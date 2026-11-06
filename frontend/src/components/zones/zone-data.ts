import type { PlotFeature } from "@/types/geo";
import { polygonAreaHa } from "@/utils/plot-utils";

export interface ZoneMeta {
  code: string;
  village: string;
  status: string;
  cls: string;
}

export interface ZoneRowData extends ZoneMeta {
  count: number;
  area: number;
}

export interface PlotsSummary {
  totalArea: number;
  zones: number;
  sources: Record<string, number>;
  persisted: number;
}

export function plotArea(feature: PlotFeature): number {
  return feature.properties.areaHa || polygonAreaHa(feature.geometry);
}

export function summarizePlots(features: PlotFeature[]): PlotsSummary {
  const totalArea = features.reduce((sum, feature) => sum + plotArea(feature), 0);
  const zones = new Set(features.map((feature) => feature.properties.zone).filter(Boolean));
  const sources = features.reduce<Record<string, number>>((acc, feature) => {
    const source = feature.properties.source;
    acc[source] = (acc[source] ?? 0) + 1;
    return acc;
  }, {});
  const persisted = features.filter((feature) => feature.properties.persisted).length;
  return { totalArea, zones: zones.size, sources, persisted };
}

function deriveZoneStatus(items: PlotFeature[]): { status: string; cls: string } {
  if (items.length === 0) return { status: "Chờ duyệt", cls: "badge-gray" };
  if (items.some((item) => item.properties.status === "violation")) {
    return { status: "Chưa đạt", cls: "badge-red" };
  }
  if (items.some((item) => item.properties.status === "improve")) {
    return { status: "Cần cải thiện", cls: "badge-gold" };
  }
  if (items.some((item) => item.properties.status === "pending")) {
    return { status: "Chờ duyệt", cls: "badge-gray" };
  }
  return { status: "Đủ chuẩn", cls: "badge-green" };
}

export function buildZoneRows(features: PlotFeature[]): ZoneRowData[] {
  const codes = Array.from(
    new Set(features.map((feature) => feature.properties.zone).filter(Boolean)),
  ).sort();

  return codes.map((code) => {
    const items = features.filter((feature) => feature.properties.zone === code);
    const area = items.reduce((sum, feature) => sum + plotArea(feature), 0);
    const village = items.find((item) => item.properties.village)?.properties.village || "Chưa gán thôn";
    const { status, cls } = deriveZoneStatus(items);
    return {
      code,
      village,
      status,
      cls,
      count: items.length,
      area,
    };
  });
}
