import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { can } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest, forbidden } from "../../common/errors/app.exception";
import { camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertExists, invalidState } from "../shared/state";

@Injectable()
export class ApprovalsService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "approvals",
      label: "Hồ sơ phê duyệt",
      table: "approvals",
      fields: `t.id, t.code, t.applicant_name, t.request_type, t.submitted_on, t.docs_count,
      t.priority, t.status, t.household_id, t.note, t.plot_code, t.review_note,
      t.reviewed_by, t.reviewed_at, t.created_at`,
      from: `approvals t`,
      orderBy: "t.submitted_on DESC, t.id DESC",
      search: ["t.code", "t.applicant_name", "t.request_type", "t.plot_code"],
      filters: { status: "t.status", priority: "t.priority", householdId: "t.household_id" },
    });
  }

  override async findOne(id: number, user: AuthUser) {
    const row = await super.findOne(id, user);
    const { rows } = await this.db.query(
      `SELECT a.id, '/api/uploads/' || a.id AS url, a.mime_type, a.original_name, a.size_bytes
       FROM approval_attachments aa
       JOIN attachments a ON a.id = aa.attachment_id
       WHERE aa.approval_id = $1
       ORDER BY a.id`,
      [id],
    );
    return { ...row, attachments: camelRows(rows) };
  }

  async review(
    id: number,
    status: "approved" | "rejected",
    note: string | null | undefined,
    user: AuthUser,
    ip?: string,
  ) {
    const { rows } = await this.db.query<{
      id: number;
      code: string;
      request_type: string;
      household_id: number | null;
    }>(
      `UPDATE approvals
       SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = COALESCE($4, review_note)
       WHERE id = $1 AND status = 'pending'
       RETURNING id, code, request_type, household_id`,
      [id, status, user.id, note ?? null],
    );
    if (rows.length === 0) {
      await assertExists(this.db, "approvals", id, "Chỉ xử lý được hồ sơ đang chờ duyệt.");
    }
    const row = rows[0];
    const action = status === "approved" ? "Duyệt hồ sơ" : "Từ chối hồ sơ";
    await this.audit.write({ ip, user }, { action, object: `${this.config.label} #${id}`, detail: note ?? row.code });
    await this.notifications.notifyHousehold(row.household_id, {
      kind: "approval",
      title: status === "approved" ? `Hồ sơ ${row.code} đã được duyệt` : `Hồ sơ ${row.code} bị từ chối`,
      body: note ?? row.request_type,
      link: "/portal?tab=home",
    });
    return this.findOne(id, user);
  }

  /** Duyệt/từ chối hồ sơ qua PATCH thì kiểm tra quyền duyệt, trạng thái pending và ghi lại người duyệt, thời điểm duyệt. */
  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (input.householdId !== undefined && input.householdId !== null) {
      const hh = await this.db.query("SELECT 1 FROM households WHERE id = $1", [input.householdId]);
      if (hh.rowCount === 0) throw badRequest("Hộ nông dân không tồn tại.");
    }
    if (context.method === "PATCH" && context.id !== undefined && input.status !== undefined) {
      const curRes = await this.db.query<{ status: string }>("SELECT status FROM approvals WHERE id = $1", [context.id]);
      const currentStatus = curRes.rows[0]?.status;
      if (currentStatus && currentStatus !== "pending" && input.status !== currentStatus) {
        throw invalidState("Chỉ xử lý chuyển trạng thái đối với hồ sơ đang chờ duyệt.");
      }
    }
    if (input.status === "approved" || input.status === "rejected") {
      if (!can(context.user.role, "approvals", "update")) {
        throw forbidden("Bạn không có quyền phê duyệt hoặc từ chối hồ sơ.");
      }
      return { ...input, reviewedBy: context.user.id, reviewedAt: new Date().toISOString() };
    }
    return input;
  }

  protected override auditAction(_method: "POST" | "PATCH", input: Record<string, unknown>) {
    return input.status === "approved" ? "Duyệt hồ sơ" : input.status === "rejected" ? "Từ chối hồ sơ" : undefined;
  }
}
