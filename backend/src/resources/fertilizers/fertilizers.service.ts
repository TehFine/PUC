import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class FertilizersService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "fertilizers",
      label: "Phân bón",
      table: "fertilizers",
      fields: `t.id, t.name, t.category, t.formula, t.manufacturer, t.dosage,
      t.application_method, t.timing, t.status, t.image_url, t.description,
      t.created_at, t.updated_at`,
      from: `fertilizers t`,
      orderBy: "t.id",
      search: ["t.name", "t.formula", "t.manufacturer"],
      filters: { category: "t.category", status: "t.status" },
    });
  }
}
