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
  householdId?: number;
  qrToken?: string;
  treeCount?: number;
  seasonQuotaKg?: number;
  lat?: number;
  lng?: number;
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
