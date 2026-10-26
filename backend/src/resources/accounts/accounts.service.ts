import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../auth/auth-user";
import { forbidden } from "../../common/errors/app.exception";
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

  /** Băm mật khẩu trước khi lưu; không cho tự đổi vai trò hoặc khóa chính mình. */
  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const next = { ...input };
    if (typeof next.password === "string") next.passwordHash = await bcrypt.hash(next.password, 12);
    delete next.password;
    if (context.method === "PATCH" && context.id === context.user.id && (next.role !== undefined || next.status !== undefined)) {
      throw forbidden("Không thể tự đổi vai trò hoặc khóa chính mình.");
    }
    return next;
  }

  /** Khóa tài khoản, đổi mật khẩu hoặc đổi vai trò thì thu hồi mọi phiên đăng nhập. */
  protected override async afterWrite(userId: number, input: Record<string, unknown>) {
    if (input.status === "locked" || input.passwordHash !== undefined || input.role !== undefined) {
      await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
    }
  }

  protected override guardDelete(userId: number, user: AuthUser) {
    if (userId === user.id) throw forbidden("Không thể xóa chính tài khoản đang đăng nhập.");
  }
}
