import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

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
    });
  }
}
