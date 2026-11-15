import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { householdIdOf, plotsTableExists } from "../common/portal-context";

/** Các thửa của hộ, khớp theo `plots.household_id` (không khớp theo tên chủ thửa). */
@Injectable()
export class PortalPlotsService {
  constructor(private readonly db: DatabaseService) {}

  /** Trả về danh sách thửa kèm mã QR định danh & hạn ngạch vụ (dự phòng sang `plot_signboard_tokens` nếu không cài PostGIS). */
  async plots(user: AuthUser) {
    const id = householdIdOf(user);
    if (await plotsTableExists(this.db)) {
      const { rows } = await this.db.query(
        `SELECT p.id, p.code, p.sheet_no AS sheet, p.parcel_no AS parcel, p.village, p.zone_code, p.variety, p.planted_year,
                p.area_ha, p.source, p.status,
                COALESCE(p.qr_token, pst.qr_token) AS qr_token,
                COALESCE(psq.tree_count, p.tree_count, pst.tree_count, GREATEST(30, ROUND(COALESCE(p.area_ha, 1) * 150)::int)) AS tree_count,
                COALESCE(psq.max_quota_kg, p.season_quota_kg)::float8 AS max_quota_kg,
                ST_AsGeoJSON(p.geom) AS geometry_json,
                ST_Y(ST_Centroid(p.geom)) AS lat,
                ST_X(ST_Centroid(p.geom)) AS lng
         FROM plots p
         LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)
         LEFT JOIN plot_season_quotas psq ON psq.season_year = EXTRACT(YEAR FROM now())::int AND upper(psq.plot_code) = upper(p.code)
         WHERE p.household_id = $1
         ORDER BY p.code`,
        [id],
      );
      return { data: camelRows(rows), available: true };
    }

    const regSign = await this.db.query<{ reg: string | null }>("SELECT to_regclass('public.plot_signboard_tokens') AS reg");
    if (!regSign.rows[0]?.reg) return { data: [], available: false };

    const { rows } = await this.db.query(
      `SELECT ROW_NUMBER() OVER (ORDER BY pst.plot_code)::int AS id,
              pst.plot_code AS code,
              NULL::text AS sheet,
              NULL::text AS parcel,
              pst.village_name AS village,
              pst.zone_code,
              pst.variety,
              pst.planted_year,
              pst.area_ha::float8 AS area_ha,
              'declared'::text AS source,
              'approved'::text AS status,
              pst.qr_token,
              COALESCE(psq.tree_count, pst.tree_count) AS tree_count,
              psq.max_quota_kg::float8 AS max_quota_kg,
              pst.geometry_json,
              pst.center_lat::float8 AS lat,
              pst.center_lng::float8 AS lng
       FROM plot_signboard_tokens pst
       LEFT JOIN plot_season_quotas psq ON psq.season_year = EXTRACT(YEAR FROM now())::int AND upper(psq.plot_code) = upper(pst.plot_code)
       WHERE pst.household_id = $1
       ORDER BY pst.plot_code`,
      [id],
    );
    return { data: camelRows(rows), available: rows.length > 0 };
  }
}
