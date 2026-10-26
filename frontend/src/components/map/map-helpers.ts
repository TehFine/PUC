import type * as Leaflet from "leaflet";
import type { Polygon } from "geojson";
import type { PlotFeature, PlotSource } from "@/types/geo";
import { SOURCE_COLORS } from "@/types/geo";
import { polygonAreaHa } from "@/utils/plot-utils";
import type { ComparisonState, DraftState, Mode, PlotForm, PreviewState } from "./map-types";

export const EMPTY_PREVIEW: PreviewState = { points: 0, areaHa: 0, perimeterKm: 0 };

export function plotStyle(source: PlotSource, selected: boolean): Leaflet.PathOptions {
  const color = SOURCE_COLORS[source] ?? SOURCE_COLORS.demo;
  return {
    color: selected ? "#f8fafc" : color,
    weight: selected ? 3 : 1.7,
    opacity: 1,
    fillColor: color,
    fillOpacity: selected ? 0.4 : 0.2,
  };
}

export function polygonFromLatLngs(points: Leaflet.LatLng[]): Polygon {
  const coordinates: number[][] = points.map((point) => [point.lng, point.lat]);
  if (coordinates.length > 0) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([first[0], first[1]]);
  }
  return { type: "Polygon", coordinates: [coordinates] };
}

export function previewFromLatLngs(points: Leaflet.LatLng[]): PreviewState {
  let perimeter = 0;
  for (let index = 1; index < points.length; index += 1) {
    perimeter += points[index - 1].distanceTo(points[index]);
  }
  const areaHa = points.length >= 3 ? polygonAreaHa(polygonFromLatLngs(points)) : 0;
  return { points: points.length, areaHa, perimeterKm: perimeter / 1000 };
}

export function defaultForm(source: PlotSource): PlotForm {
  return {
    code: `KB-MOI-${String(Date.now()).slice(-5)}`,
    sheet: "",
    parcel: "",
    owner: "",
    village: "",
    zone: "",
    variety: "",
    year: "",
    source,
  };
}

interface HeadingInput {
  mode: Mode;
  draft: DraftState | null;
  comparison: ComparisonState | null;
  selectedFeature: PlotFeature | null;
  formCode: string;
}

export function panelHeading({ mode, draft, comparison, selectedFeature, formCode }: HeadingInput) {
  const kicker = draft
    ? "Thửa vừa vẽ"
    : comparison
      ? "Kết quả đối chiếu"
      : mode !== "idle"
        ? "Đang thao tác trên bản đồ"
        : selectedFeature
          ? "Thửa đang chọn"
          : "Bản đồ";

  const title = draft
    ? formCode || "Chưa đặt mã"
    : comparison
      ? comparison.target.properties.code
      : selectedFeature
        ? selectedFeature.properties.code
        : mode === "draw"
          ? "Vẽ thửa mới"
          : mode === "gps"
            ? "Đo GPS"
            : mode === "compare"
              ? "Đối chiếu thửa"
              : "Thông báo";

  return { kicker, title };
}
