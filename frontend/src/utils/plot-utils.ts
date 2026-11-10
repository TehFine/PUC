import { area } from "@turf/area";
import { intersect } from "@turf/intersect";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { PlotCollection, PlotFeature } from "@/types/geo";

export function polygonAreaHa(geometry: Polygon): number {
  return area({ type: "Feature", properties: {}, geometry }) / 10_000;
}

export function formatHa(value: number): string {
  return `${value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

export function formatCoordValue(value: number): string {
  const s7 = value.toFixed(7).replace(/0+$/, "");
  const [intPart, decPart = ""] = s7.split(".");
  return `${intPart}.${decPart.padEnd(5, "0")}`;
}

export function formatCoords(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return "—";
  return `${formatCoordValue(lat)}, ${formatCoordValue(lng)}`;
}

export function plotCenterCoords(feature: PlotFeature): { lat: number; lng: number } | null {
  const { lat, lng } = feature.properties;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  const ring = feature.geometry?.coordinates?.[0];
  if (!ring || ring.length === 0) return null;
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
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
  return area(result) / 10_000;
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
    return `${props.sheet || "—"}/${props.parcel || "—"}`;
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
