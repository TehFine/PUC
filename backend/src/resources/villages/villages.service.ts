import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class VillagesService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "villages",
      label: "Thôn",
      table: "villages",
      fields: `t.id, t.name, t.leader, t.household_count, t.plot_count, t.area_ha`,
      from: `villages t`,
      orderBy: "t.id",
      search: ["t.name", "t.leader"],
    });
  }
}
