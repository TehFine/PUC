import { useEffect, useRef, type RefObject } from "react";
import type * as Leaflet from "leaflet";
import type { Feature } from "geojson";
import type { PlotCollection, PlotFeature } from "@/types/geo";
import { plotLodTier, plotStyle, populatePlotTooltip, type PlotLodTier } from "./map-helpers";
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

/** Keeps Leaflet layers in sync with React state: plot polygons, zoom-adaptive LoD labels, selection style and base map. */
export function usePlotLayers({ ready, plots, selectedCode, baseLayer, refs }: UsePlotLayersArgs) {
  const { leaflet, map: mapRef, plotGroup, plotLayers, baseLayers, mode, selectedCode: selectedRef, select } = refs;

  const fittedRef = useRef(false);
  const labelNodesRef = useRef<Map<string, { el: HTMLElement; feature: PlotFeature }>>(new Map());
  const lodTierRef = useRef<PlotLodTier>(0);
  const baseLayerRef = useRef<BaseLayer>(baseLayer);

  useEffect(() => {
    baseLayerRef.current = baseLayer;
  }, [baseLayer]);

  useEffect(() => {
    const L = leaflet.current;
    const map = mapRef.current;
    const group = plotGroup.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();
    plotLayers.current.clear();
    labelNodesRef.current.clear();

    if (!plots) return;

    const currentZoom = map.getZoom();
    const initialTier = plotLodTier(currentZoom);
    lodTierRef.current = initialTier;

    plots.features.forEach((feature, index) => {
      const labelOffset: [number, number] = [0, index % 2 === 0 ? -9 : 9];
      const geo = L.geoJSON(feature, {
        style: plotStyle(
          feature.properties.source,
          feature.properties.code === selectedRef.current,
          feature.properties.zone || feature.properties.code,
          currentZoom,
          baseLayerRef.current,
        ),
        onEachFeature: (_geoFeature: Feature, layer: Leaflet.Layer) => {
          // Leaflet nhận HTMLElement trực tiếp; populatePlotTooltip chỉ gán textContent nên chống hoàn toàn XSS.
          const label = document.createElement("span");
          populatePlotTooltip(label, feature, initialTier);
          labelNodesRef.current.set(feature.properties.code, { el: label, feature });
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

  // Tự động nâng cấp độ chi tiết nhãn & độ trong suốt polygon khi người dùng zoom sâu vào thửa đất
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const syncZoomLod = () => {
      const zoom = map.getZoom();
      const nextTier = plotLodTier(zoom);
      if (nextTier === lodTierRef.current) return;
      lodTierRef.current = nextTier;

      labelNodesRef.current.forEach(({ el, feature }) => {
        populatePlotTooltip(el, feature, nextTier);
      });

      plotLayers.current.forEach((layer, code) => {
        const entry = labelNodesRef.current.get(code);
        const feature = entry?.feature;
        layer.setStyle(
          plotStyle(
            feature?.properties.source ?? "demo",
            code === selectedRef.current,
            feature?.properties.zone || feature?.properties.code,
            zoom,
            baseLayerRef.current,
          ),
        );
        if (code === selectedRef.current) layer.bringToFront();
      });
    };

    map.on("zoomend", syncZoomLod);
    return () => {
      map.off("zoomend", syncZoomLod);
    };
  }, [ready, mapRef, plotLayers, selectedRef]);

  useEffect(() => {
    const map = mapRef.current;
    const zoom = map ? map.getZoom() : 15;
    const features = new Map(plots?.features.map((feature) => [feature.properties.code, feature]));
    plotLayers.current.forEach((layer, code) => {
      const feature = features.get(code);
      layer.setStyle(
        plotStyle(
          feature?.properties.source ?? "demo",
          code === selectedCode,
          feature?.properties.zone || feature?.properties.code,
          zoom,
          baseLayer,
        ),
      );
      if (code === selectedCode) layer.bringToFront();
    });
  }, [plots, selectedCode, baseLayer, plotLayers, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    const dark = baseLayers.current.map;
    const streets = baseLayers.current.streets;
    const satellite = baseLayers.current.satellite;
    if (!ready || !map || !dark || !streets || !satellite) return;

    const all: Array<[BaseLayer, Leaflet.Layer]> = [
      ["satellite", satellite],
      ["streets", streets],
      ["map", dark],
    ];
    for (const [key, layer] of all) {
      if (key !== baseLayer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }
    const active = baseLayer === "satellite" ? satellite : baseLayer === "streets" ? streets : dark;
    if (!map.hasLayer(active)) {
      active.addTo(map);
    }
  }, [baseLayer, ready, mapRef, baseLayers]);
}
