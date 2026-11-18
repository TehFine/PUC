import type { FeatureCollection, Polygon } from "geojson";
import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { isManagementRole } from "../auth/permissions";
import {
  assertHouseholdInScope,
  isStaffInCuneCoopScope,
  isStaffInParcelScope,
} from "../common/crud/village-scope";
import { AppException, badRequest, forbidden } from "../common/errors/app.exception";
import { resolvePlotHouseholdId, syncHouseholdAndVillageStats } from "../common/sql/stats-sync";
import { DatabaseService } from "../database/database.service";
import type {
  CreatedPlot,
  ImportResult,
  MeasurementInput,
  PlotCollection,
  PlotFeature,
  PlotProperties,
  PlotSource,
  PlotStatus,
} from "./plot.types";
import { polygonAreaHa } from "./plot-utils";

interface PlotRow {
  id: string | number;
  code: string;
  sheet: string | null;
  parcel: string | null;
  owner: string | null;
  village: string | null;
  zone: string | null;
  variety: string | null;
  year: number | null;
  area_ha: string | number | null;
  source: PlotSource;
  status: PlotStatus;
  source_ref: string | null;
  household_id?: string | number | null;
  hh_village_id?: string | number | null;
  hh_village_name?: string | null;
  qr_token?: string | null;
  tree_count?: string | number | null;
  season_quota_kg?: string | number | null;
  lat?: string | number | null;
  lng?: string | number | null;
  geometry_json: string;
}

interface MeasurementRow {
  id: string | number;
  plot_code: string;
  measured_by: string;
  area_ha: string | number;
  note: string | null;
  created_at: string;
  geometry_json: string;
}

export interface CreatePlotInput {
  code?: string;
  sheet?: string;
  parcel?: string;
  owner?: string;
  village?: string;
  zone?: string;
  variety?: string;
  year?: number;
  householdId?: number;
  /** Giá trị lạ được chuẩn hóa về mặc định (declared / pending). */
  source?: string;
  status?: string;
  geometry: Polygon;
  sourceRef?: string;
}

export interface StoredMeasurement {
  id: string;
  plotCode: string;
  measuredBy: string;
  areaHa: number;
  note?: string;
  createdAt: string;
  geometry: Polygon;
  persisted: boolean;
}

export interface MeasurementResult {
  measurement: StoredMeasurement;
  persisted: boolean;
}

/** Dữ liệu thửa đất không hợp lệ (trả 400). */
export class PlotInputError extends AppException {
  constructor(message: string) {
    super(400, message, "BAD_REQUEST");
  }
}

function asNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function safeParsePolygon(raw: string | null | undefined): Polygon {
  if (!raw || typeof raw !== "string") {
    return { type: "Polygon", coordinates: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Polygon;
    if (parsed && parsed.type === "Polygon" && Array.isArray(parsed.coordinates)) {
      return parsed;
    }
  } catch {
    // Bỏ qua dữ liệu GeoJSON hỏng để không làm gãy tiến trình đọc danh sách.
  }
  return { type: "Polygon", coordinates: [] };
}

function rowToFeature(row: PlotRow): PlotFeature {
  return {
    type: "Feature",
    geometry: safeParsePolygon(row.geometry_json),
    properties: {
      id: String(row.id),
      code: row.code,
      sheet: row.sheet ?? "",
      parcel: row.parcel ?? "",
      owner: row.owner ?? "",
      village: row.village ?? "",
      zone: row.zone ?? "",
      variety: row.variety ?? "",
      year: row.year ?? undefined,
      areaHa: asNumber(row.area_ha),
      source: row.source,
      status: row.status,
      sourceRef: row.source_ref ?? undefined,
      householdId: row.household_id != null ? Number(row.household_id) : undefined,
      qrToken: row.qr_token ?? undefined,
      treeCount: row.tree_count != null ? Number(row.tree_count) : undefined,
      seasonQuotaKg: row.season_quota_kg != null ? asNumber(row.season_quota_kg) : undefined,
      lat: row.lat != null ? asNumber(row.lat) : undefined,
      lng: row.lng != null ? asNumber(row.lng) : undefined,
      persisted: true,
    },
  };
}

const MAX_RINGS_PER_POLYGON = 32;
const MAX_POINTS_PER_RING = 5000;
const VN_MIN_LNG = 102.0;
const VN_MAX_LNG = 110.5;
const VN_MIN_LAT = 8.0;
const VN_MAX_LAT = 24.0;

function normalizeGeometry(geometry: unknown): Polygon {
  if (!geometry || typeof geometry !== "object") {
    throw new PlotInputError("Thiếu dữ liệu hình học của thửa.");
  }
  const candidate = geometry as Polygon;
  if (candidate.type !== "Polygon" || !Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
    throw new PlotInputError("Hình học phải là Polygon GeoJSON hợp lệ.");
  }
  if (candidate.coordinates.length > MAX_RINGS_PER_POLYGON) {
    throw new PlotInputError(`Polygon không được vượt quá ${MAX_RINGS_PER_POLYGON} vòng tọa độ.`);
  }

  let totalVertices = 0;
  const rings = candidate.coordinates.map((ring) => {
    if (!Array.isArray(ring) || ring.length < 3) {
      throw new PlotInputError("Polygon cần ít nhất 3 điểm.");
    }
    if (ring.length > MAX_POINTS_PER_RING) {
      throw new PlotInputError(`Mỗi vòng polygon không được vượt quá ${MAX_POINTS_PER_RING} điểm.`);
    }
    const rawPositions = ring.map((position) => {
      if (!Array.isArray(position) || position.length < 2) {
        throw new PlotInputError("Tọa độ polygon không hợp lệ.");
      }
      const lng = Number(position[0]);
      const lat = Number(position[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new PlotInputError("Tọa độ polygon không hợp lệ.");
      }
      if (lng < VN_MIN_LNG || lng > VN_MAX_LNG || lat < VN_MIN_LAT || lat > VN_MAX_LAT) {
        throw new PlotInputError("Tọa độ ranh giới thửa đất phải nằm trong phạm vi lãnh thổ Việt Nam.");
      }
      return [lng, lat];
    });
    // Loại bỏ các điểm bấm đúp trùng nhau liên tiếp (khoảng cách < ~1mm) để tránh gãy ST_IsValid
    const positions: number[][] = [];
    for (const pt of rawPositions) {
      const prev = positions[positions.length - 1];
      if (!prev || Math.abs(prev[0] - pt[0]) > 1e-8 || Math.abs(prev[1] - pt[1]) > 1e-8) {
        positions.push(pt);
      }
    }
    if (positions.length > 1) {
      const first = positions[0];
      const last = positions[positions.length - 1];
      if (Math.abs(first[0] - last[0]) <= 1e-8 && Math.abs(first[1] - last[1]) <= 1e-8) {
        positions[positions.length - 1] = [first[0], first[1]];
      } else {
        positions.push([first[0], first[1]]);
      }
    }
    if (positions.length < 4) {
      throw new PlotInputError("Polygon cần ít nhất 3 điểm phân biệt và phải khép kín.");
    }
    totalVertices += positions.length;
    if (totalVertices > MAX_POINTS_PER_RING) {
      throw new PlotInputError(`Polygon không được vượt quá ${MAX_POINTS_PER_RING} điểm tọa độ.`);
    }
    return positions;
  });

  return { type: "Polygon", coordinates: rings };
}

function normalizeCode(value: unknown, fallback?: string): string {
  const code = String(value ?? fallback ?? "").trim();
  if (!code) throw new PlotInputError("Mã thửa không được để trống.");
  return code.slice(0, 64);
}

function cleanText(value: unknown, max = 160): string {
  return String(value ?? "").trim().slice(0, max);
}

function normVillageCompare(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeSource(value: unknown, fallback: PlotSource): PlotSource {
  return value === "declared" || value === "measured" || value === "cadastral" || value === "demo"
    ? value
    : fallback;
}

function normalizeStatus(value: unknown, fallback: PlotStatus): PlotStatus {
  return value === "approved" || value === "improve" || value === "violation" || value === "pending"
    ? value
    : fallback;
}

function toProperties(input: CreatePlotInput, geometry: Polygon): PlotProperties {
  return {
    code: normalizeCode(input.code),
    sheet: cleanText(input.sheet, 24),
    parcel: cleanText(input.parcel, 24),
    owner: cleanText(input.owner),
    village: cleanText(input.village, 80),
    zone: cleanText(input.zone, 48),
    variety: cleanText(input.variety, 80),
    year: input.year && Number.isFinite(input.year) ? Math.round(input.year) : undefined,
    areaHa: polygonAreaHa(geometry),
    source: normalizeSource(input.source, "declared"),
    status: normalizeStatus(input.status, "pending"),
    sourceRef: input.sourceRef ? cleanText(input.sourceRef, 240) : undefined,
  };
}

@Injectable()
export class PlotsService {
  private plotsTableExists: Promise<boolean> | null = null;
  private signboardTableExists: Promise<boolean> | null = null;

  constructor(private readonly db: DatabaseService) {}

  private hasPlotsTable(): Promise<boolean> {
    if (!this.plotsTableExists) {
      this.plotsTableExists = this.db
        .query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg")
        .then((res) => res.rows[0]?.reg !== null)
        .catch((err: unknown) => {
          this.plotsTableExists = null;
          throw err;
        });
    }
    return this.plotsTableExists;
  }

  private hasSignboardTable(): Promise<boolean> {
    if (!this.signboardTableExists) {
      this.signboardTableExists = this.db
        .query<{ reg: string | null }>("SELECT to_regclass('public.plot_signboard_tokens') AS reg")
        .then((res) => res.rows[0]?.reg !== null)
        .catch((err: unknown) => {
          this.signboardTableExists = null;
          throw err;
        });
    }
    return this.signboardTableExists;
  }

  /** Nếu là cán bộ thôn thì trả về tên thôn được phân công; các vai trò khác trả về null (không giới hạn thôn). */
  private async resolveScopedVillageName(user?: AuthUser): Promise<string | null> {
    if (!user || user.role !== "village_officer") return null;
    if (!user.villageId) return "";
    const { rows } = await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [user.villageId]);
    return (rows[0]?.name ?? "").replace(/\s+/g, " ").trim();
  }

  async listPlots(user?: AuthUser): Promise<PlotCollection> {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return { type: "FeatureCollection", features: [] };
    }
    const scopeKey = user
      ? [
          user.role,
          `c=${(user.coopCode || "HTX-CUNE").trim().toUpperCase()}`,
          `ar=${encodeURIComponent((user.assignedRegion ?? "").trim())}`,
          `ac=${encodeURIComponent((user.assignedCommune ?? "").trim())}`,
          `v=${user.villageId ?? "none"}`,
        ].join(":")
      : "system";
    const loadCollection = async (): Promise<PlotCollection> => {
      const scopedVillage = await this.resolveScopedVillageName(user);
      if (user?.role === "village_officer" && !scopedVillage && !user.assignedCommune?.trim()) {
        return { type: "FeatureCollection", features: [] };
      }
      const officerVillageName = scopedVillage || null;
      const hasPlots = await this.hasPlotsTable();
      if (!hasPlots) {
        const hasSign = await this.hasSignboardTable();
        if (!hasSign) return { type: "FeatureCollection", features: [] };
        const paramsFb: unknown[] = [];
        const whereFb =
          scopedVillage !== null && scopedVillage !== ""
            ? (paramsFb.push(scopedVillage),
              "AND lower(regexp_replace(btrim(COALESCE(pst.village_name, v_hh.name, '')), '\\s+', ' ', 'g')) = lower(btrim($1))")
            : "";
        const { rows: fbRows } = await this.db.query<PlotRow>(
          `SELECT ROW_NUMBER() OVER (ORDER BY pst.plot_code)::int AS id,
                  pst.plot_code AS code,
                  ''::text AS sheet,
                  ''::text AS parcel,
                  COALESCE(h.name, '') AS owner,
                  COALESCE(pst.village_name, v_hh.name, '') AS village,
                  COALESCE(pst.zone_code, 'VN-DLOR-0086') AS zone,
                  COALESCE(pst.variety, 'Ri6 & Monthong (Dona)') AS variety,
                  pst.planted_year AS year,
                  pst.area_ha,
                  'declared'::text AS source,
                  'approved'::text AS status,
                  NULL::text AS source_ref,
                  pst.household_id,
                  h.village_id AS hh_village_id,
                  v_hh.name AS hh_village_name,
                  pst.qr_token,
                  COALESCE(psq.tree_count, pst.tree_count) AS tree_count,
                  psq.max_quota_kg AS season_quota_kg,
                  pst.center_lat AS lat,
                  pst.center_lng AS lng,
                  pst.geometry_json
           FROM plot_signboard_tokens pst
           LEFT JOIN households h ON h.id = pst.household_id
           LEFT JOIN villages v_hh ON v_hh.id = h.village_id
           LEFT JOIN plot_season_quotas psq ON psq.season_year = EXTRACT(YEAR FROM now())::int AND upper(psq.plot_code) = upper(pst.plot_code)
           WHERE pst.geometry_json IS NOT NULL ${whereFb}
           ORDER BY pst.zone_code, pst.plot_code`,
          paramsFb,
        );
        const filteredFb = fbRows.filter((r) =>
          isStaffInParcelScope(
            user,
            {
              villageId: r.hh_village_id != null ? Number(r.hh_village_id) : null,
              villageName: r.village || r.hh_village_name,
              zoneCode: r.zone,
              plotCode: r.code,
            },
            officerVillageName,
          ),
        );
        return { type: "FeatureCollection", features: filteredFb.map(rowToFeature) };
      }
      const params: unknown[] = [];
      const where =
        scopedVillage !== null && scopedVillage !== ""
          ? (params.push(scopedVillage),
            "WHERE lower(regexp_replace(btrim(COALESCE(p.village, v_hh.name, '')), '\\s+', ' ', 'g')) = lower(btrim($1))")
          : "";
      const { rows } = await this.db.query<PlotRow>(
        `
          SELECT p.id, p.code, p.sheet_no AS sheet, p.parcel_no AS parcel, p.owner_name AS owner,
                 COALESCE(NULLIF(btrim(p.village), ''), v_hh.name, p.village) AS village,
                 p.zone_code AS zone, p.variety, p.planted_year AS year, p.area_ha,
                 p.source, p.status, p.source_ref, p.household_id,
                 h.village_id AS hh_village_id,
                 v_hh.name AS hh_village_name,
                 COALESCE(p.qr_token, pst.qr_token) AS qr_token,
                 COALESCE(psq.tree_count, p.tree_count, pst.tree_count) AS tree_count,
                 COALESCE(psq.max_quota_kg, p.season_quota_kg) AS season_quota_kg,
                 ST_Y(ST_Centroid(p.geom)) AS lat, ST_X(ST_Centroid(p.geom)) AS lng,
                 ST_AsGeoJSON(p.geom) AS geometry_json
          FROM plots p
          LEFT JOIN households h ON h.id = p.household_id
          LEFT JOIN villages v_hh ON v_hh.id = h.village_id
          LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)
          LEFT JOIN plot_season_quotas psq ON psq.season_year = EXTRACT(YEAR FROM now())::int AND upper(psq.plot_code) = upper(p.code)
          ${where}
          ORDER BY p.zone_code, p.code
        `,
        params,
      );
      const filteredRows = rows.filter((r) =>
        isStaffInParcelScope(
          user,
          {
            villageId: r.hh_village_id != null ? Number(r.hh_village_id) : null,
            villageName: r.village || r.hh_village_name,
            zoneCode: r.zone,
            plotCode: r.code,
          },
          officerVillageName,
        ),
      );
      return { type: "FeatureCollection", features: filteredRows.map(rowToFeature) };
    };

    if (!this.db.cache) return loadCollection();
    return this.db.cache.getOrLoad(`plots:list:${scopeKey}`, 30_000, ["plots"], loadCollection);
  }

  /** Kiểm định hình học PostGIS: ST_IsValid, ST_NPoints <= 2000 và ST_Area(geom::geography)/10000 trong [0.005, 500] ha. */
  private async validatePostgisGeometry(
    queryable: { query: typeof DatabaseService.prototype.query },
    geometry: Polygon,
  ): Promise<number> {
    let row: { is_valid: boolean; n_points: number; area_ha: number } | undefined;
    try {
      const res = await queryable.query<{ is_valid: boolean; n_points: number; area_ha: number }>(
        `WITH g AS (
           SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
         )
         SELECT ST_IsValid(geom) AS is_valid,
                ST_NPoints(geom)::int AS n_points,
                (ST_Area(geom::geography) / 10000.0)::float8 AS area_ha
         FROM g`,
        [JSON.stringify(geometry)],
      );
      row = res.rows[0];
    } catch {
      throw badRequest("Hình học ranh giới thửa đất không hợp lệ (tự cắt hoặc đảo chiều vòng).");
    }
    if (!row || !row.is_valid) {
      throw badRequest("Hình học ranh giới thửa đất không hợp lệ (tự cắt hoặc đảo chiều vòng).");
    }
    if (Number(row.n_points) > MAX_POINTS_PER_RING) {
      throw badRequest(`Hình học thửa đất không được vượt quá ${MAX_POINTS_PER_RING} điểm tọa độ.`);
    }
    const areaHa = Number(row.area_ha);
    if (!Number.isFinite(areaHa) || areaHa < 0.005 || areaHa > 500) {
      throw badRequest("Diện tích thửa đất tính theo ranh giới thực địa phải nằm trong khoảng 0.005 đến 500 ha.");
    }
    return Number(areaHa.toFixed(4));
  }

  async createPlot(input: CreatePlotInput, user?: AuthUser): Promise<CreatedPlot> {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền tạo thửa đất ngoài phạm vi quản lý.");
    }
    if (!input || typeof input !== "object") throw new PlotInputError("Thiếu dữ liệu thửa đất.");
    const geometry = normalizeGeometry(input.geometry);
    const pgAreaHa = await this.validatePostgisGeometry(this.db, geometry);
    const properties = toProperties(input, geometry);
    properties.areaHa = pgAreaHa;
    const scopedVillage = await this.resolveScopedVillageName(user);
    const officerVillageName = scopedVillage || null;
    if (scopedVillage !== null) {
      if (!scopedVillage && !user?.assignedCommune?.trim()) {
        throw forbidden("Tài khoản cán bộ thôn chưa được gắn thôn phụ trách.");
      }
      if (scopedVillage && properties.village && normVillageCompare(properties.village) !== normVillageCompare(scopedVillage)) {
        throw forbidden("Cán bộ thôn chỉ được tạo thửa đất thuộc thôn mình phụ trách.");
      }
      if (scopedVillage) {
        properties.village = scopedVillage;
      }
      properties.status = "pending";
    }

    if (input.householdId !== undefined && input.householdId !== null) {
      if (user) {
        await assertHouseholdInScope(this.db, { householdId: input.householdId }, user);
      }
      const hhCheck = await this.db.query<{ id: number; name: string; village_id: number | null; village_name: string | null }>(
        `SELECT h.id, h.name, h.village_id, v.name AS village_name
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE h.id = $1`,
        [input.householdId],
      );
      const hhRow = hhCheck.rows[0];
      if (!hhRow) {
        throw badRequest("Hộ nông dân liên kết không tồn tại.");
      }
      if (hhRow.village_name) {
        if (properties.village && normVillageCompare(properties.village) !== normVillageCompare(hhRow.village_name)) {
          throw badRequest("Tên thôn của thửa đất không khớp với thôn của hộ nông dân được gắn.");
        }
        properties.village = hhRow.village_name;
      }
      if (!properties.owner) {
        properties.owner = hhRow.name;
      }
    }

    const pool = this.db.pool;
    let linkedHouseholdId = await resolvePlotHouseholdId(pool, {
      householdId: input.householdId,
      ownerName: properties.owner,
      villageName: properties.village,
    });

    if (linkedHouseholdId !== null) {
      const hhMeta = await this.db.query<{ village_id: number | null; village_name: string | null }>(
        `SELECT h.village_id, v.name AS village_name
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE h.id = $1`,
        [linkedHouseholdId],
      );
      const hm = hhMeta.rows[0];
      if (hm) {
        if (
          user &&
          !isStaffInParcelScope(
            user,
            {
              villageId: hm.village_id,
              villageName: hm.village_name,
              zoneCode: properties.zone,
              plotCode: properties.code,
            },
            officerVillageName,
          )
        ) {
          if (input.householdId !== undefined && input.householdId !== null) {
            throw forbidden("Hộ nông dân này không thuộc phạm vi quản lý của bạn.");
          }
          linkedHouseholdId = null;
        } else if (hm.village_name) {
          properties.village = hm.village_name;
        }
      }
    }

    if (
      user &&
      !isStaffInParcelScope(
        user,
        {
          villageName: properties.village,
          zoneCode: properties.zone,
          plotCode: properties.code,
        },
        officerVillageName,
      )
    ) {
      throw forbidden("Bạn không có quyền tạo thửa đất ngoài địa bàn quản lý.");
    }

    try {
      const { rows } = await pool.query<PlotRow>(
        `
          INSERT INTO plots (
            code, sheet_no, parcel_no, owner_name, village, zone_code, variety,
            planted_year, area_ha, source, status, source_ref, household_id, geom
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13,
            ST_SetSRID(ST_GeomFromGeoJSON($14), 4326)
          )
          RETURNING id, code, sheet_no AS sheet, parcel_no AS parcel, owner_name AS owner,
                    village, zone_code AS zone, variety, planted_year AS year, area_ha,
                    source, status, source_ref, household_id, qr_token,
                    ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng,
                    ST_AsGeoJSON(geom) AS geometry_json
        `,
        [
          properties.code,
          properties.sheet,
          properties.parcel,
          properties.owner,
          properties.village,
          properties.zone,
          properties.variety,
          properties.year ?? null,
          properties.areaHa,
          properties.source,
          properties.status,
          properties.sourceRef ?? null,
          linkedHouseholdId,
          JSON.stringify(geometry),
        ],
      );

      await pool
        .query(
          `INSERT INTO plot_signboard_tokens
             (plot_code, qr_token, household_id, zone_code, village_name, variety, planted_year, area_ha, tree_count, center_lat, center_lng, geometry_json)
           VALUES ($1, COALESCE($2, puc_random_qr_token(14)), $3, COALESCE(NULLIF($4, ''), 'VN-DLOR-0086'), $5, $6, $7, $8, GREATEST(30, ROUND($8 * 150)::int), $9, $10, $11)
           ON CONFLICT (plot_code) DO UPDATE
             SET household_id = COALESCE(EXCLUDED.household_id, plot_signboard_tokens.household_id),
                 zone_code = EXCLUDED.zone_code,
                 area_ha = EXCLUDED.area_ha,
                 center_lat = EXCLUDED.center_lat,
                 center_lng = EXCLUDED.center_lng,
                 geometry_json = EXCLUDED.geometry_json
           WHERE plot_signboard_tokens.household_id IS NULL
              OR EXCLUDED.household_id IS NULL
              OR plot_signboard_tokens.household_id = EXCLUDED.household_id`,
          [
            rows[0].code,
            rows[0].qr_token ?? null,
            linkedHouseholdId ?? null,
            properties.zone,
            properties.village,
            properties.variety || "Ri6 & Monthong (Dona)",
            properties.year ?? 2018,
            properties.areaHa,
            rows[0].lat ?? null,
            rows[0].lng ?? null,
            rows[0].geometry_json,
          ],
        )
        .catch(() => undefined);

      await syncHouseholdAndVillageStats(pool, {
        householdIds: linkedHouseholdId ? [linkedHouseholdId] : [],
        hasPlots: true,
      });

      return { feature: rowToFeature(rows[0]), persisted: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") throw new PlotInputError("Mã thửa đã tồn tại.");
      throw error;
    }
  }

  async updatePlotGeometry(
    codeInput: string,
    geometryInput: unknown,
    updateArea = false,
    user?: AuthUser,
  ): Promise<CreatedPlot> {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền chỉnh sửa thửa đất ngoài phạm vi quản lý.");
    }
    const code = normalizeCode(codeInput);
    const geometry = normalizeGeometry(geometryInput);
    const scopedVillage = await this.resolveScopedVillageName(user);
    const officerVillageName = scopedVillage || null;
    const pool = this.db.pool;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const computedAreaHa = await this.validatePostgisGeometry(client, geometry);

      const existing = await client.query<{
        id: string | number;
        village: string | null;
        zone_code: string | null;
        household_id: string | number | null;
        hh_village_id: number | null;
        hh_village_name: string | null;
      }>(
        `SELECT p.id, p.village, p.zone_code, p.household_id,
                h.village_id AS hh_village_id, v.name AS hh_village_name
         FROM plots p
         LEFT JOIN households h ON h.id = p.household_id
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE p.code = $1
         FOR UPDATE OF p`,
        [code],
      );
      if (existing.rows.length === 0) {
        throw new PlotInputError(`Không tìm thấy thửa đất có mã ${code}.`);
      }
      const exRow = existing.rows[0];
      if (
        user &&
        !isStaffInParcelScope(
          user,
          {
            villageId: exRow.hh_village_id,
            villageName: exRow.village || exRow.hh_village_name,
            zoneCode: exRow.zone_code,
            plotCode: code,
          },
          officerVillageName,
        )
      ) {
        throw forbidden("Bạn không có quyền chỉnh sửa thửa đất ngoài địa bàn quản lý.");
      }

      const { rows } = await client.query<PlotRow>(
        `
          UPDATE plots
          SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
              area_ha = CASE WHEN $3::boolean THEN $4::numeric ELSE area_ha END,
              updated_at = now()
          WHERE code = $1
          RETURNING id, code, sheet_no AS sheet, parcel_no AS parcel, owner_name AS owner,
                    village, zone_code AS zone, variety, planted_year AS year, area_ha,
                    source, status, source_ref, household_id,
                    ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng,
                    ST_AsGeoJSON(geom) AS geometry_json
        `,
        [code, JSON.stringify(geometry), Boolean(updateArea), computedAreaHa],
      );

      await client.query("SAVEPOINT sp_sync_signboard");
      try {
        await client.query(
          `UPDATE plot_signboard_tokens
           SET geometry_json = $2,
               center_lat = $3,
               center_lng = $4,
               area_ha = CASE WHEN $5::boolean THEN $6::numeric ELSE area_ha END
           WHERE upper(plot_code) = upper($1)`,
          [
            code,
            rows[0].geometry_json,
            rows[0].lat ?? null,
            rows[0].lng ?? null,
            Boolean(updateArea),
            computedAreaHa,
          ],
        );
        await client.query("RELEASE SAVEPOINT sp_sync_signboard");
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT sp_sync_signboard");
      }

      if (updateArea) {
        const hhId = existing.rows[0].household_id != null ? Number(existing.rows[0].household_id) : null;
        await syncHouseholdAndVillageStats(client, {
          householdIds: hhId ? [hhId] : [],
          hasPlots: true,
        });
      }

      await client.query("COMMIT");
      return { feature: rowToFeature(rows[0]), persisted: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async importCadastral(
    collection: FeatureCollection,
    sourceRef?: string,
    user?: AuthUser,
  ): Promise<ImportResult> {
    if (user?.role === "village_officer") {
      throw forbidden("Chỉ quản trị viên hoặc cán bộ HTX/kiểm tra mới có quyền nhập dữ liệu địa chính hàng loạt.");
    }
    if (user && !isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền nhập dữ liệu địa chính ngoài phạm vi quản lý.");
    }
    if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
      throw new PlotInputError("Tệp phải là GeoJSON FeatureCollection.");
    }
    const importSource = sourceRef ? cleanText(sourceRef, 240) : undefined;
    if (collection.features.length === 0) throw new PlotInputError("Tệp GeoJSON không có thửa đất nào.");
    if (collection.features.length > 2000) throw new PlotInputError("Mỗi lần chỉ nhập tối đa 2.000 thửa.");

    const features = collection.features.map((feature, index) => {
      const geometry = normalizeGeometry(feature.geometry);
      const raw = (feature.properties ?? {}) as Record<string, unknown>;
      const props = toProperties(
        {
          code: String(raw.code ?? raw.ma_thua ?? raw.MA_THUA ?? `CAD-${Date.now()}-${index + 1}`),
          sheet: String(raw.sheet ?? raw.so_to ?? raw.SO_TO ?? ""),
          parcel: String(raw.parcel ?? raw.so_thua ?? raw.SO_THUA ?? ""),
          owner: String(raw.owner ?? raw.chu_ho ?? raw.CHU_HO ?? ""),
          village: String(raw.village ?? raw.thon ?? raw.THON ?? ""),
          zone: String(raw.zone ?? raw.ma_vung ?? raw.MA_VUNG ?? ""),
          variety: String(raw.variety ?? raw.giong ?? raw.GIONG ?? ""),
          year: Number(raw.year ?? raw.nam_trong ?? raw.NAM_TRONG) || undefined,
          source: "cadastral",
          status: "pending",
          geometry,
        },
        geometry,
      );
      return {
        type: "Feature" as const,
        geometry,
        properties: { ...props, source: "cadastral" as const, sourceRef: importSource },
      };
    });

    const byCode = new Map<string, (typeof features)[number]>();
    for (const feature of features) {
      if (
        user &&
        !isStaffInParcelScope(
          user,
          {
            villageName: feature.properties.village,
            zoneCode: feature.properties.zone,
            plotCode: feature.properties.code,
          },
          null,
        )
      ) {
        throw forbidden("Tệp địa chính chứa thửa đất nằm ngoài địa bàn quản lý của bạn.");
      }
      byCode.set(feature.properties.code, feature);
    }
    const uniqueFeatures = Array.from(byCode.values());
    const BATCH_SIZE = 200;

    const pool = this.db.pool;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const savedCodes: string[] = [];

      for (let offset = 0; offset < uniqueFeatures.length; offset += BATCH_SIZE) {
        const chunk = uniqueFeatures.slice(offset, offset + BATCH_SIZE);

        let valRes: { rows: Array<{ is_valid: boolean; n_points: number; area_ha: number }> };
        try {
          valRes = await client.query<{ is_valid: boolean; n_points: number; area_ha: number }>(
            `SELECT ST_IsValid(g.geom) AS is_valid,
                    ST_NPoints(g.geom)::int AS n_points,
                    (ST_Area(g.geom::geography) / 10000.0)::float8 AS area_ha
             FROM UNNEST($1::text[]) WITH ORDINALITY AS u(geom_json, ord)
             CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_GeomFromGeoJSON(u.geom_json), 4326) AS geom) g
             ORDER BY u.ord`,
            [chunk.map((f) => JSON.stringify(f.geometry))],
          );
        } catch {
          throw badRequest("Hình học ranh giới thửa đất không hợp lệ (tự cắt hoặc đảo chiều vòng).");
        }

        for (let i = 0; i < valRes.rows.length; i++) {
          const vr = valRes.rows[i];
          if (!vr || !vr.is_valid) {
            throw badRequest("Hình học ranh giới thửa đất không hợp lệ (tự cắt hoặc đảo chiều vòng).");
          }
          if (Number(vr.n_points) > MAX_POINTS_PER_RING) {
            throw badRequest(`Hình học thửa đất không được vượt quá ${MAX_POINTS_PER_RING} điểm tọa độ.`);
          }
          const aHa = Number(vr.area_ha);
          if (!Number.isFinite(aHa) || aHa < 0.005 || aHa > 500) {
            throw badRequest("Diện tích thửa đất tính theo ranh giới thực địa phải nằm trong khoảng 0.005 đến 500 ha.");
          }
          chunk[i].properties.areaHa = Number(aHa.toFixed(4));
        }

        const upserted = await client.query<{ code: string }>(
          `
            INSERT INTO plots (
              code, sheet_no, parcel_no, owner_name, village, zone_code, variety,
              planted_year, area_ha, source, status, source_ref, geom
            )
            SELECT
              u.code, u.sheet_no, u.parcel_no, u.owner_name, u.village, u.zone_code, u.variety,
              u.planted_year, u.area_ha, 'cadastral', u.status, $11,
              ST_SetSRID(ST_GeomFromGeoJSON(u.geom_json), 4326)
            FROM UNNEST(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
              $6::text[], $7::text[], $8::int[], $9::numeric[], $10::text[], $12::text[]
            ) AS u(
              code, sheet_no, parcel_no, owner_name, village,
              zone_code, variety, planted_year, area_ha, status, geom_json
            )
            ON CONFLICT (code) DO UPDATE SET
              sheet_no = EXCLUDED.sheet_no,
              parcel_no = EXCLUDED.parcel_no,
              owner_name = EXCLUDED.owner_name,
              village = EXCLUDED.village,
              zone_code = EXCLUDED.zone_code,
              variety = EXCLUDED.variety,
              planted_year = EXCLUDED.planted_year,
              area_ha = EXCLUDED.area_ha,
              source = 'cadastral',
              source_ref = EXCLUDED.source_ref,
              geom = EXCLUDED.geom,
              updated_at = now()
            WHERE plots.source NOT IN ('measured')
              AND plots.status NOT IN ('approved', 'violation')
              AND $13::boolean
            RETURNING code
          `,
          [
            chunk.map((f) => f.properties.code),
            chunk.map((f) => f.properties.sheet),
            chunk.map((f) => f.properties.parcel),
            chunk.map((f) => f.properties.owner),
            chunk.map((f) => f.properties.village),
            chunk.map((f) => f.properties.zone),
            chunk.map((f) => f.properties.variety),
            chunk.map((f) => f.properties.year ?? null),
            chunk.map((f) => f.properties.areaHa),
            chunk.map((f) => f.properties.status),
            importSource ?? null,
            chunk.map((f) => JSON.stringify(f.geometry)),
            !user || isManagementRole(user.role),
          ],
        );
        for (const r of upserted.rows) {
          savedCodes.push(r.code);
        }
      }

      if (savedCodes.length > 0) {
        // Tự gắn household_id khi tên chủ thửa trùng duy nhất trong cùng thôn (hoặc trên toàn HTX khi thửa chưa khai thôn), đồng thời đồng bộ tên thôn.
        await client.query(
          `UPDATE plots p
           SET household_id = m.household_id,
               village = m.village_name
           FROM (
             SELECT DISTINCT ON (p0.id) p0.id AS plot_id, h.id AS household_id, v.name AS village_name
             FROM plots p0
             JOIN households h ON lower(btrim(h.name)) = lower(btrim(p0.owner_name))
             JOIN villages v ON v.id = h.village_id
             WHERE p0.code = ANY($1::text[])
               AND p0.household_id IS NULL
               AND btrim(COALESCE(p0.owner_name, '')) <> ''
               AND (
                 (
                   btrim(COALESCE(p0.village, '')) <> ''
                   AND lower(btrim(v.name)) = lower(btrim(p0.village))
                   AND (
                     SELECT count(*)
                     FROM households h2
                     JOIN villages v2 ON v2.id = h2.village_id
                     WHERE lower(btrim(h2.name)) = lower(btrim(p0.owner_name))
                       AND lower(btrim(v2.name)) = lower(btrim(p0.village))
                   ) = 1
                 )
                 OR (
                   btrim(COALESCE(p0.village, '')) = ''
                   AND (
                     SELECT count(*)
                     FROM households h3
                     WHERE lower(btrim(h3.name)) = lower(btrim(p0.owner_name))
                   ) = 1
                 )
               )
             ORDER BY p0.id, (lower(btrim(v.name)) = lower(btrim(COALESCE(p0.village, '')))) DESC
           ) m
           WHERE p.id = m.plot_id`,
          [savedCodes],
        );

        const affectedHh = await client.query<{ household_id: number | string }>(
          `SELECT DISTINCT household_id
           FROM plots
           WHERE code = ANY($1::text[]) AND household_id IS NOT NULL`,
          [savedCodes],
        );
        await syncHouseholdAndVillageStats(client, {
          householdIds: affectedHh.rows.map((r) => Number(r.household_id)),
          hasPlots: true,
        });
      }

      await client.query("COMMIT");
      return { imported: savedCodes.length, persisted: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addMeasurement(input: MeasurementInput, user?: AuthUser): Promise<MeasurementResult> {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền thêm kết quả đo ngoài phạm vi quản lý.");
    }
    if (!input || typeof input !== "object") throw new PlotInputError("Thiếu dữ liệu kết quả đo.");
    const geometry = normalizeGeometry(input.geometry);
    const areaHa = await this.validatePostgisGeometry(this.db, geometry);
    let plotCode = cleanText(input.plotCode, 64);
    if (!plotCode) throw new PlotInputError("Thiếu mã thửa cần đối chiếu.");

    const scopedVillage = await this.resolveScopedVillageName(user);
    const officerVillageName = scopedVillage || null;
    const pool = this.db.pool;

    let plotId: number | null = null;
    let plotVillage: string | null = null;
    let plotZone: string | null = null;
    let hhVillageId: number | null = null;
    const rawPlotId = input.plotId !== undefined && input.plotId !== null ? String(input.plotId).trim() : "";
    if (rawPlotId !== "") {
      if (!/^\d+$/.test(rawPlotId)) {
        throw badRequest("Định danh thửa đất (plotId) không hợp lệ.");
      }
      const found = await pool.query<{
        id: string | number;
        code: string;
        village: string | null;
        zone_code: string | null;
        hh_village_id: number | null;
        hh_village_name: string | null;
      }>(
        `SELECT p.id, p.code, p.village, p.zone_code,
                h.village_id AS hh_village_id, v.name AS hh_village_name
         FROM plots p
         LEFT JOIN households h ON h.id = p.household_id
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE p.id = $1`,
        [Number(rawPlotId)],
      );
      if (found.rows.length > 0) {
        if (String(found.rows[0].code).trim().toUpperCase() !== plotCode.toUpperCase()) {
          throw badRequest("Mã thửa (plotCode) không khớp với thửa đất được chọn (plotId).");
        }
        plotId = Number(found.rows[0].id);
        plotCode = found.rows[0].code;
        plotVillage = found.rows[0].village || found.rows[0].hh_village_name;
        plotZone = found.rows[0].zone_code;
        hhVillageId = found.rows[0].hh_village_id;
      }
    } else {
      const found = await pool.query<{
        id: string | number;
        code: string;
        village: string | null;
        zone_code: string | null;
        hh_village_id: number | null;
        hh_village_name: string | null;
      }>(
        `SELECT p.id, p.code, p.village, p.zone_code,
                h.village_id AS hh_village_id, v.name AS hh_village_name
         FROM plots p
         LEFT JOIN households h ON h.id = p.household_id
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE upper(p.code) = upper($1)`,
        [plotCode],
      );
      if (found.rows.length > 0) {
        plotId = Number(found.rows[0].id);
        plotCode = found.rows[0].code;
        plotVillage = found.rows[0].village || found.rows[0].hh_village_name;
        plotZone = found.rows[0].zone_code;
        hhVillageId = found.rows[0].hh_village_id;
      }
    }
    if (!plotId) throw new PlotInputError("Không tìm thấy thửa để lưu kết quả đo.");
    if (
      user &&
      !isStaffInParcelScope(
        user,
        {
          villageId: hhVillageId,
          villageName: plotVillage,
          zoneCode: plotZone,
          plotCode,
        },
        officerVillageName,
      )
    ) {
      throw forbidden("Bạn không có quyền thêm kết quả đo cho thửa đất ngoài địa bàn quản lý.");
    }

    const { rows } = await pool.query<MeasurementRow>(
      `
        INSERT INTO plot_measurements (plot_id, plot_code, measured_by, area_ha, note, geom)
        VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))
        RETURNING id, plot_code, measured_by, area_ha, note, created_at,
                  ST_AsGeoJSON(geom) AS geometry_json
      `,
      [
        plotId,
        plotCode,
        cleanText(input.measuredBy, 120) || "Cán bộ đo",
        areaHa,
        input.note ? cleanText(input.note, 500) : null,
        JSON.stringify(geometry),
      ],
    );

    const row = rows[0];
    return {
      measurement: {
        id: String(row.id),
        plotCode: row.plot_code,
        measuredBy: row.measured_by,
        areaHa: asNumber(row.area_ha),
        note: row.note ?? undefined,
        createdAt: row.created_at,
        geometry: safeParsePolygon(row.geometry_json),
        persisted: true,
      },
      persisted: true,
    };
  }

  async listMeasurements(plotCode: string, user?: AuthUser): Promise<StoredMeasurement[]> {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return [];
    }
    const code = cleanText(plotCode, 64);
    if (!code) return [];
    if (!(await this.hasPlotsTable())) {
      return [];
    }
    const scopedVillage = await this.resolveScopedVillageName(user);
    const officerVillageName = scopedVillage || null;
    const pool = this.db.pool;
    const found = await pool.query<{
      village: string | null;
      zone_code: string | null;
      hh_village_id: number | null;
      hh_village_name: string | null;
    }>(
      `SELECT p.village, p.zone_code, h.village_id AS hh_village_id, v.name AS hh_village_name
       FROM plots p
       LEFT JOIN households h ON h.id = p.household_id
       LEFT JOIN villages v ON v.id = h.village_id
       WHERE upper(p.code) = upper($1)
       LIMIT 1`,
      [code],
    );
    if (found.rows.length === 0) {
      return [];
    }
    const meta = found.rows[0];
    if (
      user &&
      !isStaffInParcelScope(
        user,
        {
          villageId: meta.hh_village_id,
          villageName: meta.village || meta.hh_village_name,
          zoneCode: meta.zone_code,
          plotCode: code,
        },
        officerVillageName,
      )
    ) {
      return [];
    }

    const { rows } = await pool.query<MeasurementRow>(
      `
        SELECT id, plot_code, measured_by, area_ha, note, created_at,
               ST_AsGeoJSON(geom) AS geometry_json
        FROM plot_measurements
        WHERE upper(plot_code) = upper($1)
        ORDER BY created_at DESC
      `,
      [code],
    );

    return rows.map((row) => ({
      id: String(row.id),
      plotCode: row.plot_code,
      measuredBy: row.measured_by,
      areaHa: asNumber(row.area_ha),
      note: row.note ?? undefined,
      createdAt: row.created_at,
      geometry: safeParsePolygon(row.geometry_json),
      persisted: true,
    }));
  }
}
