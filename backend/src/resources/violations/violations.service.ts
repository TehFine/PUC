import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest } from "../../common/errors/app.exception";
import { attachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertExists, TODAY_VN_SQL } from "../shared/state";
import { isJournalViolationSql, lastJournalOnSql } from "../shared/violation-evidence";
import type { ResolveViolationDto } from "./violations.dto";

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
      t.resolved_on, t.resolution_notes, t.resolved_by,
      ${isJournalViolationSql("t")} AS is_journal_violation,
      ${lastJournalOnSql("t")} AS last_journal_on`,
      from: `violations t`,
      orderBy: "t.detected_on DESC, t.id DESC",
      search: ["t.title", "t.household_label", "t.plot_code"],
      filters: { severity: "t.severity", status: "t.status", householdId: "t.household_id" },
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const out: Record<string, unknown> = { ...input, _method: context.method };
    if (out.householdId) {
      const { rows } = await this.db.query<{ name: string; village_name: string }>(
        `SELECT h.name, v.name AS village_name
         FROM households h JOIN villages v ON v.id = h.village_id
         WHERE h.id = $1`,
        [out.householdId],
      );
      if (rows.length === 0) throw badRequest("Hộ nông dân không tồn tại.");
      if (!out.householdLabel) {
        out.householdLabel = `${rows[0].name} – ${rows[0].village_name}`;
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
      await assertExists(this.db, "violations", id, "Vi phạm này đã được đóng trước đó.");
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
