import { intersect } from "@turf/intersect";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { PlotCollection, PlotFeature } from "@/types/geo";

// Thông số Elipxôit chuẩn quốc tế WGS84 (khớp trực tiếp với PostGIS geography)
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const WGS84_E = Math.sqrt(WGS84_E2);
const DEG_TO_RAD = Math.PI / 180;

function authalicQ(latRad: number): number {
  const sinPhi = Math.sin(latRad);
  const eSin = WGS84_E * sinPhi;
  const oneMinusE2Sin2 = 1 - eSin * eSin;
  if (oneMinusE2Sin2 <= 1e-15) return sinPhi >= 0 ? 2 : -2;
  const atanhTerm = (1 / (2 * WGS84_E)) * Math.log((1 + eSin) / (1 - eSin));
  return (1 - WGS84_E2) * (sinPhi / oneMinusE2Sin2 + atanhTerm);
}

function wrapDeltaRad(dLonRad: number): number {
  let d = dLonRad;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

function ringEllipsoidalAreaSqm(ring: number[][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring
      : [...ring, ring[0]];
  if (closed.length < 4) return 0;

  const q0 = authalicQ(Number(closed[0][1]) * DEG_TO_RAD);
  let prevLon = Number(closed[0][0]) * DEG_TO_RAD;
  let prevQRel = 0;
  let acc = 0;

  for (let i = 1; i < closed.length; i += 1) {
    const lon = Number(closed[i][0]) * DEG_TO_RAD;
    const lat = Number(closed[i][1]) * DEG_TO_RAD;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const qRel = authalicQ(lat) - q0;
    const dLon = wrapDeltaRad(lon - prevLon);
    acc += dLon * (prevQRel + qRel);
    prevLon = lon;
    prevQRel = qRel;
  }

  return Math.abs((WGS84_A * WGS84_A * 0.25) * acc);
}

export function polygonAreaSqm(geometry: Polygon | MultiPolygon): number {
  if (!geometry || typeof geometry !== "object") return 0;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates ?? [];
    if (rings.length === 0) return 0;
    let total = ringEllipsoidalAreaSqm(rings[0]);
    for (let i = 1; i < rings.length; i += 1) {
      total -= ringEllipsoidalAreaSqm(rings[i]);
    }
    return Math.max(0, total);
  }
  if (geometry.type === "MultiPolygon") {
    let sum = 0;
    for (const polyCoords of geometry.coordinates ?? []) {
      if (!polyCoords || polyCoords.length === 0) continue;
      let polyArea = ringEllipsoidalAreaSqm(polyCoords[0]);
      for (let i = 1; i < polyCoords.length; i += 1) {
        polyArea -= ringEllipsoidalAreaSqm(polyCoords[i]);
      }
      sum += Math.max(0, polyArea);
    }
    return sum;
  }
  return 0;
}

export function polygonAreaHa(geometry: Polygon): number {
  return polygonAreaSqm(geometry) / 10_000;
}

/** Khoảng cách trắc địa chính xác theo bán kính cong kinh tuyến và vĩ tuyến trên WGS84 (mét). */
export function wgs84DistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = wrapDeltaRad((lng2 - lng1) * DEG_TO_RAD);
  const midLat = ((lat1 + lat2) * 0.5) * DEG_TO_RAD;
  const sinMid = Math.sin(midLat);
  const w2 = 1 - WGS84_E2 * sinMid * sinMid;
  const w = Math.sqrt(w2);
  const mRadius = (WGS84_A * (1 - WGS84_E2)) / (w2 * w);
  const nRadiusCos = (WGS84_A / w) * Math.cos(midLat);
  const dy = mRadius * dLat;
  const dx = nRadiusCos * dLon;
  return Math.hypot(dx, dy);
}

export function formatHa(value: number, maxDecimals: number = 4): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  })} ha`;
}

export function formatAreaSqm(areaHa: number): string {
  const sqm = (Number.isFinite(areaHa) ? areaHa : 0) * 10_000;
  if (Math.abs(sqm) < 1000 && Math.abs(sqm % 1) >= 0.1) {
    return `${sqm.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;
  }
  return `${Math.round(sqm).toLocaleString("vi-VN")} m²`;
}

export function formatPerimeterMeters(perimeterKm: number): string {
  const meters = (Number.isFinite(perimeterKm) ? perimeterKm : 0) * 1000;
  if (meters < 100) {
    return `${meters.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
  }
  return `${Math.round(meters).toLocaleString("vi-VN")} m`;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface SelfIntersection {
  edgeA: number;
  edgeB: number;
  lat: number;
  lng: number;
}

/**
 * Phát hiện các cặp cạnh không kề nhau bị cắt chéo nhau trên đa giác đang vẽ.
 * Cho phép cảnh báo tức thời trên bản đồ trước khi gửi lưu PostGIS (ST_IsValid).
 */
export function findSelfIntersections(points: ReadonlyArray<LatLngPoint>): SelfIntersection[] {
  const n = points.length;
  if (n < 4) return [];

  const refLat = points[0].lat * DEG_TO_RAD;
  const cosRef = Math.cos(refLat);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    xs[i] = (points[i].lng - points[0].lng) * DEG_TO_RAD * WGS84_A * cosRef;
    ys[i] = (points[i].lat - points[0].lat) * DEG_TO_RAD * WGS84_A;
  }

  const hits: SelfIntersection[] = [];
  const EPS = 1e-7;

  for (let i = 0; i < n; i += 1) {
    const i2 = (i + 1) % n;
    const ax = xs[i];
    const ay = ys[i];
    const bx = xs[i2];
    const by = ys[i2];
    const minAx = Math.min(ax, bx);
    const maxAx = Math.max(ax, bx);
    const minAy = Math.min(ay, by);
    const maxAy = Math.max(ay, by);

    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      const j2 = (j + 1) % n;
      const cx = xs[j];
      const cy = ys[j];
      const dx = xs[j2];
      const dy = ys[j2];

      if (
        Math.max(cx, dx) < minAx - EPS ||
        Math.min(cx, dx) > maxAx + EPS ||
        Math.max(cy, dy) < minAy - EPS ||
        Math.min(cy, dy) > maxAy + EPS
      ) {
        continue;
      }

      const rX = bx - ax;
      const rY = by - ay;
      const sX = dx - cx;
      const sY = dy - cy;
      const denom = rX * sY - rY * sX;
      if (Math.abs(denom) <= EPS) continue;

      const qpX = cx - ax;
      const qpY = cy - ay;
      const t = (qpX * sY - qpY * sX) / denom;
      const u = (qpX * rY - qpY * rX) / denom;

      if (t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS) {
        const hitLat = points[i].lat + t * (points[i2].lat - points[i].lat);
        const hitLng = points[i].lng + t * (points[i2].lng - points[i].lng);
        hits.push({ edgeA: i, edgeB: j, lat: hitLat, lng: hitLng });
      }
    }
  }

  return hits;
}

/**
 * Làm mượt và rút gọn chuỗi tọa độ vẽ nét tự do (Ramer-Douglas-Peucker trong hệ mét mặt phẳng cục bộ)
 * để giữ trọn đường cong bờ suối, đường uốn lượn với sai số dưới 0.35m mà không sinh hàng nghìn điểm nhiễu.
 */
export function simplifyTrackPoints<T extends LatLngPoint>(
  points: ReadonlyArray<T>,
  toleranceMeters: number = 0.35,
): T[] {
  if (points.length <= 2) return [...points];

  const refLat = points[0].lat * DEG_TO_RAD;
  const cosRef = Math.cos(refLat);
  const xs = points.map((p) => (p.lng - points[0].lng) * DEG_TO_RAD * WGS84_A * cosRef);
  const ys = points.map((p) => (p.lat - points[0].lat) * DEG_TO_RAD * WGS84_A);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const tolSq = toleranceMeters * toleranceMeters;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const pair = stack.pop();
    if (!pair) break;
    const [first, last] = pair;
    if (last - first <= 1) continue;

    const ax = xs[first];
    const ay = ys[first];
    const bx = xs[last];
    const by = ys[last];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let maxDistSq = -1;
    let splitIdx = -1;

    for (let i = first + 1; i < last; i += 1) {
      let distSq: number;
      if (lenSq <= 1e-12) {
        const px = xs[i] - ax;
        const py = ys[i] - ay;
        distSq = px * px + py * py;
      } else {
        const t = Math.max(0, Math.min(1, ((xs[i] - ax) * dx + (ys[i] - ay) * dy) / lenSq));
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        const ex = xs[i] - projX;
        const ey = ys[i] - projY;
        distSq = ex * ex + ey * ey;
      }
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        splitIdx = i;
      }
    }

    if (maxDistSq > tolSq && splitIdx !== -1) {
      keep[splitIdx] = 1;
      stack.push([first, splitIdx], [splitIdx, last]);
    }
  }

  const out: T[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

export function formatCoordValue(value: number): string {
  const s7 = value.toFixed(7).replace(/0+$/, "");
  const [intPart, decPart = ""] = s7.split(".");
  return `${intPart}.${decPart.padEnd(5, "0")}`;
}

export function formatCoords(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return "-";
  return `${formatCoordValue(lat)}, ${formatCoordValue(lng)}`;
}

export function plotCenterCoords(feature: PlotFeature): { lat: number; lng: number } | null {
  const { lat, lng } = feature.properties;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  const ring = feature.geometry?.coordinates?.[0];
  if (!ring || ring.length === 0) return null;
  const pts =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  if (pts.length === 0) return null;
  const sum = pts.reduce(
    (acc, pt) => ({ lng: acc.lng + Number(pt[0]), lat: acc.lat + Number(pt[1]) }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / pts.length, lng: sum.lng / pts.length };
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function intersectionGeometry(a: Polygon, b: Polygon): Feature<Polygon | MultiPolygon> | null {
  try {
    return intersect({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: a },
        { type: "Feature", properties: {}, geometry: b },
      ],
    });
  } catch {
    return null;
  }
}

export function overlapAreaHa(a: Polygon, b: Polygon): number {
  const result = intersectionGeometry(a, b);
  if (!result) return 0;
  return polygonAreaSqm(result.geometry) / 10_000;
}

export interface PlotOverlap {
  code: string;
  owner: string;
  areaHa: number;
}

function getPolygonBbox(poly: Polygon): [number, number, number, number] | null {
  const ring = poly.coordinates?.[0];
  if (!ring || ring.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const lng = ring[i][0];
    const lat = ring[i][1];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

function bboxesOverlap(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function findOverlaps(target: PlotFeature, collection: PlotCollection | null): PlotOverlap[] {
  if (!collection) return [];
  const targetBbox = getPolygonBbox(target.geometry);
  if (!targetBbox) return [];

  const overlaps: PlotOverlap[] = [];
  for (let i = 0; i < collection.features.length; i += 1) {
    const feature = collection.features[i];
    if (feature.properties.code === target.properties.code) continue;
    const candidateBbox = getPolygonBbox(feature.geometry);
    if (!candidateBbox || !bboxesOverlap(targetBbox, candidateBbox)) continue;
    const areaHa = overlapAreaHa(target.geometry, feature.geometry);
    if (areaHa > 0.0005) {
      overlaps.push({
        code: feature.properties.code,
        owner: feature.properties.owner,
        areaHa,
      });
    }
  }
  return overlaps.sort((a, b) => b.areaHa - a.areaHa);
}

export interface PlotComparison {
  declaredAreaHa: number;
  measuredAreaHa: number;
  overlapAreaHa: number;
  overlapRatio: number;
  differenceHa: number;
  differenceRatio: number;
  needsReview: boolean;
  warnings: string[];
}

export function comparePolygons(declared: Polygon, measured: Polygon): PlotComparison {
  const declaredAreaHa = polygonAreaHa(declared);
  const measuredAreaHa = polygonAreaHa(measured);
  const overlap = overlapAreaHa(declared, measured);
  const overlapRatio = declaredAreaHa > 0 ? overlap / declaredAreaHa : 0;
  const differenceHa = measuredAreaHa - declaredAreaHa;
  const differenceRatio = declaredAreaHa > 0 ? differenceHa / declaredAreaHa : 0;

  const warnings: string[] = [];
  if (overlapRatio < 0.8) {
    warnings.push("Phần đo lại chỉ trùng dưới 80% diện tích khai báo.");
  }
  if (overlapRatio < 0.98) {
    warnings.push(`Có ${formatHa(Math.max(0, declaredAreaHa - overlap))} khai báo nằm ngoài vùng đo lại.`);
  }
  if (Math.abs(differenceRatio) > 0.1) {
    warnings.push(
      `Chênh lệch diện tích ${formatPercent(Math.abs(differenceRatio) * 100)} (${formatHa(
        Math.abs(differenceHa),
      )}).`,
    );
  }

  return {
    declaredAreaHa,
    measuredAreaHa,
    overlapAreaHa: overlap,
    overlapRatio,
    differenceHa,
    differenceRatio,
    needsReview: warnings.length > 0,
    warnings,
  };
}

export function featureLabel(feature: Feature<Polygon>): string {
  const props = feature.properties as { sheet?: string; parcel?: string; code?: string } | null;
  if (props?.sheet || props?.parcel) {
    return `${props.sheet || "-"}/${props.parcel || "-"}`;
  }
  return props?.code ?? "Thửa đất";
}

export function isPolygon(value: unknown): value is Polygon {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: string; coordinates?: unknown };
  return candidate.type === "Polygon" && Array.isArray(candidate.coordinates);
}

export function isMultiPolygon(value: unknown): value is MultiPolygon {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: string; coordinates?: unknown };
  return candidate.type === "MultiPolygon" && Array.isArray(candidate.coordinates);
}
