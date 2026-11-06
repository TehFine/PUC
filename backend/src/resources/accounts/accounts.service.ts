import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, forbidden } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class AccountsService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "accounts",
      label: "Tài khoản",
      table: "users",
      fields: `t.id, t.full_name, t.username, t.role, t.status, t.village_id,
      v.name AS village_name, t.household_id, t.last_login_at, t.created_at`,
      from: `users t LEFT JOIN villages v ON v.id = t.village_id`,
      orderBy: "t.id",
      search: ["t.full_name", "t.username"],
      filters: { role: "t.role", status: "t.status" },
      virtual: ["password"],
    });
  }

  /** Băm mật khẩu trước khi lưu; không cho tự đổi vai trò, khóa chính mình, hoặc làm mất quản trị viên cuối cùng. */
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
    return next;
  }

  /** Khóa tài khoản, đổi mật khẩu, đổi vai trò hoặc đổi phạm vi thôn/hộ thì thu hồi mọi phiên đăng nhập. */
  protected override async afterWrite(userId: number, input: Record<string, unknown>) {
    if (
      input.status === "locked" ||
      input.passwordHash !== undefined ||
      input.role !== undefined ||
      input.villageId !== undefined ||
      input.householdId !== undefined ||
      input.username !== undefined
    ) {
      await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
    }
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
