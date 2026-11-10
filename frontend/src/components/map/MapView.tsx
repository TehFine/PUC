"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import {
  ADMIN_EDIT_PLOT_EVENT,
  consumePendingEditPlotCode,
  notifyCountsChanged,
} from "@/components/admin/shared/counts-events";
import {
  createPlot,
  importCadastral,
  saveMeasurement as saveMeasurementRequest,
  updatePlotGeometry,
} from "@/services/plots";
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
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { AppleLoadingPill } from "@/components/ui/Skeleton";
import { isLowEndDevice } from "@/lib/network";
import {
  defaultForm,
  EMPTY_PREVIEW,
  formatEdgeMeters,
  panelHeading,
  polygonFromLatLngs,
  previewFromLatLngs,
  renderCadastralDimensions,
} from "./map-helpers";
import { createBaseLayers, MAP_CENTER, MAX_MAP_ZOOM, type BaseLayers } from "./map-layers";
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
  pendingEditCode?: string | null;
  onPendingEditHandled?: () => void;
}

function extractOpenRingLatLngs(L: typeof import("leaflet"), feature: PlotFeature): Leaflet.LatLng[] {
  const ring = feature.geometry.coordinates[0] ?? [];
  if (ring.length === 0) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  const openRing =
    ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
  return openRing.map(([lng, lat]) => L.latLng(lat, lng));
}

export default function MapView({
  plots,
  loading = false,
  onChanged,
  pendingEditCode,
  onPendingEditHandled,
}: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const baseLayersRef = useRef<Partial<BaseLayers>>({});
  const plotGroupRef = useRef<Leaflet.FeatureGroup | null>(null);
  const dimensionGroupRef = useRef<Leaflet.LayerGroup | null>(null);
  const draftGroupRef = useRef<Leaflet.LayerGroup | null>(null);
  const compareGroupRef = useRef<Leaflet.LayerGroup | null>(null);
  const plotLayersRef = useRef<Map<string, Leaflet.Path>>(new Map());
  const verticesRef = useRef<Leaflet.LatLng[]>([]);
  const modeRef = useRef<Mode>("idle");
  const draftSourceRef = useRef<PlotSource>("declared");
  const compareTargetRef = useRef<PlotFeature | null>(null);
  const editTargetRef = useRef<PlotFeature | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("satellite");
  const [zoomLevel, setZoomLevel] = useState<number>(13);
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
  const [updateAreaOnEdit, setUpdateAreaOnEdit] = useState(false);

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
    const currentMode = modeRef.current;
    const compareMode = currentMode === "compare";
    const editMode = currentMode === "edit";
    const color = editMode ? "#f59e0b" : compareMode ? "#c05621" : "#2f7a4f";

    let polyLayer: Leaflet.Polygon | null = null;
    let lineLayer: Leaflet.Polyline | null = null;

    if (points.length >= 3) {
      polyLayer = L.polygon(
        points.map((point) => [point.lat, point.lng] as Leaflet.LatLngTuple),
        {
          color,
          weight: editMode ? 2.5 : 2,
          opacity: 1,
          fillColor: color,
          fillOpacity: editMode ? 0.28 : 0.2,
          dashArray: editMode ? undefined : "5 4",
          interactive: false,
        },
      ).addTo(group);
    }

    if (points.length >= 2) {
      lineLayer = L.polyline(
        points.map((point) => [point.lat, point.lng] as Leaflet.LatLngTuple),
        { color, weight: 2, opacity: 0.9, dashArray: "4 4", interactive: false },
      ).addTo(group);

      // Hiển thị chiều dài thực tế từng cạnh (mét) ngay khi đang vẽ / chỉnh sửa hình dạng thửa (giới hạn <= 24 đỉnh)
      if (points.length <= 24) {
        const edgeCount = points.length >= 3 ? points.length : points.length - 1;
        for (let i = 0; i < edgeCount; i += 1) {
          const p1 = points[i];
          const p2 = points[(i + 1) % points.length];
          const meters = p1.distanceTo(p2);
          if (!Number.isFinite(meters) || meters < 2.5) continue;
          const mid = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);
          const dimIcon = L.divIcon({
            className: "plot-edge-dim-wrap",
            html: `<span class="plot-edge-dim-badge is-draft">${formatEdgeMeters(meters)}</span>`,
            iconSize: [0, 0],
          });
          L.marker(mid, { icon: dimIcon, interactive: false, keyboard: false }).addTo(group);
        }
      }
    }

    if (editMode) {
      // Nút trung điểm trên từng cạnh để bấm hoặc kéo thêm đỉnh mới
      if (points.length >= 2) {
        const edgeCount = points.length >= 3 ? points.length : points.length - 1;
        for (let i = 0; i < edgeCount; i += 1) {
          const p1 = points[i];
          const p2 = points[(i + 1) % points.length];
          const mid = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);
          const midIcon = L.divIcon({
            className: "plot-edit-midpoint-icon",
            html: `<span style="display:block;width:10px;height:10px;border-radius:50%;background:#fde68a;border:2px solid #d97706;box-shadow:0 1px 4px rgba(0,0,0,0.35);cursor:pointer;" title="Kéo hoặc bấm để thêm đỉnh mới trên cạnh này"></span>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          const midMarker = L.marker(mid, { draggable: true, icon: midIcon }).addTo(group);
          midMarker.on("click", (ev) => {
            L.DomEvent.stopPropagation(ev);
            const next = [...verticesRef.current];
            next.splice(i + 1, 0, mid);
            verticesRef.current = next;
            redrawDraftRef.current(next);
            setPreview(previewFromLatLngs(next));
          });
          midMarker.on("dragend", () => {
            const newPos = midMarker.getLatLng();
            const next = [...verticesRef.current];
            next.splice(i + 1, 0, newPos);
            verticesRef.current = next;
            redrawDraftRef.current(next);
            setPreview(previewFromLatLngs(next));
          });
        }
      }

      // Nút đỉnh có thể kéo thả để chỉnh hình dạng và bấm chuột phải để xóa đỉnh
      points.forEach((point, idx) => {
        const vertexIcon = L.divIcon({
          className: "plot-edit-vertex-icon",
          html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:#ffffff;border:3px solid #d97706;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:grab;" title="Đỉnh #${idx + 1}: Kéo để di chuyển · Chuột phải để xóa"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker(point, { draggable: true, icon: vertexIcon }).addTo(group);
        marker.on("drag", () => {
          const pos = marker.getLatLng();
          const next = [...verticesRef.current];
          next[idx] = pos;
          verticesRef.current = next;
          const tuples = next.map((pt) => [pt.lat, pt.lng] as Leaflet.LatLngTuple);
          polyLayer?.setLatLngs(tuples);
          lineLayer?.setLatLngs(tuples);
          setPreview(previewFromLatLngs(next));
        });
        marker.on("dragend", () => {
          redrawDraftRef.current(verticesRef.current);
          setPreview(previewFromLatLngs(verticesRef.current));
        });
        marker.on("contextmenu", (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (verticesRef.current.length <= 3) {
            setMessage({ tone: "info", text: "Thửa đất cần tối thiểu 3 đỉnh. Dùng “Vẽ lại từ đầu” nếu muốn chấm lại toàn bộ." });
            return;
          }
          const next = verticesRef.current.filter((_, itemIdx) => itemIdx !== idx);
          verticesRef.current = next;
          redrawDraftRef.current(next);
          setPreview(previewFromLatLngs(next));
        });
      });
      return;
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
      if (
        modeRef.current !== "draw" &&
        modeRef.current !== "gps" &&
        modeRef.current !== "compare" &&
        modeRef.current !== "edit"
      ) {
        return;
      }
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
    editTargetRef.current = null;
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
      return;
    }

    if (currentMode === "edit") {
      const target = editTargetRef.current;
      if (!target) return;
      stopGps();
      setSaving(true);
      updatePlotGeometry(target.properties.code, {
        geometry,
        updateArea: updateAreaOnEdit,
      })
        .then((res) => {
          draftGroupRef.current?.clearLayers();
          editTargetRef.current = null;
          verticesRef.current = [];
          setPreview(EMPTY_PREVIEW);
          changeMode("idle");
          setSelectedCode(res.feature.properties.code);
          setMessage({
            tone: "ok",
            text: `Đã lưu hình dạng mới cho thửa đất ${res.feature.properties.code}.`,
          });
          notifyCountsChanged();
          onChanged?.();
        })
        .catch((err) => {
          setMessage({
            tone: "error",
            text: err instanceof Error ? err.message : "Không lưu được hình dạng thửa đất.",
          });
        })
        .finally(() => {
          setSaving(false);
        });
    }
  }, [changeMode, onChanged, stopGps, updateAreaOnEdit]);

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
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      const imported = (await import("leaflet")) as unknown as {
        default?: typeof import("leaflet");
      };
      const L = imported.default ?? (imported as unknown as typeof import("leaflet"));
      if (disposed || !mapElementRef.current) return;

      leafletRef.current = L;
      const lowEnd = isLowEndDevice();
      const map = L.map(mapElementRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 9,
        maxZoom: MAX_MAP_ZOOM,
        zoomSnap: lowEnd ? 0.5 : 0.25,
        zoomDelta: lowEnd ? 1 : 0.5,
        wheelPxPerZoomLevel: lowEnd ? 60 : 90,
        fadeAnimation: !lowEnd,
        preferCanvas: true,
      }).setView(MAP_CENTER, 13);

      mapRef.current = map;
      L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);
      const layers = createBaseLayers(L);
      baseLayersRef.current = layers;
      layers.satellite.addTo(map);

      plotGroupRef.current = L.featureGroup().addTo(map);
      dimensionGroupRef.current = L.layerGroup().addTo(map);
      draftGroupRef.current = L.layerGroup().addTo(map);
      compareGroupRef.current = L.layerGroup().addTo(map);

      map.on("zoomend", () => {
        setZoomLevel(map.getZoom());
      });

      map.on("click", (event) => {
        const latlng = L.latLng(event.latlng.lat, event.latlng.lng);
        if (
          modeRef.current === "draw" ||
          modeRef.current === "gps" ||
          modeRef.current === "compare" ||
          modeRef.current === "edit"
        ) {
          addVertexRef.current(latlng);
          return;
        }
        if (modeRef.current === "idle" && !draftRef.current && !comparisonRef.current) {
          setSelectedCode(null);
          setMessage(null);
        }
      });

      resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (!disposed && mapRef.current) mapRef.current.invalidateSize({ pan: false });
        }, 120);
      });
      resizeObserver.observe(mapElementRef.current);
      setReady(true);
    };

    void init();

    return () => {
      disposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      plotGroupRef.current = null;
      dimensionGroupRef.current = null;
      draftGroupRef.current = null;
      compareGroupRef.current = null;
      setReady(false);
    };
  }, []);

  // Vẽ mốc đỉnh địa chính + số đo chiều dài từng cạnh (mét) khi phóng sát (Z >= 17) vào thửa đang chọn
  useEffect(() => {
    const L = leafletRef.current;
    const dimGroup = dimensionGroupRef.current;
    if (!ready || !L || !dimGroup) return;

    dimGroup.clearLayers();
    if (mode !== "idle" || draft || comparison || !selectedFeature || zoomLevel < 17) {
      return;
    }
    renderCadastralDimensions(L, dimGroup, selectedFeature.geometry, isLowEndDevice());
  }, [ready, selectedFeature, mode, draft, comparison, zoomLevel]);

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

  const startEditShape = useCallback(
    (targetFeature?: PlotFeature | null) => {
      const feature = targetFeature ?? selectedFeature;
      if (modeRef.current === "edit" && !targetFeature) {
        resetDraftState();
        changeMode("idle");
        setMessage(null);
        return;
      }
      if (!feature) {
        setMessage({
          tone: "info",
          text: "Hãy bấm chọn một thửa đất trên bản đồ trước khi sửa hình dạng.",
        });
        return;
      }
      const L = leafletRef.current;
      const map = mapRef.current;
      if (!L) return;

      resetDraftState();
      setSelectedCode(feature.properties.code);
      editTargetRef.current = feature;
      setUpdateAreaOnEdit(false);
      changeMode("edit");

      const initialPoints = extractOpenRingLatLngs(L, feature);
      verticesRef.current = initialPoints;
      redrawDraftRef.current(initialPoints);
      setPreview(previewFromLatLngs(initialPoints));
      setMessage({
        tone: "info",
        text: `Đang sửa hình dạng thửa ${feature.properties.code} (${feature.properties.owner || "Nông hộ"}). Kéo các đỉnh trắng để chỉnh ranh giới, kéo chấm vàng giữa cạnh để thêm đỉnh mới, hoặc bấm “Vẽ lại từ đầu”.`,
      });

      if (map && initialPoints.length > 0) {
        const bounds = L.latLngBounds(initialPoints);
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.5), { maxZoom: 19.5 });
        }
      }
    },
    [changeMode, resetDraftState, selectedFeature],
  );

  const undoEditVertex = useCallback(() => {
    if (modeRef.current !== "edit" || verticesRef.current.length <= 3) return;
    const next = verticesRef.current.slice(0, -1);
    verticesRef.current = next;
    redrawDraftRef.current(next);
    setPreview(previewFromLatLngs(next));
  }, []);

  const clearEditVertices = useCallback(() => {
    if (modeRef.current !== "edit") return;
    verticesRef.current = [];
    redrawDraftRef.current([]);
    setPreview(EMPTY_PREVIEW);
    setMessage({
      tone: "info",
      text: "Đã xóa các đỉnh cũ. Hãy bấm trực tiếp các góc mới của mảnh đất trên bản đồ (ít nhất 3 điểm), sau đó bấm “Lưu hình dạng”.",
    });
  }, []);

  const resetEditOriginal = useCallback(() => {
    const L = leafletRef.current;
    const target = editTargetRef.current;
    if (modeRef.current !== "edit" || !L || !target) return;
    const initialPoints = extractOpenRingLatLngs(L, target);
    verticesRef.current = initialPoints;
    redrawDraftRef.current(initialPoints);
    setPreview(previewFromLatLngs(initialPoints));
    setMessage({
      tone: "info",
      text: "Đã khôi phục lại hình dạng ban đầu của thửa đất.",
    });
  }, []);

  useEffect(() => {
    if (!ready || !plots || plots.features.length === 0) return;
    const codeToEdit = pendingEditCode || consumePendingEditPlotCode();
    if (!codeToEdit) return;
    const target = plots.features.find((f) => f.properties.code === codeToEdit);
    if (!target) return;
    const timer = window.setTimeout(() => {
      startEditShape(target);
      onPendingEditHandled?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, plots, pendingEditCode, onPendingEditHandled, startEditShape]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEditEvent = (event: Event) => {
      const code = (event as CustomEvent<string>).detail || consumePendingEditPlotCode();
      if (!code || !plots) return;
      const target = plots.features.find((f) => f.properties.code === code);
      if (target) startEditShape(target);
    };
    window.addEventListener(ADMIN_EDIT_PLOT_EVENT, onEditEvent);
    return () => window.removeEventListener(ADMIN_EDIT_PLOT_EVENT, onEditEvent);
  }, [plots, startEditShape]);

  const cancelDraft = useCallback(() => {
    resetDraftState();
    changeMode("idle");
    setMessage(null);
  }, [changeMode, resetDraftState]);

  const closePanel = useCallback(() => {
    cancelDraft();
    setSelectedCode(null);
  }, [cancelDraft]);

  const zoomIn = () => mapRef.current?.zoomIn(1);
  const zoomOut = () => mapRef.current?.zoomOut(1);

  const focusSelectedPlot = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !selectedFeature) return;
    const pts = extractOpenRingLatLngs(L, selectedFeature);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts);
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.32), { maxZoom: 19.5 });
    }
  }, [selectedFeature]);

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

  const panelRef = useRef<HTMLElement>(null);
  const panelHeadRef = useRef<HTMLDivElement>(null);

  const handleDismissPanel = useCallback(() => {
    const el = panelRef.current;
    if (el) {
      el.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease";
      el.style.transform = "translate3d(0, 105%, 0)";
      el.style.opacity = "0";
      setTimeout(() => {
        closePanel();
        if (panelRef.current) {
          panelRef.current.style.transition = "";
          panelRef.current.style.transform = "";
          panelRef.current.style.opacity = "";
        }
      }, 220);
      return;
    }
    closePanel();
  }, [closePanel]);

  useSheetSwipe({
    sheetRef: panelRef,
    handleRef: panelHeadRef,
    onDismiss: handleDismissPanel,
    enabled: showPanel,
  });

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
        canEditShape={Boolean(selectedFeature)}
        importing={importing}
        onBaseLayerChange={setBaseLayer}
        onDraw={startDraw}
        onGps={startGps}
        onCompare={startCompare}
        onEditShape={() => startEditShape()}
        onImport={() => fileInputRef.current?.click()}
      />

      <MapZoomControls
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fitPlots}
        onFocusSelected={selectedFeature && mode === "idle" ? focusSelectedPlot : undefined}
        zoomLevel={ready ? zoomLevel : undefined}
      />

      {mode !== "idle" && (
        <DrawHint
          mode={mode}
          preview={preview}
          gpsAccuracy={gpsAccuracy}
          saving={saving}
          onFinish={finishDraft}
          onCancel={cancelDraft}
          onUndoVertex={mode === "edit" ? undoEditVertex : undefined}
          onClearVertices={mode === "edit" ? clearEditVertices : undefined}
          onResetOriginal={mode === "edit" ? resetEditOriginal : undefined}
        />
      )}

      {loading && (
        <div className="plotmap-loading">
          <AppleLoadingPill label="Đang tải dữ liệu thửa…" hud />
        </div>
      )}

      {showPanel && (
        <aside ref={panelRef} className="plotmap-panel">
          <div ref={panelHeadRef} className="pt-sheet-topbar">
            <div className="pt-sheet-handle-zone" title="Kéo hoặc vuốt xuống để đóng">
              <div className="pt-sheet-handle-bar" />
            </div>
            <div className="plotmap-panel-head">
              <div>
                <div className="plotmap-kicker">{panelKicker}</div>
                <div className="plotmap-title">{panelTitle}</div>
              </div>
              <button type="button" className="pp-close" onClick={handleDismissPanel} aria-label="Đóng">
                <CloseCircleIcon size={28} />
              </button>
            </div>
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

            {mode !== "idle" && !draft && !comparison && (
              <ModeNote
                mode={mode}
                preview={preview}
                declaredAreaHa={selectedFeature?.properties.areaHa}
                updateArea={updateAreaOnEdit}
                onUpdateAreaChange={setUpdateAreaOnEdit}
                saving={saving}
                onFinish={finishDraft}
                onCancel={cancelDraft}
              />
            )}
          </div>
        </aside>
      )}

      {showPopup && selectedFeature && (
        <PlotPopup
          feature={selectedFeature}
          overlaps={overlaps}
          onCompare={startCompare}
          onEditShape={() => startEditShape(selectedFeature)}
          onFocusPlot={focusSelectedPlot}
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
