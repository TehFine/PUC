import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, villageScope } from "../../common/crud/village-scope";
import { badRequest } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

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
    if (context.method === "POST" && (out.mrlStatus === undefined || out.isolationDays === undefined)) {
      const { rows } = await this.db.query<{ status: string; isolation_days: number | null }>(
        "SELECT status, isolation_days FROM pesticides WHERE id = $1",
        [out.pesticideId],
      );
      if (rows.length === 0) throw badRequest("Thuốc BVTV không tồn tại.");
      if (out.mrlStatus === undefined) {
        out.mrlStatus = rows[0].status === "allowed" ? "pass" : "exceeded";
      }
      if (out.isolationDays === undefined) {
        out.isolationDays = rows[0].isolation_days ?? 0;
      }
    }
    return out;
  }
}
