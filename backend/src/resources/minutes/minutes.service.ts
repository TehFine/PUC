import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class MinutesService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "minutes",
      label: "Biên bản kiểm tra",
      table: "inspection_minutes",
      fields: `t.id, t.code, t.held_on, t.location, t.officer, t.result`,
      from: `inspection_minutes t`,
      orderBy: "t.held_on DESC, t.id DESC",
      search: ["t.code", "t.location", "t.officer"],
      filters: { result: "t.result" },
    });
  }
}
