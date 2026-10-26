import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class AuditLogService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "audit-log",
      label: "Nhật ký",
      table: "audit_logs",
      fields: `t.id, t.occurred_at, t.user_id, t.user_name, t.ip, t.action, t.object, t.detail`,
      from: `audit_logs t`,
      orderBy: "t.occurred_at DESC, t.id DESC",
      search: ["t.user_name", "t.action", "t.object", "t.detail"],
      filters: { action: "t.action", userId: "t.user_id" },
    });
  }
}
