import type { FeatureCollection, Polygon } from "geojson";
import { Injectable } from "@nestjs/common";
import { AppException } from "../common/errors/app.exception";
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

function rowToFeature(row: PlotRow): PlotFeature {
  return {
    type: "Feature",
    geometry: JSON.parse(row.geometry_json) as Polygon,
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
      persisted: true,
    },
  };
}

function normalizeGeometry(geometry: unknown): Polygon {
  if (!geometry || typeof geometry !== "object") {
    throw new PlotInputError("Thiếu dữ liệu hình học của thửa.");
  }
  const candidate = geometry as Polygon;
  if (candidate.type !== "Polygon" || !Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
    throw new PlotInputError("Hình học phải là Polygon GeoJSON hợp lệ.");
  }

  const rings = candidate.coordinates.map((ring) => {
    if (!Array.isArray(ring) || ring.length < 3) {
      throw new PlotInputError("Polygon cần ít nhất 3 điểm.");
    }
    const positions = ring.map((position) => {
      if (!Array.isArray(position) || position.length < 2) {
        throw new PlotInputError("Tọa độ polygon không hợp lệ.");
      }
      const lng = Number(position[0]);
      const lat = Number(position[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new PlotInputError("Tọa độ polygon không hợp lệ.");
      }
      return [lng, lat];
    });
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      positions.push([first[0], first[1]]);
    }
    if (positions.length < 4) {
      throw new PlotInputError("Polygon cần ít nhất 3 điểm và phải khép kín.");
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
  constructor(private readonly db: DatabaseService) {}

  async listPlots(): Promise<PlotCollection> {
    const { rows } = await this.db.query<PlotRow>(`
      SELECT id, code, sheet_no AS sheet, parcel_no AS parcel, owner_name AS owner,
             village, zone_code AS zone, variety, planted_year AS year, area_ha,
             source, status, source_ref, ST_AsGeoJSON(geom) AS geometry_json
      FROM plots
      ORDER BY zone_code, sheet_no, parcel_no
    `);
    return { type: "FeatureCollection", features: rows.map(rowToFeature) };
  }

  async createPlot(input: CreatePlotInput): Promise<CreatedPlot> {
    if (!input || typeof input !== "object") throw new PlotInputError("Thiếu dữ liệu thửa đất.");
    const geometry = normalizeGeometry(input.geometry);
    const properties = toProperties(input, geometry);
    const pool = this.db.pool;

    try {
      const { rows } = await pool.query<PlotRow>(
        `
          INSERT INTO plots (
            code, sheet_no, parcel_no, owner_name, village, zone_code, variety,
            planted_year, area_ha, source, status, source_ref, geom
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            ST_SetSRID(ST_GeomFromGeoJSON($13), 4326)
          )
          RETURNING id, code, sheet_no AS sheet, parcel_no AS parcel, owner_name AS owner,
                    village, zone_code AS zone, variety, planted_year AS year, area_ha,
                    source, status, source_ref, ST_AsGeoJSON(geom) AS geometry_json
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
          JSON.stringify(geometry),
        ],
      );
      return { feature: rowToFeature(rows[0]), persisted: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") throw new PlotInputError("Mã thửa đã tồn tại.");
      throw error;
    }
  }

  async importCadastral(
    collection: FeatureCollection,
    sourceRef?: string,
  ): Promise<ImportResult> {
    if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
      throw new PlotInputError("Tệp phải là GeoJSON FeatureCollection.");
    }
    const importSource = sourceRef ? cleanText(sourceRef, 240) : undefined;
    if (collection.features.length === 0) throw new PlotInputError("Tệp GeoJSON không có thửa đất nào.");
    if (collection.features.length > 2000) throw new PlotInputError("Mỗi lần chỉ nhập tối đa 2.000 thửa.");

    const features = collection.features
      .map((feature, index) => {
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

    const pool = this.db.pool;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const feature of features) {
        const p = feature.properties;
        await client.query(
          `
            INSERT INTO plots (
              code, sheet_no, parcel_no, owner_name, village, zone_code, variety,
              planted_year, area_ha, source, status, source_ref, geom
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'cadastral', $10, $11,
                    ST_SetSRID(ST_GeomFromGeoJSON($12), 4326))
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
          `,
          [
            p.code,
            p.sheet,
            p.parcel,
            p.owner,
            p.village,
            p.zone,
            p.variety,
            p.year ?? null,
            p.areaHa,
            p.status,
            importSource ?? null,
            JSON.stringify(feature.geometry),
          ],
        );
      }
      await client.query("COMMIT");
      return { imported: features.length, persisted: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addMeasurement(input: MeasurementInput): Promise<MeasurementResult> {
    if (!input || typeof input !== "object") throw new PlotInputError("Thiếu dữ liệu kết quả đo.");
    const geometry = normalizeGeometry(input.geometry);
    const areaHa = polygonAreaHa(geometry);
    const plotCode = cleanText(input.plotCode, 64);
    if (!plotCode) throw new PlotInputError("Thiếu mã thửa cần đối chiếu.");

    const pool = this.db.pool;

    let plotId: number | null = null;
    if (input.plotId && /^\d+$/.test(input.plotId)) {
      plotId = Number(input.plotId);
    } else {
      const found = await pool.query<{ id: string | number }>("SELECT id FROM plots WHERE code = $1", [plotCode]);
      if (found.rows.length > 0) plotId = Number(found.rows[0].id);
    }
    if (!plotId) throw new PlotInputError("Không tìm thấy thửa để lưu kết quả đo.");

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
        geometry: JSON.parse(row.geometry_json) as Polygon,
        persisted: true,
      },
      persisted: true,
    };
  }

  async listMeasurements(plotCode: string): Promise<StoredMeasurement[]> {
    const code = cleanText(plotCode, 64);
    if (!code) return [];
    const pool = this.db.pool;

    const { rows } = await pool.query<MeasurementRow>(
      `
        SELECT id, plot_code, measured_by, area_ha, note, created_at,
               ST_AsGeoJSON(geom) AS geometry_json
        FROM plot_measurements
        WHERE plot_code = $1
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
      geometry: JSON.parse(row.geometry_json) as Polygon,
      persisted: true,
    }));
  }
}
