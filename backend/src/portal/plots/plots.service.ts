import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { EAKHAL_ADMIN_LOCATION, resolveParcelAdminLocation } from "../../common/crud/village-scope";
import { camelRows } from "../../common/sql/rows";
import { hasPublicColumn, hasPublicTable } from "../../common/sql/schema-cache";
import { DatabaseService } from "../../database/database.service";
import { householdIdOf, plotsTableExists, TODAY_VN_SQL } from "../common/portal-context";

interface PortalPlotQueryRow extends Record<string, unknown> {
  code: string;
  village: string | null;
  zone_code: string | null;
  hh_village_name?: string | null;
  hh_commune_location?: string | null;
}

function resolvePlotCommuneLocation(row: PortalPlotQueryRow): string {
  const byParcel = resolveParcelAdminLocation(row.village, row.zone_code || row.code);
  if (byParcel === EAKHAL_ADMIN_LOCATION) {
    return EAKHAL_ADMIN_LOCATION;
  }
  const hhCommune = typeof row.hh_commune_location === "string" ? row.hh_commune_location.trim() : "";
  if (hhCommune) {
    const plotVillage = typeof row.village === "string" ? row.village.trim().toLowerCase() : "";
    const hhVillage = typeof row.hh_village_name === "string" ? row.hh_village_name.trim().toLowerCase() : "";
    if (!plotVillage || plotVillage === hhVillage) {
      return hhCommune;
    }
  }
  return byParcel;
}

function mapPortalPlotRows(rows: PortalPlotQueryRow[]) {
  const cleaned = rows.map(({ hh_village_name, hh_commune_location, ...rest }) => ({
    ...rest,
    commune_location: resolvePlotCommuneLocation({
      code: String(rest.code ?? ""),
      village: (rest.village as string | null) ?? null,
      zone_code: (rest.zone_code as string | null) ?? null,
      hh_village_name,
      hh_commune_location,
    }),
  }));
  return camelRows(cleaned);
}

/** Các thửa của hộ, khớp theo `plots.household_id` (không khớp theo tên chủ thửa). */
@Injectable()
export class PortalPlotsService {
  constructor(private readonly db: DatabaseService) {}

  /** Trả về danh sách thửa kèm mã QR định danh & hạn ngạch vụ (dự phòng sang `plot_signboard_tokens` nếu không cài PostGIS). */
  async plots(user: AuthUser) {
    const id = householdIdOf(user);
    const loadPlots = async () => {
      const [hasPlots, hasSignboard, hasQuotas, hasCommuneCol] = await Promise.all([
        plotsTableExists(this.db),
        hasPublicTable(this.db, "plot_signboard_tokens"),
        hasPublicTable(this.db, "plot_season_quotas"),
        hasPublicColumn(this.db, "villages", "commune_location"),
      ]);

      const hhCommuneSelectSql = hasCommuneCol
        ? "NULLIF(btrim(v_hh.commune_location), '') AS hh_commune_location"
        : "NULL::text AS hh_commune_location";

      if (hasPlots) {
        const pstJoinSql = hasSignboard
          ? `LEFT JOIN LATERAL (
               SELECT pst0.qr_token, pst0.tree_count, pst0.village_name, pst0.zone_code
               FROM plot_signboard_tokens pst0
               WHERE upper(btrim(pst0.plot_code)) = upper(btrim(p.code))
               ORDER BY (pst0.household_id = p.household_id) DESC NULLS LAST, pst0.created_at DESC
               LIMIT 1
             ) pst ON true`
          : `LEFT JOIN LATERAL (
               SELECT NULL::text AS qr_token, NULL::int AS tree_count, NULL::text AS village_name, NULL::text AS zone_code
             ) pst ON true`;

        const psqJoinSql = hasQuotas
          ? `LEFT JOIN LATERAL (
               SELECT psq0.tree_count, psq0.max_quota_kg
               FROM plot_season_quotas psq0
               WHERE psq0.season_year = EXTRACT(YEAR FROM ${TODAY_VN_SQL})::int
                 AND upper(btrim(psq0.plot_code)) = upper(btrim(p.code))
               ORDER BY (psq0.household_id = p.household_id) DESC NULLS LAST, psq0.updated_at DESC, psq0.id DESC
               LIMIT 1
             ) psq ON true`
          : `LEFT JOIN LATERAL (
               SELECT NULL::int AS tree_count, NULL::numeric AS max_quota_kg
             ) psq ON true`;

        const { rows } = await this.db.query<PortalPlotQueryRow>(
          `SELECT p.id, p.code, p.sheet_no AS sheet, p.parcel_no AS parcel,
                  COALESCE(NULLIF(btrim(p.village), ''), NULLIF(btrim(pst.village_name), ''), v_hh.name) AS village,
                  COALESCE(NULLIF(btrim(p.zone_code), ''), NULLIF(btrim(pst.zone_code), '')) AS zone_code,
                  NULLIF(btrim(p.variety), '') AS variety,
                  p.planted_year,
                  p.area_ha::float8 AS area_ha,
                  p.source, p.status,
                  COALESCE(p.qr_token, pst.qr_token) AS qr_token,
                  COALESCE(NULLIF(psq.tree_count, 0), NULLIF(p.tree_count, 0), NULLIF(pst.tree_count, 0)) AS tree_count,
                  COALESCE(psq.max_quota_kg, p.season_quota_kg)::float8 AS max_quota_kg,
                  ST_AsGeoJSON(p.geom) AS geometry_json,
                  ST_Y(ST_Centroid(p.geom)) AS lat,
                  ST_X(ST_Centroid(p.geom)) AS lng,
                  v_hh.name AS hh_village_name,
                  ${hhCommuneSelectSql}
           FROM plots p
           LEFT JOIN households h ON h.id = p.household_id
           LEFT JOIN villages v_hh ON v_hh.id = h.village_id
           ${pstJoinSql}
           ${psqJoinSql}
           WHERE p.household_id = $1
           ORDER BY p.code`,
          [id],
        );
        return { data: mapPortalPlotRows(rows), available: true };
      }

      if (!hasSignboard) {
        return { data: [], available: false };
      }

      const psqFallbackJoinSql = hasQuotas
        ? `LEFT JOIN LATERAL (
             SELECT psq0.tree_count, psq0.max_quota_kg
             FROM plot_season_quotas psq0
             WHERE psq0.season_year = EXTRACT(YEAR FROM ${TODAY_VN_SQL})::int
               AND upper(btrim(psq0.plot_code)) = upper(btrim(pst.plot_code))
             ORDER BY (psq0.household_id = pst.household_id) DESC NULLS LAST, psq0.updated_at DESC, psq0.id DESC
             LIMIT 1
           ) psq ON true`
        : `LEFT JOIN LATERAL (
             SELECT NULL::int AS tree_count, NULL::numeric AS max_quota_kg
           ) psq ON true`;

      const { rows } = await this.db.query<PortalPlotQueryRow>(
        `SELECT ROW_NUMBER() OVER (ORDER BY pst.plot_code)::int AS id,
                pst.plot_code AS code,
                NULL::text AS sheet,
                NULL::text AS parcel,
                COALESCE(NULLIF(btrim(pst.village_name), ''), v_hh.name) AS village,
                NULLIF(btrim(pst.zone_code), '') AS zone_code,
                NULLIF(btrim(pst.variety), '') AS variety,
                pst.planted_year,
                pst.area_ha::float8 AS area_ha,
                'declared'::text AS source,
                'approved'::text AS status,
                pst.qr_token,
                COALESCE(NULLIF(psq.tree_count, 0), NULLIF(pst.tree_count, 0)) AS tree_count,
                psq.max_quota_kg::float8 AS max_quota_kg,
                pst.geometry_json,
                pst.center_lat::float8 AS lat,
                pst.center_lng::float8 AS lng,
                v_hh.name AS hh_village_name,
                ${hhCommuneSelectSql}
         FROM plot_signboard_tokens pst
         LEFT JOIN households h ON h.id = pst.household_id
         LEFT JOIN villages v_hh ON v_hh.id = h.village_id
         ${psqFallbackJoinSql}
         WHERE pst.household_id = $1
         ORDER BY pst.plot_code`,
        [id],
      );
      return { data: mapPortalPlotRows(rows), available: rows.length > 0 };
    };
    if (!this.db.cache) return loadPlots();
    return this.db.cache.getOrLoad(`portal:plots:h:${id}`, 20_000, ["plots", "portal"], loadPlots);
  }
}
