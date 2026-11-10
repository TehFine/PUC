import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, villageScope } from "../../common/crud/village-scope";
import { attachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { assertPlotOwned } from "../../portal/common/portal-context";

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
      t.latitude, t.longitude`,
      from: `journal_entries t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.entry_on DESC, t.id DESC",
      search: ["h.name", "t.plot_code", "t.activity", "t.detail"],
      filters: { householdId: "t.household_id", activity: "t.activity" },
      scope: villageScope("h.village_id"),
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    await assertHouseholdInScope(this.db, input, context.user);
    const out = { ...input };
    let existing: { household_id: number; plot_code: string | null } | undefined;
    if (context.method === "PATCH" && context.id !== undefined && (out.plotCode !== undefined || out.householdId !== undefined)) {
      const exRes = await this.db.query<{ household_id: number; plot_code: string | null }>(
        "SELECT household_id, plot_code FROM journal_entries WHERE id = $1",
        [context.id],
      );
      existing = exRes.rows[0];
    }
    const effectiveHouseholdId = Number(out.householdId ?? existing?.household_id ?? 0);
    const effectivePlotCode =
      out.plotCode !== undefined ? (typeof out.plotCode === "string" ? out.plotCode : null) : (existing?.plot_code ?? null);
    if (effectiveHouseholdId > 0 && effectivePlotCode) {
      out.plotCode = await assertPlotOwned(this.db, effectiveHouseholdId, effectivePlotCode);
    }
    return out;
  }
}
