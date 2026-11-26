import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { isStaffInCuneCoopScope } from "../../common/crud/village-scope";
import { badRequest, forbidden } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { enterpriseSelfScope } from "../enterprises/enterprises.service";

@Injectable()
export class ContractsService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "contracts",
      label: "Hợp đồng liên kết thu mua",
      table: "contracts",
      fields: `t.id, t.code, t.enterprise_id, e.name AS enterprise_name, e.packhouse_code,
      t.title, t.signed_on, t.valid_until, t.target_tons, t.price_guarantee, t.market, t.status, t.notes, t.created_at`,
      from: `contracts t JOIN enterprises e ON e.id = t.enterprise_id`,
      orderBy: "t.signed_on DESC, t.id DESC",
      search: ["t.code", "t.title", "e.name", "t.market"],
      filters: { status: "t.status", enterpriseId: "t.enterprise_id", market: "t.market" },
      // Doanh nghiệp chỉ thấy hợp đồng của chính mình (giá bảo lãnh, sản lượng cam kết là bí mật thương mại); cán bộ ngoài HTX bị chặn.
      scope: (user, params) => {
        if (user.role === "enterprise") {
          return enterpriseSelfScope("t.enterprise_id")(user, params);
        }
        if (!isStaffInCuneCoopScope(user, false)) {
          return "1 = 0";
        }
        return null;
      },
    });
  }

  private async querySummary(user: AuthUser): Promise<{
    totalCount: number;
    activeCount: number;
    activeTargetTons: number;
  }> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    const scoped = this.config.scope?.(user, params);
    if (scoped) conditions.push(scoped);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.db.query<{
      total_count: number;
      active_count: number;
      active_target_tons: number;
    }>(
      `SELECT COUNT(*)::int AS total_count,
              COUNT(*) FILTER (WHERE t.status = 'active')::int AS active_count,
              COALESCE(SUM(t.target_tons) FILTER (WHERE t.status = 'active'), 0)::float8 AS active_target_tons
         FROM contracts t
         JOIN enterprises e ON e.id = t.enterprise_id
        ${where}`,
      params,
    );
    const row = rows[0];
    return {
      totalCount: Number(row?.total_count ?? 0),
      activeCount: Number(row?.active_count ?? 0),
      activeTargetTons: Number(row?.active_target_tons ?? 0),
    };
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    // Bỏ qua bộ lọc enterpriseId do client gửi với tài khoản doanh nghiệp: phạm vi đã cố định theo tài khoản.
    const cleanQuery = user.role === "enterprise" ? { ...query, enterpriseId: undefined } : query;
    const [res, summary] = await Promise.all([
      super.list(user, cleanQuery),
      this.querySummary(user),
    ]);
    return { ...res, summary };
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, false)) {
      throw forbidden("Bạn không có quyền thao tác hợp đồng bao tiêu ngoài phạm vi đơn vị.");
    }
    if (input.enterpriseId !== undefined && input.enterpriseId !== null) {
      const ent = await this.db.query("SELECT 1 FROM enterprises WHERE id = $1", [input.enterpriseId]);
      if (ent.rowCount === 0) throw badRequest("Doanh nghiệp liên kết không tồn tại.");
    }

    let existingDates: { signed_on: string | null; valid_until: string | null } | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const ex = await this.db.query<{ signed_on: string | null; valid_until: string | null }>(
        `SELECT to_char(signed_on, 'YYYY-MM-DD') AS signed_on,
                to_char(valid_until, 'YYYY-MM-DD') AS valid_until
         FROM contracts
         WHERE id = $1`,
        [context.id],
      );
      existingDates = ex.rows[0];
    }

    const effSignedOn =
      input.signedOn !== undefined
        ? typeof input.signedOn === "string" && input.signedOn.trim()
          ? input.signedOn.trim().slice(0, 10)
          : null
        : existingDates?.signed_on ?? null;
    const effValidUntil =
      input.validUntil !== undefined
        ? typeof input.validUntil === "string" && input.validUntil.trim()
          ? input.validUntil.trim().slice(0, 10)
          : null
        : existingDates?.valid_until ?? null;

    if (effSignedOn && effValidUntil && effValidUntil < effSignedOn) {
      throw badRequest("Ngày hết hiệu lực hợp đồng không được nhỏ hơn ngày ký.");
    }
    return input;
  }

  protected override guardDelete(_id: number, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, false)) {
      throw forbidden("Bạn không có quyền xóa hợp đồng bao tiêu ngoài phạm vi đơn vị.");
    }
  }
}
