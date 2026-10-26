import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class ApprovalsService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "approvals",
      label: "Hồ sơ phê duyệt",
      table: "approvals",
      fields: `t.id, t.code, t.applicant_name, t.request_type, t.submitted_on, t.docs_count,
      t.priority, t.status, t.reviewed_at, t.created_at`,
      from: `approvals t`,
      orderBy: "t.submitted_on DESC, t.id DESC",
      search: ["t.code", "t.applicant_name", "t.request_type"],
      filters: { status: "t.status", priority: "t.priority" },
    });
  }

  /** Duyệt/từ chối hồ sơ thì ghi lại người duyệt và thời điểm duyệt. */
  protected override prepare(input: Record<string, unknown>, context: WriteContext) {
    return context.method === "PATCH" && input.status !== undefined
      ? { ...input, reviewedBy: context.user.id, reviewedAt: new Date().toISOString() }
      : input;
  }

  protected override auditAction(_method: "POST" | "PATCH", input: Record<string, unknown>) {
    return input.status === "approved" ? "Duyệt hồ sơ" : input.status === "rejected" ? "Từ chối hồ sơ" : undefined;
  }
}
