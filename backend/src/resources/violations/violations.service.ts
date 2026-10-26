import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class ViolationsService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "violations",
      label: "Vi phạm",
      table: "violations",
      fields: `t.id, t.severity, t.title, t.household_label, t.detected_on, t.plot_code, t.description, t.status`,
      from: `violations t`,
      orderBy: "t.detected_on DESC, t.id DESC",
      search: ["t.title", "t.household_label", "t.plot_code"],
      filters: { severity: "t.severity", status: "t.status" },
    });
  }
}
