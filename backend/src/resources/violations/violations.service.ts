import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest } from "../../common/errors/app.exception";
import { attachmentUrlSql, attachmentUrlsSql, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned } from "../../portal/common/portal-context";
import { assertExists, TODAY_VN_SQL } from "../shared/state";
import { isJournalViolationSql, lastJournalOnSql } from "../shared/violation-evidence";
import type { ResolveViolationDto } from "./violations.dto";

interface ExistingViolationRow {
  id: number;
  status: string;
  household_id: number | null;
  plot_code: string | null;
  title: string;
}

@Injectable()
export class ViolationsService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "violations",
      label: "Vi phạm",
      table: "violations",
      fields: `t.id, t.severity, t.title, t.household_label, t.household_id, t.detected_on, t.plot_code,
      t.description, t.status, t.farmer_response, t.farmer_response_at,
      ${attachmentUrlSql("t.farmer_response_photo_id")} AS farmer_response_photo_url,
      ${attachmentUrlsSql("t.farmer_response_photo_ids", "t.farmer_response_photo_id")} AS farmer_response_photo_urls,
      t.resolved_on, t.resolution_notes, t.resolved_by,
      ${isJournalViolationSql("t")} AS is_journal_violation,
      ${lastJournalOnSql("t")} AS last_journal_on`,
      from: `violations t`,
      orderBy: "t.detected_on DESC, t.id DESC",
      search: ["t.title", "t.household_label", "t.plot_code"],
      filters: { severity: "t.severity", status: "t.status", householdId: "t.household_id" },
      virtual: ["_method", "_notifyResolved"],
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const out: Record<string, unknown> = { ...input, _method: context.method };

    let current: ExistingViolationRow | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const curRes = await this.db.query<ExistingViolationRow>(
        "SELECT id, status, household_id, plot_code, title FROM violations WHERE id = $1",
        [context.id],
      );
      current = curRes.rows[0];
      if (!current) {
        return out;
      }
      if (current.status === "resolved") {
        throw badRequest("Vi phạm đã đóng hồ sơ xử lý, không thể chỉnh sửa hoặc xóa.");
      }
      if (
        input.householdId === null ||
        (current.household_id !== null &&
          input.householdId !== undefined &&
          Number(input.householdId) !== Number(current.household_id))
      ) {
        throw badRequest("Không được gỡ hoặc đổi hộ gắn với biên bản vi phạm.");
      }
    }

    if (out.householdId) {
      const { rows } = await this.db.query<{ name: string; village_name: string }>(
        `SELECT h.name, v.name AS village_name
         FROM households h JOIN villages v ON v.id = h.village_id
         WHERE h.id = $1`,
        [out.householdId],
      );
      if (rows.length === 0) throw badRequest("Hộ nông dân không tồn tại.");
      if (!out.householdLabel && context.method === "POST") {
        out.householdLabel = `${rows[0].name} - ${rows[0].village_name}`;
      }
    }

    const effHouseholdId =
      out.householdId !== undefined
        ? out.householdId
          ? Number(out.householdId)
          : null
        : current?.household_id !== null && current?.household_id !== undefined
          ? Number(current.household_id)
          : null;

    if (out.plotCode !== undefined) {
      const cleanPlot = typeof out.plotCode === "string" ? out.plotCode.trim() : "";
      if (cleanPlot && effHouseholdId) {
        out.plotCode = await assertPlotOwned(this.db, effHouseholdId, cleanPlot);
      } else if (!cleanPlot) {
        out.plotCode = null;
      }
    } else if (context.method === "PATCH" && out.householdId !== undefined && effHouseholdId && current?.plot_code) {
      await assertPlotOwned(this.db, effHouseholdId, current.plot_code);
    }

    if (out.status === "resolved") {
      const notes = typeof out.resolutionNotes === "string" ? out.resolutionNotes.trim() : "";
      if (!notes) {
        throw badRequest("Vui lòng dùng chức năng Xác nhận khắc phục để đóng vi phạm kèm biên bản xử lý.");
      }
      out.resolutionNotes = notes;
      out.resolvedOn = todayVn();
      out.resolvedBy = context.user.id;
      if (context.method === "PATCH" && effHouseholdId) {
        out._notifyResolved = {
          householdId: effHouseholdId,
          title: String(out.title ?? current?.title ?? ""),
          notes,
        };
      }
    }

    if (context.method === "POST" && !out.householdLabel) {
      throw badRequest("Phải chọn hộ nông dân hoặc nhập nhãn hộ.");
    }
    return out;
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    if (input._method === "POST" && input.householdId) {
      await this.notifications.notifyHousehold(Number(input.householdId), {
        kind: "violation",
        title: `Cảnh báo vi phạm: ${String(input.title)}`,
        body: input.description ? String(input.description) : null,
        link: "/portal?tab=diary",
      });
    }
    const resolved = input._notifyResolved as { householdId: number; title: string; notes: string } | undefined;
    if (resolved?.householdId) {
      await this.notifications.notifyHousehold(resolved.householdId, {
        kind: "violation",
        title: `Vi phạm đã được xác nhận khắc phục: ${resolved.title}`,
        body: resolved.notes,
        link: "/portal?tab=diary",
      });
    }
  }

  protected override async guardDelete(id: number, _user: AuthUser) {
    const existing = await this.db.query("SELECT id FROM violations WHERE id = $1", [id]);
    if ((existing.rowCount ?? 0) === 0) {
      return;
    }
    throw badRequest("Hồ sơ vi phạm phải được lưu vết kiểm toán, không được xóa.");
  }

  async resolve(id: number, dto: ResolveViolationDto, user: AuthUser, ip?: string) {
    const { rows } = await this.db.query<{ id: number; title: string; household_id: number | null }>(
      `UPDATE violations
       SET status = 'resolved', resolved_on = ${TODAY_VN_SQL}, resolution_notes = $2, resolved_by = $3
       WHERE id = $1 AND status = 'open'
       RETURNING id, title, household_id`,
      [id, dto.resolutionNotes, user.id],
    );
    if (rows.length === 0) {
      await assertExists(this.db, "violations", id, "Vi phạm đã đóng hồ sơ xử lý, không thể chỉnh sửa hoặc xóa.");
    }
    const row = rows[0];
    await this.audit.write(
      { ip, user },
      { action: "Đóng vi phạm", object: `${this.config.label} #${id}`, detail: dto.resolutionNotes },
    );
    await this.notifications.notifyHousehold(row.household_id, {
      kind: "violation",
      title: `Vi phạm đã được xác nhận khắc phục: ${row.title}`,
      body: dto.resolutionNotes,
      link: "/portal?tab=diary",
    });
    return this.findOne(id, user);
  }
}
