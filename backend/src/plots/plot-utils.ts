import { intersect } from "@turf/intersect";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { PlotCollection, PlotFeature } from "./plot.types";

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
  return Number((polygonAreaSqm(geometry) / 10_000).toFixed(4));
}

export function formatHa(value: number): string {
  return `${value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ha`;
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

export function findOverlaps(target: PlotFeature, collection: PlotCollection | null): PlotOverlap[] {
  if (!collection) return [];
  return collection.features
    .filter((feature) => feature.properties.code !== target.properties.code)
    .map((feature) => ({
      code: feature.properties.code,
      owner: feature.properties.owner,
      areaHa: overlapAreaHa(target.geometry, feature.geometry),
    }))
    .filter((item) => item.areaHa > 0.0005)
    .sort((a, b) => b.areaHa - a.areaHa);
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
