import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { ADMIN_PRIVILEGED_ROLES, isAdminPrivilegedRole } from "../../auth/permissions";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { AppException, badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

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
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "accounts",
      label: "Tài khoản",
      table: "users",
      fields: `t.id, t.full_name, t.username, t.email, t.role, t.status, t.village_id,
      v.name AS village_name, t.household_id, t.enterprise_id, e.name AS enterprise_name,
      e.packhouse_code AS enterprise_packhouse_code, t.assigned_commune, t.assigned_region,
      t.coop_code, t.two_factor_enabled,
      (SELECT count(*)::int FROM refresh_tokens rt WHERE rt.user_id = t.id AND rt.revoked_at IS NULL AND rt.expires_at > now()) AS active_session_count,
      t.last_login_at, t.created_at`,
      from: `users t
             LEFT JOIN villages v ON v.id = t.village_id
             LEFT JOIN enterprises e ON e.id = t.enterprise_id`,
      orderBy: "t.id",
      search: ["t.full_name", "t.username", "t.email", "e.name"],
      filters: { role: "t.role", status: "t.status" },
      virtual: ["password"],
    });
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

    let existing: { role: string; status: string; household_id: number | null } | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const curRes = await this.db.query<{ role: string; status: string; household_id: number | null }>(
        "SELECT role, status, household_id FROM users WHERE id = $1",
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
      }
    }

    if (typeof next.username === "string") {
      const cleanUsername = next.username.trim();
      next.username = cleanUsername;
      const dupRes = await this.db.query<{ id: number }>(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND ($2::bigint IS NULL OR id <> $2) LIMIT 1",
        [cleanUsername, context.id ?? null],
      );
      if ((dupRes.rowCount ?? 0) > 0) {
        throw new AppException(409, `Tên đăng nhập "${cleanUsername}" đã được sử dụng.`, "DB_23505");
      }
    }

    const effRole = String(next.role ?? existing?.role ?? "");
    const isSelfPatch = context.method === "PATCH" && context.id !== undefined && Number(context.id) === Number(context.user.id);
    if (!isSelfPatch) {
      assertRoleHierarchy(context.user.role, existing?.role ?? null, typeof next.role === "string" ? next.role : null);
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
      ((next.role !== undefined && !isAdminPrivilegedRole(String(next.role))) ||
        (next.status !== undefined && next.status !== "active"))
    ) {
      await this.assertNotLastActiveAdmin(context.id);
    }
    if (next.villageId !== undefined && next.villageId !== null) {
      const village = await this.db.query("SELECT 1 FROM villages WHERE id = $1", [next.villageId]);
      if (village.rowCount === 0) throw badRequest("Thôn được chọn không tồn tại.");
    }
    if (next.householdId !== undefined && next.householdId !== null) {
      const household = await this.db.query("SELECT 1 FROM households WHERE id = $1", [next.householdId]);
      if (household.rowCount === 0) throw badRequest("Hộ nông dân được chọn không tồn tại.");
    }
    if (next.enterpriseId !== undefined && next.enterpriseId !== null) {
      const ent = await this.db.query("SELECT 1 FROM enterprises WHERE id = $1", [next.enterpriseId]);
      if (ent.rowCount === 0) throw badRequest("Doanh nghiệp hoặc cơ sở đóng gói được chọn không tồn tại.");
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
    return next;
  }

  /** Tuần tự hóa kiểm tra quản trị viên cuối cùng bằng khóa tư vấn và FOR UPDATE trong giao dịch trước khi cập nhật/xóa. */
  private async withSerializedAdminGuard<T>(
    targetUserId: number,
    mayReduceAdmins: boolean,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!mayReduceAdmins) {
      return fn();
    }
    const client = await this.db.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [ADMIN_MUTATION_ADVISORY_LOCK]);
      await client.query("BEGIN");
      try {
        const targetRes = await client.query<{ role: string; status: string }>(
          "SELECT role, status FROM users WHERE id = $1 FOR UPDATE",
          [targetUserId],
        );
        if (isAdminPrivilegedRole(targetRes.rows[0]?.role) && targetRes.rows[0]?.status === "active") {
          const activeAdmins = await client.query<{ id: number }>(
            "SELECT id FROM users WHERE role = ANY($1::text[]) AND status = 'active' FOR UPDATE",
            [ADMIN_PRIVILEGED_ROLES],
          );
          const remaining = activeAdmins.rows.filter((r) => Number(r.id) !== Number(targetUserId));
          if (remaining.length === 0) {
            throw badRequest("Phải giữ lại ít nhất một tài khoản quản trị viên đang hoạt động.");
          }
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADMIN_MUTATION_ADVISORY_LOCK]).catch(() => undefined);
      client.release();
    }
  }

  override async update(id: number, dto: object, user: AuthUser, ip?: string) {
    const patch = dto as { role?: string; status?: string };
    if (id === user.id && (patch.status === "locked" || (patch.role !== undefined && patch.role !== user.role))) {
      throw forbidden("Không thể tự khóa hoặc tự hạ quyền chính tài khoản đang đăng nhập.");
    }
    const mayReduceAdmins =
      (patch.role !== undefined && !isAdminPrivilegedRole(patch.role)) ||
      (patch.status !== undefined && patch.status !== "active");
    return this.withSerializedAdminGuard(id, mayReduceAdmins, () => super.update(id, dto, user, ip));
  }

  override async remove(id: number, user: AuthUser, ip?: string) {
    if (id === user.id) throw forbidden("Không thể xóa chính tài khoản đang đăng nhập.");
    return this.withSerializedAdminGuard(id, true, () => super.remove(id, user, ip));
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
      if (shouldUnlockCounters) {
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
      }
      if (input.passwordHash !== undefined) {
        tasks.push(
          this.db.query("DELETE FROM password_reset_requests WHERE user_id = $1 AND status = 'pending'", [userId]),
        );
      }
      if (shouldRevokeSessions) {
        tasks.push(
          this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [userId]),
          this.db.query(
            "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
            [userId],
          ),
        );
      }
      await Promise.all(tasks);
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
             token_version = token_version + 1
         WHERE id = $1`,
        [targetUserId],
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
    await this.audit.write(
      { ip, user: actor },
      {
        action: "Đặt lại xác thực 2 lớp (2FA)",
        object: `${target.rows[0].full_name} (${target.rows[0].username})`,
      },
    );
    return { ok: true as const };
  }

  protected override async guardDelete(userId: number, user: AuthUser) {
    if (userId === user.id) throw forbidden("Không thể xóa chính tài khoản đang đăng nhập.");
    const target = await this.db.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [userId]);
    if (target.rows[0]) {
      assertRoleHierarchy(user.role, target.rows[0].role, null);
    }
    await this.assertNotLastActiveAdmin(userId);
  }

  private async assertNotLastActiveAdmin(userId: number) {
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ role: string; status: string }>(
        "SELECT role, status FROM users WHERE id = $1 FOR UPDATE",
        [userId],
      );
      if (isAdminPrivilegedRole(rows[0]?.role) && rows[0]?.status === "active") {
        const admins = await client.query<{ id: number }>(
          "SELECT id FROM users WHERE role = ANY($1::text[]) AND status = 'active' FOR UPDATE",
          [ADMIN_PRIVILEGED_ROLES],
        );
        const remaining = admins.rows.filter((r) => Number(r.id) !== Number(userId));
        if (remaining.length === 0) {
          throw badRequest("Phải giữ lại ít nhất một tài khoản quản trị viên đang hoạt động.");
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
