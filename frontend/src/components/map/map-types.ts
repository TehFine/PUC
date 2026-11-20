import type { Polygon } from "geojson";
import type { PlotFeature, PlotSource } from "@/types/geo";
import type { PlotComparison } from "@/utils/plot-utils";

export type Mode = "idle" | "draw" | "gps" | "compare" | "edit";
export type DrawStyle = "point" | "freehand";
export type BaseLayer = "satellite" | "satellite-google" | "streets" | "map";
export type MessageTone = "ok" | "error" | "info";

export interface DraftState {
  geometry: Polygon;
  areaHa: number;
  vertexCount: number;
}

export interface ComparisonState {
  target: PlotFeature;
  geometry: Polygon;
  result: PlotComparison;
}

export interface PreviewState {
  points: number;
  areaHa: number;
  areaSqm: number;
  perimeterKm: number;
  selfIntersections: number;
}

export interface PlotForm {
  code: string;
  sheet: string;
  parcel: string;
  owner: string;
  village: string;
  zone: string;
  variety: string;
  year: string;
  source: PlotSource;
}

export interface MapMessage {
  tone: MessageTone;
  text: string;
}
