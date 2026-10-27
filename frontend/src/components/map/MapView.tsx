"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { createPlot, importCadastral, saveMeasurement as saveMeasurementRequest } from "@/services/plots";
import type { PlotFeature, PlotSource } from "@/types/geo";
import {
  comparePolygons,
  findOverlaps,
  intersectionGeometry,
  polygonAreaHa,
  type PlotOverlap,
} from "@/utils/plot-utils";
import ComparisonResult from "./ComparisonResult";
import DraftForm from "./DraftForm";
import DrawHint from "./DrawHint";
import {
  defaultForm,
  EMPTY_PREVIEW,
  panelHeading,
  polygonFromLatLngs,
  previewFromLatLngs,
} from "./map-helpers";
import { createBaseLayers, MAP_CENTER, type BaseLayers } from "./map-layers";
import type {
  BaseLayer,
  ComparisonState,
  DraftState,
  MapMessage,
  MessageTone,
  Mode,
  PlotForm,
  PreviewState,
} from "./map-types";
import MapToolbar from "./MapToolbar";
import MapZoomControls from "./MapZoomControls";
import ModeNote from "./ModeNote";
import PlotPopup from "./PlotPopup";
import { usePlotLayers } from "./use-plot-layers";

interface MapViewProps {
  plots: import("@/types/geo").PlotCollection | null;
  loading?: boolean;
  onChanged?: () => void;
}

export default function MapView({ plots, loading = false, onChanged }: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const baseLayersRef = useRef<Partial<BaseLayers>>({});
  const plotGroupRef = useRef<Leaflet.FeatureGroup | null>(null);
  const draftGroupRef = useRef<Leaflet.LayerGroup | null>(null);
  const compareGroupRef = useRef<Leaflet.LayerGroup | null>(null);
  const plotLayersRef = useRef<Map<string, Leaflet.Path>>(new Map());
  const verticesRef = useRef<Leaflet.LatLng[]>([]);
  const modeRef = useRef<Mode>("idle");
  const draftSourceRef = useRef<PlotSource>("declared");
  const compareTargetRef = useRef<PlotFeature | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("map");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [comparison, setComparison] = useState<ComparisonState | null>(null);
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [form, setForm] = useState<PlotForm>(() => defaultForm("declared"));
  const [message, setMessage] = useState<MapMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [measureSaved, setMeasureSaved] = useState(false);
  const [measuredBy, setMeasuredBy] = useState("Cán bộ đo");
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  const selectedFeature = useMemo(
    () => plots?.features.find((feature) => feature.properties.code === selectedCode) ?? null,
    [plots, selectedCode],
  );

  const overlaps = useMemo<PlotOverlap[]>(
    () => (selectedFeature ? findOverlaps(selectedFeature, plots) : []),
    [selectedFeature, plots],
  );

  const selectedCodeRef = useRef<string | null>(selectedCode);
  const draftRef = useRef<DraftState | null>(draft);
  const comparisonRef = useRef<ComparisonState | null>(comparison);
  const selectRef = useRef<(feature: PlotFeature) => void>(() => undefined);
  const addVertexRef = useRef<(latlng: Leaflet.LatLng) => void>(() => undefined);
  const redrawDraftRef = useRef<(points: Leaflet.LatLng[]) => void>(() => undefined);

  useEffect(() => {
    selectedCodeRef.current = selectedCode;
  }, [selectedCode]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    comparisonRef.current = comparison;
  }, [comparison]);

  const changeMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setGpsAccuracy(null);
  }, []);

  const redrawDraft = useCallback((points: Leaflet.LatLng[]) => {
    const L = leafletRef.current;
    const group = draftGroupRef.current;
    if (!L || !group) return;

    group.clearLayers();
    const compareMode = modeRef.current === "compare";
    const color = compareMode ? "#c05621" : "#2f7a4f";

    if (points.length >= 3) {
      L.polygon(
        points.map((point) => [point.lat, point.lng] as Leaflet.LatLngTuple),
        {
          color,
          weight: 2,
          opacity: 1,
          fillColor: color,
          fillOpacity: 0.2,
          dashArray: "5 4",
          interactive: false,
        },
      ).addTo(group);
    }

    if (points.length >= 2) {
      L.polyline(
        points.map((point) => [point.lat, point.lng] as Leaflet.LatLngTuple),
        { color, weight: 2, opacity: 0.9, dashArray: "4 4", interactive: false },
      ).addTo(group);
    }

    points.forEach((point) => {
      L.circleMarker(point, {
        radius: 3.2,
        color: "#ffffff",
        weight: 1.5,
        fillColor: color,
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    });
  }, []);

  useEffect(() => {
    redrawDraftRef.current = redrawDraft;
  }, [redrawDraft]);

  const addVertex = useCallback(
    (latlng: Leaflet.LatLng) => {
      if (modeRef.current !== "draw" && modeRef.current !== "gps" && modeRef.current !== "compare") return;
      verticesRef.current = [...verticesRef.current, latlng];
      redrawDraftRef.current(verticesRef.current);
      setPreview(previewFromLatLngs(verticesRef.current));
      setMessage(null);
    },
    [],
  );

  useEffect(() => {
    addVertexRef.current = addVertex;
  }, [addVertex]);

  const resetDraftState = useCallback(() => {
    stopGps();
    verticesRef.current = [];
    draftGroupRef.current?.clearLayers();
    compareGroupRef.current?.clearLayers();
    compareTargetRef.current = null;
    setDraft(null);
    setComparison(null);
    setPreview(EMPTY_PREVIEW);
    setMeasureSaved(false);
  }, [stopGps]);

  const finishDraft = useCallback(() => {
    const points = verticesRef.current;
    if (points.length < 3) {
      setMessage({ tone: "error", text: "Cần ít nhất 3 điểm để tạo một polygon." });
      return;
    }

    const geometry = polygonFromLatLngs(points);
    const currentMode = modeRef.current;
    const L = leafletRef.current;
    const map = mapRef.current;

    if (currentMode === "compare") {
      const target = compareTargetRef.current;
      if (!target) return;
      stopGps();
      const result = comparePolygons(target.geometry, geometry);
      setComparison({ target, geometry, result });
      setMeasureSaved(false);
      changeMode("idle");
      setPreview(previewFromLatLngs(points));
      verticesRef.current = [];
      setMessage(null);

      const intersection = intersectionGeometry(target.geometry, geometry);
      if (intersection && L && compareGroupRef.current) {
        compareGroupRef.current.clearLayers();
        L.geoJSON(intersection, {
          style: {
            color: "#9c3125",
            weight: 1.5,
            fillColor: "#c0392b",
            fillOpacity: 0.42,
            interactive: false,
          },
        }).addTo(compareGroupRef.current);
      }

      if (L && map) {
        const bounds = L.latLngBounds([]);
        target.geometry.coordinates[0].forEach(([lng, lat]) => bounds.extend([lat, lng]));
        points.forEach((point) => bounds.extend(point));
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.35), { maxZoom: 16 });
      }
      return;
    }

    if (currentMode === "draw" || currentMode === "gps") {
      stopGps();
      setDraft({ geometry, areaHa: polygonAreaHa(geometry) });
      setForm(defaultForm(draftSourceRef.current));
      setPreview(previewFromLatLngs(points));
      setMessage(null);
      changeMode("idle");
      verticesRef.current = [];
    }
  }, [changeMode, stopGps]);

  const handleSelect = useCallback(
    (feature: PlotFeature) => {
      if (modeRef.current !== "idle") return;
      if (draft || comparison) {
        setMessage({
          tone: "info",
          text: "Lưu hoặc đóng kết quả đang làm trước khi chọn thửa khác.",
        });
        return;
      }
      setSelectedCode(feature.properties.code);
      setMessage(null);
    },
    [comparison, draft],
  );

  useEffect(() => {
    selectRef.current = handleSelect;
  }, [handleSelect]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const init = async () => {
      const imported = (await import("leaflet")) as unknown as {
        default?: typeof import("leaflet");
      };
      const L = imported.default ?? (imported as unknown as typeof import("leaflet"));
      if (disposed || !mapElementRef.current) return;

      leafletRef.current = L;
      const map = L.map(mapElementRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 9,
        maxZoom: 19,
      }).setView(MAP_CENTER, 13);

      mapRef.current = map;
      const layers = createBaseLayers(L);
      baseLayersRef.current = layers;
      layers.map.addTo(map);

      plotGroupRef.current = L.featureGroup().addTo(map);
      draftGroupRef.current = L.layerGroup().addTo(map);
      compareGroupRef.current = L.layerGroup().addTo(map);

      map.on("click", (event) => {
        const latlng = L.latLng(event.latlng.lat, event.latlng.lng);
        if (modeRef.current === "draw" || modeRef.current === "gps" || modeRef.current === "compare") {
          addVertexRef.current(latlng);
          return;
        }
        if (modeRef.current === "idle" && !draftRef.current && !comparisonRef.current) {
          setSelectedCode(null);
          setMessage(null);
        }
      });

      resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(mapElementRef.current);
      setReady(true);
    };

    void init();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      plotGroupRef.current = null;
      draftGroupRef.current = null;
      compareGroupRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  usePlotLayers({
    ready,
    plots,
    selectedCode,
    baseLayer,
    refs: {
      leaflet: leafletRef,
      map: mapRef,
      plotGroup: plotGroupRef,
      plotLayers: plotLayersRef,
      baseLayers: baseLayersRef,
      mode: modeRef,
      selectedCode: selectedCodeRef,
      select: selectRef,
    },
  });

  const startDraw = () => {
    if (mode === "draw") {
      cancelDraft();
      return;
    }
    if (draft || comparison) {
      setMessage({ tone: "info", text: "Lưu hoặc đóng kết quả đang làm trước khi vẽ thửa mới." });
      return;
    }
    resetDraftState();
    setSelectedCode(null);
    draftSourceRef.current = "declared";
    changeMode("draw");
    setMessage({ tone: "info", text: "Bấm ít nhất 3 điểm trên bản đồ, sau đó chọn Hoàn tất." });
  };

  const startGps = () => {
    if (mode === "gps") {
      cancelDraft();
      return;
    }
    if (!navigator.geolocation) {
      setMessage({ tone: "error", text: "Trình duyệt không hỗ trợ định vị GPS." });
      return;
    }
    if (draft || comparison) {
      setMessage({ tone: "info", text: "Lưu hoặc đóng kết quả đang làm trước khi đo GPS." });
      return;
    }

    resetDraftState();
    setSelectedCode(null);
    draftSourceRef.current = "measured";
    changeMode("gps");
    setMessage({
      tone: "info",
      text: "Đang ghi GPS. Di chuyển quanh thửa đất; có thể bấm thêm điểm thủ công nếu tín hiệu yếu.",
    });

    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = L.latLng(position.coords.latitude, position.coords.longitude);
        const points = verticesRef.current;
        const last = points[points.length - 1];
        if (!last || last.distanceTo(next) >= 2) {
          verticesRef.current = [...points, next];
          redrawDraftRef.current(verticesRef.current);
          setPreview(previewFromLatLngs(verticesRef.current));
          if (points.length === 0) map?.setView(next, 17);
        }
        setGpsAccuracy(Math.round(position.coords.accuracy));
      },
      (error) => {
        setGpsAccuracy(null);
        setMessage({
          tone: "error",
          text:
            error.code === 1
              ? "Bạn cần cấp quyền vị trí cho trình duyệt để đo GPS."
              : "Không lấy được vị trí GPS. Có thể bấm trực tiếp trên bản đồ để thêm điểm.",
        });
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  };

  const startCompare = () => {
    if (mode === "compare") {
      cancelDraft();
      return;
    }
    if (!selectedFeature) {
      setMessage({ tone: "info", text: "Chọn một thửa trên bản đồ trước khi đối chiếu." });
      return;
    }
    if (draft) {
      setMessage({ tone: "info", text: "Lưu hoặc hủy thửa vừa vẽ trước khi đối chiếu." });
      return;
    }

    resetDraftState();
    compareTargetRef.current = selectedFeature;
    changeMode("compare");
    setMessage({
      tone: "info",
      text: "Vẽ polygon đo lại thực địa. Hệ thống sẽ so khớp với polygon khai báo.",
    });
  };

  const cancelDraft = () => {
    resetDraftState();
    changeMode("idle");
    setMessage(null);
  };

  const closePanel = () => {
    cancelDraft();
    setSelectedCode(null);
  };

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();

  const fitPlots = () => {
    const map = mapRef.current;
    const group = plotGroupRef.current;
    if (!map || !group) return;
    const bounds = group.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.08));
  };

  const savePlot = async () => {
    if (!draft) return;
    if (!form.code.trim()) {
      setMessage({ tone: "error", text: "Nhập mã thửa trước khi lưu." });
      return;
    }

    setSaving(true);
    try {
      const data = await createPlot({
        ...form,
        year: form.year ? Number(form.year) : undefined,
        geometry: draft.geometry,
      });

      setDraft(null);
      draftGroupRef.current?.clearLayers();
      setComparison(null);
      compareGroupRef.current?.clearLayers();
      setPreview(EMPTY_PREVIEW);
      changeMode("idle");
      setSelectedCode(data.feature.properties.code);
      setMessage({
        tone: "ok",
        text: data.persisted
          ? "Đã lưu thửa vào PostGIS."
          : "Đã lưu tạm trong phiên này. Cấu hình DATABASE_URL để lưu lâu dài.",
      });
      onChanged?.();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Không lưu được thửa.",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveMeasurement = async () => {
    if (!comparison) return;
    setSaving(true);
    try {
      const data = await saveMeasurementRequest({
        plotId: comparison.target.properties.id,
        plotCode: comparison.target.properties.code,
        measuredBy,
        geometry: comparison.geometry,
      });

      setMeasureSaved(true);
      setMessage({
        tone: "ok",
        text: data.persisted
          ? "Đã lưu kết quả đo vào PostGIS."
          : "Đã lưu kết quả đo tạm trong phiên này. Cấu hình DATABASE_URL để lưu lâu dài.",
      });
      onChanged?.();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Không lưu được kết quả đo.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || (parsed as { type?: string }).type !== "FeatureCollection") {
        throw new Error("Tệp phải là GeoJSON FeatureCollection.");
      }
      const data = await importCadastral(parsed as import("geojson").FeatureCollection, file.name);

      setMessage({
        tone: "ok",
        text: `Đã nhập ${data.imported ?? 0} thửa từ ${file.name}${
          data.persisted ? " vào PostGIS." : " (lưu tạm trong phiên này)."
        }`,
      });
      onChanged?.();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Không nhập được tệp GeoJSON.",
      });
    } finally {
      setImporting(false);
    }
  };

  const showPopup = Boolean(selectedFeature) && !draft && !comparison && mode === "idle";
  const showPanel = Boolean(draft || comparison || message) || mode !== "idle";

  const { kicker: panelKicker, title: panelTitle } = panelHeading({
    mode,
    draft,
    comparison,
    selectedFeature,
    formCode: form.code,
  });

  const toneClass = (tone: MessageTone) =>
    tone === "ok" ? "plotmap-note-ok" : tone === "error" ? "plotmap-note-error" : "plotmap-note-info";

  return (
    <div className={`plotmap-shell ${mode !== "idle" ? "drawing" : ""}`}>
      <div ref={mapElementRef} className="plotmap-canvas" />

      <MapToolbar
        baseLayer={baseLayer}
        mode={mode}
        ready={ready}
        canCompare={Boolean(selectedFeature || comparison)}
        importing={importing}
        onBaseLayerChange={setBaseLayer}
        onDraw={startDraw}
        onGps={startGps}
        onCompare={startCompare}
        onImport={() => fileInputRef.current?.click()}
      />

      <MapZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fitPlots} />

      {mode !== "idle" && (
        <DrawHint
          mode={mode}
          preview={preview}
          gpsAccuracy={gpsAccuracy}
          onFinish={finishDraft}
          onCancel={cancelDraft}
        />
      )}

      {loading && <div className="plotmap-loading">Đang tải dữ liệu thửa…</div>}

      {showPanel && (
        <aside className="plotmap-panel">
          <div className="plotmap-panel-head">
            <div>
              <div className="plotmap-kicker">{panelKicker}</div>
              <div className="plotmap-title">{panelTitle}</div>
            </div>
            <button type="button" className="map-tool" onClick={closePanel}>
              Đóng
            </button>
          </div>

          <div className="plotmap-panel-body">
            {message && <div className={`plotmap-note ${toneClass(message.tone)}`}>{message.text}</div>}

            {draft && (
              <DraftForm
                draft={draft}
                preview={preview}
                form={form}
                saving={saving}
                onChange={setForm}
                onSave={savePlot}
                onCancel={cancelDraft}
              />
            )}

            {comparison && !draft && (
              <ComparisonResult
                comparison={comparison}
                measuredBy={measuredBy}
                saving={saving}
                saved={measureSaved}
                onMeasuredByChange={setMeasuredBy}
                onSave={saveMeasurement}
                onRedraw={startCompare}
                onClose={closePanel}
              />
            )}

            {mode !== "idle" && !draft && !comparison && <ModeNote mode={mode} />}
          </div>
        </aside>
      )}

      {showPopup && selectedFeature && (
        <PlotPopup
          feature={selectedFeature}
          overlaps={overlaps}
          onCompare={startCompare}
          onClose={() => setSelectedCode(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,application/geo+json,application/json"
        className="plotmap-file"
        onChange={handleImportFile}
      />
    </div>
  );
}
