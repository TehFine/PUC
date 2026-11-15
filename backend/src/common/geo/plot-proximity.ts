import type { DatabaseService } from "../../database/database.service";

const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_M * c;
}

/**
 * Kiểm tra điểm (lng, lat) có nằm trong vòng đa giác đóng hay không (thuật toán Ray-Casting).
 * ring: mảng [lng, lat][] theo chuẩn GeoJSON WGS84.
 */
export function pointInRing(lng: number, lat: number, ring: Array<[number, number]>): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Khoảng cách ngắn nhất (mét) từ điểm (lat, lng) tới cạnh đoạn thẳng [A, B] bằng phép chiếu phẳng cục bộ.
 */
function distancePointToSegmentMeters(
  lat: number,
  lng: number,
  aLng: number,
  aLat: number,
  bLng: number,
  bLat: number,
): number {
  const cosLat = Math.cos(toRad(lat));
  const mPerDegLat = 111_132.92;
  const mPerDegLng = 111_412.84 * cosLat;

  const ax = (aLng - lng) * mPerDegLng;
  const ay = (aLat - lat) * mPerDegLat;
  const bx = (bLng - lng) * mPerDegLng;
  const by = (bLat - lat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) {
    return Math.hypot(ax, ay);
  }
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(projX, projY);
}

export function evaluatePointAgainstPolygonGeoJson(
  geometryJson: string | null | undefined,
  lat: number,
  lng: number,
): { insidePolygon: boolean; distanceMeters: number | null; centerLat: number | null; centerLng: number | null } {
  if (!geometryJson) {
    return { insidePolygon: false, distanceMeters: null, centerLat: null, centerLng: null };
  }
  try {
    const parsed = JSON.parse(geometryJson) as {
      type?: string;
      coordinates?: unknown;
    };
    let outerRing: Array<[number, number]> | null = null;
    const holes: Array<Array<[number, number]>> = [];

    if (parsed.type === "Polygon" && Array.isArray(parsed.coordinates) && Array.isArray(parsed.coordinates[0])) {
      outerRing = parsed.coordinates[0] as Array<[number, number]>;
      for (let i = 1; i < parsed.coordinates.length; i++) {
        if (Array.isArray(parsed.coordinates[i])) {
          holes.push(parsed.coordinates[i] as Array<[number, number]>);
        }
      }
    } else if (
      parsed.type === "MultiPolygon" &&
      Array.isArray(parsed.coordinates) &&
      Array.isArray(parsed.coordinates[0]) &&
      Array.isArray(parsed.coordinates[0][0])
    ) {
      outerRing = parsed.coordinates[0][0] as Array<[number, number]>;
    }

    if (!outerRing || outerRing.length < 3) {
      return { insidePolygon: false, distanceMeters: null, centerLat: null, centerLng: null };
    }

    let sumLat = 0;
    let sumLng = 0;
    const uniqueCount =
      outerRing.length > 1 &&
      outerRing[0][0] === outerRing[outerRing.length - 1][0] &&
      outerRing[0][1] === outerRing[outerRing.length - 1][1]
        ? outerRing.length - 1
        : outerRing.length;
    for (let i = 0; i < uniqueCount; i++) {
      sumLng += Number(outerRing[i][0]);
      sumLat += Number(outerRing[i][1]);
    }
    const centerLat = uniqueCount > 0 ? Number((sumLat / uniqueCount).toFixed(6)) : null;
    const centerLng = uniqueCount > 0 ? Number((sumLng / uniqueCount).toFixed(6)) : null;

    const inOuter = pointInRing(lng, lat, outerRing);
    const inHole = holes.some((h) => pointInRing(lng, lat, h));
    const insidePolygon = inOuter && !inHole;

    if (insidePolygon) {
      return { insidePolygon: true, distanceMeters: 0, centerLat, centerLng };
    }

    let minDist = Infinity;
    for (let i = 0; i < outerRing.length - 1; i++) {
      const d = distancePointToSegmentMeters(
        lat,
        lng,
        Number(outerRing[i][0]),
        Number(outerRing[i][1]),
        Number(outerRing[i + 1][0]),
        Number(outerRing[i + 1][1]),
      );
      if (d < minDist) minDist = d;
    }
    if (outerRing[0][0] !== outerRing[outerRing.length - 1][0] || outerRing[0][1] !== outerRing[outerRing.length - 1][1]) {
      const d = distancePointToSegmentMeters(
        lat,
        lng,
        Number(outerRing[outerRing.length - 1][0]),
        Number(outerRing[outerRing.length - 1][1]),
        Number(outerRing[0][0]),
        Number(outerRing[0][1]),
      );
      if (d < minDist) minDist = d;
    }

    return {
      insidePolygon: false,
      distanceMeters: Number.isFinite(minDist) ? Number(minDist.toFixed(1)) : null,
      centerLat,
      centerLng,
    };
  } catch {
    return { insidePolygon: false, distanceMeters: null, centerLat: null, centerLng: null };
  }
}

export interface PlotGpsVerificationResult {
  verified: boolean;
  insidePolygon: boolean;
  distanceMeters: number | null;
  plotFound: boolean;
  centerLat: number | null;
  centerLng: number | null;
}

/**
 * Đối chứng tọa độ GPS thực địa (lat, lng) với ranh giới đa giác GIS của thửa đất:
 * - Ưu tiên truy vấn không gian PostGIS trên bảng `plots` nếu có.
 * - Dự phòng sang đa giác GeoJSON lưu trong `plot_signboard_tokens` khi môi trường không cài PostGIS.
 * - Chấp nhận sai số tán cây sầu riêng thực tế (buffer <= max(45m, min(100m, accuracy))).
 */
export async function verifyPlotGpsProximity(
  db: DatabaseService,
  plotCode: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  accuracyMeters?: number | null,
): Promise<PlotGpsVerificationResult> {
  if (
    !plotCode ||
    !plotCode.trim() ||
    lat === null ||
    lat === undefined ||
    lng === null ||
    lng === undefined ||
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lng))
  ) {
    return {
      verified: false,
      insidePolygon: false,
      distanceMeters: null,
      plotFound: false,
      centerLat: null,
      centerLng: null,
    };
  }

  const numLat = Number(lat);
  const numLng = Number(lng);
  const cleanCode = plotCode.trim();
  const maxBufferMeters = Math.max(45, Math.min(100, Number(accuracyMeters ?? 45) || 45));

  const regPlots = await db.query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg");
  if (regPlots.rows[0]?.reg) {
    const pgRes = await db.query<{
      inside: boolean;
      dist_m: number;
      center_lat: number;
      center_lng: number;
    }>(
      `SELECT ST_Covers(geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)) AS inside,
              ROUND(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)::numeric, 1)::float8 AS dist_m,
              ROUND(ST_Y(ST_Centroid(geom))::numeric, 6)::float8 AS center_lat,
              ROUND(ST_X(ST_Centroid(geom))::numeric, 6)::float8 AS center_lng
       FROM plots
       WHERE upper(code) = upper($1) AND geom IS NOT NULL
       LIMIT 1`,
      [cleanCode, numLng, numLat],
    );
    if (pgRes.rows[0]) {
      const inside = Boolean(pgRes.rows[0].inside);
      const dist = inside ? 0 : Number(pgRes.rows[0].dist_m ?? 0);
      return {
        verified: inside || dist <= maxBufferMeters,
        insidePolygon: inside,
        distanceMeters: dist,
        plotFound: true,
        centerLat: Number(pgRes.rows[0].center_lat),
        centerLng: Number(pgRes.rows[0].center_lng),
      };
    }
  }

  const regSign = await db.query<{ reg: string | null }>("SELECT to_regclass('public.plot_signboard_tokens') AS reg");
  if (regSign.rows[0]?.reg) {
    const sbRes = await db.query<{
      geometry_json: string | null;
      center_lat: number | null;
      center_lng: number | null;
    }>(
      `SELECT geometry_json, center_lat::float8 AS center_lat, center_lng::float8 AS center_lng
       FROM plot_signboard_tokens
       WHERE upper(plot_code) = upper($1)
       LIMIT 1`,
      [cleanCode],
    );
    if (sbRes.rows[0]) {
      const row = sbRes.rows[0];
      if (row.geometry_json) {
        const evalPoly = evaluatePointAgainstPolygonGeoJson(row.geometry_json, numLat, numLng);
        if (evalPoly.distanceMeters !== null) {
          return {
            verified: evalPoly.insidePolygon || evalPoly.distanceMeters <= maxBufferMeters,
            insidePolygon: evalPoly.insidePolygon,
            distanceMeters: evalPoly.distanceMeters,
            plotFound: true,
            centerLat: evalPoly.centerLat ?? row.center_lat,
            centerLng: evalPoly.centerLng ?? row.center_lng,
          };
        }
      }
      if (row.center_lat !== null && row.center_lng !== null) {
        const dist = Number(haversineMeters(numLat, numLng, Number(row.center_lat), Number(row.center_lng)).toFixed(1));
        const insideApprox = dist <= 55;
        return {
          verified: dist <= 120,
          insidePolygon: insideApprox,
          distanceMeters: insideApprox ? 0 : Number(Math.max(0, dist - 55).toFixed(1)),
          plotFound: true,
          centerLat: Number(row.center_lat),
          centerLng: Number(row.center_lng),
        };
      }
    }
  }

  return {
    verified: false,
    insidePolygon: false,
    distanceMeters: null,
    plotFound: false,
    centerLat: null,
    centerLng: null,
  };
}

