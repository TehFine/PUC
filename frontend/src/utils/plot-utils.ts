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
