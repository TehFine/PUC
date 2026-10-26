import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class TrainingService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "training",
      label: "Khóa đào tạo",
      table: "training_courses",
      fields: `t.id, t.title, t.held_on, t.location, t.trainer, t.enrolled, t.capacity, t.completed`,
      from: `training_courses t`,
      orderBy: "t.completed, t.held_on NULLS LAST, t.id",
      search: ["t.title", "t.trainer", "t.location"],
      filters: { completed: "t.completed" },
    });
  }
}
