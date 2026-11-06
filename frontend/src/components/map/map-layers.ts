import type * as Leaflet from "leaflet";

export const MAP_CENTER: Leaflet.LatLngTuple = [13.125, 108.185];

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const DARK_ATTRIBUTION = "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors";

export interface BaseLayers {
  map: Leaflet.LayerGroup;
  satellite: Leaflet.Layer;
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
  const satBase = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    attribution: "Tiles © Esri — Esri, Maxar, Earthstar Geographics",
    maxNativeZoom: 18,
    maxZoom: 20,
  });
  const satLabels = L.tileLayer(
    `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    { maxNativeZoom: 18, maxZoom: 20 },
  );
  const satellite = L.layerGroup([satBase, satLabels]);
  return { map: L.layerGroup([darkBase, darkReference]), satellite };
}
