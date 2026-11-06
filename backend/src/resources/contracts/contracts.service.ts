import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

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
    });
  }

  protected override async prepare(input: Record<string, unknown>, _context: WriteContext) {
    if (input.enterpriseId !== undefined && input.enterpriseId !== null) {
      const ent = await this.db.query("SELECT 1 FROM enterprises WHERE id = $1", [input.enterpriseId]);
      if (ent.rowCount === 0) throw badRequest("Doanh nghiệp liên kết không tồn tại.");
    }
    if (
      typeof input.signedOn === "string" &&
      typeof input.validUntil === "string" &&
      input.validUntil < input.signedOn
    ) {
      throw badRequest("Ngày hết hiệu lực hợp đồng không được nhỏ hơn ngày ký.");
    }
    return input;
  }
}
