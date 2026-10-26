import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { villageScope } from "../../common/crud/village-scope";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class HouseholdsService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "households",
      label: "Hộ nông dân",
      table: "households",
      fields: `t.id, t.code, t.name, t.cccd, t.phone, t.village_id, v.name AS village_name,
      t.plot_count, t.area_ha, t.status, t.created_at, t.updated_at`,
      from: `households t JOIN villages v ON v.id = t.village_id`,
      orderBy: "t.id",
      search: ["t.name", "t.code", "t.cccd", "t.phone"],
      filters: { villageId: "t.village_id", status: "t.status" },
      scope: villageScope("t.village_id"),
    });
  }
}
