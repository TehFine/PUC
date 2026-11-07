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

export interface ZoneColorTheme {
  zoneCode: string;
  dot: string;
  bg: string;
  text: string;
  border: string;
  rowTint: string;
}

const ZONE_COLOR_PALETTE: Omit<ZoneColorTheme, "zoneCode">[] = [
  // 1. Emerald Green
  {
    dot: "#10b981",
    bg: "#c6f0dc",
    text: "#065f46",
    border: "#6ee7b7",
    rowTint: "#e0f7ec",
  },
  // 2. Ocean Blue
  {
    dot: "#2563eb",
    bg: "#cce0ff",
    text: "#1e40af",
    border: "#93c5fd",
    rowTint: "#e2eeff",
  },
  // 3. Amber Gold
  {
    dot: "#d97706",
    bg: "#fde2a3",
    text: "#92400e",
    border: "#fcd34d",
    rowTint: "#fef0cf",
  },
  // 4. Royal Violet
  {
    dot: "#7c3aed",
    bg: "#ddd2fe",
    text: "#5b21b6",
    border: "#c4b5fd",
    rowTint: "#ede7fe",
  },
  // 5. Coral Rose
  {
    dot: "#e11d48",
    bg: "#fecdd6",
    text: "#9f1239",
    border: "#fda4af",
    rowTint: "#ffe4e9",
  },
  // 6. Cyan Teal (fallback for future zones)
  {
    dot: "#0891b2",
    bg: "#baeef7",
    text: "#155e75",
    border: "#67e8f9",
    rowTint: "#dcf6fa",
  },
  // 7. Warm Orange (fallback for future zones)
  {
    dot: "#ea580c",
    bg: "#fed7aa",
    text: "#9a3412",
    border: "#fdba74",
    rowTint: "#ffead5",
  },
  // 8. Indigo (fallback for future zones)
  {
    dot: "#4f46e5",
    bg: "#c7d2fe",
    text: "#3730a3",
    border: "#a5b4fc",
    rowTint: "#e4e8ff",
  },
  // 9. Fuchsia (fallback for future zones)
  {
    dot: "#c026d3",
    bg: "#f5d0fe",
    text: "#86198f",
    border: "#f0abfc",
    rowTint: "#fae5ff",
  },
  // 10. Lime (fallback for future zones)
  {
    dot: "#65a30d",
    bg: "#d9f99d",
    text: "#3f6212",
    border: "#bef264",
    rowTint: "#eaf8d3",
  },
];

const FIXED_ZONE_INDEX: Record<string, number> = {
  "66-PUC-SR0001-00728": 0,
  "66-PUC-SR0001-00732": 1,
  "66-PUC-SR0001-00733": 2,
  "66-PUC-SR0001-00762": 3,
  "VN-ĐLOR-0273": 4,
};

export const KNOWN_ZONES: { code: string; label: string }[] = [
  { code: "66-PUC-SR0001-00728", label: "Thôn 2 – Ea Khăl 10" },
  { code: "66-PUC-SR0001-00732", label: "Thôn Ea K'Sô – Ea Khăl 2" },
  { code: "66-PUC-SR0001-00733", label: "Thôn 4 – Ea Khăl 11" },
  { code: "66-PUC-SR0001-00762", label: "Thôn Ea K'Sô – Ea Ksô 3" },
  { code: "VN-ĐLOR-0273", label: "Tổ Sầu Riêng Sáu Bảy" },
];

/**
 * Chuẩn hóa mã hộ (VD: 66-PUC-SR0001-00728-H01) hoặc mã thửa (VD: 66-PUC-SR0001-00728-T01)
 * về đúng mã vùng trồng gốc (66-PUC-SR0001-00728) để các hộ và thửa cùng vùng luôn có cùng màu.
 */
export function normalizeZoneCode(codeOrZone?: string | null): string {
  if (!codeOrZone) return "";
  return codeOrZone.trim().replace(/-(?:H|T)\d+$/i, "");
}

export function getZoneColor(codeOrZone?: string | null): ZoneColorTheme {
  const zoneCode = normalizeZoneCode(codeOrZone);
  if (!zoneCode) {
    return {
      zoneCode: "",
      ...ZONE_COLOR_PALETTE[0],
    };
  }
  const fixedIdx = FIXED_ZONE_INDEX[zoneCode];
  if (fixedIdx !== undefined) {
    return {
      zoneCode,
      ...ZONE_COLOR_PALETTE[fixedIdx],
    };
  }
  let hash = 0;
  for (let i = 0; i < zoneCode.length; i += 1) {
    hash = (hash * 31 + zoneCode.charCodeAt(i)) >>> 0;
  }
  const paletteIdx = 5 + (hash % (ZONE_COLOR_PALETTE.length - 5));
  return {
    zoneCode,
    ...ZONE_COLOR_PALETTE[paletteIdx],
  };
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
