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

export const ZONES: ZoneMeta[] = [
  { code: "KB-VT-001", village: "Thôn 1", status: "Đủ chuẩn", cls: "badge-green" },
  { code: "KB-VT-002", village: "Thôn 2", status: "Đủ chuẩn", cls: "badge-green" },
  { code: "KB-VT-003", village: "Thôn 3", status: "Cần cải thiện", cls: "badge-gold" },
  { code: "KB-VT-004", village: "Thôn 4", status: "Đủ chuẩn", cls: "badge-green" },
  { code: "KB-VT-005", village: "Thôn 5", status: "Chưa đạt", cls: "badge-red" },
  { code: "KB-VT-006", village: "Thôn 6", status: "Cần cải thiện", cls: "badge-gold" },
];

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

export function buildZoneRows(features: PlotFeature[]): ZoneRowData[] {
  const metadata = new Map(ZONES.map((zone) => [zone.code, zone]));
  const codes = Array.from(
    new Set(features.map((feature) => feature.properties.zone).filter(Boolean)),
  ).sort();
  const rows = codes.length > 0 ? codes : ZONES.map((zone) => zone.code);

  return rows.map((code) => {
    const items = features.filter((feature) => feature.properties.zone === code);
    const area = items.reduce((sum, feature) => sum + plotArea(feature), 0);
    const meta = metadata.get(code);
    return {
      code,
      village: meta?.village ?? items[0]?.properties.village ?? "Chưa gán thôn",
      status: meta?.status ?? "Chờ duyệt",
      cls: meta?.cls ?? "badge-gray",
      count: items.length,
      area,
    };
  });
}
