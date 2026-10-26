import type * as Leaflet from "leaflet";

export const MAP_CENTER: Leaflet.LatLngTuple = [12.726, 108.152];

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const DARK_ATTRIBUTION = "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors";

export interface BaseLayers {
  map: Leaflet.LayerGroup;
  satellite: Leaflet.TileLayer;
}

export function createBaseLayers(L: typeof import("leaflet")): BaseLayers {
  const darkBase = L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    attribution: DARK_ATTRIBUTION,
    maxNativeZoom: 16,
    maxZoom: 20,
  });
  const darkReference = L.tileLayer(
    `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    { attribution: DARK_ATTRIBUTION, maxNativeZoom: 16, maxZoom: 20 },
  );
  const satellite = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    attribution: "Tiles © Esri — Esri, Maxar, Earthstar Geographics",
    // Esri không có ảnh vệ tinh chi tiết hơn mức này ở khu vực nông thôn: phóng to ảnh cũ thay vì xin tile không tồn tại
    // (tránh lỗi "Map data not yet available").
    maxNativeZoom: 17,
    maxZoom: 19,
  });
  return { map: L.layerGroup([darkBase, darkReference]), satellite };
}
