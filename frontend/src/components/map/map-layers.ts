import type * as Leaflet from "leaflet";
import { isLowEndDevice } from "@/lib/network";

export const MAP_CENTER: Leaflet.LatLngTuple = [13.125, 108.185];
export const MAX_MAP_ZOOM = 22;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const DARK_ATTRIBUTION = "Tiles © Esri — Esri, HERE, Garmin";

export interface BaseLayers {
  map: Leaflet.LayerGroup;
  streets: Leaflet.Layer;
  satellite: Leaflet.Layer;
}

/**
 * Trả về tham số độ phân giải cao (`&scale=2` -> ảnh 512x512 trên khung 256px) cho màn hình Retina,
 * tự động tắt trên thiết bị ít RAM (`lowEnd`) để tiết kiệm bộ nhớ GPU/WebView mà không gây lệch `zoomOffset`.
 */
export function getHiDpiScaleParam(lowEnd: boolean): string {
  if (lowEnd) return "";
  if (typeof window !== "undefined" && window.devicePixelRatio > 1.25) {
    return "&scale=2";
  }
  return "";
}

export function buildTilePerfOptions(
  lowEnd: boolean,
  nativeMax: number,
  targetMax: number = MAX_MAP_ZOOM,
  keepBufferOverride?: number,
): Leaflet.TileLayerOptions {
  return {
    maxNativeZoom: nativeMax,
    maxZoom: targetMax,
    keepBuffer: keepBufferOverride ?? (lowEnd ? 1 : 2),
    updateWhenIdle: lowEnd,
    updateWhenZooming: false,
  };
}

export function createGoogleSatelliteLayer(
  L: typeof import("leaflet"),
  lowEnd: boolean,
  targetMax: number = MAX_MAP_ZOOM,
  keepBufferOverride?: number,
): Leaflet.TileLayer {
  const scale = getHiDpiScaleParam(lowEnd);
  // Google Hybrid (lyrs=y): tích hợp sẵn ảnh vệ tinh thực địa độ nét rất cao tới Z21 tại Đắk Lắk
  // kèm tên đường liên thôn/buôn tiếng Việt trong duy nhất 1 lớp ảnh (nhẹ RAM hơn 66% so với ghép 3 lớp rời).
  return L.tileLayer(`https://mt{s}.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}${scale}`, {
    subdomains: ["0", "1", "2", "3"],
    attribution: "Ảnh vệ tinh & Bản đồ © Google",
    ...buildTilePerfOptions(lowEnd, 21, targetMax, keepBufferOverride),
  });
}

export function createGoogleStreetsLayer(
  L: typeof import("leaflet"),
  lowEnd: boolean,
  targetMax: number = MAX_MAP_ZOOM,
): Leaflet.TileLayer {
  const scale = getHiDpiScaleParam(lowEnd);
  // Google Terrain + Streets (lyrs=p): giữ maxNativeZoom = 16 (512x512 Retina khi có scale=2) vì từ Z17 trở lên
  // Google tắt lớp vân địa hình đồi núi khiến vùng rẫy xa đường lớn chuyển thành nền trắng phẳng.
  return L.tileLayer(`https://mt{s}.google.com/vt/lyrs=p&hl=vi&x={x}&y={y}&z={z}${scale}`, {
    subdomains: ["0", "1", "2", "3"],
    attribution: "Bản đồ địa hình & giao thông © Google",
    ...buildTilePerfOptions(lowEnd, 16, targetMax),
  });
}

export function createBaseLayers(L: typeof import("leaflet")): BaseLayers {
  const lowEnd = isLowEndDevice();

  // 1. Nền tối tương phản cao (Esri Dark Gray Canvas, over-zoom tới Z22)
  const darkOpts = buildTilePerfOptions(L ? lowEnd : true, 16, MAX_MAP_ZOOM);
  const darkBase = L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    attribution: DARK_ATTRIBUTION,
    ...darkOpts,
  });
  const darkReference = L.tileLayer(
    `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    { attribution: DARK_ATTRIBUTION, ...darkOpts },
  );

  // 2. Bản đồ địa hình & giao thông chi tiết tiếng Việt
  const streets = createGoogleStreetsLayer(L, lowEnd, MAX_MAP_ZOOM);

  // 3. Ảnh vệ tinh Hybrid siêu nét (native Z21, phóng sâu Z22, thấy rõ từng tán sầu riêng)
  const satellite = createGoogleSatelliteLayer(L, lowEnd, MAX_MAP_ZOOM);

  return {
    map: L.layerGroup([darkBase, darkReference]),
    streets,
    satellite,
  };
}
