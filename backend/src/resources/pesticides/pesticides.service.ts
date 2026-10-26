import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class PesticidesService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "pesticides",
      label: "Thuốc BVTV",
      table: "pesticides",
      fields: `t.id, t.name, t.active_ingredient, t.concentration, t.manufacturer,
      t.mrl_mg_kg, t.isolation_days, t.status`,
      from: `pesticides t`,
      orderBy: "t.id",
      search: ["t.name", "t.active_ingredient", "t.manufacturer"],
      filters: { status: "t.status" },
    });
  }
}
