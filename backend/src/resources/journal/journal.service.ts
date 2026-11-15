import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, villageScope } from "../../common/crud/village-scope";
import { badRequest } from "../../common/errors/app.exception";
import { attachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { assertPlotOwned } from "../../portal/common/portal-context";

const SEALED_LEDGER_ERR =
  "Bản ghi sổ cái đã quá thời hạn 24 giờ niêm phong hoặc đã gắn với lô xuất khẩu, không thể chỉnh sửa/xóa.";

interface ExistingJournalRow {
  household_id: number;
  plot_code: string | null;
  server_recorded_at: Date | string | null;
}

@Injectable()
export class JournalService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "journal",
      label: "Nhật ký canh tác",
      table: "journal_entries",
      fields: `t.id, t.entry_on, t.household_id, h.name AS household_name, t.plot_code,
      t.activity, t.detail, t.recorder, t.has_photo,
      ${attachmentUrlSql("t.photo_id")} AS photo_url,
      t.latitude, t.longitude,
      t.server_recorded_at, t.entry_delay_hours::float8 AS entry_delay_hours,
      t.is_late_entry, t.late_reason, t.record_hash, t.gps_verified, t.gps_distance_m::float8 AS gps_distance_m`,
      from: `journal_entries t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.entry_on DESC, t.id DESC",
      search: ["h.name", "t.plot_code", "t.activity", "t.detail"],
      filters: { householdId: "t.household_id", activity: "t.activity" },
      scope: villageScope("h.village_id"),
    });
  }

  private async assertNotExportLocked(
    householdId: number,
    plotCode: string | null | undefined,
    recordedAt?: Date | string | null,
  ) {
    if (!householdId || householdId <= 0) return;
    const cleanPlot = typeof plotCode === "string" ? plotCode.trim() : "";
    const recIso = recordedAt ? new Date(recordedAt).toISOString() : null;
    const locked = await this.db.query(
      `SELECT 1
       FROM harvest_contributions hc
       JOIN harvest_lots hl ON hl.id = hc.lot_id
       WHERE hc.household_id = $1
         AND hl.status IN ('in_transit', 'delivered', 'exported')
         AND ($2 = '' OR hc.plot_code IS NULL OR btrim(hc.plot_code) = '' OR upper(hc.plot_code) = upper($2))
         AND ($3::timestamptz IS NULL OR hl.created_at >= $3::timestamptz)
       LIMIT 1`,
      [householdId, cleanPlot, recIso],
    );
    if ((locked.rowCount ?? 0) > 0) {
      throw badRequest(SEALED_LEDGER_ERR);
    }
  }

  private async assertJournalEditable(existing: ExistingJournalRow) {
    if (existing.server_recorded_at) {
      const recordedMs = new Date(existing.server_recorded_at).getTime();
      if (Number.isFinite(recordedMs) && Date.now() - recordedMs > 24 * 3600_000) {
        throw badRequest(SEALED_LEDGER_ERR);
      }
    }
    await this.assertNotExportLocked(Number(existing.household_id), existing.plot_code, existing.server_recorded_at);
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    await assertHouseholdInScope(this.db, input, context.user);
    const out: Record<string, unknown> = { ...input };

    let existing: ExistingJournalRow | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const exRes = await this.db.query<ExistingJournalRow>(
        "SELECT household_id, plot_code, server_recorded_at FROM journal_entries WHERE id = $1",
        [context.id],
      );
      existing = exRes.rows[0];
      if (!existing) {
        delete out.recorder;
        return out;
      }
      await this.assertJournalEditable(existing);
      delete out.recorder;
    } else {
      out.recorder = context.user.fullName;
    }

    const effectiveHouseholdId = Number(out.householdId ?? existing?.household_id ?? 0);
    const effectivePlotCode =
      out.plotCode !== undefined ? (typeof out.plotCode === "string" ? out.plotCode : null) : (existing?.plot_code ?? null);
    if (effectiveHouseholdId > 0 && effectivePlotCode) {
      out.plotCode = await assertPlotOwned(this.db, effectiveHouseholdId, effectivePlotCode);
    }

    if (
      context.method === "PATCH" &&
      existing &&
      (effectiveHouseholdId !== Number(existing.household_id) ||
        (out.plotCode ?? existing.plot_code ?? null) !== (existing.plot_code ?? null))
    ) {
      await this.assertNotExportLocked(effectiveHouseholdId, (out.plotCode as string | null | undefined) ?? existing.plot_code);
    }

    return out;
  }

  protected override async guardDelete(id: number, _user: AuthUser) {
    const { rows } = await this.db.query<ExistingJournalRow>(
      "SELECT household_id, plot_code, server_recorded_at FROM journal_entries WHERE id = $1",
      [id],
    );
    if (rows[0]) {
      await this.assertJournalEditable(rows[0]);
    }
  }
}
