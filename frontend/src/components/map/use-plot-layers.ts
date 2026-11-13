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
  const labelNodesRef = useRef<
    Map<string, { el: HTMLElement; feature: PlotFeature; offset: [number, number]; perm: boolean }>
  >(new Map());
  const lodTierRef = useRef<PlotLodTier>(0);
  const permLabelsRef = useRef<boolean>(false);
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
    const initialAllowPerm =
      currentZoom >= 15 && document.documentElement.dataset.perf !== "lite";
    const initialViewBounds = initialAllowPerm ? map.getBounds().pad(0.25) : null;
    lodTierRef.current = initialTier;
    permLabelsRef.current = initialAllowPerm;

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
          const layerBounds = (layer as Leaflet.Polygon).getBounds?.();
          const isPerm = Boolean(
            initialViewBounds &&
              (!layerBounds || !layerBounds.isValid() || initialViewBounds.intersects(layerBounds)),
          );
          labelNodesRef.current.set(feature.properties.code, {
            el: label,
            feature,
            offset: labelOffset,
            perm: isPerm,
          });
          layer.bindTooltip(label, {
            permanent: isPerm,
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

  // Tự động nâng cấp độ chi tiết nhãn, cắt tỉa nhãn cố định ngoài khung nhìn & tắt nhãn cố định trên máy yếu
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const syncViewportTooltips = (allowPerm: boolean) => {
      if (!allowPerm && !permLabelsRef.current) return;
      permLabelsRef.current = allowPerm;
      const viewBounds = allowPerm ? map.getBounds().pad(0.25) : null;

      plotLayers.current.forEach((layer, code) => {
        const entry = labelNodesRef.current.get(code);
        if (!entry) return;
        const layerBounds = (layer as Leaflet.Polygon).getBounds?.();
        const shouldPerm = Boolean(
          viewBounds &&
            (!layerBounds || !layerBounds.isValid() || viewBounds.intersects(layerBounds)),
        );
        if (shouldPerm === entry.perm) return;
        entry.perm = shouldPerm;
        layer.unbindTooltip();
        layer.bindTooltip(entry.el, {
          permanent: shouldPerm,
          direction: "center",
          offset: entry.offset,
          className: "plot-tooltip",
          opacity: 1,
        });
      });
    };

    const syncZoomLod = () => {
      const zoom = map.getZoom();
      const nextTier = plotLodTier(zoom);
      const isLite = document.documentElement.dataset.perf === "lite";
      const allowPerm = !isLite && zoom >= 15;
      const tierChanged = nextTier !== lodTierRef.current;

      if (tierChanged) {
        lodTierRef.current = nextTier;
        labelNodesRef.current.forEach(({ el, feature }) => {
          populatePlotTooltip(el, feature, nextTier);
        });
        plotLayers.current.forEach((layer, code) => {
          const feature = labelNodesRef.current.get(code)?.feature;
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
      }

      syncViewportTooltips(allowPerm);
    };

    const syncMoveTooltips = () => {
      const isLite = document.documentElement.dataset.perf === "lite";
      const allowPerm = !isLite && map.getZoom() >= 15;
      syncViewportTooltips(allowPerm);
    };

    map.on("zoomend", syncZoomLod);
    map.on("moveend", syncMoveTooltips);
    return () => {
      map.off("zoomend", syncZoomLod);
      map.off("moveend", syncMoveTooltips);
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
