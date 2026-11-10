import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, villageScope } from "../../common/crud/village-scope";
import { badRequest } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { assertPlotOwned } from "../../portal/common/portal-context";

@Injectable()
export class SprayService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "spray",
      label: "Nhật ký phun thuốc",
      table: "spray_records",
      fields: `t.id, t.sprayed_on, t.household_id, h.name AS household_name, t.plot_code,
      t.pesticide_id, p.name AS pesticide_name, t.source, t.dose, t.area_ha, t.isolation_days, t.mrl_status`,
      from: `spray_records t JOIN households h ON h.id = t.household_id
      JOIN pesticides p ON p.id = t.pesticide_id`,
      orderBy: "t.sprayed_on DESC, t.id DESC",
      search: ["h.name", "p.name", "t.source", "t.plot_code"],
      filters: { householdId: "t.household_id", pesticideId: "t.pesticide_id", mrlStatus: "t.mrl_status" },
      scope: villageScope("h.village_id"),
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    await assertHouseholdInScope(this.db, input, context.user);
    const out = { ...input };

    let existing: { pesticide_id: number; household_id: number; plot_code: string | null } | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const exRes = await this.db.query<{ pesticide_id: number; household_id: number; plot_code: string | null }>(
        "SELECT pesticide_id, household_id, plot_code FROM spray_records WHERE id = $1",
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

    const effectivePesticideId =
      out.pesticideId !== undefined && out.pesticideId !== null ? out.pesticideId : existing?.pesticide_id;
    if (effectivePesticideId !== undefined && effectivePesticideId !== null) {
      const { rows } = await this.db.query<{ status: string; isolation_days: number | null }>(
        "SELECT status, isolation_days FROM pesticides WHERE id = $1",
        [effectivePesticideId],
      );
      if (rows.length === 0) throw badRequest("Thuốc BVTV không tồn tại.");
      const pesticide = rows[0];
      if (pesticide.status === "banned") {
        out.mrlStatus = "exceeded";
      } else if (context.method === "POST" && out.mrlStatus === undefined) {
        out.mrlStatus = pesticide.status === "allowed" ? "pass" : "exceeded";
      }
      if (context.method === "POST" && out.isolationDays === undefined) {
        out.isolationDays = pesticide.isolation_days ?? 0;
      }
    }
    return out;
  }
}
