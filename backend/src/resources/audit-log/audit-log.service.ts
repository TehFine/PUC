import { Injectable } from "@nestjs/common";
import { AuditService, redactAuditDetailText, redactAuditObjectLabel } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
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

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const res = await super.list(user, query);
    return {
      ...res,
      data: res.data.map((row) => ({
        ...row,
        object: redactAuditObjectLabel(typeof row.object === "string" ? row.object : ""),
        detail: redactAuditDetailText(typeof row.detail === "string" ? row.detail : null),
      })),
    };
  }

  override async findOne(id: number, user: AuthUser) {
    const row = await super.findOne(id, user);
    return {
      ...row,
      object: redactAuditObjectLabel(typeof row.object === "string" ? row.object : ""),
      detail: redactAuditDetailText(typeof row.detail === "string" ? row.detail : null),
    };
  }
}
