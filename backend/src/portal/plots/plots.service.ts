import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { householdIdOf, plotsTableExists } from "../common/portal-context";

/** Các thửa của hộ, khớp theo `plots.household_id` (không khớp theo tên chủ thửa). */
@Injectable()
export class PortalPlotsService {
  constructor(private readonly db: DatabaseService) {}

  /** Trả về `available: false` khi hệ thống chưa bật dữ liệu bản đồ (PostGIS). */
  async plots(user: AuthUser) {
    const id = householdIdOf(user);
    if (!(await plotsTableExists(this.db))) return { data: [], available: false };

    const { rows } = await this.db.query(
      `SELECT p.id, p.code, p.sheet_no AS sheet, p.parcel_no AS parcel, p.village, p.zone_code, p.variety, p.planted_year,
              p.area_ha, p.source, p.status,
              ST_AsGeoJSON(p.geom) AS geometry_json,
              ST_Y(ST_Centroid(p.geom)) AS lat,
              ST_X(ST_Centroid(p.geom)) AS lng
       FROM plots p
       WHERE p.household_id = $1
       ORDER BY p.code`,
      [id],
    );
    return { data: camelRows(rows), available: true };
  }
}
