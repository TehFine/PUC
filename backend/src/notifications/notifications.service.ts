import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { can, type Role } from "../auth/permissions";
import type { CacheTag } from "../common/cache/app-cache.service";
import {
  CUNE_ADMIN_LOCATION,
  EAKHAL_ADMIN_LOCATION,
  isStaffInCuneCoopScope,
  isStaffInParcelScope,
  matchesJurisdiction,
  villageScope,
} from "../common/crud/village-scope";
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

export interface RealtimeNotificationItem {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: null;
  createdAt: string;
}

export type RealtimeStreamEvent =
  | { type: "notification"; item: RealtimeNotificationItem }
  | { type: "notifications-sync"; readIds?: number[]; readAll?: boolean }
  | { type: "system-alert"; audience: "all" | "farmer" | "staff"; active: boolean }
  | { type: "data-sync"; tags: CacheTag[] };

interface ActiveStreamSub {
  role: Role;
  sessionId?: number | null;
  onEvict?: () => void;
  send: (event: RealtimeStreamEvent) => void;
}

/**
 * Thông báo trong ứng dụng kèm kênh đẩy thời gian thực (SSE). Các nghiệp vụ gọi `notifyHousehold`/`notifyRoles`/`notifyOversightForHousehold`
 * sau khi ghi dữ liệu; lỗi gửi thông báo không được làm hỏng thao tác chính.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly lastSyncedAt = new Map<number, number>();
  private readonly streamsByUser = new Map<number, Set<ActiveStreamSub>>();
  private totalActiveStreams = 0;
  private unsubscribeCacheTags: (() => void) | null = null;
  private pendingDataSyncTags = new Set<CacheTag>();
  private dataSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SYNC_THROTTLE_MS = 15_000;
  private static readonly MAX_STREAMS_PER_USER = 6;
  private static readonly MAX_TOTAL_STREAMS = 2_000;
  private static readonly DATA_SYNC_DEBOUNCE_MS = 40;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit(): void {
    if (!this.db.cache) return;
    this.unsubscribeCacheTags = this.db.cache.onTagsInvalidated((tags) => {
      let hasLiveTag = false;
      for (const tag of tags) {
        if (
          tag === "dashboard" ||
          tag === "auth" ||
          tag === "plots" ||
          tag === "catalog" ||
          tag === "news" ||
          tag === "portal"
        ) {
          this.pendingDataSyncTags.add(tag);
          hasLiveTag = true;
        }
      }
      if (!hasLiveTag || this.streamsByUser.size === 0) return;
      if (this.dataSyncTimer) return;
      this.dataSyncTimer = setTimeout(() => {
        this.dataSyncTimer = null;
        if (this.pendingDataSyncTags.size === 0) return;
        const batch = Array.from(this.pendingDataSyncTags);
        this.pendingDataSyncTags.clear();
        this.emitDataSync(batch);
      }, NotificationsService.DATA_SYNC_DEBOUNCE_MS);
      this.dataSyncTimer.unref?.();
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeCacheTags?.();
    this.unsubscribeCacheTags = null;
    if (this.dataSyncTimer) {
      clearTimeout(this.dataSyncTimer);
      this.dataSyncTimer = null;
    }
    this.pendingDataSyncTags.clear();
  }

  private emitDataSync(tags: CacheTag[]): void {
    const staffTags = tags.filter((t) => t !== "portal");
    const enterpriseTags = tags.filter((t) => t === "dashboard" || t === "catalog");
    const farmerTags = tags.filter(
      (t) => t === "portal" || t === "plots" || t === "catalog" || t === "news",
    );
    const staffEvent: RealtimeStreamEvent | null =
      staffTags.length > 0 ? { type: "data-sync", tags: staffTags } : null;
    const enterpriseEvent: RealtimeStreamEvent | null =
      enterpriseTags.length > 0 ? { type: "data-sync", tags: enterpriseTags } : null;
    const farmerEvent: RealtimeStreamEvent | null =
      farmerTags.length > 0 ? { type: "data-sync", tags: farmerTags } : null;
    if (!staffEvent && !enterpriseEvent && !farmerEvent) return;

    for (const subs of this.streamsByUser.values()) {
      for (const sub of subs) {
        const event =
          sub.role === "farmer"
            ? farmerEvent
            : sub.role === "enterprise"
              ? enterpriseEvent
              : staffEvent;
        if (!event) continue;
        try {
          sub.send(event);
        } catch {
          // Bỏ qua nếu kết nối vừa đóng
        }
      }
    }
  }

  /** Đăng ký luồng nhận thông báo thời gian thực (SSE) cho đúng người dùng đang đăng nhập. */
  subscribeUserStream(
    userId: number,
    role: Role,
    send: (event: RealtimeStreamEvent) => void,
    options?: { sessionId?: number | null; onEvict?: () => void },
  ): () => void {
    let bucket = this.streamsByUser.get(userId);
    if (!bucket) {
      bucket = new Set<ActiveStreamSub>();
      this.streamsByUser.set(userId, bucket);
    }
    if (bucket.size >= NotificationsService.MAX_STREAMS_PER_USER) {
      const oldest = bucket.values().next().value;
      if (oldest) {
        bucket.delete(oldest);
        this.totalActiveStreams = Math.max(0, this.totalActiveStreams - 1);
        try {
          oldest.onEvict?.();
        } catch {
          // Bỏ qua lỗi đóng socket cũ
        }
      }
    }
    if (this.totalActiveStreams >= NotificationsService.MAX_TOTAL_STREAMS) {
      for (const [uid, candidateBucket] of this.streamsByUser) {
        const oldestGlobal = candidateBucket.values().next().value;
        if (oldestGlobal) {
          candidateBucket.delete(oldestGlobal);
          this.totalActiveStreams = Math.max(0, this.totalActiveStreams - 1);
          if (candidateBucket.size === 0) this.streamsByUser.delete(uid);
          try {
            oldestGlobal.onEvict?.();
          } catch {
            // Bỏ qua lỗi đóng socket cũ
          }
          break;
        }
      }
    }
    const entry: ActiveStreamSub = {
      role,
      sessionId: options?.sessionId ?? null,
      onEvict: options?.onEvict,
      send,
    };
    bucket.add(entry);
    this.totalActiveStreams += 1;

    return () => {
      const current = this.streamsByUser.get(userId);
      if (!current || !current.has(entry)) return;
      current.delete(entry);
      this.totalActiveStreams = Math.max(0, this.totalActiveStreams - 1);
      if (current.size === 0) {
        this.streamsByUser.delete(userId);
      }
    };
  }

  /** Ngắt ngay lập tức mọi luồng SSE đang mở của người dùng (khi thu hồi phiên, đổi mật khẩu, khóa tài khoản). */
  disconnectUserStreams(userId: number, options?: { onlySessionId?: number | null; exceptSessionId?: number | null }): void {
    const bucket = this.streamsByUser.get(Number(userId));
    if (!bucket || bucket.size === 0) return;
    const toClose: ActiveStreamSub[] = [];
    for (const sub of bucket) {
      if (options?.onlySessionId !== undefined && options.onlySessionId !== null) {
        if (sub.sessionId !== options.onlySessionId) continue;
      }
      if (options?.exceptSessionId !== undefined && options.exceptSessionId !== null) {
        if (sub.sessionId === options.exceptSessionId) continue;
      }
      toClose.push(sub);
    }
    for (const sub of toClose) {
      if (bucket.delete(sub)) {
        this.totalActiveStreams = Math.max(0, this.totalActiveStreams - 1);
      }
      try {
        sub.onEvict?.();
      } catch {
        // Bỏ qua nếu luồng đã đóng
      }
    }
    if (bucket.size === 0) {
      this.streamsByUser.delete(Number(userId));
    }
  }

  /** Đẩy sự kiện cảnh báo / thông báo hệ thống thời gian thực tới các luồng đang mở thuộc nhóm đối tượng nhận. */
  emitSystemAlert(audience: "all" | "farmer" | "staff", active: boolean): void {
    const event: RealtimeStreamEvent = { type: "system-alert", audience, active };
    for (const subs of this.streamsByUser.values()) {
      for (const sub of subs) {
        const matches =
          audience === "all" ||
          (audience === "farmer" && sub.role === "farmer") ||
          (audience === "staff" && sub.role !== "farmer" && sub.role !== "enterprise");
        if (!matches) continue;
        try {
          sub.send(event);
        } catch {
          // Bỏ qua nếu kết nối vừa đóng
        }
      }
    }
  }

  private emitToUser(userId: number, event: RealtimeStreamEvent): void {
    const subs = this.streamsByUser.get(userId);
    if (!subs || subs.size === 0) return;
    for (const sub of subs) {
      try {
        sub.send(event);
      } catch {
        // Bỏ qua nếu kết nối vừa đóng
      }
    }
  }

  /** Gửi tới tài khoản (đang hoạt động) gắn với hộ. */
  async notifyHousehold(householdId: number | null | undefined, input: NotificationInput): Promise<void> {
    if (!householdId) return;
    await this.insert(
      `SELECT id FROM users WHERE household_id = $5 AND status = 'active'`,
      [input.kind, input.title, input.body ?? null, input.link ?? null, householdId],
    );
  }

  /** Gửi trực tiếp tới danh sách ID người dùng xác định (đang hoạt động). */
  async notifyUsers(userIds: number[], input: NotificationInput): Promise<void> {
    const uniqueIds = Array.from(
      new Set(userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
    );
    if (uniqueIds.length === 0) return;
    await this.insert(
      `SELECT id FROM users WHERE id = ANY($5::bigint[]) AND status = 'active'`,
      [input.kind, input.title, input.body ?? null, input.link ?? null, uniqueIds],
    );
  }

  /** Gửi tới mọi tài khoản đang hoạt động thuộc các vai trò cho trước (chỉ trong phạm vi HTX Cư Né / địa bàn cho phép). */
  async notifyRoles(
    roles: string[],
    input: NotificationInput,
    options?: { excludeUserId?: number },
  ): Promise<void> {
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
      const excludedId = options?.excludeUserId;
      const recipientIds = rows
        .filter((r) => {
          if (excludedId !== undefined && Number(r.id) === Number(excludedId)) return false;
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
   * Gửi thông báo hoặc cảnh báo giám sát tới Quản trị viên, Trưởng HTX, Phó HTX, Chuyên viên hỗ trợ,
   * Cán bộ kỹ thuật HTX, Kiểm tra viên và Cán bộ thôn phụ trách đúng thôn của hộ dân.
   */
  async notifyOversightForHousehold(
    householdId: number,
    input: NotificationInput,
    options?: { excludeUserId?: number },
  ): Promise<void> {
    const globalCandidateRoles: Role[] = [
      "admin",
      "htx_head",
      "htx_deputy",
      "support_specialist",
      "htx_officer",
      "inspector",
    ];
    const requiredResource =
      input.kind === "approval"
        ? "approvals"
        : input.kind === "violation"
          ? "violations"
          : input.kind === "harvest"
            ? "harvest"
            : input.kind === "protocol"
              ? "journal"
              : input.kind === "lab"
                ? "testing"
                : null;
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

      const excludedId = options?.excludeUserId;
      const recipientIds = staffRes.rows
        .filter((u) => {
          if (excludedId !== undefined && Number(u.id) === excludedId) return false;
          const staffUser: AuthUser = {
            id: Number(u.id),
            fullName: "",
            username: "",
            role: u.role,
            villageId: u.village_id !== null ? Number(u.village_id) : null,
            householdId: null,
            assignedCommune: u.assigned_commune,
            assignedRegion: u.assigned_region,
            coopCode: u.coop_code || "HTX-CUNE",
          };
          // Áp dụng đồng nhất kiểm tra địa bàn phụ trách (xã/thôn/vùng) cho mọi vai trò cán bộ và thanh tra:
          // Ban điều hành trung tâm (assigned_commune IS NULL) nhận toàn bộ Cư Né + Ea Khăl, còn cán bộ gắn xã nào chỉ nhận xã đó.
          return isStaffInParcelScope(
            staffUser,
            { villageId: hh.village_id, villageName: hh.village_name },
            u.village_name,
          );
        })
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

  /** Gửi thông báo tới các vai trò cán bộ phụ trách đúng phạm vi thôn/xã cho trước (ví dụ duyệt đăng ký mới theo thôn). */
  async notifyRolesForVillage(
    roles: Role[],
    village: { villageId: number | null; villageName: string | null },
    input: NotificationInput,
    options?: { excludeUserId?: number },
  ): Promise<void> {
    if (roles.length === 0) return;
    if (!village.villageId && !village.villageName) {
      await this.notifyRoles(roles, input, options);
      return;
    }
    try {
      const { rows } = await this.db.query<{
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
         WHERE u.role = ANY($1::text[]) AND u.status = 'active'`,
        [roles],
      );
      const excludedId = options?.excludeUserId;
      const recipientIds = rows
        .filter((u) => {
          if (excludedId !== undefined && Number(u.id) === Number(excludedId)) return false;
          const staffUser: AuthUser = {
            id: Number(u.id),
            fullName: "",
            username: "",
            role: u.role,
            villageId: u.village_id !== null ? Number(u.village_id) : null,
            householdId: null,
            assignedCommune: u.assigned_commune,
            assignedRegion: u.assigned_region,
            coopCode: u.coop_code || "HTX-CUNE",
          };
          return isStaffInParcelScope(staffUser, village, u.village_name);
        })
        .map((u) => Number(u.id));
      if (recipientIds.length === 0) return;
      await this.insert(
        `SELECT unnest($5::bigint[]) AS id`,
        [input.kind, input.title, input.body ?? null, input.link ?? null, recipientIds],
      );
    } catch (error) {
      this.logger.error(`Không gửi được thông báo theo thôn: ${error instanceof Error ? error.message : String(error)}`);
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

  /** Đẩy sự kiện đồng bộ danh sách thông báo tức thì tới tập người dùng vừa có thay đổi trạng thái đọc / thu hồi. */
  emitSyncToUsers(userIds: Iterable<number>): void {
    const seen = new Set<number>();
    for (const rawId of userIds) {
      const uid = Number(rawId);
      if (!Number.isFinite(uid) || uid <= 0 || seen.has(uid)) continue;
      seen.add(uid);
      this.lastSyncedAt.delete(uid);
      this.emitToUser(uid, { type: "notifications-sync" });
    }
  }

  /** Tự động đánh dấu đã đọc các thông báo chờ xử lý gắn với một hoặc nhiều đường dẫn liên kết và đồng bộ SSE tức thì. */
  async resolveByLinks(links: string[]): Promise<void> {
    const cleanLinks = Array.from(new Set(links.map((l) => l.trim()).filter(Boolean)));
    if (cleanLinks.length === 0) return;
    try {
      this.lastSyncedAt.clear();
      const res = await this.db.query<{ id: number; user_id: number }>(
        "UPDATE notifications SET read_at = now() WHERE link = ANY($1::text[]) AND read_at IS NULL RETURNING id, user_id",
        [cleanLinks],
      );
      const byUser = new Map<number, number[]>();
      for (const row of res.rows) {
        const uid = Number(row.user_id);
        const nid = Number(row.id);
        if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(nid) || nid <= 0) continue;
        let list = byUser.get(uid);
        if (!list) {
          list = [];
          byUser.set(uid, list);
        }
        list.push(nid);
      }
      for (const [uid, readIds] of byUser) {
        this.lastSyncedAt.delete(uid);
        this.emitToUser(uid, { type: "notifications-sync", readIds });
      }
    } catch (error) {
      this.logger.error(
        `Không cập nhật được trạng thái thông báo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Tự động đánh dấu đã đọc các thông báo hệ thống gắn với một mã sự cố / yêu cầu khi đã xử lý xong. */
  async resolveByLink(link: string): Promise<void> {
    await this.resolveByLinks([link]);
  }

  async list(userOrId: AuthUser | number, limit = 100) {
    const userId = typeof userOrId === "number" ? userOrId : userOrId.id;
    let rbacFilterSql = "";
    if (typeof userOrId !== "number") {
      if (userOrId.role === "farmer") {
        await this.syncFarmerNotifications(userOrId);
      } else {
        await this.syncStaffNotifications(userOrId);
        const clauses: string[] = [];
        if (!can(userOrId.role, "approvals", "read")) {
          clauses.push(
            `COALESCE(link, '') NOT LIKE '/admin?section=approval%' AND (kind <> 'approval' OR COALESCE(link, '') LIKE '/trace/%')`,
          );
        }
        if (!can(userOrId.role, "violations", "read")) {
          clauses.push(`kind <> 'violation' AND COALESCE(link, '') NOT LIKE '%violationId=%'`);
        }
        if (!can(userOrId.role, "registrations", "read")) {
          clauses.push(
            `COALESCE(link, '') NOT LIKE '/admin?section=registrations%' AND COALESCE(link, '') NOT LIKE '/admin?section=approval&sub=registrations%'`,
          );
        }
        if (!can(userOrId.role, "harvest", "read")) {
          clauses.push(`kind <> 'harvest' AND COALESCE(link, '') NOT LIKE '/admin?section=harvest%'`);
        }
        if (!can(userOrId.role, "trace-requests", "read")) {
          clauses.push(`COALESCE(link, '') NOT LIKE '/admin?section=system&sub=trace-requests%'`);
        }
        if (!can(userOrId.role, "deletion-requests", "read")) {
          clauses.push(`COALESCE(link, '') NOT LIKE '/admin?section=system&sub=deletions%'`);
        }
        if (clauses.length > 0) {
          rbacFilterSql = ` AND ${clauses.join(" AND ")}`;
        }
      }
    }

    // Tải song song tối đa $2 thông báo chưa đọc mới nhất và 50 thông báo vừa đọc gần nhất để tab Đã đọc không bao giờ bị đẩy mất
    const [listRes, unreadRes] = await Promise.all([
      this.db.query(
        `WITH unread_part AS (
           SELECT id, kind, title, body, link, read_at, created_at
           FROM notifications
           WHERE user_id = $1 AND read_at IS NULL${rbacFilterSql}
           ORDER BY created_at DESC, id DESC
           LIMIT $2
         ),
         read_part AS (
           SELECT id, kind, title, body, link, read_at, created_at
           FROM notifications
           WHERE user_id = $1 AND read_at IS NOT NULL${rbacFilterSql}
           ORDER BY COALESCE(read_at, created_at) DESC, id DESC
           LIMIT 50
         )
         SELECT id, kind, title, body, link, read_at, created_at
         FROM (
           SELECT * FROM unread_part
           UNION ALL
           SELECT * FROM read_part
         ) combined
         ORDER BY created_at DESC, id DESC`,
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
           WHERE i.scheduled_on >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
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
    const canReadTraceRequests =
      can(user.role, "trace-requests", "read") && isStaffInCuneCoopScope(user, true);
    const isDeputyReviewer = user.role === "htx_deputy";
    if (!canReadApprovals && !canReadViolations && !canReadTraceRequests && !isDeputyReviewer) return;

    const now = Date.now();
    const lastSync = this.lastSyncedAt.get(user.id) ?? 0;
    if (now - lastSync < NotificationsService.SYNC_THROTTLE_MS) return;
    if (this.lastSyncedAt.size > 1000) this.lastSyncedAt.clear();
    this.lastSyncedAt.set(user.id, now);

    try {
      const params: unknown[] = [
        user.id,
        canReadApprovals,
        canReadViolations,
        isDeputyReviewer,
        canReadTraceRequests,
      ];
      const hhScopeCond = villageScope("h.village_id")(user, params);
      const apprScope = hhScopeCond
        ? `AND a.household_id IN (SELECT h.id FROM households h WHERE ${hhScopeCond})`
        : "";
      const violScope = hhScopeCond
        ? `AND v.household_id IN (SELECT h.id FROM households h WHERE ${hhScopeCond})`
        : "";

      let traceScope = "";
      const commune = user.assignedCommune?.trim() || "";
      if (commune) {
        const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
        const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
        const eaKhalExpr = `(COALESCE(tr.puc_code, '') ~* '^66-PUC-SR0001-' OR tr.scanned_code ~* '^(?:66-PUC-SR0001-|EK\\d)')`;
        if (!inCune && !inEaKhal) {
          traceScope = "AND 1 = 0";
        } else if (inEaKhal && !inCune) {
          traceScope = `AND ${eaKhalExpr}`;
        } else if (inCune && !inEaKhal) {
          traceScope = `AND NOT ${eaKhalExpr}`;
        }
      }

      // Gộp các bước đồng bộ thông báo quản trị vào 1 câu lệnh CTE trên 1 kết nối CSDL duy nhất
      await this.db.query(
        `WITH ins_appr AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'approval',
             'Hồ sơ chờ duyệt: ' || a.code || ' - ' || a.applicant_name,
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
             v.household_label || COALESCE(' - Thửa ' || v.plot_code, '') || COALESCE(' - ' || v.description, ''),
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
         ),
         ins_del AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'approval',
             'Yêu cầu xóa chờ duyệt: ' || d.target_name || ' (' || d.target_code || ')',
             'Đề nghị bởi ' || d.requested_by_name || COALESCE(' - Lý do: ' || NULLIF(btrim(d.reason), ''), ''),
             '/admin?section=system&sub=deletions&id=' || d.id,
             d.created_at
           FROM member_deletion_requests d
           WHERE $4::boolean
             AND d.status = 'pending'
             AND d.requested_by <> $1
             AND NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.user_id = $1 AND n.link = '/admin?section=system&sub=deletions&id=' || d.id
             )
           ORDER BY d.created_at ASC, d.id ASC
         ),
         ins_trace AS (
           INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           SELECT
             $1,
             'approval',
             'Yêu cầu mở quyền xem QR (' || tr.request_code || ')',
             tr.requester_name || ' (' || tr.organization || ') đề nghị xem hồ sơ ' || COALESCE(tr.resolved_lot_code, tr.scanned_code),
             '/admin?section=system&sub=trace-requests&id=' || tr.id,
             tr.created_at
           FROM trace_access_requests tr
           WHERE $5::boolean
             AND tr.status = 'pending'
             AND COALESCE(tr.requester_user_id, 0) <> $1
             ${traceScope}
             AND NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.user_id = $1 AND n.link = '/admin?section=system&sub=trace-requests&id=' || tr.id
             )
           ORDER BY tr.created_at ASC, tr.id ASC
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
             OR
             (n.link LIKE '/admin?section=system&sub=deletions&id=%' AND EXISTS (
               SELECT 1 FROM member_deletion_requests d
               WHERE '/admin?section=system&sub=deletions&id=' || d.id = n.link AND d.status <> 'pending'
             ))
             OR
             (
               n.link LIKE '/admin?section=system&sub=trace-requests&id=%'
               AND n.title NOT LIKE 'Đã %'
               AND n.title NOT LIKE 'Từ chối%'
               AND EXISTS (
                 SELECT 1 FROM trace_access_requests tr
                 WHERE '/admin?section=system&sub=trace-requests&id=' || tr.id = n.link
                   AND tr.status <> 'pending'
               )
             )
             OR
             (
               n.link LIKE '/admin?section=approval&sub=registrations&id=%'
               AND NOT EXISTS (
                 SELECT 1 FROM users u
                 WHERE '/admin?section=approval&sub=registrations&id=' || u.id = n.link
                   AND u.status = 'pending'
               )
             )
             OR
             (
               n.link LIKE '/admin?section=registrations&id=%'
               AND NOT EXISTS (
                 SELECT 1 FROM password_reset_requests pr
                 WHERE '/admin?section=registrations&id=' || pr.id = n.link
                   AND pr.status = 'pending'
                   AND pr.expires_at > now()
               )
             )
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
    this.lastSyncedAt.delete(userId);
    await this.db.query("UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [id, userId]);
    this.emitToUser(userId, { type: "notifications-sync", readIds: [id] });
    return { ok: true };
  }

  async markReadBatch(userId: number, ids: number[]) {
    const cleanIds = Array.from(
      new Set(ids.map((raw) => Number(raw)).filter((n) => Number.isInteger(n) && n > 0)),
    ).slice(0, 100);
    if (cleanIds.length === 0) {
      return { ok: true, updated: 0, readIds: [] as number[] };
    }
    this.lastSyncedAt.delete(userId);
    const res = await this.db.query<{ id: number }>(
      `UPDATE notifications
       SET read_at = now()
       WHERE user_id = $1
         AND id = ANY($2::bigint[])
         AND read_at IS NULL
       RETURNING id`,
      [userId, cleanIds],
    );
    const updatedIds = res.rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    this.emitToUser(userId, {
      type: "notifications-sync",
      readIds: updatedIds.length > 0 ? updatedIds : cleanIds,
    });
    return { ok: true, updated: res.rowCount ?? 0, readIds: updatedIds };
  }

  async markAllRead(userId: number) {
    this.lastSyncedAt.delete(userId);
    await this.db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]);
    this.emitToUser(userId, { type: "notifications-sync", readAll: true });
    return { ok: true };
  }

  async clearRead(userId: number) {
    this.lastSyncedAt.delete(userId);
    const res = await this.db.query("DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL", [userId]);
    this.emitToUser(userId, { type: "notifications-sync" });
    return { ok: true, deleted: res.rowCount ?? 0 };
  }

  private async insert(recipientsSql: string, params: unknown[]) {
    try {
      const inserted = await this.db.query<{
        user_id: number;
        id: number;
        kind: NotificationKind;
        title: string;
        body: string | null;
        link: string | null;
        created_at: Date | string;
      }>(
        `INSERT INTO notifications (user_id, kind, title, body, link)
         SELECT DISTINCT r.id, $1, $2, $3, $4 FROM (${recipientsSql}) r
         RETURNING user_id, id, kind, title, body, link, created_at`,
        params,
      );
      for (const row of inserted.rows) {
        const uid = Number(row.user_id);
        this.lastSyncedAt.delete(uid);
        this.emitToUser(uid, {
          type: "notification",
          item: {
            id: Number(row.id),
            kind: row.kind,
            title: row.title,
            body: row.body,
            link: row.link,
            readAt: null,
            createdAt:
              row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          },
        });
      }
    } catch (error) {
      this.logger.error(`Không gửi được thông báo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
