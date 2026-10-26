import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class VarietiesService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "varieties",
      label: "Giống sầu riêng",
      table: "varieties",
      fields: `t.id, t.name, t.origin, t.weight_range, t.harvest_years, t.description`,
      from: `varieties t`,
      orderBy: "t.id",
      search: ["t.name", "t.origin"],
    });
  }
}
