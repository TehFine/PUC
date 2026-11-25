import { Injectable, Optional } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { ADMIN_PRIVILEGED_ROLES, isAdminPrivilegedRole } from "../../auth/permissions";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import {
  CUNE_ADMIN_LOCATION,
  EAKHAL_ADMIN_LOCATION,
  EAKHAL_VILLAGE_SQL_REGEX,
  isStaffInCuneCoopScope,
  isStaffInParcelScope,
  matchesJurisdiction,
} from "../../common/crud/village-scope";
import { AppException, badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { hasPublicColumn } from "../../common/sql/schema-cache";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { DeletionRequestsService } from "../deletion-requests/deletion-requests.service";

const ADMIN_MUTATION_ADVISORY_LOCK = 73829104;

function roleRank(role?: string | null): number {
  if (role === "admin") return 4;
  if (role === "htx_head") return 3;
  if (role === "support_specialist") return 2;
  if (role === "htx_deputy") return 1;
  return 0;
}

function assertRoleHierarchy(actorRole: string, targetCurrentRole?: string | null, nextRole?: string | null) {
  if (actorRole === "admin") return;
  if (targetCurrentRole === "htx_deputy" || nextRole === "htx_deputy") {
    throw forbidden(
      "Chỉ Quản trị viên hệ thống mới được khởi tạo hoặc điều chỉnh tài khoản Phó HTX nhằm bảo toàn tính độc lập của chốt phê duyệt chéo.",
    );
  }
  const actorRank = roleRank(actorRole);
  if (targetCurrentRole && roleRank(targetCurrentRole) >= actorRank) {
    throw forbidden("Bạn không có quyền chỉnh sửa hoặc thu hồi bảo mật của tài khoản ngang cấp hoặc cấp cao hơn.");
  }
  if (nextRole && roleRank(nextRole) >= actorRank) {
    throw forbidden("Bạn không có quyền cấp vai trò ngang cấp hoặc cao hơn vai trò hiện tại của mình.");
  }
}

@Injectable()
export class AccountsService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly deletionRequests: DeletionRequestsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    super(db, audit, {
      resource: "accounts",
      label: "Tài khoản",
      table: "users",
      fields: `t.id, t.full_name, t.username, t.email, t.role, t.status, t.village_id,
      v.name AS village_name, t.household_id, t.enterprise_id, e.name AS enterprise_name,
      e.packhouse_code AS enterprise_packhouse_code, t.assigned_commune, t.assigned_region,
      t.coop_code, t.two_factor_enabled,
      COALESCE(rt_agg.active_cnt, 0) AS active_session_count,
      t.last_login_at, t.created_at`,
      from: `users t
             LEFT JOIN villages v ON v.id = t.village_id
             LEFT JOIN enterprises e ON e.id = t.enterprise_id
             LEFT JOIN (
               SELECT user_id, count(*)::int AS active_cnt
               FROM refresh_tokens
               WHERE revoked_at IS NULL AND expires_at > now()
               GROUP BY user_id
             ) rt_agg ON rt_agg.user_id = t.id`,
      orderBy: "t.id",
      search: ["t.full_name", "t.username", "t.email", "e.name"],
      filters: { role: "t.role", status: "t.status" },
      scope: (user, params) => {
        if (user.role === "admin") return null;
        if (!isStaffInCuneCoopScope(user, true)) return "1 = 0";
        const clauses: string[] = [];
        params.push((user.coopCode || "HTX-CUNE").trim().toUpperCase());
        clauses.push(`UPPER(COALESCE(t.coop_code, 'HTX-CUNE')) = $${params.length}`);
        const commune = user.assignedCommune?.trim() || "";
        if (commune) {
          const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
          const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
          if (!inCune && !inEaKhal) return "1 = 0";
          if (inEaKhal && !inCune) {
            clauses.push(`(v.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}' OR COALESCE(t.assigned_commune, '') ~* 'ea\\s*kh[aă]l')`);
          } else if (inCune && !inEaKhal) {
            clauses.push(`((v.name IS NULL OR v.name !~* '${EAKHAL_VILLAGE_SQL_REGEX}') AND COALESCE(t.assigned_commune, '') !~* 'ea\\s*kh[aă]l')`);
          }
        }
        return clauses.join(" AND ");
      },
      virtual: ["password", "_actorId", "_targetPrevRole"],
    });
  }

  private async assertNoPendingDeletionsByActor(actorId: number): Promise<void> {
    const res = await this.db.query<{ id: number }>(
      "SELECT id FROM member_deletion_requests WHERE requested_by = $1 AND status = 'pending' LIMIT 1",
      [actorId],
    );
    if ((res.rowCount ?? 0) > 0) {
      throw forbidden(
        "Không thể khởi tạo mới hoặc đặt lại thông tin xác thực của Phó HTX khi bạn đang có yêu cầu xóa thành viên chờ phê duyệt.",
      );
    }
  }

  /** Băm mật khẩu trước khi lưu; kiểm tra phạm vi đơn vị (doanh nghiệp/xã/địa bàn/HTX); không cho tự đổi vai trò, khóa chính mình, hoặc làm mất quản trị viên cuối cùng. */
  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const next: Record<string, unknown> = { ...input };
    if (typeof next.password === "string") {
      // Phòng thủ chiều sâu ngoài DTO: chuẩn hóa NFC và chặn quá 72 byte UTF-8 (bcrypt cắt bỏ phần dư).
      const normalizedPassword = next.password.normalize("NFC");
      if (Buffer.byteLength(normalizedPassword, "utf8") > 72) throw badRequest("Mật khẩu tối đa 72 byte UTF-8.");
      next.passwordHash = await bcrypt.hash(normalizedPassword, 12);
    }
    delete next.password;

    let existing:
      | {
          role: string;
          status: string;
          household_id: number | null;
          village_id: number | null;
          enterprise_id: number | null;
          assigned_commune: string | null;
          assigned_region: string | null;
          coop_code: string | null;
          email: string | null;
        }
      | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const curRes = await this.db.query<{
        role: string;
        status: string;
        household_id: number | null;
        village_id: number | null;
        enterprise_id: number | null;
        assigned_commune: string | null;
        assigned_region: string | null;
        coop_code: string | null;
        email: string | null;
      }>(
        `SELECT role, status, household_id, village_id, enterprise_id, assigned_commune, assigned_region, coop_code, email
         FROM users WHERE id = $1`,
        [context.id],
      );
      existing = curRes.rows[0];
      if (context.id === context.user.id && existing) {
        if (
          (next.role !== undefined && next.role !== existing.role) ||
          (next.status !== undefined && next.status !== existing.status)
        ) {
          throw forbidden("Không thể tự đổi vai trò hoặc khóa chính mình.");
        }
        if (context.user.role !== "admin") {
          if (
            (next.coopCode !== undefined &&
              String(next.coopCode || "HTX-CUNE").trim().toUpperCase() !==
                String(existing.coop_code || "HTX-CUNE").trim().toUpperCase()) ||
            (next.assignedCommune !== undefined &&
              (next.assignedCommune ?? null) !== (existing.assigned_commune ?? null)) ||
            (next.assignedRegion !== undefined &&
              (next.assignedRegion ?? null) !== (existing.assigned_region ?? null)) ||
            (next.villageId !== undefined &&
              (next.villageId ?? null) !== (existing.village_id !== null ? Number(existing.village_id) : null)) ||
            (next.householdId !== undefined &&
              (next.householdId ?? null) !== (existing.household_id !== null ? Number(existing.household_id) : null)) ||
            (next.enterpriseId !== undefined &&
              (next.enterpriseId ?? null) !== (existing.enterprise_id !== null ? Number(existing.enterprise_id) : null))
          ) {
            throw forbidden("Không thể tự thay đổi phạm vi địa bàn hoặc đơn vị quản lý của chính mình.");
          }
        }
        if (
          next.email !== undefined &&
          (next.email ? String(next.email).trim().toLowerCase() : null) !==
            (existing.email ? existing.email.trim().toLowerCase() : null)
        ) {
          throw badRequest("Vui lòng cập nhật địa chỉ email liên kết qua mục Hồ sơ cá nhân có xác thực mật khẩu.");
        }
      }
    }

    if (context.user.role !== "admin" && !isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền thao tác tài khoản ngoài phạm vi quản lý.");
    }

    if (typeof next.username === "string") {
      const cleanUsername = next.username.trim();
      next.username = cleanUsername;
      const dupRes = await this.db.query<{ id: number }>(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND ($2::bigint IS NULL OR id <> $2) LIMIT 1",
        [cleanUsername, context.id ?? null],
      );
      if ((dupRes.rowCount ?? 0) > 0) {
        throw new AppException(409, `Tên đăng nhập "${cleanUsername}" đã được sử dụng.`, "CONFLICT");
      }
    }

    const effRole = String(next.role ?? existing?.role ?? "");
    const isSelfPatch = context.method === "PATCH" && context.id !== undefined && Number(context.id) === Number(context.user.id);
    if (!isSelfPatch) {
      assertRoleHierarchy(context.user.role, existing?.role ?? null, typeof next.role === "string" ? next.role : null);
    }
    if (
      (context.method === "POST" && effRole === "htx_deputy") ||
      (!isSelfPatch &&
        (existing?.role === "htx_deputy" || effRole === "htx_deputy") &&
        next.passwordHash !== undefined)
    ) {
      await this.assertNoPendingDeletionsByActor(context.user.id);
    }
    if (next.householdId !== undefined && next.householdId !== null && effRole !== "farmer") {
      throw badRequest("Chỉ tài khoản nông hộ mới được liên kết với hộ canh tác.");
    }
    if (effRole !== "farmer" && (context.method === "POST" || next.role !== undefined || existing?.household_id != null)) {
      next.householdId = null;
    }

    if (
      context.method === "PATCH" &&
      context.id !== undefined &&
      existing?.role === "htx_deputy" &&
      existing.status === "active" &&
      ((next.role !== undefined && next.role !== "htx_deputy") ||
        (next.status !== undefined && next.status !== "active"))
    ) {
      await this.assertNotLastActiveDeputy(context.id);
    }
    const [village, household, ent, hasCreatedByCol] = await Promise.all([
      next.villageId !== undefined && next.villageId !== null
        ? this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages WHERE id = $1", [next.villageId])
        : Promise.resolve(null),
      next.householdId !== undefined && next.householdId !== null
        ? this.db.query<{ id: number; village_id: number | null; village_name: string | null }>(
            "SELECT h.id, h.village_id, v.name AS village_name FROM households h LEFT JOIN villages v ON v.id = h.village_id WHERE h.id = $1",
            [next.householdId],
          )
        : Promise.resolve(null),
      next.enterpriseId !== undefined && next.enterpriseId !== null
        ? this.db.query("SELECT 1 FROM enterprises WHERE id = $1", [next.enterpriseId])
        : Promise.resolve(null),
      context.method === "POST" ? hasPublicColumn(this.db, "users", "created_by") : Promise.resolve(false),
    ]);
    if (village && village.rowCount === 0) throw badRequest("Thôn được chọn không tồn tại.");
    if (household && household.rowCount === 0) throw badRequest("Hộ nông dân được chọn không tồn tại.");
    if (ent && ent.rowCount === 0) throw badRequest("Doanh nghiệp hoặc cơ sở đóng gói được chọn không tồn tại.");
    if (context.user.role !== "admin") {
      if (village?.rows[0] && !isStaffInParcelScope(context.user, { villageId: village.rows[0].id, villageName: village.rows[0].name }, null)) {
        throw forbidden("Thôn được chọn nằm ngoài địa bàn quản lý của bạn.");
      }
      if (
        household?.rows[0] &&
        !isStaffInParcelScope(
          context.user,
          { villageId: household.rows[0].village_id, villageName: household.rows[0].village_name },
          null,
        )
      ) {
        throw forbidden("Hộ nông dân được chọn nằm ngoài địa bàn quản lý của bạn.");
      }
      if (typeof next.coopCode === "string") {
        const actorCoop = (context.user.coopCode || "HTX-CUNE").trim().toUpperCase();
        if (next.coopCode.trim().toUpperCase() !== actorCoop) {
          throw forbidden("Không thể gán mã đơn vị HTX khác phạm vi quản lý của bạn.");
        }
      } else if (context.method === "POST") {
        next.coopCode = (context.user.coopCode || "HTX-CUNE").trim().toUpperCase();
      }
      if (context.user.assignedCommune?.trim()) {
        if (typeof next.assignedCommune === "string" && next.assignedCommune.trim()) {
          if (!matchesJurisdiction(context.user.assignedCommune, [next.assignedCommune])) {
            throw forbidden("Xã phân công nằm ngoài địa bàn quản lý của bạn.");
          }
        } else if (context.method === "POST") {
          next.assignedCommune = context.user.assignedCommune.trim();
        }
      }
    }
    if (context.method === "POST" && next.role === "inspector" && next.assignedRegion === undefined) {
      next.assignedRegion = "Tỉnh Đắk Lắk";
    }
    if (typeof next.coopCode === "string") {
      next.coopCode = next.coopCode.trim().toUpperCase() || "HTX-CUNE";
    }
    if (typeof next.email === "string" && next.email.trim()) {
      await this.db.query("UPDATE users SET email = NULL WHERE status = 'pending' AND LOWER(email) = LOWER($1)", [
        next.email.trim(),
      ]);
    }
    if (context.method === "POST" && hasCreatedByCol) {
      next.createdBy = context.user.id;
    }
    next._actorId = context.user.id;
    next._targetPrevRole = existing?.role ?? null;
    return next;
  }

  /** Tuần tự hóa kiểm tra quản trị viên cuối cùng và Phó HTX cuối cùng bằng khóa tư vấn trước và trong khi cập nhật/xóa. */
  private async withSerializedAdminGuard<T>(
    targetUserId: number,
    mayReduceLeadership: boolean,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!mayReduceLeadership) {
      return fn();
    }
    const lockConn = await this.db.pool.connect();
    try {
      await lockConn.query("SELECT pg_advisory_lock($1)", [ADMIN_MUTATION_ADVISORY_LOCK]);
      await lockConn.query("BEGIN");
      try {
        const targetRes = await lockConn.query<{ role: string; status: string }>(
          "SELECT role, status FROM users WHERE id = $1 FOR UPDATE",
          [targetUserId],
        );
        if (isAdminPrivilegedRole(targetRes.rows[0]?.role) && targetRes.rows[0]?.status === "active") {
          const activeAdmins = await lockConn.query<{ id: number }>(
            "SELECT id FROM users WHERE role = ANY($1::text[]) AND status = 'active' FOR UPDATE",
            [ADMIN_PRIVILEGED_ROLES],
          );
          const remaining = activeAdmins.rows.filter((r) => Number(r.id) !== Number(targetUserId));
          if (remaining.length === 0) {
            throw badRequest("Phải giữ lại ít nhất một tài khoản quản trị viên đang hoạt động.");
          }
        }
        if (targetRes.rows[0]?.role === "htx_deputy" && targetRes.rows[0]?.status === "active") {
          const activeDeputies = await lockConn.query<{ id: number }>(
            "SELECT id FROM users WHERE role = 'htx_deputy' AND status = 'active' FOR UPDATE",
          );
          const remainingDeputies = activeDeputies.rows.filter((r) => Number(r.id) !== Number(targetUserId));
          if (remainingDeputies.length === 0) {
            throw badRequest("Phải giữ lại ít nhất một tài khoản Phó HTX đang hoạt động để giám sát phê duyệt chéo.");
          }
        }
        await lockConn.query("COMMIT");
      } catch (err) {
        await lockConn.query("ROLLBACK");
        throw err;
      }
      // Giữ nguyên pg_advisory_lock xuyên suốt cho tới khi fn() hoàn tất UPDATE để triệt tiêu TOCTOU
      return await fn();
    } finally {
      await lockConn.query("SELECT pg_advisory_unlock($1)", [ADMIN_MUTATION_ADVISORY_LOCK]).catch(() => undefined);
      lockConn.release();
    }
  }

  override async update(id: number, dto: object, user: AuthUser, ip?: string) {
    const patch = dto as { role?: string; status?: string };
    if (id === user.id && (patch.status === "locked" || (patch.role !== undefined && patch.role !== user.role))) {
      throw forbidden("Không thể tự khóa hoặc tự hạ quyền chính tài khoản đang đăng nhập.");
    }
    const mayReduceLeadership =
      patch.role !== undefined || (patch.status !== undefined && patch.status !== "active");
    return this.withSerializedAdminGuard(id, mayReduceLeadership, () => super.update(id, dto, user, ip));
  }

  override async remove(id: number, user: AuthUser, ip?: string) {
    if (id === user.id) throw forbidden("Không thể xóa chính tài khoản đang đăng nhập.");
    return this.deletionRequests.requestDeletion({ targetType: "account", targetId: id }, user, ip);
  }

  /** Khóa tài khoản, đổi mật khẩu, đổi email, đổi vai trò hoặc đổi bất kỳ phạm vi quản lý nào thì tăng token_version và thu hồi mọi phiên đăng nhập. */
  protected override async afterWrite(userId: number, input: Record<string, unknown>) {
    if (
      input.status === "locked" ||
      input.status === "active" ||
      input.passwordHash !== undefined ||
      input.role !== undefined ||
      input.villageId !== undefined ||
      input.householdId !== undefined ||
      input.enterpriseId !== undefined ||
      input.assignedCommune !== undefined ||
      input.assignedRegion !== undefined ||
      input.coopCode !== undefined ||
      input.username !== undefined ||
      input.email !== undefined
    ) {
      const shouldUnlockCounters = input.passwordHash !== undefined || input.status === "active";
      const shouldRevokeSessions = input.status !== "active" || input.passwordHash !== undefined || input.role !== undefined || input.username !== undefined || input.email !== undefined || input.villageId !== undefined || input.householdId !== undefined || input.enterpriseId !== undefined || input.assignedCommune !== undefined || input.assignedRegion !== undefined || input.coopCode !== undefined;

      const tasks: Promise<unknown>[] = [];
      if (shouldUnlockCounters && shouldRevokeSessions) {
        tasks.push(
          this.db.query(
            `UPDATE users
             SET failed_login_count = 0,
                 locked_until = NULL,
                 two_factor_failed_count = 0,
                 cccd_reset_failed_count = 0,
                 cccd_reset_locked_until = NULL,
                 token_version = token_version + 1
             WHERE id = $1`,
            [userId],
          ),
        );
      } else if (shouldUnlockCounters) {
        tasks.push(
          this.db.query(
            `UPDATE users
             SET failed_login_count = 0,
                 locked_until = NULL,
                 two_factor_failed_count = 0,
                 cccd_reset_failed_count = 0,
                 cccd_reset_locked_until = NULL
             WHERE id = $1`,
            [userId],
          ),
        );
      } else if (shouldRevokeSessions) {
        tasks.push(this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [userId]));
      }
      let clearedResetsPromise: Promise<{ rows: { id: number }[] }> | null = null;
      if (input.passwordHash !== undefined) {
        clearedResetsPromise = this.db.query<{ id: number }>(
          "DELETE FROM password_reset_requests WHERE user_id = $1 AND status = 'pending' RETURNING id",
          [userId],
        );
        tasks.push(clearedResetsPromise);
      }
      if (shouldRevokeSessions) {
        tasks.push(
          this.db.query(
            "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
            [userId],
          ),
        );
      }
      if (
        input._targetPrevRole !== null &&
        input._targetPrevRole !== undefined &&
        input.passwordHash !== undefined &&
        Number(input._actorId) > 0 &&
        Number(input._actorId) !== Number(userId)
      ) {
        const hasCredResetCol = await hasPublicColumn(this.db, "users", "credential_reset_by");
        if (hasCredResetCol) {
          tasks.push(
            this.db.query(
              "UPDATE users SET credential_reset_by = $2, credential_reset_at = now() WHERE id = $1",
              [userId, Number(input._actorId)],
            ),
          );
        }
      }
      await Promise.all(tasks);
      if (shouldRevokeSessions) {
        this.notifications?.disconnectUserStreams(Number(userId));
      }
      if (input.role === "htx_deputy" || input._targetPrevRole === "htx_deputy") {
        await this.notifications?.notifyRoles(
          ["admin", "htx_head", "htx_deputy"],
          {
            kind: "system",
            title: "Cập nhật thông tin tài khoản Phó HTX",
            body: "Tài khoản Phó HTX vừa được khởi tạo hoặc cập nhật thông tin bảo mật trong Quản trị hệ thống.",
            link: "/admin?section=system",
          },
          Number(input._actorId) > 0 ? { excludeUserId: Number(input._actorId) } : undefined,
        );
      }
      const linksToResolve: string[] = [];
      if (input.status === "active" || input.status === "locked") {
        linksToResolve.push(`/admin?section=approval&sub=registrations&id=${userId}`);
      }
      if (clearedResetsPromise) {
        const cleared = await clearedResetsPromise;
        for (const r of cleared.rows) {
          linksToResolve.push(`/admin?section=registrations&id=${r.id}`);
        }
      }
      if (linksToResolve.length > 0) {
        await this.notifications?.resolveByLinks(linksToResolve);
      }
    }
  }

  /** Quản trị viên đăng xuất từ xa toàn bộ thiết bị đang đăng nhập của một tài khoản. */
  async revokeUserSessions(targetUserId: number, actor: AuthUser, ip?: string) {
    const target = await this.db.query<{ id: number; username: string; full_name: string; role: string }>(
      "SELECT id, username, full_name, role FROM users WHERE id = $1",
      [targetUserId],
    );
    if (!target.rows[0]) throw notFound("Không tìm thấy tài khoản.");
    if (Number(targetUserId) !== Number(actor.id)) {
      assertRoleHierarchy(actor.role, target.rows[0].role, null);
    }

    const [, revRes] = await Promise.all([
      this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [targetUserId]),
      this.db.query(
        "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
        [targetUserId],
      ),
    ]);
    this.notifications?.disconnectUserStreams(Number(targetUserId));
    await this.audit.write(
      { ip, user: actor },
      {
        action: "Đăng xuất từ xa tài khoản",
        object: `${target.rows[0].full_name} (${target.rows[0].username})`,
        detail: `Thu hồi ${revRes.rowCount ?? 0} phiên`,
      },
    );
    return { ok: true as const, revokedCount: revRes.rowCount ?? 0 };
  }

  /** Quản trị viên đặt lại xác thực 2 lớp khi cán bộ/đối tác mất thiết bị xác thực (sau khi đối chiếu). */
  async resetTwoFactor(targetUserId: number, actor: AuthUser, ip?: string) {
    const target = await this.db.query<{ id: number; username: string; full_name: string; role: string }>(
      "SELECT id, username, full_name, role FROM users WHERE id = $1",
      [targetUserId],
    );
    if (!target.rows[0]) throw notFound("Không tìm thấy tài khoản.");
    if (Number(targetUserId) !== Number(actor.id)) {
      assertRoleHierarchy(actor.role, target.rows[0].role, null);
    }
    if (target.rows[0].role === "htx_deputy" && Number(targetUserId) !== Number(actor.id)) {
      await this.assertNoPendingDeletionsByActor(actor.id);
    }
    const hasCredResetCol = await hasPublicColumn(this.db, "users", "credential_reset_by");
    const credResetClause =
      hasCredResetCol && Number(targetUserId) !== Number(actor.id)
        ? ", credential_reset_by = $2, credential_reset_at = now()"
        : "";
    const updateParams =
      hasCredResetCol && Number(targetUserId) !== Number(actor.id)
        ? [targetUserId, actor.id]
        : [targetUserId];

    await Promise.all([
      this.db.query(
        `UPDATE users
         SET two_factor_enabled = false,
             two_factor_secret = NULL,
             two_factor_pending_secret = NULL,
             two_factor_backup_codes = '[]'::jsonb,
             two_factor_last_used_step = NULL,
             two_factor_failed_count = 0,
             failed_login_count = 0,
             locked_until = NULL,
             token_version = token_version + 1${credResetClause}
         WHERE id = $1`,
        updateParams,
      ),
      this.db.query(
        "DELETE FROM auth_otp_challenges WHERE user_id = $1",
        [targetUserId],
      ),
      this.db.query(
        "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
        [targetUserId],
      ),
    ]);
    this.notifications?.disconnectUserStreams(Number(targetUserId));
    if (target.rows[0].role === "htx_deputy") {
      await this.notifications?.notifyRoles(["admin", "htx_head", "htx_deputy"], {
        kind: "system",
        title: `Đặt lại xác thực 2 lớp (2FA) tài khoản Phó HTX: ${target.rows[0].full_name}`,
        body: `Thực hiện bởi ${actor.fullName} (${actor.username}).`,
        link: "/admin?section=system",
      });
    }
    await this.audit.write(
      { ip, user: actor },
      {
        action: "Đặt lại xác thực 2 lớp (2FA)",
        object: `${target.rows[0].full_name} (${target.rows[0].username})`,
      },
    );
    return { ok: true as const };
  }

  private async assertNotLastActiveDeputy(userId: number) {
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ role: string; status: string }>(
        "SELECT role, status FROM users WHERE id = $1 FOR UPDATE",
        [userId],
      );
      if (rows[0]?.role === "htx_deputy" && rows[0]?.status === "active") {
        const deputies = await client.query<{ id: number }>(
          "SELECT id FROM users WHERE role = 'htx_deputy' AND status = 'active' FOR UPDATE",
        );
        const remaining = deputies.rows.filter((r) => Number(r.id) !== Number(userId));
        if (remaining.length === 0) {
          throw badRequest("Phải giữ lại ít nhất một tài khoản Phó HTX đang hoạt động để giám sát phê duyệt chéo.");
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
