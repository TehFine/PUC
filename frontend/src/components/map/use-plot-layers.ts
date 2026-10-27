import { useEffect, useRef, type RefObject } from "react";
import type * as Leaflet from "leaflet";
import type { Feature } from "geojson";
import type { PlotCollection, PlotFeature } from "@/types/geo";
import { featureLabel } from "@/utils/plot-utils";
import { plotStyle } from "./map-helpers";
import type { BaseLayers } from "./map-layers";
import type { BaseLayer, Mode } from "./map-types";

interface PlotLayersRefs {
  leaflet: RefObject<typeof import("leaflet") | null>;
  map: RefObject<Leaflet.Map | null>;
  plotGroup: RefObject<Leaflet.FeatureGroup | null>;
  plotLayers: RefObject<Map<string, Leaflet.Path>>;
  baseLayers: RefObject<Partial<BaseLayers>>;
  mode: RefObject<Mode>;
  selectedCode: RefObject<string | null>;
  select: RefObject<(feature: PlotFeature) => void>;
}

interface UsePlotLayersArgs {
  ready: boolean;
  plots: PlotCollection | null;
  selectedCode: string | null;
  baseLayer: BaseLayer;
  refs: PlotLayersRefs;
}

/** Keeps Leaflet layers in sync with React state: plot polygons, selection style and base map. */
export function usePlotLayers({ ready, plots, selectedCode, baseLayer, refs }: UsePlotLayersArgs) {
  const { leaflet, map: mapRef, plotGroup, plotLayers, baseLayers, mode, selectedCode: selectedRef, select } = refs;

  const fittedRef = useRef(false);

  useEffect(() => {
    const L = leaflet.current;
    const map = mapRef.current;
    const group = plotGroup.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();
    plotLayers.current.clear();

    if (!plots) return;

    plots.features.forEach((feature, index) => {
      const labelOffset: [number, number] = [0, index % 2 === 0 ? -9 : 9];
      const geo = L.geoJSON(feature, {
        style: plotStyle(feature.properties.source, feature.properties.code === selectedRef.current),
        onEachFeature: (_geoFeature: Feature, layer: Leaflet.Layer) => {
          // Leaflet gán chuỗi vào innerHTML; nhãn lấy từ dữ liệu nhập nên phải dùng textContent để chống XSS.
          const label = document.createElement("span");
          label.textContent = featureLabel(feature);
          layer.bindTooltip(label, {
            permanent: true,
            direction: "center",
            offset: labelOffset,
            className: "plot-tooltip",
            opacity: 1,
          });
          layer.on("click", (event: Leaflet.LeafletMouseEvent) => {
            if (mode.current !== "idle") return;
            L.DomEvent.stopPropagation(event);
            select.current(feature);
          });
        },
      });
      geo.addTo(group);
      const path = geo.getLayers()[0] as Leaflet.Path | undefined;
      if (path) plotLayers.current.set(feature.properties.code, path);
    });

    if (!fittedRef.current && plots.features.length > 0) {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.08));
        fittedRef.current = true;
      }
    }
  }, [plots, ready, leaflet, mapRef, plotGroup, plotLayers, mode, selectedRef, select]);

  useEffect(() => {
    const features = new Map(plots?.features.map((feature) => [feature.properties.code, feature]));
    plotLayers.current.forEach((layer, code) => {
      const feature = features.get(code);
      layer.setStyle(plotStyle(feature?.properties.source ?? "demo", code === selectedCode));
      if (code === selectedCode) layer.bringToFront();
    });
  }, [plots, selectedCode, plotLayers]);

  useEffect(() => {
    const map = mapRef.current;
    const osm = baseLayers.current.map;
    const satellite = baseLayers.current.satellite;
    if (!ready || !map || !osm || !satellite) return;

    if (baseLayer === "satellite") {
      if (map.hasLayer(osm)) map.removeLayer(osm);
      if (!map.hasLayer(satellite)) satellite.addTo(map);
    } else {
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (!map.hasLayer(osm)) osm.addTo(map);
    }
  }, [baseLayer, ready, mapRef, baseLayers]);
}
