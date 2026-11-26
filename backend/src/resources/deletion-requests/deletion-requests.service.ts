import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { ADMIN_PRIVILEGED_ROLES, isAdminPrivilegedRole } from "../../auth/permissions";
import {
  assertHouseholdInScope,
  CUNE_ADMIN_LOCATION,
  EAKHAL_ADMIN_LOCATION,
  EAKHAL_VILLAGE_SQL_REGEX,
  isStaffInCuneCoopScope,
  matchesJurisdiction,
  resolveParcelAdminLocation,
} from "../../common/crud/village-scope";
import { AppException, badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { camelRows } from "../../common/sql/rows";
import { hasPublicColumn, hasPublicTable } from "../../common/sql/schema-cache";
import { hasPlotsTable, syncHouseholdAndVillageStats } from "../../common/sql/stats-sync";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import type {
  CreateDeletionRequestDto,
  DeletionTargetType,
  ListDeletionRequestsQueryDto,
  ReviewDeletionRequestDto,
} from "./deletion-requests.dto";

const ADMIN_MUTATION_ADVISORY_LOCK = 73829104;

const ROLE_LABELS_VN: Record<string, string> = {
  admin: "Quản trị viên",
  htx_head: "Trưởng HTX",
  htx_deputy: "Phó HTX",
  support_specialist: "Chuyên viên hỗ trợ hệ thống",
  htx_officer: "Cán bộ HTX",
  inspector: "Kiểm tra viên",
  village_officer: "Cán bộ Thôn",
  enterprise: "Doanh nghiệp / CSĐG",
  farmer: "Nông dân",
};

function roleRank(role?: string | null): number {
  if (role === "admin") return 4;
  if (role === "htx_head") return 3;
  if (role === "support_specialist") return 2;
  if (role === "htx_deputy") return 1;
  return 0;
}

function assertAccountDeleteHierarchy(actorRole: string, targetRole?: string | null) {
  if (actorRole === "admin") return;
  const actorRank = roleRank(actorRole);
  if (targetRole && roleRank(targetRole) >= actorRank) {
    throw forbidden("Bạn không có quyền yêu cầu xóa tài khoản ngang cấp hoặc cấp cao hơn.");
  }
}

interface RawDeletionRequestRow extends Record<string, unknown> {
  id: number;
  target_type: DeletionTargetType;
  target_id: number;
  target_name: string;
  target_code: string;
  target_role: string | null;
  reason: string | null;
  requested_by: number;
  requested_by_name: string;
  requested_by_role: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
}

@Injectable()
export class DeletionRequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) { }

  private buildReviewerCommuneSqlFilter(alias: string, user: AuthUser): string | null {
    const commune = user.assignedCommune?.trim() || "";
    if (!commune) return null;
    const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
    const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
    if (!inCune && !inEaKhal) return "1 = 0";
    if (inCune && inEaKhal) return null;

    const hhEaKhalExpr = `(
      ${alias}.target_type = 'household' AND (
        ${alias}.target_code ~* '^66-PUC-SR0001-'
        OR EXISTS (
          SELECT 1
            FROM households h_sc
            JOIN villages v_sc ON v_sc.id = h_sc.village_id
           WHERE h_sc.id = ${alias}.target_id
             AND v_sc.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}'
        )
      )
    )`;

    const accEaKhalExpr = `(
      ${alias}.target_type = 'account' AND (
        EXISTS (
          SELECT 1
            FROM users u_sc
            LEFT JOIN households uh_sc ON uh_sc.id = u_sc.household_id
            LEFT JOIN villages uv_sc ON uv_sc.id = COALESCE(uh_sc.village_id, u_sc.village_id)
           WHERE u_sc.id = ${alias}.target_id
             AND (
               uv_sc.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}'
               OR (
                 uv_sc.id IS NULL
                 AND COALESCE(u_sc.assigned_commune, '') ~* '(ea\\s*kh[aă]l|ea\\s*h''?leo)'
               )
             )
        )
        OR (
          NOT EXISTS (SELECT 1 FROM users u_ex WHERE u_ex.id = ${alias}.target_id)
          AND EXISTS (
            SELECT 1
              FROM users actor_sc
             WHERE actor_sc.id IN (${alias}.requested_by, ${alias}.reviewed_by)
               AND COALESCE(actor_sc.assigned_commune, '') ~* '(ea\\s*kh[aă]l|ea\\s*h''?leo)'
          )
        )
      )
    )`;

    const eaKhalExpr = `(${hhEaKhalExpr} OR ${accEaKhalExpr})`;
    if (inEaKhal && !inCune) return eaKhalExpr;
    if (inCune && !inEaKhal) return `NOT ${eaKhalExpr}`;
    return null;
  }

  private async assertRequestTargetInCommuneScope(
    reqRow: Pick<RawDeletionRequestRow, "target_type" | "target_id" | "target_code">,
    user: AuthUser,
    runner?: PoolClient,
  ): Promise<void> {
    const commune = user.assignedCommune?.trim() || "";
    if (!commune) return;
    const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
    const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
    if (!inCune && !inEaKhal) {
      throw forbidden("Yêu cầu xóa này nằm ngoài địa bàn xã được phân công quản lý của bạn.");
    }
    if (inCune && inEaKhal) return;

    const q = runner ? runner.query.bind(runner) : this.db.query.bind(this.db);

    if (reqRow.target_type === "household") {
      const hhRes = await q<{ code: string; village_name: string | null }>(
        `SELECT h.code, v.name AS village_name
           FROM households h
           LEFT JOIN villages v ON v.id = h.village_id
          WHERE h.id = $1`,
        [reqRow.target_id],
      );
      const hh = hhRes.rows[0];
      const targetLoc = hh
        ? resolveParcelAdminLocation(hh.village_name, hh.code)
        : resolveParcelAdminLocation(null, reqRow.target_code);
      if (!matchesJurisdiction(commune, [targetLoc])) {
        throw forbidden("Yêu cầu xóa này nằm ngoài địa bàn xã được phân công quản lý của bạn.");
      }
      return;
    }

    const accRes = await q<{
      assigned_commune: string | null;
      village_name: string | null;
      hh_code: string | null;
      has_village: boolean;
    }>(
      `SELECT u.assigned_commune,
              uv.name AS village_name,
              uh.code AS hh_code,
              (COALESCE(uh.village_id, u.village_id) IS NOT NULL) AS has_village
         FROM users u
         LEFT JOIN households uh ON uh.id = u.household_id
         LEFT JOIN villages uv ON uv.id = COALESCE(uh.village_id, u.village_id)
        WHERE u.id = $1`,
      [reqRow.target_id],
    );
    const acc = accRes.rows[0];
    if (!acc) return;

    let allowed: boolean;
    if (acc.has_village || acc.hh_code) {
      const targetLoc = resolveParcelAdminLocation(acc.village_name, acc.hh_code);
      allowed = matchesJurisdiction(commune, [targetLoc]);
    } else if (acc.assigned_commune && acc.assigned_commune.trim()) {
      const targetLocs = [CUNE_ADMIN_LOCATION, EAKHAL_ADMIN_LOCATION].filter((loc) =>
        matchesJurisdiction(acc.assigned_commune!, [loc]),
      );
      allowed = targetLocs.length > 0 ? matchesJurisdiction(commune, targetLocs) : false;
    } else {
      allowed = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
    }
    if (!allowed) {
      throw forbidden("Yêu cầu xóa này nằm ngoài địa bàn xã được phân công quản lý của bạn.");
    }
  }

  async list(query: ListDeletionRequestsQueryDto, user: AuthUser) {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safePageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));
    if (!isStaffInCuneCoopScope(user, true)) {
      return { data: [], total: 0, pendingCount: 0, page: safePage, pageSize: safePageSize };
    }
    const offset = (safePage - 1) * safePageSize;

    const params: unknown[] = [];
    const conds: string[] = [];
    const communeCond = this.buildReviewerCommuneSqlFilter("d", user);
    if (communeCond) {
      conds.push(communeCond);
    }

    if (query.status) {
      params.push(query.status);
      conds.push(`d.status = $${params.length}`);
    }
    if (query.targetType) {
      params.push(query.targetType);
      conds.push(`d.target_type = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q.trim()}%`);
      const idx = params.length;
      conds.push(
        `(d.target_name ILIKE $${idx} OR d.target_code ILIKE $${idx} OR d.requested_by_name ILIKE $${idx} OR COALESCE(d.reason, '') ILIKE $${idx})`,
      );
    }

    const whereSql = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const pendingWhereSql = communeCond
      ? `WHERE d.status = 'pending' AND (${communeCond})`
      : `WHERE d.status = 'pending'`;
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const [rowsRes, countRes, pendingRes] = await Promise.all([
      this.db.query(
        `SELECT d.id, d.target_type, d.target_id, d.target_name, d.target_code, d.target_role,
                d.reason, d.requested_by, d.requested_by_name, d.requested_by_role,
                d.status, d.reviewed_by, d.reviewed_by_name, d.review_note, d.reviewed_at, d.created_at
         FROM member_deletion_requests d
         ${whereSql}
         ORDER BY (CASE WHEN d.status = 'pending' THEN 0 ELSE 1 END) ASC, d.created_at DESC, d.id DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, safePageSize, offset],
      ),
      this.db.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM member_deletion_requests d ${whereSql}`,
        params,
      ),
      this.db.query<{ pending_count: number }>(
        `SELECT count(*)::int AS pending_count FROM member_deletion_requests d ${pendingWhereSql}`,
      ),
    ]);

    return {
      data: camelRows(rowsRes.rows),
      total: countRes.rows[0]?.total ?? 0,
      pendingCount: pendingRes.rows[0]?.pending_count ?? 0,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  private async assertHouseholdHasNoHistory(householdId: number, runner?: PoolClient): Promise<boolean> {
    const [hasPlots, hasMilestones] = await Promise.all([
      hasPlotsTable(this.db),
      hasPublicTable(this.db, "care_milestone_declarations"),
    ]);
    const plotsCheckSql = hasPlots ? "OR EXISTS (SELECT 1 FROM plots WHERE household_id = $1)" : "";
    const milestonesCheckSql = hasMilestones
      ? "OR EXISTS (SELECT 1 FROM care_milestone_declarations WHERE household_id = $1)"
      : "";
    const sql = `SELECT (
      EXISTS (SELECT 1 FROM lab_tests WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM spray_records WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM journal_entries WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM farmer_stamps WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM farmer_stamp_allocations WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM harvest_contributions WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM harvest_declarations WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM approvals WHERE household_id = $1)
      OR EXISTS (SELECT 1 FROM violations WHERE household_id = $1)
      ${plotsCheckSql}
      ${milestonesCheckSql}
    ) AS has_history`;
    const historyCheck = runner
      ? await runner.query<{ has_history: boolean }>(sql, [householdId])
      : await this.db.query<{ has_history: boolean }>(sql, [householdId]);
    if (historyCheck.rows[0]?.has_history) {
      throw badRequest("Hộ dân đã có lịch sử canh tác, hồ sơ, kiểm nghiệm hoặc tem truy xuất nên không thể xóa.");
    }
    return hasPlots;
  }

  private async assertRemainingLeadershipGuards(targetUserId: number, runner?: PoolClient): Promise<void> {
    const q = runner ? runner.query.bind(runner) : this.db.query.bind(this.db);
    const targetRes = await q<{ role: string; status: string }>(
      "SELECT role, status FROM users WHERE id = $1",
      [targetUserId],
    );
    const target = targetRes.rows[0];
    if (!target || target.status !== "active") return;

    if (isAdminPrivilegedRole(target.role)) {
      const admins = await q<{ id: number }>(
        "SELECT id FROM users WHERE role = ANY($1::text[]) AND status = 'active'",
        [ADMIN_PRIVILEGED_ROLES],
      );
      const remaining = admins.rows.filter((r) => Number(r.id) !== Number(targetUserId));
      if (remaining.length === 0) {
        throw badRequest("Phải giữ lại ít nhất một tài khoản quản trị viên đang hoạt động.");
      }
    }

    if (target.role === "htx_deputy") {
      const deputies = await q<{ id: number }>(
        "SELECT id FROM users WHERE role = 'htx_deputy' AND status = 'active'",
      );
      const remaining = deputies.rows.filter((r) => Number(r.id) !== Number(targetUserId));
      if (remaining.length === 0) {
        throw badRequest("Phải giữ lại ít nhất một tài khoản Phó HTX đang hoạt động để giám sát phê duyệt chéo.");
      }
    }
  }

  /**
   * Tạo yêu cầu xóa tài khoản hoặc hộ thành viên và gửi thông báo thời gian thực tới Phó HTX.
   * Không bao giờ xóa trực tiếp khi Quản trị viên / Trưởng HTX bấm xóa.
   */
  async requestDeletion(
    dto: CreateDeletionRequestDto,
    user: AuthUser,
    ip?: string,
    options?: { strictConflict?: boolean },
  ) {
    const targetId = Number(dto.targetId);
    const cleanReason = typeof dto.reason === "string" && dto.reason.trim() ? dto.reason.trim() : null;

    let targetName = "";
    let targetCode = "";
    let targetRole: string | null = null;

    if (dto.targetType === "account") {
      if (!isStaffInCuneCoopScope(user, true)) {
        throw forbidden("Bạn không có quyền yêu cầu xóa tài khoản ngoài phạm vi quản lý.");
      }
      if (targetId === Number(user.id)) {
        throw forbidden("Không thể xóa chính tài khoản đang đăng nhập.");
      }
      const targetRes = await this.db.query<{
        id: number;
        full_name: string;
        username: string;
        role: string;
        status: string;
      }>("SELECT id, full_name, username, role, status FROM users WHERE id = $1", [targetId]);
      const target = targetRes.rows[0];
      if (!target) throw notFound("Không tìm thấy tài khoản.");

      await this.assertRequestTargetInCommuneScope(
        { target_type: "account", target_id: targetId, target_code: target.username },
        user,
      );
      assertAccountDeleteHierarchy(user.role, target.role);
      await this.assertRemainingLeadershipGuards(targetId);

      targetName = target.full_name;
      targetCode = target.username;
      targetRole = target.role;
    } else {
      if (!isStaffInCuneCoopScope(user, true)) {
        throw forbidden("Bạn không có quyền xóa hộ nông dân ngoài phạm vi quản lý.");
      }
      const hhRes = await this.db.query<{ id: number; code: string; name: string }>(
        "SELECT id, code, name FROM households WHERE id = $1",
        [targetId],
      );
      const hh = hhRes.rows[0];
      if (!hh) throw notFound("Không tìm thấy hộ nông dân.");

      await assertHouseholdInScope(this.db, { householdId: targetId }, user);
      await this.assertHouseholdHasNoHistory(targetId);

      targetName = hh.name;
      targetCode = hh.code;
      targetRole = "farmer";
    }

    const existingPending = await this.db.query(
      `SELECT id, target_type, target_id, target_name, target_code, target_role,
              reason, requested_by, requested_by_name, requested_by_role,
              status, reviewed_by, reviewed_by_name, review_note, reviewed_at, created_at
       FROM member_deletion_requests
       WHERE target_type = $1 AND target_id = $2 AND status = 'pending'
       LIMIT 1`,
      [dto.targetType, targetId],
    );

    if (existingPending.rows[0]) {
      if (options?.strictConflict) {
        throw new AppException(
          409,
          "Hồ sơ này đang có yêu cầu xóa chờ Phó HTX phê duyệt.",
          "DELETION_ALREADY_PENDING",
        );
      }
      const pendingRow = existingPending.rows[0] as RawDeletionRequestRow;
      const pendingLink = `/admin?section=system&sub=deletions&id=${pendingRow.id}`;
      const missingDeputyRes = await this.db.query<{ id: number }>(
        `SELECT u.id
         FROM users u
         WHERE u.role = 'htx_deputy'
           AND u.status = 'active'
           AND u.id <> $1
           AND NOT EXISTS (
             SELECT 1 FROM notifications n
             WHERE n.user_id = u.id AND n.link = $2 AND n.read_at IS NULL
           )`,
        [user.id, pendingLink],
      );
      if (missingDeputyRes.rows.length > 0) {
        const targetKindLabel = dto.targetType === "account" ? "tài khoản" : "hộ thành viên";
        const actorRoleLabel = ROLE_LABELS_VN[user.role] ?? user.role;
        await this.notifications.notifyUsers(
          missingDeputyRes.rows.map((r) => Number(r.id)),
          {
            kind: "approval",
            title: `Yêu cầu xóa ${targetKindLabel}: ${targetName} (${targetCode})`,
            body: `${actorRoleLabel} ${user.fullName} đề nghị xóa khỏi hệ thống.${cleanReason ? ` Lý do: ${cleanReason}` : " Vui lòng kiểm tra và phê duyệt."}`,
            link: pendingLink,
          },
        );
      }
      return {
        ok: true as const,
        pendingApproval: true as const,
        alreadyPending: true as const,
        message: "Yêu cầu xóa đang chờ Phó HTX phê duyệt.",
        request: camelRows([pendingRow])[0],
      };
    }

    const inserted = await this.db.query<RawDeletionRequestRow>(
      `INSERT INTO member_deletion_requests (
         target_type, target_id, target_name, target_code, target_role,
         reason, requested_by, requested_by_name, requested_by_role, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id, target_type, target_id, target_name, target_code, target_role,
                 reason, requested_by, requested_by_name, requested_by_role,
                 status, reviewed_by, reviewed_by_name, review_note, reviewed_at, created_at`,
      [
        dto.targetType,
        targetId,
        targetName,
        targetCode,
        targetRole,
        cleanReason,
        user.id,
        user.fullName,
        user.role,
      ],
    );

    const createdRow = inserted.rows[0];
    const targetKindLabel = dto.targetType === "account" ? "tài khoản" : "hộ thành viên";
    const actorRoleLabel = ROLE_LABELS_VN[user.role] ?? user.role;

    await this.audit.write(
      { ip, user },
      {
        action: "Gửi yêu cầu xóa thành viên",
        object: `${targetName} (${targetCode})`,
        detail: `${actorRoleLabel} đề nghị xóa ${targetKindLabel}, chuyển Phó HTX phê duyệt${cleanReason ? `. Lý do: ${cleanReason}` : ""}`,
      },
    );

    await this.notifications.notifyRoles(["htx_deputy"], {
      kind: "approval",
      title: `Yêu cầu xóa ${targetKindLabel}: ${targetName} (${targetCode})`,
      body: `${actorRoleLabel} ${user.fullName} đề nghị xóa khỏi hệ thống.${cleanReason ? ` Lý do: ${cleanReason}` : " Vui lòng kiểm tra và phê duyệt."}`,
      link: `/admin?section=system&sub=deletions&id=${createdRow.id}`,
    });

    return {
      ok: true as const,
      pendingApproval: true as const,
      alreadyPending: false as const,
      message: "Đã gửi yêu cầu xóa đến Phó HTX để phê duyệt.",
      request: camelRows([createdRow])[0],
    };
  }

  /** Chỉ Phó HTX (`htx_deputy`) mới có quyền phê duyệt để thực thi xóa vĩnh viễn. */
  async approve(requestId: number, user: AuthUser, dto: ReviewDeletionRequestDto, ip?: string) {
    if (user.role !== "htx_deputy" || !isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Chỉ Phó HTX mới có quyền phê duyệt yêu cầu xóa thành viên khỏi hệ thống.");
    }
    const cleanNote = typeof dto.note === "string" && dto.note.trim() ? dto.note.trim() : null;

    const [hasCreatedByCol, hasCredResetCol] = await Promise.all([
      hasPublicColumn(this.db, "users", "created_by"),
      hasPublicColumn(this.db, "users", "credential_reset_by"),
    ]);

    const client = await this.db.pool.connect();
    let reqRow: RawDeletionRequestRow | undefined;
    let updatedReqRow: RawDeletionRequestRow | undefined;
    let oldVillageIdForSync: number | undefined;
    let hasPlotsForSync = false;
    let resolvedNotifUserIds: number[] = [];

    try {
      await client.query("SELECT pg_advisory_lock($1)", [ADMIN_MUTATION_ADVISORY_LOCK]);
      await client.query("BEGIN");
      try {
        await client.query(
          `SELECT set_config('puc.actor_user_id', $1, true),
                  set_config('puc.actor_name', $2, true),
                  set_config('puc.actor_role', $3, true)`,
          [String(user.id), user.fullName, user.role],
        );
        const lockRes = await client.query<RawDeletionRequestRow>(
          `SELECT * FROM member_deletion_requests WHERE id = $1 FOR UPDATE`,
          [requestId],
        );
        reqRow = lockRes.rows[0];
        if (!reqRow) throw notFound("Không tìm thấy yêu cầu xóa.");
        await this.assertRequestTargetInCommuneScope(reqRow, user, client);
        if (reqRow.status !== "pending") {
          throw badRequest("Yêu cầu xóa này đã được xử lý trước đó.");
        }
        if (Number(reqRow.requested_by) === Number(user.id)) {
          throw forbidden("Người khởi tạo yêu cầu không được tự phê duyệt yêu cầu của chính mình.");
        }

        if (hasCreatedByCol || hasCredResetCol) {
          const cols = [
            "created_at",
            hasCreatedByCol ? "created_by" : "NULL::bigint AS created_by",
            hasCredResetCol ? "credential_reset_by" : "NULL::bigint AS credential_reset_by",
            hasCredResetCol ? "credential_reset_at" : "NULL::timestamptz AS credential_reset_at",
          ].join(", ");
          const reviewerProv = await client.query<{
            created_at: Date | string;
            created_by: number | null;
            credential_reset_by: number | null;
            credential_reset_at: Date | string | null;
          }>(`SELECT ${cols} FROM users WHERE id = $1`, [user.id]);
          const prov = reviewerProv.rows[0];
          if (prov) {
            const reqCreatedMs = new Date(reqRow.created_at).getTime();
            const depCreatedMs = new Date(prov.created_at).getTime();
            if (
              prov.created_by !== null &&
              Number(prov.created_by) === Number(reqRow.requested_by) &&
              Number.isFinite(reqCreatedMs) &&
              Number.isFinite(depCreatedMs) &&
              depCreatedMs >= reqCreatedMs
            ) {
              throw forbidden(
                "Tài khoản Phó HTX được khởi tạo bởi chính người gửi yêu cầu sau thời điểm lập yêu cầu xóa không được phép phê duyệt yêu cầu này.",
              );
            }
            if (
              prov.credential_reset_by !== null &&
              Number(prov.credential_reset_by) === Number(reqRow.requested_by) &&
              prov.credential_reset_at
            ) {
              const resetMs = new Date(prov.credential_reset_at).getTime();
              if (!Number.isFinite(reqCreatedMs) || !Number.isFinite(resetMs) || resetMs >= reqCreatedMs) {
                throw forbidden(
                  "Tài khoản Phó HTX vừa được người gửi yêu cầu đặt lại thông tin xác thực; vui lòng để Phó HTX tự đổi mật khẩu cá nhân trước khi phê duyệt.",
                );
              }
            }
          }
        }

        const targetId = Number(reqRow.target_id);

        if (reqRow.target_type === "account") {
          if (targetId === Number(user.id)) {
            throw forbidden("Không thể phê duyệt xóa chính tài khoản đang đăng nhập.");
          }
          const targetAcc = await client.query<{
            id: number;
            full_name: string;
            username: string;
            role: string;
            status: string;
          }>("SELECT id, full_name, username, role, status FROM users WHERE id = $1 FOR UPDATE", [targetId]);

          if (!targetAcc.rows[0]) {
            throw badRequest("Tài khoản cần xóa không còn tồn tại trên hệ thống.");
          }
          await this.assertRemainingLeadershipGuards(targetId, client);

          const upd = await client.query<RawDeletionRequestRow>(
            `UPDATE member_deletion_requests
             SET status = 'approved',
                 reviewed_by = $2,
                 reviewed_by_name = $3,
                 review_note = $4,
                 reviewed_at = now()
             WHERE id = $1
             RETURNING *`,
            [requestId, user.id, user.fullName, cleanNote],
          );
          updatedReqRow = upd.rows[0];

          await client.query("DELETE FROM users WHERE id = $1", [targetId]);
        } else {
          const hhRes = await client.query<{ id: number; village_id: number | null }>(
            "SELECT id, village_id FROM households WHERE id = $1 FOR UPDATE",
            [targetId],
          );
          if (!hhRes.rows[0]) {
            throw badRequest("Hồ sơ hộ nông dân cần xóa không còn tồn tại trên hệ thống.");
          }
          oldVillageIdForSync = hhRes.rows[0].village_id ? Number(hhRes.rows[0].village_id) : undefined;
          hasPlotsForSync = await this.assertHouseholdHasNoHistory(targetId, client);

          const linkedUsers = await client.query<{ id: number }>(
            "SELECT id FROM users WHERE household_id = $1 FOR UPDATE",
            [targetId],
          );
          const linkedUserIds = linkedUsers.rows.map((r) => Number(r.id));

          await client.query("DELETE FROM households WHERE id = $1", [targetId]);

          if (linkedUserIds.length > 0) {
            await client.query(
              "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = ANY($1::bigint[]) AND revoked_at IS NULL",
              [linkedUserIds],
            );
            await client.query(
              "UPDATE users SET status = 'locked', token_version = token_version + 1, household_id = NULL WHERE id = ANY($1::bigint[])",
              [linkedUserIds],
            );
          }

          const upd = await client.query<RawDeletionRequestRow>(
            `UPDATE member_deletion_requests
             SET status = 'approved',
                 reviewed_by = $2,
                 reviewed_by_name = $3,
                 review_note = $4,
                 reviewed_at = now()
             WHERE id = $1
             RETURNING *`,
            [requestId, user.id, user.fullName, cleanNote],
          );
          updatedReqRow = upd.rows[0];
        }

        const resolvedNotifs = await client.query<{ user_id: number }>(
          `UPDATE notifications
           SET read_at = now()
           WHERE link = $1 AND read_at IS NULL
           RETURNING user_id`,
          [`/admin?section=system&sub=deletions&id=${requestId}`],
        );
        resolvedNotifUserIds = resolvedNotifs.rows.map((r) => Number(r.user_id));

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADMIN_MUTATION_ADVISORY_LOCK]).catch(() => undefined);
      client.release();
    }

    if (resolvedNotifUserIds.length > 0) {
      this.notifications.emitSyncToUsers(resolvedNotifUserIds);
    }

    if (reqRow?.target_type === "household") {
      await syncHouseholdAndVillageStats(this.db, {
        forceZeroVillageIds: oldVillageIdForSync ? [oldVillageIdForSync] : [],
        hasPlots: hasPlotsForSync,
      });
    }
    this.db.cache?.invalidateTags(["dashboard", "plots", "auth"], true);

    const targetKindLabel = reqRow.target_type === "account" ? "tài khoản" : "hộ thành viên";

    await this.audit.write(
      { ip, user },
      {
        action: "Phê duyệt xóa thành viên",
        object: `${reqRow.target_name} (${reqRow.target_code})`,
        detail: `Phó HTX ${user.fullName} phê duyệt yêu cầu xóa ${targetKindLabel} của ${reqRow.requested_by_name}${cleanNote ? `. Ghi chú: ${cleanNote}` : ""}`,
      },
    );

    if (reqRow.requested_by) {
      await this.notifications.notifyUsers([Number(reqRow.requested_by)], {
        kind: "approval",
        title: `Đã duyệt xóa ${targetKindLabel}: ${reqRow.target_name} (${reqRow.target_code})`,
        body: `Phó HTX ${user.fullName} đã phê duyệt và hoàn tất xóa khỏi hệ thống.${cleanNote ? ` Ghi chú: ${cleanNote}` : ""}`,
        link: "/admin?section=system&sub=deletions",
      });
    }

    return {
      ok: true as const,
      request: updatedReqRow ? camelRows([updatedReqRow])[0] : null,
    };
  }

  /** Chỉ Phó HTX (`htx_deputy`) mới có quyền từ chối yêu cầu xóa. */
  async reject(requestId: number, user: AuthUser, dto: ReviewDeletionRequestDto, ip?: string) {
    if (user.role !== "htx_deputy" || !isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Chỉ Phó HTX mới có quyền từ chối yêu cầu xóa thành viên.");
    }
    const cleanNote = typeof dto.note === "string" && dto.note.trim() ? dto.note.trim() : null;

    const existing = await this.db.query<RawDeletionRequestRow>(
      "SELECT * FROM member_deletion_requests WHERE id = $1",
      [requestId],
    );
    const reqRow = existing.rows[0];
    if (!reqRow) throw notFound("Không tìm thấy yêu cầu xóa.");
    await this.assertRequestTargetInCommuneScope(reqRow, user);
    if (reqRow.status !== "pending") {
      throw badRequest("Yêu cầu xóa này đã được xử lý trước đó.");
    }

    const upd = await this.db.query<RawDeletionRequestRow>(
      `UPDATE member_deletion_requests
       SET status = 'rejected',
           reviewed_by = $2,
           reviewed_by_name = $3,
           review_note = $4,
           reviewed_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [requestId, user.id, user.fullName, cleanNote],
    );
    if (!upd.rows[0]) {
      throw badRequest("Yêu cầu xóa này đã được xử lý trước đó.");
    }

    await this.notifications.resolveByLink(`/admin?section=system&sub=deletions&id=${requestId}`);

    const targetKindLabel = reqRow.target_type === "account" ? "tài khoản" : "hộ thành viên";

    await this.audit.write(
      { ip, user },
      {
        action: "Từ chối xóa thành viên",
        object: `${reqRow.target_name} (${reqRow.target_code})`,
        detail: `Phó HTX ${user.fullName} từ chối yêu cầu xóa ${targetKindLabel} của ${reqRow.requested_by_name}${cleanNote ? `. Lý do: ${cleanNote}` : ""}`,
      },
    );

    await this.notifications.notifyUsers([Number(reqRow.requested_by)], {
      kind: "approval",
      title: `Từ chối yêu cầu xóa: ${reqRow.target_name} (${reqRow.target_code})`,
      body: `Phó HTX ${user.fullName} không phê duyệt xóa ${targetKindLabel}.${cleanNote ? ` Lý do: ${cleanNote}` : ""}`,
      link: "/admin?section=system&sub=deletions",
    });

    return {
      ok: true as const,
      request: camelRows([upd.rows[0]])[0],
    };
  }

  /** Người tạo yêu cầu (hoặc Quản trị viên) thu hồi yêu cầu xóa khi Phó HTX chưa xử lý. */
  async cancel(requestId: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền thao tác yêu cầu xóa ngoài phạm vi đơn vị.");
    }
    const existing = await this.db.query<RawDeletionRequestRow>(
      "SELECT * FROM member_deletion_requests WHERE id = $1",
      [requestId],
    );
    const reqRow = existing.rows[0];
    if (!reqRow) throw notFound("Không tìm thấy yêu cầu xóa.");
    await this.assertRequestTargetInCommuneScope(reqRow, user);
    if (reqRow.status !== "pending") {
      throw badRequest("Chỉ có thể thu hồi yêu cầu đang chờ duyệt.");
    }
    if (Number(reqRow.requested_by) !== Number(user.id) && user.role !== "admin") {
      throw forbidden("Bạn chỉ có thể thu hồi yêu cầu xóa do chính mình khởi tạo.");
    }

    const upd = await this.db.query<RawDeletionRequestRow>(
      `UPDATE member_deletion_requests
       SET status = 'cancelled',
           reviewed_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [requestId],
    );
    if (!upd.rows[0]) {
      throw badRequest("Yêu cầu xóa này đã được xử lý trước đó.");
    }

    await this.notifications.resolveByLink(`/admin?section=system&sub=deletions&id=${requestId}`);

    const targetKindLabel = reqRow.target_type === "account" ? "tài khoản" : "hộ thành viên";
    const actorRoleLabel = ROLE_LABELS_VN[user.role] ?? user.role;
    await this.notifications.notifyRoles(
      ["htx_deputy"],
      {
        kind: "approval",
        title: `Đã thu hồi yêu cầu xóa ${targetKindLabel}: ${reqRow.target_name} (${reqRow.target_code})`,
        body: `${actorRoleLabel} ${user.fullName} đã thu hồi yêu cầu xóa đang chờ phê duyệt.`,
        link: "/admin?section=system&sub=deletions",
      },
      { excludeUserId: user.id },
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Thu hồi yêu cầu xóa",
        object: `${reqRow.target_name} (${reqRow.target_code})`,
        detail: `${user.fullName} đã hủy yêu cầu xóa đang chờ duyệt`,
      },
    );

    return {
      ok: true as const,
      request: camelRows([upd.rows[0]])[0],
    };
  }
}
