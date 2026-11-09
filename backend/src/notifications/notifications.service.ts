import { Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { camelRows } from "../common/sql/rows";
import { DatabaseService } from "../database/database.service";

export type NotificationKind = "approval" | "violation" | "harvest" | "training" | "schedule" | "lab" | "system";

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

  /** Gửi tới mọi tài khoản đang hoạt động thuộc các vai trò cho trước (ví dụ cán bộ HTX khi hộ gửi hồ sơ). */
  async notifyRoles(roles: string[], input: NotificationInput): Promise<void> {
    await this.insert(
      `SELECT id FROM users WHERE role = ANY($5::text[]) AND status = 'active'`,
      [input.kind, input.title, input.body ?? null, input.link ?? null, roles],
    );
  }

  /** Gửi tới tất cả hộ dân có tài khoản (ví dụ lịch kiểm tra, khóa tập huấn mới). */
  async notifyAllFarmers(input: NotificationInput): Promise<void> {
    await this.notifyRoles(["farmer"], input);
  }

  async list(userOrId: AuthUser | number, limit = 50) {
    const userId = typeof userOrId === "number" ? userOrId : userOrId.id;
    if (typeof userOrId !== "number") {
      if (userOrId.role === "farmer") {
        await this.syncFarmerNotifications(userOrId);
      } else {
        await this.syncStaffNotifications(userOrId);
      }
    }

    // Danh sách và số chưa đọc độc lập nhau: chạy song song để giảm một lượt chờ CSDL
    const [listRes, unreadRes] = await Promise.all([
      this.db.query(
        `SELECT id, kind, title, body, link, read_at, created_at FROM notifications
         WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
        [userId, limit],
      ),
      this.db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
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
                 AND (n.link = '/portal?tab=diary&violationId=' || v.id OR (n.kind = 'violation' AND n.title LIKE '%' || v.title))
             )
           ORDER BY v.detected_on ASC, v.id ASC
         ),
         ins_sched AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'schedule',
             'Lịch kiểm tra: ' || i.title,
             'Ngày ' || to_char(i.scheduled_on, 'DD/MM/YYYY') || ' · Cán bộ phụ trách: ' || i.officer,
             '/portal?tab=inspection&scheduleId=' || i.id,
             now()
           FROM inspection_schedule i
           WHERE i.scheduled_on >= current_date
             AND NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.user_id = $1
                 AND (n.link = '/portal?tab=inspection&scheduleId=' || i.id OR (n.kind = 'schedule' AND n.title LIKE '%' || i.title))
             )
           ORDER BY i.scheduled_on ASC, i.id ASC
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
    const now = Date.now();
    const lastSync = this.lastSyncedAt.get(user.id) ?? 0;
    if (now - lastSync < NotificationsService.SYNC_THROTTLE_MS) return;
    if (this.lastSyncedAt.size > 1000) this.lastSyncedAt.clear();
    this.lastSyncedAt.set(user.id, now);

    try {
      const isVillageScoped = user.role === "village_officer";
      const villageId = isVillageScoped ? (user.villageId ?? -1) : null;
      const params: unknown[] = villageId !== null ? [user.id, villageId] : [user.id];
      const apprScope =
        villageId !== null
          ? "AND a.household_id IN (SELECT id FROM households WHERE village_id = $2)"
          : "";
      const violScope =
        villageId !== null
          ? "AND v.household_id IN (SELECT id FROM households WHERE village_id = $2)"
          : "";

      // Gộp 3 bước đồng bộ thông báo quản trị vào 1 câu lệnh CTE trên 1 kết nối CSDL duy nhất
      await this.db.query(
        `WITH ins_appr AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'approval',
             'Hồ sơ chờ duyệt: ' || a.code || ' – ' || a.applicant_name,
             a.request_type || ' · Nộp ngày ' || to_char(a.submitted_on, 'DD/MM/YYYY'),
             '/admin?section=approval&id=' || a.id,
             COALESCE(a.created_at, a.submitted_on::timestamptz, now())
           FROM approvals a
           WHERE a.status = 'pending' ${apprScope}
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
             v.household_label || COALESCE(' · Thửa ' || v.plot_code, '') || COALESCE(' – ' || v.description, ''),
             '/admin?section=journal&violationId=' || v.id,
             COALESCE(v.detected_on::timestamptz, now())
           FROM violations v
           WHERE v.status = 'open' ${violScope}
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
