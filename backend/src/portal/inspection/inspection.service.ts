import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { householdIdOf, TODAY_VN_SQL } from "../common/portal-context";

/** Kiểm nghiệm và lịch kiểm tra của hộ. */
@Injectable()
export class InspectionService {
  constructor(private readonly db: DatabaseService) {}

  async labTests(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT t.id, t.code, t.plot_code, t.sampled_on, t.cd_mg_kg, t.yellow_o_positive, t.residue_mg_kg,
              t.chlorpyrifos_mg_kg, t.result, t.lab, h.name AS household_name
       FROM lab_tests t JOIN households h ON h.id = t.household_id
       WHERE t.household_id = $1 ORDER BY t.sampled_on DESC, t.id DESC LIMIT 100`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  /** Lịch kiểm tra sắp tới của HTX (chung cho mọi hộ). */
  async schedule(user: AuthUser) {
    householdIdOf(user);
    const { rows } = await this.db.query(
      `SELECT id, scheduled_on, title, officer, kind FROM inspection_schedule
       WHERE scheduled_on >= ${TODAY_VN_SQL} ORDER BY scheduled_on ASC, id ASC LIMIT 20`,
    );
    return { data: camelRows(rows) };
  }
}
