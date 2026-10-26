import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class ScheduleService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "schedule",
      label: "Lịch kiểm tra",
      table: "inspection_schedule",
      fields: `t.id, t.scheduled_on, t.title, t.officer, t.plot_count, t.kind`,
      from: `inspection_schedule t`,
      orderBy: "t.scheduled_on ASC, t.id",
      search: ["t.title", "t.officer"],
      filters: { kind: "t.kind" },
    });
  }
}
