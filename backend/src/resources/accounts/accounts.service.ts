import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

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
    const next = { ...input };
    if (typeof next.password === "string") next.passwordHash = await bcrypt.hash(next.password, 12);
    delete next.password;
    if (context.method === "PATCH" && context.id === context.user.id && (next.role !== undefined || next.status !== undefined)) {
      throw forbidden("Không thể tự đổi vai trò hoặc khóa chính mình.");
    }
    if (
      context.method === "PATCH" &&
      context.id !== undefined &&
      ((next.role !== undefined && next.role !== "admin") || (next.status !== undefined && next.status !== "active"))
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
      if (ent.rowCount === 0) throw badRequest("Doanh nghiệp / cơ sở đóng gói được chọn không tồn tại.");
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

  /** Khóa tài khoản, đổi mật khẩu, đổi vai trò hoặc đổi bất kỳ phạm vi quản lý nào thì tăng token_version và thu hồi mọi phiên đăng nhập. */
  protected override async afterWrite(userId: number, input: Record<string, unknown>) {
    if (
      input.status === "locked" ||
      input.passwordHash !== undefined ||
      input.role !== undefined ||
      input.villageId !== undefined ||
      input.householdId !== undefined ||
      input.enterpriseId !== undefined ||
      input.assignedCommune !== undefined ||
      input.assignedRegion !== undefined ||
      input.coopCode !== undefined ||
      input.username !== undefined
    ) {
      await Promise.all([
        this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [userId]),
        this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
          userId,
        ]),
      ]);
    }
  }

  /** Quản trị viên đăng xuất từ xa toàn bộ thiết bị đang đăng nhập của một tài khoản. */
  async revokeUserSessions(targetUserId: number, actor: AuthUser, ip?: string) {
    const target = await this.db.query<{ id: number; username: string; full_name: string }>(
      "SELECT id, username, full_name FROM users WHERE id = $1",
      [targetUserId],
    );
    if (!target.rows[0]) throw notFound("Không tìm thấy tài khoản.");

    const [, revRes] = await Promise.all([
      this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [targetUserId]),
      this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
        targetUserId,
      ]),
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
    const target = await this.db.query<{ id: number; username: string; full_name: string }>(
      "SELECT id, username, full_name FROM users WHERE id = $1",
      [targetUserId],
    );
    if (!target.rows[0]) throw notFound("Không tìm thấy tài khoản.");

    await Promise.all([
      this.db.query(
        `UPDATE users
         SET two_factor_enabled = false,
             two_factor_secret = NULL,
             two_factor_pending_secret = NULL,
             two_factor_backup_codes = '[]'::jsonb,
             token_version = token_version + 1
         WHERE id = $1`,
        [targetUserId],
      ),
      this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
        targetUserId,
      ]),
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
    await this.assertNotLastActiveAdmin(userId);
  }

  private async assertNotLastActiveAdmin(userId: number) {
    const { rows } = await this.db.query<{ role: string; status: string }>(
      "SELECT role, status FROM users WHERE id = $1",
      [userId],
    );
    if (rows[0]?.role === "admin" && rows[0]?.status === "active") {
      const admins = await this.db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active' AND id <> $1",
        [userId],
      );
      if (admins.rows[0].n === 0) {
        throw badRequest("Phải giữ lại ít nhất một tài khoản quản trị viên đang hoạt động.");
      }
    }
  }
}
