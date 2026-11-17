import { Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { can, type Role } from "../auth/permissions";
import { isStaffInCuneCoopScope, isStaffInParcelScope, villageScope } from "../common/crud/village-scope";
import { camelRows } from "../common/sql/rows";
import { DatabaseService } from "../database/database.service";

export type NotificationKind =
  | "approval"
  | "violation"
  | "harvest"
  | "training"
  | "schedule"
  | "lab"
  | "system"
  | "protocol";

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Đường dẫn trong ứng dụng, ví dụ `/portal?tab=inspection`. */
  link?: string | null;
}

/**
 * Thông báo trong ứng dụng. Các nghiệp vụ gọi `notifyHousehold`/`notifyUsers` sau khi ghi dữ liệu;
 * lỗi gửi thông báo không được làm hỏng thao tác chính.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly lastSyncedAt = new Map<number, number>();
  private static readonly SYNC_THROTTLE_MS = 15_000;

  constructor(private readonly db: DatabaseService) {}

  /** Gửi tới tài khoản (đang hoạt động) gắn với hộ. */
  async notifyHousehold(householdId: number | null | undefined, input: NotificationInput): Promise<void> {
    if (!householdId) return;
    await this.insert(
      `SELECT id FROM users WHERE household_id = $5 AND status = 'active'`,
      [input.kind, input.title, input.body ?? null, input.link ?? null, householdId],
    );
  }

  /** Gửi tới mọi tài khoản đang hoạt động thuộc các vai trò cho trước (chỉ trong phạm vi HTX Cư Né / địa bàn cho phép). */
  async notifyRoles(roles: string[], input: NotificationInput): Promise<void> {
    if (roles.length === 0) return;
    try {
      const { rows } = await this.db.query<{
        id: number;
        role: Role;
        village_id: number | null;
        assigned_commune: string | null;
        assigned_region: string | null;
        coop_code: string | null;
      }>(
        `SELECT id, role, village_id, assigned_commune, assigned_region, coop_code
         FROM users
         WHERE role = ANY($1::text[]) AND status = 'active'`,
        [roles],
      );
      const recipientIds = rows
        .filter((r) => {
          if (r.role === "farmer" || r.role === "enterprise") return true;
          return isStaffInCuneCoopScope(
            {
              id: Number(r.id),
              fullName: "",
              username: "",
              role: r.role,
              villageId: r.village_id !== null ? Number(r.village_id) : null,
              householdId: null,
              assignedCommune: r.assigned_commune,
              assignedRegion: r.assigned_region,
              coopCode: r.coop_code || "HTX-CUNE",
            },
            false,
          );
        })
        .map((r) => Number(r.id));
      if (recipientIds.length === 0) return;
      await this.insert(
        `SELECT unnest($5::bigint[]) AS id`,
        [input.kind, input.title, input.body ?? null, input.link ?? null, recipientIds],
      );
    } catch (error) {
      this.logger.error(`Không gửi được thông báo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gửi cảnh báo tuân thủ quy trình tới Quản trị viên, Cán bộ HTX, Kiểm tra viên
   * và Cán bộ thôn phụ trách đúng thôn của hộ dân (chỉ gửi cho vai trò có quyền đọc và thuộc phạm vi địa bàn/HTX).
   */
  async notifyOversightForHousehold(householdId: number, input: NotificationInput): Promise<void> {
    const globalCandidateRoles: Role[] = ["admin", "htx_officer", "inspector"];
    const requiredResource =
      input.kind === "approval" ? "approvals" : input.kind === "violation" ? "violations" : null;
    const allowedGlobalRoles = requiredResource
      ? globalCandidateRoles.filter((r) => can(r, requiredResource, "read"))
      : globalCandidateRoles;
    const allowVillageOfficer = requiredResource ? can("village_officer", requiredResource, "read") : true;
    if (allowedGlobalRoles.length === 0 && !allowVillageOfficer) return;

    try {
      const [hhRes, staffRes] = await Promise.all([
        this.db.query<{ village_id: number | null; village_name: string | null }>(
          `SELECT h.village_id, v.name AS village_name
           FROM households h
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE h.id = $1`,
          [householdId],
        ),
        this.db.query<{
          id: number;
          role: Role;
          village_id: number | null;
          village_name: string | null;
          assigned_commune: string | null;
          assigned_region: string | null;
          coop_code: string | null;
        }>(
          `SELECT u.id, u.role, u.village_id, v.name AS village_name,
                  u.assigned_commune, u.assigned_region, u.coop_code
           FROM users u
           LEFT JOIN villages v ON v.id = u.village_id
           WHERE u.status = 'active'
             AND (
               u.role = ANY($1::text[])
               OR ($2::boolean AND u.role = 'village_officer')
             )`,
          [allowedGlobalRoles, allowVillageOfficer],
        ),
      ]);
      const hh = hhRes.rows[0];
      if (!hh) return;

      const recipientIds = staffRes.rows
        .filter((u) =>
          isStaffInParcelScope(
            {
              id: Number(u.id),
              fullName: "",
              username: "",
              role: u.role,
              villageId: u.village_id !== null ? Number(u.village_id) : null,
              householdId: null,
              assignedCommune: u.assigned_commune,
              assignedRegion: u.assigned_region,
              coopCode: u.coop_code || "HTX-CUNE",
            },
            { villageId: hh.village_id, villageName: hh.village_name },
            u.village_name,
          ),
        )
        .map((u) => Number(u.id));
      if (recipientIds.length === 0) return;

      await this.insert(
        `SELECT unnest($5::bigint[]) AS id`,
        [input.kind, input.title, input.body ?? null, input.link ?? null, recipientIds],
      );
    } catch (error) {
      this.logger.error(`Không gửi được thông báo giám sát: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Gửi tới tất cả hộ dân có tài khoản (ví dụ lịch kiểm tra, khóa tập huấn mới). */
  async notifyAllFarmers(input: NotificationInput): Promise<void> {
    await this.notifyRoles(["farmer"], input);
  }

  /** Gửi tới toàn bộ tài khoản đang hoạt động trên hệ thống (thông báo khẩn / bảo trì). */
  async notifyAllUsers(input: NotificationInput): Promise<void> {
    await this.insert(
      `SELECT id FROM users WHERE status = 'active'`,
      [input.kind, input.title, input.body ?? null, input.link ?? null],
    );
  }

  /** Tự động đánh dấu đã đọc các thông báo hệ thống gắn với một mã sự cố khi sự cố đã khắc phục. */
  async resolveByLink(link: string): Promise<void> {
    try {
      this.lastSyncedAt.clear();
      await this.db.query("UPDATE notifications SET read_at = now() WHERE link = $1 AND read_at IS NULL", [link]);
    } catch (error) {
      this.logger.error(`Không cập nhật được trạng thái thông báo sự cố: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async list(userOrId: AuthUser | number, limit = 50) {
    const userId = typeof userOrId === "number" ? userOrId : userOrId.id;
    let rbacFilterSql = "";
    if (typeof userOrId !== "number") {
      if (userOrId.role === "farmer") {
        await this.syncFarmerNotifications(userOrId);
      } else {
        await this.syncStaffNotifications(userOrId);
        const clauses: string[] = [];
        if (!can(userOrId.role, "approvals", "read")) {
          clauses.push(`kind <> 'approval' AND COALESCE(link, '') NOT LIKE '/admin?section=approval%'`);
        }
        if (!can(userOrId.role, "violations", "read")) {
          clauses.push(`kind <> 'violation' AND COALESCE(link, '') NOT LIKE '%violationId=%'`);
        }
        if (!can(userOrId.role, "registrations", "read")) {
          clauses.push(`COALESCE(link, '') NOT LIKE '/admin?section=registrations%'`);
        }
        if (clauses.length > 0) {
          rbacFilterSql = ` AND ${clauses.join(" AND ")}`;
        }
      }
    }

    // Danh sách và số chưa đọc độc lập nhau: chạy song song để giảm một lượt chờ CSDL
    const [listRes, unreadRes] = await Promise.all([
      this.db.query(
        `SELECT id, kind, title, body, link, read_at, created_at FROM notifications
         WHERE user_id = $1${rbacFilterSql} ORDER BY created_at DESC, id DESC LIMIT $2`,
        [userId, limit],
      ),
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL${rbacFilterSql}`,
        [userId],
      ),
    ]);
    return { data: camelRows(listRes.rows), unread: unreadRes.rows[0].n };
  }

  /**
   * Đồng bộ tự động các cảnh báo vi phạm đang mở (violations: open) và lịch kiểm tra sắp tới
   * vào bảng notifications của hộ nông dân, đồng thời tự đánh dấu đã đọc khi vi phạm đã xử lý xong.
   */
  async syncFarmerNotifications(user: AuthUser): Promise<void> {
    const now = Date.now();
    const lastSync = this.lastSyncedAt.get(user.id) ?? 0;
    if (now - lastSync < NotificationsService.SYNC_THROTTLE_MS) return;
    if (this.lastSyncedAt.size > 1000) this.lastSyncedAt.clear();
    this.lastSyncedAt.set(user.id, now);

    try {
      let householdId = user.householdId;
      if (!householdId) {
        const uRes = await this.db.query<{ household_id: number | null }>(
          "SELECT household_id FROM users WHERE id = $1",
          [user.id],
        );
        householdId = uRes.rows[0]?.household_id ?? null;
      }
      if (!householdId) return;

      // Gộp 3 bước đồng bộ thông báo vào 1 câu lệnh CTE để chỉ chiếm 1 kết nối từ pool
      await this.db.query(
        `WITH ins_viol AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'violation',
             'Cảnh báo vi phạm: ' || v.title,
             COALESCE('Thửa ' || v.plot_code || ' – ', '') || COALESCE(v.description, 'Vui lòng kiểm tra và cập nhật khắc phục.'),
             '/portal?tab=diary&violationId=' || v.id,
             COALESCE(v.detected_on::timestamptz, now())
           FROM violations v
           WHERE v.household_id = $2
             AND v.status = 'open'
             AND NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.user_id = $1
                 AND (n.link = '/portal?tab=diary&violationId=' || v.id OR (n.kind = 'violation' AND strpos(n.title, v.title) > 0))
             )
           ORDER BY v.detected_on ASC, v.id ASC
         ),
         ins_sched AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'schedule',
             'Lịch kiểm tra: ' || i.title,
             'Ngày ' || to_char(i.scheduled_on, 'DD/MM/YYYY') || ' - Cán bộ phụ trách: ' || i.officer,
             '/portal?tab=inspection&scheduleId=' || i.id,
             now()
           FROM inspection_schedule i
           WHERE i.scheduled_on >= current_date
             AND i.kind <> 'sudden'
             AND NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.user_id = $1
                 AND (n.link = '/portal?tab=inspection&scheduleId=' || i.id OR (n.kind = 'schedule' AND strpos(n.title, i.title) > 0))
             )
           ORDER BY i.scheduled_on ASC, i.id ASC
         ),
         del_sudden AS (
           -- Gỡ thông báo lịch đã đồng bộ trước đó nếu đợt kiểm tra đã chuyển sang đột xuất.
           DELETE FROM notifications n
           USING inspection_schedule i
           WHERE n.user_id = $1
             AND n.kind = 'schedule'
             AND n.link = '/portal?tab=inspection&scheduleId=' || i.id
             AND i.kind = 'sudden'
         )
         UPDATE notifications n
         SET read_at = now()
         WHERE n.user_id = $1
           AND n.read_at IS NULL
           AND n.link LIKE '/portal?tab=diary&violationId=%'
           AND EXISTS (
             SELECT 1 FROM violations v
             WHERE '/portal?tab=diary&violationId=' || v.id = n.link AND v.status <> 'open'
           )`,
        [user.id, householdId],
      );
    } catch (error) {
      this.lastSyncedAt.delete(user.id);
      this.logger.error(
        `Không đồng bộ được thông báo hộ nông dân: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Đồng bộ tự động các hồ sơ chờ duyệt (approvals: pending) và cảnh báo vi phạm đang mở (violations: open)
   * vào bảng notifications của cán bộ quản trị, đồng thời tự động đánh dấu đã đọc khi hồ sơ/vi phạm đã xử lý xong.
   */
  private async syncStaffNotifications(user: AuthUser): Promise<void> {
    const canReadApprovals = can(user.role, "approvals", "read");
    const canReadViolations = can(user.role, "violations", "read");
    if (!canReadApprovals && !canReadViolations) return;

    const now = Date.now();
    const lastSync = this.lastSyncedAt.get(user.id) ?? 0;
    if (now - lastSync < NotificationsService.SYNC_THROTTLE_MS) return;
    if (this.lastSyncedAt.size > 1000) this.lastSyncedAt.clear();
    this.lastSyncedAt.set(user.id, now);

    try {
      const params: unknown[] = [user.id, canReadApprovals, canReadViolations];
      const hhScopeCond = villageScope("h.village_id")(user, params);
      const apprScope = hhScopeCond
        ? `AND a.household_id IN (SELECT h.id FROM households h WHERE ${hhScopeCond})`
        : "";
      const violScope = hhScopeCond
        ? `AND v.household_id IN (SELECT h.id FROM households h WHERE ${hhScopeCond})`
        : "";

      // Gộp 3 bước đồng bộ thông báo quản trị vào 1 câu lệnh CTE trên 1 kết nối CSDL duy nhất
      await this.db.query(
        `WITH ins_appr AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'approval',
             'Hồ sơ chờ duyệt: ' || a.code || ' – ' || a.applicant_name,
             a.request_type || ' - Nộp ngày ' || to_char(a.submitted_on, 'DD/MM/YYYY'),
             '/admin?section=approval&id=' || a.id,
             COALESCE(a.created_at, a.submitted_on::timestamptz, now())
           FROM approvals a
           WHERE $2::boolean
             AND a.status = 'pending' ${apprScope}
             AND NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.user_id = $1 AND n.link = '/admin?section=approval&id=' || a.id
             )
           ORDER BY a.submitted_on ASC, a.id ASC
         ),
         ins_viol AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'violation',
             'Cảnh báo vi phạm: ' || v.title,
             v.household_label || COALESCE(' - Thửa ' || v.plot_code, '') || COALESCE(' – ' || v.description, ''),
             '/admin?section=journal&violationId=' || v.id,
             COALESCE(v.detected_on::timestamptz, now())
           FROM violations v
           WHERE $3::boolean
             AND v.status = 'open' ${violScope}
             AND NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.user_id = $1 AND n.link = '/admin?section=journal&violationId=' || v.id
             )
           ORDER BY v.detected_on ASC, v.id ASC
         )
         UPDATE notifications n
         SET read_at = now()
         WHERE n.user_id = $1
           AND n.read_at IS NULL
           AND (
             (n.link LIKE '/admin?section=approval&id=%' AND EXISTS (
               SELECT 1 FROM approvals a
               WHERE '/admin?section=approval&id=' || a.id = n.link AND a.status <> 'pending'
             ))
             OR
             (n.link LIKE '/admin?section=journal&violationId=%' AND EXISTS (
               SELECT 1 FROM violations v
               WHERE '/admin?section=journal&violationId=' || v.id = n.link AND v.status <> 'open'
             ))
           )`,
        params,
      );
    } catch (error) {
      this.lastSyncedAt.delete(user.id);
      this.logger.error(
        `Không đồng bộ được thông báo quản trị: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async markRead(userId: number, id: number) {
    await this.db.query("UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [id, userId]);
    return { ok: true };
  }

  async markAllRead(userId: number) {
    await this.db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]);
    return { ok: true };
  }

  async clearRead(userId: number) {
    const res = await this.db.query("DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL", [userId]);
    return { ok: true, deleted: res.rowCount ?? 0 };
  }

  private async insert(recipientsSql: string, params: unknown[]) {
    try {
      this.lastSyncedAt.clear();
      await this.db.query(
        `INSERT INTO notifications (user_id, kind, title, body, link)
         SELECT r.id, $1, $2, $3, $4 FROM (${recipientsSql}) r`,
        params,
      );
    } catch (error) {
      this.logger.error(`Không gửi được thông báo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
