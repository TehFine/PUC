import type { Feature, FeatureCollection, Polygon } from "geojson";

export type PlotSource = "declared" | "measured" | "cadastral" | "demo";
export type PlotStatus = "approved" | "improve" | "violation" | "pending";

export interface PlotProperties {
  id?: string;
  code: string;
  sheet: string;
  parcel: string;
  owner: string;
  village: string;
  zone: string;
  variety: string;
  year?: number;
  areaHa: number;
  source: PlotSource;
  status: PlotStatus;
  sourceRef?: string;
  persisted?: boolean;
}

export type PlotFeature = Feature<Polygon, PlotProperties>;
export type PlotCollection = FeatureCollection<Polygon, PlotProperties>;

export interface CreatedPlot {
  feature: PlotFeature;
  persisted: boolean;
}

export interface MeasurementInput {
  plotCode: string;
  plotId?: string;
  measuredBy: string;
  geometry: Polygon;
  note?: string;
}

export interface ImportResult {
  imported: number;
  persisted: boolean;
}

export const SOURCE_LABELS: Record<PlotSource, string> = {
  declared: "Hộ khai báo",
  measured: "Cán bộ đo",
  cadastral: "Dữ liệu địa chính",
  demo: "Dữ liệu mẫu",
};

export const STATUS_LABELS: Record<PlotStatus, string> = {
  approved: "Đủ chuẩn",
  improve: "Cần cải thiện",
  violation: "Vi phạm",
  pending: "Chờ duyệt",
};

export const SOURCE_COLORS: Record<PlotSource, string> = {
  declared: "#2f7a4f",
  measured: "#c05621",
  cadastral: "#2b6cb0",
  demo: "#6b7280",
};
