import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class HarvestService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "harvest",
      label: "Lô thu hoạch",
      table: "harvest_lots",
      fields: `t.id, t.code, t.harvested_on, t.weight_tons, t.household_count, t.buyer, t.market,
      t.qr_code, t.status`,
      from: `harvest_lots t`,
      orderBy: "t.harvested_on DESC, t.id DESC",
      search: ["t.code", "t.buyer", "t.market"],
      filters: { status: "t.status", market: "t.market" },
    });
  }
}
