import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { can } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, isStaffInCuneCoopScope, villageScope } from "../../common/crud/village-scope";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned, conflict, withTransaction } from "../../portal/common/portal-context";
import { assertExists } from "../shared/state";

const FINALIZED_APPROVAL_ERR = "Hồ sơ đã được xử lý, không thể chỉnh sửa.";
const SAFE_COL_KEY = /^[a-zA-Z]+$/;
const toSnakeCol = (key: string) => key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

interface ApprovalRow {
  id: number;
  status: string;
  code: string;
  applicant_name: string;
  request_type: string;
  household_id: number | null;
  plot_code: string | null;
}

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
      from: `approvals t LEFT JOIN households h ON h.id = t.household_id`,
      orderBy: "t.submitted_on DESC, t.id DESC",
      search: ["t.code", "t.applicant_name", "t.request_type", "t.plot_code"],
      filters: { status: "t.status", priority: "t.priority", householdId: "t.household_id" },
      scope: villageScope("h.village_id"),
      virtual: ["_notifyReview", "_notifyPendingCreate"],
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

  override async update(id: number, dto: object, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền xử lý hồ sơ ngoài phạm vi quản lý.");
    }
    await this.findOne(id, user);

    const virtual = new Set(this.config.virtual ?? []);
    const { input } = await withTransaction(this.db, async (client) => {
      const locked = await client.query<{ status: string; household_id: number | null }>(
        "SELECT status, household_id FROM approvals WHERE id = $1 FOR UPDATE",
        [id],
      );
      const cur = locked.rows[0];
      if (!cur) throw notFound();
      if (cur.household_id !== null) {
        await assertHouseholdInScope(this.db, { householdId: cur.household_id }, user);
      } else if (!isStaffInCuneCoopScope(user, false)) {
        throw forbidden("Bạn không có quyền xử lý hồ sơ ngoài phạm vi quản lý.");
      }
      if (cur.status !== "pending") {
        throw conflict(FINALIZED_APPROVAL_ERR);
      }

      const prepared = await this.prepare({ ...dto }, { user, ip, method: "PATCH", id });
      const entries = Object.entries(prepared).filter(
        ([key, value]) => value !== undefined && !virtual.has(key) && SAFE_COL_KEY.test(key),
      );
      if (entries.length === 0) {
        throw badRequest("Không có trường nào để cập nhật.");
      }
      const assignments = entries.map(([key], idx) => `${toSnakeCol(key)} = $${idx + 1}`);
      const upd = await client.query(
        `UPDATE approvals SET ${assignments.join(", ")} WHERE id = $${entries.length + 1} AND status = 'pending'`,
        [...entries.map(([, value]) => value), id],
      );
      if (upd.rowCount === 0) {
        throw conflict(FINALIZED_APPROVAL_ERR);
      }
      return { input: prepared };
    });

    await this.afterWrite(id, input);
    await this.audit.write(
      { ip, user },
      {
        action: this.auditAction("PATCH", input) ?? "Cập nhật",
        object: `${this.config.label} #${id}`,
        detail: "Đã cập nhật nội dung hồ sơ đề nghị",
      },
    );
    return this.findOne(id, user);
  }

  async review(
    id: number,
    status: "approved" | "rejected",
    note: string | null | undefined,
    user: AuthUser,
    ip?: string,
  ) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền xử lý hồ sơ ngoài phạm vi quản lý.");
    }
    if (status === "rejected" && !String(note ?? "").trim()) {
      throw badRequest("Vui lòng nhập lý do từ chối hồ sơ.");
    }
    const existingRes = await this.db.query<{ id: number; household_id: number | null }>(
      "SELECT id, household_id FROM approvals WHERE id = $1",
      [id],
    );
    if (!existingRes.rows[0]) {
      throw notFound();
    }
    if (existingRes.rows[0].household_id !== null) {
      await assertHouseholdInScope(this.db, { householdId: existingRes.rows[0].household_id }, user);
    } else if (!isStaffInCuneCoopScope(user, false)) {
      throw forbidden("Bạn không có quyền xử lý hồ sơ ngoài phạm vi quản lý.");
    }

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
      await assertExists(this.db, "approvals", id, FINALIZED_APPROVAL_ERR);
    }
    const row = rows[0];
    const action = status === "approved" ? "Duyệt hồ sơ" : "Từ chối hồ sơ";
    await this.notifications.resolveByLink(`/admin?section=approval&id=${id}`);
    await this.audit.write({ ip, user }, { action, object: `${this.config.label} #${id}`, detail: note ?? row.code });
    await this.notifications.notifyHousehold(row.household_id, {
      kind: "approval",
      title: status === "approved" ? `Hồ sơ ${row.code} đã được duyệt` : `Hồ sơ ${row.code} bị từ chối`,
      body: note ?? row.request_type,
      link: "/portal?tab=home",
    });
    return this.findOne(id, user);
  }

  /** Duyệt/từ chối hồ sơ qua PATCH thì kiểm tra quyền duyệt, trạng thái pending, khóa sửa định danh và ghi người duyệt. */
  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền thao tác hồ sơ ngoài phạm vi quản lý.");
    }
    const out: Record<string, unknown> = { ...input };

    if (context.method === "PATCH" && context.id !== undefined) {
      const curRes = await this.db.query<ApprovalRow>(
        "SELECT id, status, code, applicant_name, request_type, household_id, plot_code FROM approvals WHERE id = $1",
        [context.id],
      );
      const current = curRes.rows[0];
      if (!current) {
        return out;
      }
      if (current.household_id !== null) {
        await assertHouseholdInScope(this.db, { householdId: current.household_id }, context.user);
      } else if (!isStaffInCuneCoopScope(context.user, false)) {
        throw forbidden("Bạn không có quyền xử lý hồ sơ ngoài phạm vi quản lý.");
      }
      if (current.status !== "pending") {
        throw conflict(FINALIZED_APPROVAL_ERR);
      }

      if (input.code !== undefined && String(input.code).trim() !== String(current.code).trim()) {
        throw badRequest("Không được thay đổi mã hồ sơ đang xét duyệt.");
      }
      if (input.applicantName !== undefined && String(input.applicantName).trim() !== String(current.applicant_name).trim()) {
        throw badRequest("Không được thay đổi tên người nộp hồ sơ đang xét duyệt.");
      }
      if (input.requestType !== undefined && String(input.requestType).trim() !== String(current.request_type).trim()) {
        throw badRequest("Không được thay đổi loại yêu cầu của hồ sơ đang xét duyệt.");
      }
      const curHouseholdId = current.household_id !== null ? Number(current.household_id) : null;
      const nextHouseholdId = input.householdId === undefined ? curHouseholdId : (input.householdId !== null ? Number(input.householdId) : null);
      if (input.householdId !== undefined && nextHouseholdId !== curHouseholdId) {
        throw badRequest("Không được thay đổi hộ gắn với hồ sơ đang xét duyệt.");
      }
      const curPlot = current.plot_code ? String(current.plot_code).trim().toUpperCase() : null;
      const nextPlot =
        input.plotCode === undefined
          ? curPlot
          : input.plotCode && String(input.plotCode).trim() !== ""
            ? String(input.plotCode).trim().toUpperCase()
            : null;
      if (input.plotCode !== undefined && nextPlot !== curPlot) {
        throw badRequest("Không được thay đổi mã thửa gắn với hồ sơ đang xét duyệt.");
      }

      if (input.status === "rejected" && !String(input.reviewNote ?? "").trim()) {
        throw badRequest("Vui lòng nhập lý do từ chối hồ sơ.");
      }
      if (input.status === "approved" || input.status === "rejected") {
        if (!can(context.user.role, "approvals", "update")) {
          throw forbidden("Bạn không có quyền phê duyệt hoặc từ chối hồ sơ.");
        }
        out.reviewedBy = context.user.id;
        out.reviewedAt = new Date();
        out._notifyReview = {
          householdId: curHouseholdId,
          code: current.code,
          requestType: current.request_type,
          status: input.status,
          reviewNote: typeof input.reviewNote === "string" && input.reviewNote.trim() ? input.reviewNote.trim() : null,
        };
      }
      return out;
    }

    if (out.householdId !== undefined && out.householdId !== null) {
      await assertHouseholdInScope(this.db, { householdId: out.householdId }, context.user);
      if (out.plotCode && typeof out.plotCode === "string" && out.plotCode.trim() !== "") {
        out.plotCode = await assertPlotOwned(this.db, Number(out.householdId), out.plotCode);
      }
    } else if (!isStaffInCuneCoopScope(context.user, false)) {
      throw forbidden("Bạn không có quyền tạo hồ sơ ngoài phạm vi quản lý.");
    }
    if (out.status === "rejected" && !String(out.reviewNote ?? out.note ?? "").trim()) {
      throw badRequest("Vui lòng nhập lý do từ chối hồ sơ.");
    }
    if (out.status === "approved" || out.status === "rejected") {
      if (!can(context.user.role, "approvals", "update")) {
        throw forbidden("Bạn không có quyền phê duyệt hoặc từ chối hồ sơ.");
      }
      out.reviewedBy = context.user.id;
      out.reviewedAt = new Date();
    } else if (context.method === "POST") {
      out._notifyPendingCreate = {
        actorId: context.user.id,
        householdId: out.householdId !== undefined && out.householdId !== null ? Number(out.householdId) : null,
        code: String(out.code ?? ""),
        applicantName: String(out.applicantName ?? ""),
        requestType: String(out.requestType ?? ""),
      };
    }
    return out;
  }

  protected override async afterWrite(id: number, input: Record<string, unknown>) {
    const pendingCreate = input._notifyPendingCreate as
      | {
          actorId: number;
          householdId: number | null;
          code: string;
          applicantName: string;
          requestType: string;
        }
      | undefined;
    if (pendingCreate) {
      const payload = {
        kind: "approval" as const,
        title: `Hồ sơ chờ duyệt: ${pendingCreate.code} – ${pendingCreate.applicantName}`,
        body: pendingCreate.requestType,
        link: `/admin?section=approval&id=${id}`,
      };
      if (pendingCreate.householdId) {
        await this.notifications.notifyOversightForHousehold(pendingCreate.householdId, payload, {
          excludeUserId: pendingCreate.actorId,
        });
      } else {
        await this.notifications.notifyRoles(
          ["admin", "htx_head", "htx_deputy", "support_specialist", "htx_officer", "inspector"],
          payload,
          { excludeUserId: pendingCreate.actorId },
        );
      }
    }

    const notify = input._notifyReview as
      | {
        householdId: number | null;
        code: string;
        requestType: string;
        status: "approved" | "rejected";
        reviewNote: string | null;
      }
      | undefined;
    if (!notify) return;
    await this.notifications.resolveByLink(`/admin?section=approval&id=${id}`);
    if (!notify.householdId) return;
    await this.notifications.notifyHousehold(notify.householdId, {
      kind: "approval",
      title: notify.status === "approved" ? `Hồ sơ ${notify.code} đã được duyệt` : `Hồ sơ ${notify.code} bị từ chối`,
      body: notify.reviewNote ?? notify.requestType,
      link: "/portal?tab=home",
    });
  }

  override async remove(id: number, user: AuthUser, ip?: string) {
    const res = await super.remove(id, user, ip);
    await this.notifications.resolveByLink(`/admin?section=approval&id=${id}`);
    return res;
  }

  protected override async guardDelete(id: number, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền xóa hồ sơ ngoài phạm vi quản lý.");
    }
    const curRes = await this.db.query<{ status: string; household_id: number | null }>(
      "SELECT status, household_id FROM approvals WHERE id = $1",
      [id],
    );
    const cur = curRes.rows[0];
    if (!cur) return;
    if (cur.household_id !== null) {
      await assertHouseholdInScope(this.db, { householdId: cur.household_id }, user);
    } else if (!isStaffInCuneCoopScope(user, false)) {
      throw forbidden("Bạn không có quyền xóa hồ sơ ngoài phạm vi quản lý.");
    }
    if (cur.status !== "pending") {
      throw conflict("Hồ sơ đã hoàn tất xét duyệt, không thể xóa.");
    }
  }

  protected override auditAction(_method: "POST" | "PATCH", input: Record<string, unknown>) {
    return input.status === "approved" ? "Duyệt hồ sơ" : input.status === "rejected" ? "Từ chối hồ sơ" : undefined;
  }
}
