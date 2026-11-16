import type * as Leaflet from "leaflet";
import type { GeoJsonObject, Polygon } from "geojson";
import { getZoneColor } from "@/components/zones/zone-data";
import type { PlotFeature, PlotSource } from "@/types/geo";
import { SOURCE_COLORS } from "@/types/geo";
import {
  featureLabel,
  findSelfIntersections,
  polygonAreaSqm,
  wgs84DistanceMeters,
} from "@/utils/plot-utils";
import type { BaseLayer, ComparisonState, DraftState, Mode, PlotForm, PreviewState } from "./map-types";

export const EMPTY_PREVIEW: PreviewState = {
  points: 0,
  areaHa: 0,
  areaSqm: 0,
  perimeterKm: 0,
  selfIntersections: 0,
};

export type PlotLodTier = 0 | 1 | 2;

export function plotLodTier(zoom: number): PlotLodTier {
  if (zoom >= 16.75) return 2;
  if (zoom >= 15) return 1;
  return 0;
}

export function plotStyle(
  source: PlotSource,
  selected: boolean,
  zoneOrCode?: string,
  zoom: number = 15,
  baseLayer: BaseLayer = "satellite",
): Leaflet.PathOptions {
  const color = zoneOrCode ? getZoneColor(zoneOrCode).dot : (SOURCE_COLORS[source] ?? SOURCE_COLORS.demo);
  const tier = plotLodTier(zoom);
  const selectedBorder = baseLayer === "streets" ? "#0f172a" : "#fef08a";
  const weight =
    tier === 2 ? (selected ? 3.8 : 2.6) : tier === 1 ? (selected ? 3.3 : 2.2) : selected ? 2.9 : 1.8;
  const fillOpacity =
    tier === 2 ? (selected ? 0.22 : 0.14) : tier === 1 ? (selected ? 0.34 : 0.22) : selected ? 0.44 : 0.26;

  return {
    color: selected ? selectedBorder : color,
    weight,
    opacity: 1,
    fillColor: color,
    fillOpacity,
  };
}

/**
 * Cập nhật nội dung nhãn thửa đất theo mức độ thu phóng (LoD) bằng DOM API thuần (`textContent`),
 * tuyệt đối không dùng `innerHTML` cho dữ liệu người dùng để chống XSS.
 */
export function populatePlotTooltip(
  container: HTMLElement,
  feature: PlotFeature,
  tier: PlotLodTier,
): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const shortLabel = featureLabel(feature);
  const props = feature.properties;

  if (tier === 0) {
    container.className = "plot-tooltip-inner";
    container.textContent = shortLabel;
    return;
  }

  const areaStr = `${Number(props.areaHa ?? 0).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} ha`;

  if (tier === 1) {
    container.className = "plot-tooltip-inner is-mid";
    container.textContent = `${shortLabel} - ${areaStr}`;
    return;
  }

  container.className = "plot-tooltip-inner is-rich";
  const titleEl = document.createElement("strong");
  titleEl.className = "plot-tooltip-title";
  titleEl.textContent =
    props.code && props.code !== shortLabel ? `${props.code} (${shortLabel})` : shortLabel;

  const metaEl = document.createElement("span");
  metaEl.className = "plot-tooltip-meta";
  const parts = [areaStr];
  if (props.variety) parts.push(props.variety);
  if (props.zone) parts.push(props.zone);
  metaEl.textContent = parts.join(" - ");

  container.appendChild(titleEl);
  container.appendChild(metaEl);
}

export function formatEdgeMeters(meters: number): string {
  if (meters >= 100) {
    return `${Math.round(meters).toLocaleString("vi-VN")} m`;
  }
  return `${meters.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}

function extractOuterRingCoords(geometry: GeoJsonObject | null | undefined): number[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as {
    type?: string;
    coordinates?: unknown;
    geometries?: GeoJsonObject[];
    features?: Array<{ geometry?: GeoJsonObject }>;
  };
  if (g.type === "FeatureCollection" && Array.isArray(g.features) && g.features[0]?.geometry) {
    return extractOuterRingCoords(g.features[0].geometry);
  }
  if (g.type === "Feature" && (geometry as unknown as { geometry?: GeoJsonObject }).geometry) {
    return extractOuterRingCoords((geometry as unknown as { geometry?: GeoJsonObject }).geometry);
  }
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return (g.coordinates[0] as number[][] | undefined) ?? [];
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    const firstPoly = (g.coordinates[0] as number[][][] | undefined) ?? [];
    return firstPoly[0] ?? [];
  }
  return [];
}

/**
 * Vẽ các mốc đỉnh địa chính và nhãn chiều dài thực tế từng cạnh (mét) khi phóng to sát thửa đất.
 * Hỗ trợ thửa đất phức tạp nhiều đỉnh (hàng trăm đến hàng nghìn đỉnh), tự động lọc theo khung nhìn
 * và chiều dài cạnh trên màn hình để không chồng nhãn.
 */
export function renderCadastralDimensions(
  L: typeof import("leaflet"),
  group: Leaflet.LayerGroup,
  geometry: GeoJsonObject | null | undefined,
  lowEnd: boolean = false,
  map?: Leaflet.Map | null,
): void {
  group.clearLayers();
  const rawRing = extractOuterRingCoords(geometry);
  if (rawRing.length < 3) return;

  const first = rawRing[0];
  const last = rawRing[rawRing.length - 1];
  const openCoords =
    rawRing.length > 1 && first[0] === last[0] && first[1] === last[1] ? rawRing.slice(0, -1) : rawRing;
  if (openCoords.length < 3) return;

  const latlngs = openCoords
    .filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
    .map(([lng, lat]) => L.latLng(lat, lng));

  if (latlngs.length < 3) return;

  const paddedBounds = map ? map.getBounds().pad(0.25) : null;
  const maxVertexMarkers = lowEnd ? 800 : 5000;
  const maxEdgeBadges = lowEnd ? 40 : 120;

  let renderedVertices = 0;
  for (let i = 0; i < latlngs.length && renderedVertices < maxVertexMarkers; i += 1) {
    const pt = latlngs[i];
    if (paddedBounds && latlngs.length > 80 && !paddedBounds.contains(pt)) continue;
    L.circleMarker(pt, {
      radius: latlngs.length > 60 ? 3.2 : 4,
      color: "#0f172a",
      weight: 1.6,
      fillColor: "#fde047",
      fillOpacity: 1,
      interactive: false,
    }).addTo(group);
    renderedVertices += 1;
  }

  let renderedLabels = 0;
  let lastBadgePt: Leaflet.Point | null = null;
  for (let i = 0; i < latlngs.length && renderedLabels < maxEdgeBadges; i += 1) {
    const p1 = latlngs[i];
    const p2 = latlngs[(i + 1) % latlngs.length];
    const mid = L.latLng((p1.lat + p2.lat) * 0.5, (p1.lng + p2.lng) * 0.5);
    if (paddedBounds && !paddedBounds.contains(mid)) continue;

    const meters = wgs84DistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
    if (!Number.isFinite(meters) || meters < 1.5) continue;

    if (map) {
      const px1 = map.latLngToContainerPoint(p1);
      const px2 = map.latLngToContainerPoint(p2);
      if (px1.distanceTo(px2) < 42) continue;
      const midPx = map.latLngToContainerPoint(mid);
      if (lastBadgePt && midPx.distanceTo(lastBadgePt) < 38) continue;
      lastBadgePt = midPx;
    } else if (latlngs.length > 36 && meters < 6) {
      continue;
    }

    const labelText = formatEdgeMeters(meters);
    const icon = L.divIcon({
      className: "plot-edge-dim-wrap",
      html: `<span class="plot-edge-dim-badge">${labelText}</span>`,
      iconSize: [0, 0],
    });
    L.marker(mid, { icon, interactive: false, keyboard: false }).addTo(group);
    renderedLabels += 1;
  }
}

export function cleanLatLngPoints(points: ReadonlyArray<Leaflet.LatLng>): Leaflet.LatLng[] {
  const out: Leaflet.LatLng[] = [];
  for (const pt of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.abs(prev.lat - pt.lat) > 1e-8 || Math.abs(prev.lng - pt.lng) > 1e-8) {
      out.push(pt);
    }
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.lat - last.lat) <= 1e-8 && Math.abs(first.lng - last.lng) <= 1e-8) {
      out.pop();
    }
  }
  return out;
}

export function polygonFromLatLngs(points: Leaflet.LatLng[]): Polygon {
  const cleaned = cleanLatLngPoints(points);
  const coordinates: number[][] = cleaned.map((point) => [point.lng, point.lat]);
  if (coordinates.length > 0) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([first[0], first[1]]);
  }
  return { type: "Polygon", coordinates: [coordinates] };
}

export function previewFromLatLngs(
  points: Leaflet.LatLng[],
  options?: { skipIntersections?: boolean },
): PreviewState {
  const cleaned = cleanLatLngPoints(points);
  let perimeterMeters = 0;
  for (let index = 1; index < cleaned.length; index += 1) {
    const a = cleaned[index - 1];
    const b = cleaned[index];
    perimeterMeters += wgs84DistanceMeters(a.lat, a.lng, b.lat, b.lng);
  }
  if (cleaned.length >= 3) {
    const last = cleaned[cleaned.length - 1];
    const first = cleaned[0];
    perimeterMeters += wgs84DistanceMeters(last.lat, last.lng, first.lat, first.lng);
  }
  const areaSqm = cleaned.length >= 3 ? polygonAreaSqm(polygonFromLatLngs(cleaned)) : 0;
  const areaHa = areaSqm / 10_000;
  const selfIntersections =
    !options?.skipIntersections && cleaned.length >= 4 ? findSelfIntersections(cleaned).length : 0;

  return {
    points: cleaned.length,
    areaHa,
    areaSqm,
    perimeterKm: perimeterMeters / 1000,
    selfIntersections,
  };
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
      : mode === "edit"
        ? "Chỉnh sửa hình dạng"
        : mode !== "idle"
          ? "Thao tác ranh giới"
          : selectedFeature
            ? "Thửa đang chọn"
            : "Bản đồ";

  const title = draft
    ? formCode || "Chưa đặt mã"
    : comparison
      ? comparison.target.properties.code
      : mode === "edit" && selectedFeature
        ? selectedFeature.properties.code
        : selectedFeature
          ? selectedFeature.properties.code
          : mode === "draw"
            ? "Vẽ thửa mới"
            : mode === "gps"
              ? "Đo GPS"
              : mode === "compare"
                ? "Đối chiếu thửa"
                : mode === "edit"
                  ? "Chỉnh sửa hình dạng"
                  : "Thông báo";

  return { kicker, title };
}
