import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { isStaffInCuneCoopScope } from "../../common/crud/village-scope";
import { forbidden } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

/**
 * Tài khoản doanh nghiệp chỉ được xem hồ sơ của chính doanh nghiệp mình (không dò được mã số thuế,
 * SĐT, người đại diện của đối thủ). Tài khoản doanh nghiệp chưa gắn `enterpriseId` không thấy gì.
 */
export const enterpriseSelfScope = (column: string) => (user: AuthUser, params: unknown[]) => {
  if (user.role === "enterprise") {
    if (!user.enterpriseId) return "1 = 0";
    params.push(user.enterpriseId);
    return `${column} = $${params.length}`;
  }
  if (!isStaffInCuneCoopScope(user, true)) {
    return "1 = 0";
  }
  return null;
};

@Injectable()
export class EnterprisesService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "enterprises",
      label: "Doanh nghiệp liên kết",
      table: "enterprises",
      fields: `t.id, t.code, t.name, t.tax_code, t.representative, t.phone, t.address, t.packhouse_code, t.status, t.created_at`,
      from: `enterprises t`,
      orderBy: "t.id",
      search: ["t.name", "t.code", "t.representative", "t.packhouse_code"],
      filters: { status: "t.status" },
      scope: enterpriseSelfScope("t.id"),
    });
  }

  protected override prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, false)) {
      throw forbidden("Bạn không có quyền cập nhật hồ sơ doanh nghiệp ngoài phạm vi quản lý.");
    }
    return input;
  }

  /** Khi tạm ngưng hoặc chấm dứt hợp tác doanh nghiệp, thu hồi ngay mọi phiên đăng nhập của tài khoản thuộc doanh nghiệp đó. */
  protected override async afterWrite(id: number, input: Record<string, unknown>) {
    if (input.status !== undefined && input.status !== "active") {
      await Promise.all([
        this.db.query(
          `UPDATE refresh_tokens
           SET revoked_at = now(), revoked_reason = 'security'
           WHERE user_id IN (SELECT id FROM users WHERE enterprise_id = $1) AND revoked_at IS NULL`,
          [id],
        ),
        this.db.query("UPDATE users SET token_version = token_version + 1 WHERE enterprise_id = $1", [id]),
      ]);
    }
  }

  override async remove(id: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, false)) {
      throw forbidden("Bạn không có quyền xóa doanh nghiệp ngoài phạm vi quản lý.");
    }
    const { rows } = await this.db.query<{ id: number }>("SELECT id FROM users WHERE enterprise_id = $1", [id]);
    const linkedUserIds = rows.map((r) => Number(r.id));
    const result = await super.remove(id, user, ip);
    if (linkedUserIds.length > 0) {
      await Promise.all([
        this.db.query(
          `UPDATE refresh_tokens
           SET revoked_at = now(), revoked_reason = 'security'
           WHERE user_id = ANY($1::bigint[]) AND revoked_at IS NULL`,
          [linkedUserIds],
        ),
        this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = ANY($1::bigint[])", [
          linkedUserIds,
        ]),
      ]);
    }
    return result;
  }
}
