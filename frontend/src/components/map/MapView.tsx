"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { animatePopupExit } from "@/lib/popup-motion";
import { toast } from "@/components/ui/Toast";
import { usePersistedState } from "@/lib/back-navigation";
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
  findSelfIntersections,
  intersectionGeometry,
  polygonAreaHa,
  simplifyTrackPoints,
  wgs84DistanceMeters,
  type PlotOverlap,
} from "@/utils/plot-utils";
import ComparisonResult from "./ComparisonResult";
import DraftForm from "./DraftForm";
import DrawHint from "./DrawHint";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { LoadingToastBridge } from "@/components/ui/Toast";
import { useBackLayer } from "@/lib/back-navigation";
import { isLowEndDevice } from "@/lib/network";
import {
  cleanLatLngPoints,
  defaultForm,
  EMPTY_PREVIEW,
  formatEdgeMeters,
  panelHeading,
  plotStyle,
  polygonFromLatLngs,
  previewFromLatLngs,
  renderCadastralDimensions,
} from "./map-helpers";
import {
  attachSmoothMapZoom,
  createBaseLayers,
  createCrispCanvasRenderer,
  fetchSatelliteCaptureInfo,
  MAP_CENTER,
  MAX_MAP_ZOOM,
  preconnectMapTileOrigins,
  warmSatelliteTilesAt,
  type BaseLayers,
  type SmoothMapZoomHandle,
} from "./map-layers";
import type {
  BaseLayer,
  ComparisonState,
  DraftState,
  DrawStyle,
  MapMessage,
  MessageTone,
  Mode,
  PlotForm,
  PreviewState,
} from "./map-types";
import MapToolbar from "./MapToolbar";
import MapZoomControls from "./MapZoomControls";
import PlotPopup from "./PlotPopup";
import { usePlotLayers } from "./use-plot-layers";

export interface PendingPlotAction {
  code: string;
  action: "inspect" | "edit" | "redraw";
  seq: number;
}

interface MapViewProps {
  plots: import("@/types/geo").PlotCollection | null;
  loading?: boolean;
  canEditShape?: boolean;
  onChanged?: () => void;
  pendingEditCode?: string | null;
  onPendingEditHandled?: () => void;
  pendingPlotAction?: PendingPlotAction | null;
  onPendingPlotActionHandled?: () => void;
}

const MAX_HISTORY_STEPS = 80;
let leafletModulePromise: Promise<typeof import("leaflet")> | null = null;
function loadLeaflet() {
  if (!leafletModulePromise) {
    leafletModulePromise = import("leaflet");
  }
  return leafletModulePromise;
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

function cloneLatLngList(L: typeof import("leaflet"), pts: ReadonlyArray<Leaflet.LatLng>): Leaflet.LatLng[] {
  return pts.map((pt) => L.latLng(pt.lat, pt.lng));
}

/**
 * Ghép đường nét cong tự do vào đa giác khép kín đang sửa:
 * thay thế cung ngắn hơn giữa hai đỉnh gần điểm đầu và điểm cuối nét vẽ nhất.
 */
function spliceCurveIntoClosedRing(
  existing: Leaflet.LatLng[],
  stroke: Leaflet.LatLng[],
): Leaflet.LatLng[] {
  const n = existing.length;
  if (n < 3 || stroke.length < 2) return [...existing, ...stroke];

  const startPt = stroke[0];
  const endPt = stroke[stroke.length - 1];

  let iStart = 0;
  let bestStartDist = Infinity;
  let iEnd = 0;
  let bestEndDist = Infinity;

  for (let i = 0; i < n; i += 1) {
    const dS = wgs84DistanceMeters(existing[i].lat, existing[i].lng, startPt.lat, startPt.lng);
    if (dS < bestStartDist) {
      bestStartDist = dS;
      iStart = i;
    }
    const dE = wgs84DistanceMeters(existing[i].lat, existing[i].lng, endPt.lat, endPt.lng);
    if (dE < bestEndDist) {
      bestEndDist = dE;
      iEnd = i;
    }
  }

  if (iStart === iEnd) {
    const nextIdx = (iStart + 1) % n;
    const prevIdx = (iStart - 1 + n) % n;
    const dNext = wgs84DistanceMeters(existing[nextIdx].lat, existing[nextIdx].lng, endPt.lat, endPt.lng);
    const dPrev = wgs84DistanceMeters(existing[prevIdx].lat, existing[prevIdx].lng, endPt.lat, endPt.lng);
    if (dNext <= dPrev) {
      iEnd = nextIdx;
    } else {
      iEnd = prevIdx;
    }
  }

  const forwardSteps = (iEnd - iStart + n) % n;
  const backwardSteps = (iStart - iEnd + n) % n;

  if (forwardSteps <= backwardSteps) {
    // Giữ cung từ iEnd -> iStart, thay cung iStart -> iEnd bằng stroke (theo chiều thuận)
    const kept: Leaflet.LatLng[] = [];
    let cursor = iEnd;
    while (cursor !== iStart) {
      kept.push(existing[cursor]);
      cursor = (cursor + 1) % n;
    }
    kept.push(existing[iStart]);
    const innerStroke =
      bestStartDist < 1.0 ? stroke.slice(1) : stroke;
    const trimmedStroke =
      bestEndDist < 1.0 && innerStroke.length > 0 ? innerStroke.slice(0, -1) : innerStroke;
    return cleanLatLngPoints([...kept, ...trimmedStroke]);
  }

  // Thay cung ngược từ iStart -> iEnd (tức chiều thuận là iEnd -> iStart với stroke đảo chiều)
  const kept: Leaflet.LatLng[] = [];
  let cursor = iStart;
  while (cursor !== iEnd) {
    kept.push(existing[cursor]);
    cursor = (cursor + 1) % n;
  }
  kept.push(existing[iEnd]);
  const reversed = [...stroke].reverse();
  const innerStroke = bestEndDist < 1.0 ? reversed.slice(1) : reversed;
  const trimmedStroke =
    bestStartDist < 1.0 && innerStroke.length > 0 ? innerStroke.slice(0, -1) : innerStroke;
  return cleanLatLngPoints([...kept, ...trimmedStroke]);
}

export default function MapView({
  plots,
  loading = false,
  canEditShape = false,
  onChanged,
  pendingEditCode,
  onPendingEditHandled,
  pendingPlotAction,
  onPendingPlotActionHandled,
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
  const draftVerticesRef = useRef<Leaflet.LatLng[]>([]);
  const hasDraftFormInitRef = useRef(false);
  const historyRef = useRef<Leaflet.LatLng[][]>([]);
  const redoRef = useRef<Leaflet.LatLng[][]>([]);

  const modeRef = useRef<Mode>("idle");
  const drawStyleRef = useRef<DrawStyle>("point");
  const selectedVertexRef = useRef<number | null>(null);
  const draftSourceRef = useRef<PlotSource>("declared");
  const compareTargetRef = useRef<PlotFeature | null>(null);
  const editTargetRef = useRef<PlotFeature | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hoverLatLngRef = useRef<Leaflet.LatLng | null>(null);
  const keyZoomHoldingRef = useRef(false);
  const defaultZoomSnapRef = useRef(0);
  const smoothZoomRef = useRef<SmoothMapZoomHandle | null>(null);

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [drawStyle, setDrawStyle] = useState<DrawStyle>("point");
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [historyCounts, setHistoryCounts] = useState<{ undo: number; redo: number }>({
    undo: 0,
    redo: 0,
  });
  const [baseLayer, setBaseLayer] = usePersistedState<BaseLayer>(
    "admin:map:base-layer",
    "satellite",
    (v): v is BaseLayer =>
      v === "satellite" || v === "satellite-google" || v === "streets",
  );
  const [zoomLevel, setZoomLevel] = useState<number>(15);
  const [imageryDateLabel, setImageryDateLabel] = useState<string | null>(null);
  const initialPlotsRef = useRef(plots);
  useEffect(() => {
    initialPlotsRef.current = plots;
  }, [plots]);
  const [selectedCode, setSelectedCode] = usePersistedState<string | null>(
    "admin:map:selected-plot",
    null,
    (v): v is string | null => v === null || typeof v === "string",
  );
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
  const [updateAreaOnEdit, setUpdateAreaOnEdit] = useState(true);

  const selectedFeature = useMemo(
    () => plots?.features.find((feature) => feature.properties.code === selectedCode) ?? null,
    [plots, selectedCode],
  );

  const [overlapState, setOverlapState] = useState<{ code: string; items: PlotOverlap[] } | null>(null);

  useEffect(() => {
    if (!selectedFeature) return;
    let cancelled = false;
    const code = selectedFeature.properties.code;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setOverlapState({ code, items: findOverlaps(selectedFeature, plots) });
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedFeature, plots]);

  const overlaps =
    selectedFeature && overlapState?.code === selectedFeature.properties.code ? overlapState.items : [];

  const selectedCodeRef = useRef<string | null>(selectedCode);
  const draftRef = useRef<DraftState | null>(draft);
  const comparisonRef = useRef<ComparisonState | null>(comparison);
  const selectRef = useRef<(feature: PlotFeature) => void>(() => undefined);
  const addVertexRef = useRef<(latlng: Leaflet.LatLng) => void>(() => undefined);
  const redrawDraftRef = useRef<(points: Leaflet.LatLng[], frozen?: boolean) => void>(() => undefined);
  const finishDraftRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    selectedCodeRef.current = selectedCode;
  }, [selectedCode]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    comparisonRef.current = comparison;
  }, [comparison]);

  const syncSelectedVertex = useCallback((idx: number | null) => {
    selectedVertexRef.current = idx;
    setSelectedVertexIndex(idx);
  }, []);

  const pushHistorySnapshot = useCallback((snapshot: ReadonlyArray<Leaflet.LatLng>) => {
    const L = leafletRef.current;
    if (!L) return;
    const nextHist = [...historyRef.current, cloneLatLngList(L, snapshot)];
    if (nextHist.length > MAX_HISTORY_STEPS) {
      nextHist.shift();
    }
    historyRef.current = nextHist;
    redoRef.current = [];
    setHistoryCounts({ undo: nextHist.length, redo: 0 });
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    redoRef.current = [];
    setHistoryCounts({ undo: 0, redo: 0 });
  }, []);

  const changeMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
    if (next === "idle") {
      drawStyleRef.current = "point";
      setDrawStyle("point");
      mapRef.current?.dragging.enable();
    }
  }, []);

  const changeDrawStyle = useCallback((next: DrawStyle) => {
    drawStyleRef.current = next;
    setDrawStyle(next);
    const map = mapRef.current;
    if (!map) return;
    if (modeRef.current !== "idle" && next === "freehand") {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }, []);

  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setGpsAccuracy(null);
  }, []);

  const redrawDraft = useCallback(
    (points: Leaflet.LatLng[], frozen: boolean = false) => {
      const L = leafletRef.current;
      const group = draftGroupRef.current;
      const map = mapRef.current;
      if (!L || !group) return;

      group.clearLayers();
      if (points.length === 0) return;

      const currentMode = modeRef.current;
      const compareMode = currentMode === "compare";
      const editMode = currentMode === "edit";
      const interactiveHandles = !frozen && currentMode !== "idle";

      const strokeColor = editMode ? "#f59e0b" : compareMode ? "#ea580c" : "#22c55e";
      const fillColor = editMode ? "#f59e0b" : compareMode ? "#c05621" : "#16a34a";

      let polyLayer: Leaflet.Polygon | null = null;
      let mainLineLayer: Leaflet.Polyline | null = null;
      let closingLineLayer: Leaflet.Polyline | null = null;

      if (points.length >= 3) {
        polyLayer = L.polygon(
          points.map((point) => [point.lat, point.lng] as Leaflet.LatLngTuple),
          {
            color: strokeColor,
            weight: editMode || frozen ? 2.6 : 0,
            opacity: editMode || frozen ? 0.95 : 0,
            fillColor,
            fillOpacity: editMode ? 0.24 : 0.2,
            interactive: false,
          },
        ).addTo(group);
      }

      if (points.length >= 2 && !editMode && !frozen) {
        mainLineLayer = L.polyline(
          points.map((point) => [point.lat, point.lng] as Leaflet.LatLngTuple),
          { color: strokeColor, weight: 2.6, opacity: 0.96, interactive: false },
        ).addTo(group);

        if (points.length >= 3) {
          closingLineLayer = L.polyline(
            [
              [points[points.length - 1].lat, points[points.length - 1].lng],
              [points[0].lat, points[0].lng],
            ],
            { color: "#fde047", weight: 2, opacity: 0.9, dashArray: "5 5", interactive: false },
          ).addTo(group);
        }
      } else if (points.length === 2 && (editMode || frozen)) {
        mainLineLayer = L.polyline(
          points.map((point) => [point.lat, point.lng] as Leaflet.LatLngTuple),
          { color: strokeColor, weight: 2.6, opacity: 0.95, dashArray: "5 4", interactive: false },
        ).addTo(group);
      }

      // Tô đỏ trực quan các cặp cạnh bị tự cắt chéo nhau (nếu có)
      const intersections = points.length >= 4 ? findSelfIntersections(points) : [];
      if (intersections.length > 0) {
        const flaggedEdges = new Set<number>();
        for (const hit of intersections) {
          flaggedEdges.add(hit.edgeA);
          flaggedEdges.add(hit.edgeB);
          L.circleMarker([hit.lat, hit.lng], {
            radius: 5,
            color: "#ffffff",
            weight: 1.8,
            fillColor: "#dc2626",
            fillOpacity: 1,
            interactive: false,
          }).addTo(group);
        }
        flaggedEdges.forEach((edgeIdx) => {
          const pA = points[edgeIdx];
          const pB = points[(edgeIdx + 1) % points.length];
          L.polyline(
            [
              [pA.lat, pA.lng],
              [pB.lat, pB.lng],
            ],
            { color: "#dc2626", weight: 3.4, opacity: 0.98, dashArray: "4 4", interactive: false },
          ).addTo(group);
        });
      }

      const paddedBounds = map ? map.getBounds().pad(0.25) : null;

      // Nhãn chiều dài thực tế từng cạnh (mét) tự động lọc theo khoảng cách pixel, không giới hạn 24 đỉnh
      if (points.length >= 2) {
        const edgeCount = points.length >= 3 ? points.length : points.length - 1;
        let shownBadges = 0;
        let lastBadgePx: Leaflet.Point | null = null;

        for (let i = 0; i < edgeCount && shownBadges < 120; i += 1) {
          const p1 = points[i];
          const p2 = points[(i + 1) % points.length];
          const mid = L.latLng((p1.lat + p2.lat) * 0.5, (p1.lng + p2.lng) * 0.5);
          if (paddedBounds && !paddedBounds.contains(mid)) continue;

          const meters = wgs84DistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
          if (!Number.isFinite(meters) || meters < 1.2) continue;

          if (map) {
            const px1 = map.latLngToContainerPoint(p1);
            const px2 = map.latLngToContainerPoint(p2);
            if (px1.distanceTo(px2) < 42) continue;
            const midPx = map.latLngToContainerPoint(mid);
            if (lastBadgePx && midPx.distanceTo(lastBadgePx) < 38) continue;
            lastBadgePx = midPx;
          }

          const dimIcon = L.divIcon({
            className: "plot-edge-dim-wrap",
            html: `<span class="plot-edge-dim-badge is-draft">${formatEdgeMeters(meters)}</span>`,
            iconSize: [0, 0],
          });
          L.marker(mid, { icon: dimIcon, interactive: false, keyboard: false }).addTo(group);
          shownBadges += 1;
        }
      }

      if (!interactiveHandles) {
        // Khi đang mở bảng điền thông tin lưu thửa (frozen): hiển thị rõ các đỉnh đã chấm
        for (let i = 0; i < points.length; i += 1) {
          if (paddedBounds && points.length > 100 && !paddedBounds.contains(points[i])) continue;
          L.circleMarker(points[i], {
            radius: 3.8,
            color: "#0f172a",
            weight: 1.5,
            fillColor: "#fde047",
            fillOpacity: 1,
            interactive: false,
          }).addTo(group);
        }
        return;
      }

      // 1. Tay nắm trung điểm trên mọi cạnh đủ độ rộng hiển thị để chẻ cạnh, uốn đường cong không giới hạn
      if (points.length >= 2) {
        const edgeCount = points.length >= 3 ? points.length : points.length - 1;
        for (let i = 0; i < edgeCount; i += 1) {
          const p1 = points[i];
          const p2 = points[(i + 1) % points.length];
          const mid = L.latLng((p1.lat + p2.lat) * 0.5, (p1.lng + p2.lng) * 0.5);
          if (paddedBounds && !paddedBounds.contains(mid)) continue;

          if (map) {
            const px1 = map.latLngToContainerPoint(p1);
            const px2 = map.latLngToContainerPoint(p2);
            if (px1.distanceTo(px2) < 26) continue;
          }

          const midIcon = L.divIcon({
            className: "plot-edit-midpoint-icon",
            html: `<span class="plot-midpoint-grip" title="Bấm hoặc kéo để chèn thêm đỉnh mới trên cạnh này"></span>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          const midMarker = L.marker(mid, { draggable: true, icon: midIcon }).addTo(group);
          let beforeMidDrag: Leaflet.LatLng[] | null = null;
          let insertedDuringDrag = false;
          let midRaf = 0;

          midMarker.on("click", (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (insertedDuringDrag) return;
            pushHistorySnapshot(verticesRef.current);
            const next = [...verticesRef.current];
            next.splice(i + 1, 0, mid);
            verticesRef.current = next;
            syncSelectedVertex(i + 1);
            redrawDraftRef.current(next);
            setPreview(previewFromLatLngs(next));
          });

          midMarker.on("dragstart", () => {
            beforeMidDrag = cloneLatLngList(L, verticesRef.current);
            const next = [...verticesRef.current];
            next.splice(i + 1, 0, midMarker.getLatLng());
            verticesRef.current = next;
            insertedDuringDrag = true;
          });

          midMarker.on("drag", () => {
            if (!insertedDuringDrag) return;
            const pos = midMarker.getLatLng();
            const next = [...verticesRef.current];
            next[i + 1] = pos;
            verticesRef.current = next;
            const tuples = next.map((pt) => [pt.lat, pt.lng] as Leaflet.LatLngTuple);
            polyLayer?.setLatLngs(tuples);
            mainLineLayer?.setLatLngs(tuples);
            if (closingLineLayer && next.length >= 3) {
              closingLineLayer.setLatLngs([
                [next[next.length - 1].lat, next[next.length - 1].lng],
                [next[0].lat, next[0].lng],
              ]);
            }
            if (midRaf === 0) {
              midRaf = window.requestAnimationFrame(() => {
                midRaf = 0;
                setPreview(previewFromLatLngs(verticesRef.current, { skipIntersections: true }));
              });
            }
          });

          midMarker.on("dragend", () => {
            if (midRaf) {
              window.cancelAnimationFrame(midRaf);
              midRaf = 0;
            }
            if (beforeMidDrag) {
              pushHistorySnapshot(beforeMidDrag);
              beforeMidDrag = null;
            }
            syncSelectedVertex(i + 1);
            redrawDraftRef.current(verticesRef.current);
            setPreview(previewFromLatLngs(verticesRef.current));
          });
        }
      }

      // 2. Tay nắm từng đỉnh: kéo thả tự do ở mọi chế độ, chạm để chọn, chuột phải để xóa, chạm đỉnh #1 để khép kín
      points.forEach((point, idx) => {
        if (paddedBounds && points.length > 160 && idx !== 0 && !paddedBounds.contains(point)) {
          L.circleMarker(point, {
            radius: 3,
            color: "#0f172a",
            weight: 1.2,
            fillColor: "#ffffff",
            fillOpacity: 1,
            interactive: false,
          }).addTo(group);
          return;
        }

        const isFirstClosable = idx === 0 && points.length >= 3 && !editMode;
        const isSelected = selectedVertexRef.current === idx;
        const gripClasses = [
          "plot-vertex-grip",
          isFirstClosable ? "is-first" : "",
          isSelected ? "is-selected" : "",
          editMode ? "is-edit" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const tooltipText = isFirstClosable
          ? "Đỉnh đầu #1: Bấm để khép kín và hoàn tất, kéo để dời góc"
          : `Đỉnh #${idx + 1}: Kéo để dời vị trí, bấm để chọn, chuột phải để xóa`;

        const size = isFirstClosable ? 16 : 13;
        const anchor = size / 2;
        const vertexIcon = L.divIcon({
          className: "plot-edit-vertex-icon",
          html: `<span class="${gripClasses}" title="${tooltipText}"></span>`,
          iconSize: [size, size],
          iconAnchor: [anchor, anchor],
        });

        const marker = L.marker(point, {
          draggable: true,
          icon: vertexIcon,
          zIndexOffset: isFirstClosable ? 300 : isSelected ? 200 : 100,
        }).addTo(group);

        let dragRaf = 0;
        let wasDragged = false;
        let beforeVertexDrag: Leaflet.LatLng[] | null = null;

        marker.on("dragstart", () => {
          wasDragged = true;
          beforeVertexDrag = cloneLatLngList(L, verticesRef.current);
        });

        marker.on("drag", () => {
          const pos = marker.getLatLng();
          const next = [...verticesRef.current];
          next[idx] = pos;
          verticesRef.current = next;
          const tuples = next.map((pt) => [pt.lat, pt.lng] as Leaflet.LatLngTuple);
          polyLayer?.setLatLngs(tuples);
          mainLineLayer?.setLatLngs(tuples);
          if (closingLineLayer && next.length >= 3) {
            closingLineLayer.setLatLngs([
              [next[next.length - 1].lat, next[next.length - 1].lng],
              [next[0].lat, next[0].lng],
            ]);
          }
          if (dragRaf === 0) {
            dragRaf = window.requestAnimationFrame(() => {
              dragRaf = 0;
              setPreview(previewFromLatLngs(verticesRef.current, { skipIntersections: true }));
            });
          }
        });

        marker.on("dragend", () => {
          if (dragRaf) {
            window.cancelAnimationFrame(dragRaf);
            dragRaf = 0;
          }
          if (beforeVertexDrag) {
            pushHistorySnapshot(beforeVertexDrag);
            beforeVertexDrag = null;
          }
          syncSelectedVertex(idx);
          redrawDraftRef.current(verticesRef.current);
          setPreview(previewFromLatLngs(verticesRef.current));
          window.setTimeout(() => {
            wasDragged = false;
          }, 50);
        });

        marker.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (wasDragged) return;
          if (isFirstClosable) {
            finishDraftRef.current();
            return;
          }
          const nextSel = selectedVertexRef.current === idx ? null : idx;
          syncSelectedVertex(nextSel);
          redrawDraftRef.current(verticesRef.current);
        });

        marker.on("contextmenu", (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (modeRef.current === "edit" && verticesRef.current.length <= 3) {
            setMessage({
              tone: "info",
              text: "Thửa đất cần tối thiểu 3 đỉnh. Dùng nút Xóa vẽ lại nếu muốn chấm lại toàn bộ.",
            });
            return;
          }
          pushHistorySnapshot(verticesRef.current);
          const next = verticesRef.current.filter((_, itemIdx) => itemIdx !== idx);
          verticesRef.current = next;
          syncSelectedVertex(null);
          redrawDraftRef.current(next);
          setPreview(previewFromLatLngs(next));
        });
      });
    },
    [pushHistorySnapshot, syncSelectedVertex],
  );

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
      const current = verticesRef.current;
      const last = current[current.length - 1];
      if (last && wgs84DistanceMeters(last.lat, last.lng, latlng.lat, latlng.lng) < 0.15) {
        return;
      }

      pushHistorySnapshot(current);

      // Trong chế độ sửa hình khép kín đã có >= 3 đỉnh: chèn đỉnh mới vào cạnh gần vị trí bấm nhất
      if (modeRef.current === "edit" && current.length >= 3) {
        const map = mapRef.current;
        let insertAt = current.length;
        if (map) {
          const clickPx = map.latLngToContainerPoint(latlng);
          let bestDistSq = Infinity;
          for (let i = 0; i < current.length; i += 1) {
            const pA = map.latLngToContainerPoint(current[i]);
            const pB = map.latLngToContainerPoint(current[(i + 1) % current.length]);
            const dx = pB.x - pA.x;
            const dy = pB.y - pA.y;
            const lenSq = dx * dx + dy * dy;
            const t =
              lenSq <= 1e-9
                ? 0
                : Math.max(0, Math.min(1, ((clickPx.x - pA.x) * dx + (clickPx.y - pA.y) * dy) / lenSq));
            const ex = clickPx.x - (pA.x + t * dx);
            const ey = clickPx.y - (pA.y + t * dy);
            const distSq = ex * ex + ey * ey;
            if (distSq < bestDistSq) {
              bestDistSq = distSq;
              insertAt = i + 1;
            }
          }
        }
        const next = [...current];
        next.splice(insertAt, 0, latlng);
        verticesRef.current = next;
        syncSelectedVertex(insertAt);
        redrawDraftRef.current(next);
        setPreview(previewFromLatLngs(next));
        setMessage(null);
        return;
      }

      const next = [...current, latlng];
      verticesRef.current = next;
      syncSelectedVertex(next.length - 1);
      redrawDraftRef.current(next);
      setPreview(previewFromLatLngs(next));
      setMessage(null);
    },
    [pushHistorySnapshot, syncSelectedVertex],
  );

  useEffect(() => {
    addVertexRef.current = addVertex;
  }, [addVertex]);

  const restoreTargetLayerStyle = useCallback(
    (target: PlotFeature | null, isSelected: boolean) => {
      if (!target) return;
      const layer = plotLayersRef.current.get(target.properties.code);
      const map = mapRef.current;
      if (!layer) return;
      const baseStyle = plotStyle(
        target.properties.source,
        isSelected,
        target.properties.zone || target.properties.code,
        map?.getZoom() ?? 16,
        baseLayer,
      );
      layer.setStyle({ ...baseStyle, dashArray: undefined });
    },
    [baseLayer],
  );

  const resetDraftState = useCallback(() => {
    stopGps();
    if (editTargetRef.current) {
      restoreTargetLayerStyle(editTargetRef.current, selectedCodeRef.current === editTargetRef.current.properties.code);
    }
    verticesRef.current = [];
    draftVerticesRef.current = [];
    hasDraftFormInitRef.current = false;
    clearHistory();
    syncSelectedVertex(null);
    draftGroupRef.current?.clearLayers();
    compareGroupRef.current?.clearLayers();
    compareTargetRef.current = null;
    editTargetRef.current = null;
    setDraft(null);
    setComparison(null);
    setPreview(EMPTY_PREVIEW);
    setMeasureSaved(false);
  }, [clearHistory, restoreTargetLayerStyle, stopGps, syncSelectedVertex]);

  const finishDraft = useCallback(() => {
    const L = leafletRef.current;
    const cleaned = cleanLatLngPoints(verticesRef.current);
    if (cleaned.length < 3) {
      setMessage({ tone: "error", text: "Cần ít nhất 3 đỉnh phân biệt để khép kín ranh giới thửa đất." });
      return;
    }

    const selfHits = findSelfIntersections(cleaned);
    if (selfHits.length > 0) {
      setMessage({
        tone: "error",
        text: "Ranh giới đang có cạnh tự cắt chéo nhau. Hãy kéo chỉnh đỉnh bị chéo trước khi hoàn tất.",
      });
      return;
    }

    const geometry = polygonFromLatLngs(cleaned);
    const currentMode = modeRef.current;
    const map = mapRef.current;

    if (currentMode === "compare") {
      const target = compareTargetRef.current;
      if (!target) return;
      stopGps();
      const result = comparePolygons(target.geometry, geometry);
      setComparison({ target, geometry, result });
      setMeasureSaved(false);
      changeMode("idle");
      syncSelectedVertex(null);
      setPreview(previewFromLatLngs(cleaned));
      redrawDraftRef.current(cleaned, true);
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
        cleaned.forEach((point) => bounds.extend(point));
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.35), { maxZoom: 18 });
      }
      return;
    }

    if (currentMode === "draw" || currentMode === "gps") {
      stopGps();
      if (L) {
        draftVerticesRef.current = cloneLatLngList(L, cleaned);
      }
      if (!hasDraftFormInitRef.current) {
        setForm(defaultForm(draftSourceRef.current));
        hasDraftFormInitRef.current = true;
      }
      setDraft({
        geometry,
        areaHa: polygonAreaHa(geometry),
        vertexCount: cleaned.length,
      });
      setPreview(previewFromLatLngs(cleaned));
      setMessage(null);
      syncSelectedVertex(null);
      changeMode("idle");
      redrawDraftRef.current(cleaned, true);
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
          clearHistory();
          syncSelectedVertex(null);
          setPreview(EMPTY_PREVIEW);
          changeMode("idle");
          setSelectedCode(res.feature.properties.code);
          setMessage({
            tone: "ok",
            text: `Đã cập nhật ranh giới (${cleaned.length} đỉnh) cho thửa ${res.feature.properties.code}.`,
          });
          toast.success(`Đã cập nhật ranh giới thửa ${res.feature.properties.code}`);
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
  }, [changeMode, clearHistory, onChanged, setSelectedCode, stopGps, syncSelectedVertex, updateAreaOnEdit]);

  useEffect(() => {
    finishDraftRef.current = finishDraft;
  }, [finishDraft]);

  const resumeDraftEdit = useCallback(() => {
    const L = leafletRef.current;
    if (!L || draftVerticesRef.current.length === 0) return;
    const restored = cloneLatLngList(L, draftVerticesRef.current);
    setDraft(null);
    setMessage(null);
    verticesRef.current = restored;
    syncSelectedVertex(null);
    changeMode("draw");
    redrawDraftRef.current(restored);
    setPreview(previewFromLatLngs(restored));
  }, [changeMode, syncSelectedVertex]);

  const handleUndo = useCallback(() => {
    const L = leafletRef.current;
    if (!L || historyRef.current.length === 0) return;
    const prevList = [...historyRef.current];
    const targetState = prevList.pop();
    if (!targetState) return;
    const nextRedo = [...redoRef.current, cloneLatLngList(L, verticesRef.current)];
    historyRef.current = prevList;
    redoRef.current = nextRedo;
    setHistoryCounts({ undo: prevList.length, redo: nextRedo.length });

    verticesRef.current = targetState;
    if (selectedVertexRef.current !== null && selectedVertexRef.current >= targetState.length) {
      syncSelectedVertex(null);
    }
    redrawDraftRef.current(targetState);
    setPreview(previewFromLatLngs(targetState));
    setMessage(null);
  }, [syncSelectedVertex]);

  const handleRedo = useCallback(() => {
    const L = leafletRef.current;
    if (!L || redoRef.current.length === 0) return;
    const nextRedo = [...redoRef.current];
    const targetState = nextRedo.pop();
    if (!targetState) return;
    const nextHist = [...historyRef.current, cloneLatLngList(L, verticesRef.current)];
    historyRef.current = nextHist;
    redoRef.current = nextRedo;
    setHistoryCounts({ undo: nextHist.length, redo: nextRedo.length });

    verticesRef.current = targetState;
    redrawDraftRef.current(targetState);
    setPreview(previewFromLatLngs(targetState));
    setMessage(null);
  }, []);

  const handleDeleteSelectedVertex = useCallback(() => {
    const idx = selectedVertexRef.current;
    if (idx === null) return;
    if (modeRef.current === "edit" && verticesRef.current.length <= 3) {
      setMessage({
        tone: "info",
        text: "Thửa đất cần tối thiểu 3 đỉnh. Chọn Xóa vẽ lại nếu muốn chấm mới toàn bộ.",
      });
      return;
    }
    pushHistorySnapshot(verticesRef.current);
    const next = verticesRef.current.filter((_, i) => i !== idx);
    verticesRef.current = next;
    syncSelectedVertex(null);
    redrawDraftRef.current(next);
    setPreview(previewFromLatLngs(next));
  }, [pushHistorySnapshot, syncSelectedVertex]);

  const handleClearVertices = useCallback(() => {
    if (verticesRef.current.length === 0) return;
    pushHistorySnapshot(verticesRef.current);
    verticesRef.current = [];
    syncSelectedVertex(null);
    redrawDraftRef.current([]);
    setPreview(EMPTY_PREVIEW);
    setMessage({
      tone: "info",
      text: "Đã làm trống các đỉnh. Hãy chấm từng góc hoặc vẽ nét cong để tạo ranh giới mới.",
    });
  }, [pushHistorySnapshot, syncSelectedVertex]);

  const resetEditOriginal = useCallback(() => {
    const L = leafletRef.current;
    const target = editTargetRef.current;
    if (modeRef.current !== "edit" || !L || !target) return;
    pushHistorySnapshot(verticesRef.current);
    const initialPoints = extractOpenRingLatLngs(L, target);
    verticesRef.current = initialPoints;
    syncSelectedVertex(null);
    redrawDraftRef.current(initialPoints);
    setPreview(previewFromLatLngs(initialPoints));
    setMessage({
      tone: "info",
      text: "Đã khôi phục ranh giới ban đầu của thửa đất.",
    });
  }, [pushHistorySnapshot, syncSelectedVertex]);

  const handleFlyToCoord = useCallback(
    (lat: number, lng: number, shouldAddPoint: boolean) => {
      const L = leafletRef.current;
      const map = mapRef.current;
      if (!L || !map) return;
      const targetLatLng = L.latLng(lat, lng);
      map.setView(targetLatLng, Math.max(map.getZoom(), 20), { animate: true });
      if (shouldAddPoint) {
        addVertexRef.current(targetLatLng);
      }
    },
    [],
  );

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
      const firstPt = feature.geometry.coordinates[0]?.[0];
      if (firstPt && firstPt.length >= 2) {
        warmSatelliteTilesAt(firstPt[1], firstPt[0], 18);
      }
      setSelectedCode(feature.properties.code);
      setMessage(null);
    },
    [comparison, draft, setSelectedCode],
  );

  useEffect(() => {
    selectRef.current = handleSelect;
  }, [handleSelect]);

  // Khởi tạo bản đồ Leaflet + bộ điều khiển thu phóng mượt 60-120 FPS
  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let smoothZoom: SmoothMapZoomHandle | null = null;

    preconnectMapTileOrigins();
    warmSatelliteTilesAt(MAP_CENTER[0], MAP_CENTER[1], 15);
    void fetchSatelliteCaptureInfo(MAP_CENTER[0], MAP_CENTER[1]).then((info) => {
      if (!disposed && info?.dateLabel) {
        setImageryDateLabel(info.dateLabel);
      }
    });

    const init = async () => {
      const imported = (await loadLeaflet()) as unknown as {
        default?: typeof import("leaflet");
      };
      const L = imported.default ?? (imported as unknown as typeof import("leaflet"));
      if (disposed || !mapElementRef.current) return;

      leafletRef.current = L;
      const initialZoomSnap = 0;
      defaultZoomSnapRef.current = initialZoomSnap;
      const map = L.map(mapElementRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 9,
        maxZoom: MAX_MAP_ZOOM,
        zoomSnap: initialZoomSnap,
        zoomDelta: 0.75,
        scrollWheelZoom: false,
        fadeAnimation: true,
        zoomAnimation: true,
        zoomAnimationThreshold: 10,
        inertia: true,
        inertiaDeceleration: 2800,
        inertiaMaxSpeed: 2400,
        preferCanvas: true,
        renderer: createCrispCanvasRenderer(L, 0.65),
        doubleClickZoom: false,
      });

      // Chốt khung nhìn ban đầu một lần duy nhất TRƯỚC KHI gắn lớp ảnh vệ tinh để không tải rồi hủy mảnh thừa
      const seedPlots = initialPlotsRef.current;
      let initializedBounds = false;
      if (seedPlots && seedPlots.features.length > 0) {
        const bounds = L.latLngBounds([]);
        for (const f of seedPlots.features) {
          const ring = f.geometry?.coordinates?.[0];
          if (!ring) continue;
          for (const pt of ring) {
            if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
              bounds.extend([pt[1], pt[0]]);
            }
          }
        }
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.08), { animate: false });
          initializedBounds = true;
        }
      }
      if (!initializedBounds) {
        map.setView(MAP_CENTER, 15, { animate: false });
      }
      setZoomLevel(Math.round(map.getZoom() * 10) / 10);

      mapRef.current = map;
      smoothZoom = attachSmoothMapZoom(L, map);
      smoothZoomRef.current = smoothZoom;
      L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);
      const layers = createBaseLayers(L);
      baseLayersRef.current = layers;
      layers.satellite.addTo(map);

      plotGroupRef.current = L.featureGroup().addTo(map);
      dimensionGroupRef.current = L.layerGroup().addTo(map);
      draftGroupRef.current = L.layerGroup().addTo(map);
      compareGroupRef.current = L.layerGroup().addTo(map);

      const refreshActiveOverlay = () => {
        if (keyZoomHoldingRef.current) return;
        const roundedZoom = Math.round(map.getZoom() * 10) / 10;
        setZoomLevel((prev) => (Math.abs(prev - roundedZoom) >= 0.1 ? roundedZoom : prev));
        if (modeRef.current !== "idle" && verticesRef.current.length > 0) {
          redrawDraftRef.current(verticesRef.current);
        } else if (draftRef.current && draftVerticesRef.current.length > 0) {
          redrawDraftRef.current(draftVerticesRef.current, true);
        }
      };

      map.on("zoomend", refreshActiveOverlay);
      map.on("mousemove", (event) => {
        hoverLatLngRef.current = event.latlng;
      });
      map.getContainer().addEventListener("mouseleave", () => {
        hoverLatLngRef.current = null;
      });
      map.on("moveend", () => {
        if (modeRef.current !== "idle" && verticesRef.current.length > 40) {
          redrawDraftRef.current(verticesRef.current);
        }
      });

      map.on("click", (event) => {
        if (drawStyleRef.current === "freehand" && modeRef.current !== "idle") {
          return;
        }
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

      let lastW = mapElementRef.current.clientWidth;
      let lastH = mapElementRef.current.clientHeight;
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (Math.abs(width - lastW) < 2 && Math.abs(height - lastH) < 2) return;
        lastW = width;
        lastH = height;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const activeMap = mapRef.current;
          if (!disposed && activeMap && !activeMap.getContainer().classList.contains("is-map-zooming")) {
            activeMap.invalidateSize({ pan: false, animate: false });
          }
        }, 140);
      });
      resizeObserver.observe(mapElementRef.current);
      setReady(true);
    };

    void init();

    return () => {
      disposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      smoothZoom?.destroy();
      smoothZoomRef.current = null;
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
  }, [setSelectedCode]);

  // Chỉ gắn bộ lắng nghe cảm ứng non-passive khi ĐANG BẬT chế độ vẽ nét cong tự do,
  // giữ cho cử chỉ chụm 2 ngón thu phóng ở chế độ xem chạy thẳng trên luồng GPU không bị chặn.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || mode === "idle" || drawStyle !== "freehand") return;

    const container = map.getContainer();
    let strokeActive = false;
    let strokePoints: Leaflet.LatLng[] = [];
    let lastPx: Leaflet.Point | null = null;
    let startPx: Leaflet.Point | null = null;
    let tempStrokeLine: Leaflet.Polyline | null = null;

    const cancelStroke = () => {
      strokeActive = false;
      strokePoints = [];
      lastPx = null;
      startPx = null;
      if (tempStrokeLine) {
        tempStrokeLine.remove();
        tempStrokeLine = null;
      }
    };

    const getClientPoint = (clientX: number, clientY: number): Leaflet.Point => {
      const rect = container.getBoundingClientRect();
      return L.point(clientX - rect.left, clientY - rect.top);
    };

    const beginStroke = (clientX: number, clientY: number, target: EventTarget | null) => {
      if (modeRef.current === "idle" || drawStyleRef.current !== "freehand") return false;
      const el = target as HTMLElement | null;
      if (el?.closest(".leaflet-marker-icon, .leaflet-control")) return false;
      const group = draftGroupRef.current;
      if (!group) return false;

      const pt = getClientPoint(clientX, clientY);
      const latlng = map.containerPointToLatLng(pt);
      strokeActive = true;
      startPx = pt;
      lastPx = pt;
      strokePoints = [latlng];
      tempStrokeLine = L.polyline([[latlng.lat, latlng.lng]], {
        color: "#fef08a",
        weight: 2.8,
        opacity: 0.96,
        interactive: false,
      }).addTo(group);
      return true;
    };

    const moveStroke = (clientX: number, clientY: number) => {
      if (!strokeActive || !lastPx || !tempStrokeLine) return;
      const pt = getClientPoint(clientX, clientY);
      if (pt.distanceTo(lastPx) < 4) return;
      const latlng = map.containerPointToLatLng(pt);
      const prevLatLng = strokePoints[strokePoints.length - 1];
      if (prevLatLng && wgs84DistanceMeters(prevLatLng.lat, prevLatLng.lng, latlng.lat, latlng.lng) < 0.45) {
        return;
      }
      lastPx = pt;
      strokePoints.push(latlng);
      tempStrokeLine.addLatLng(latlng);
    };

    const finishStroke = (clientX?: number, clientY?: number) => {
      if (!strokeActive) return;
      const rawStroke = [...strokePoints];
      const originPx = startPx;
      const endPx =
        clientX !== undefined && clientY !== undefined ? getClientPoint(clientX, clientY) : lastPx;
      cancelStroke();

      if (rawStroke.length === 0) return;

      if (rawStroke.length < 2 || (originPx && endPx && originPx.distanceTo(endPx) < 6)) {
        addVertexRef.current(rawStroke[0]);
        return;
      }

      let simplified = simplifyTrackPoints(rawStroke, 0.35);
      if (simplified.length < 2) {
        addVertexRef.current(rawStroke[0]);
        return;
      }

      const existing = verticesRef.current;
      pushHistorySnapshot(existing);

      if (modeRef.current === "edit" && existing.length >= 3) {
        const merged = spliceCurveIntoClosedRing(existing, simplified);
        verticesRef.current = merged;
        syncSelectedVertex(null);
        redrawDraftRef.current(merged);
        setPreview(previewFromLatLngs(merged));
        setMessage(null);
        return;
      }

      if (existing.length === 0 && simplified.length >= 5) {
        const firstPx = map.latLngToContainerPoint(simplified[0]);
        const tailPx = map.latLngToContainerPoint(simplified[simplified.length - 1]);
        if (firstPx.distanceTo(tailPx) <= 18) {
          simplified = simplified.slice(0, -1);
        }
      } else if (existing.length > 0) {
        const lastExisting = existing[existing.length - 1];
        if (
          wgs84DistanceMeters(lastExisting.lat, lastExisting.lng, simplified[0].lat, simplified[0].lng) <
          0.8
        ) {
          simplified = simplified.slice(1);
        }
      }

      const combined = cleanLatLngPoints([...existing, ...simplified]);
      verticesRef.current = combined;
      syncSelectedVertex(combined.length > 0 ? combined.length - 1 : null);
      redrawDraftRef.current(combined);
      setPreview(previewFromLatLngs(combined));
      setMessage(null);
    };

    const onMouseDown = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      if (beginStroke(ev.clientX, ev.clientY, ev.target)) {
        ev.preventDefault();
      }
    };
    const onMouseMove = (ev: MouseEvent) => {
      if (!strokeActive) return;
      ev.preventDefault();
      moveStroke(ev.clientX, ev.clientY);
    };
    const onMouseUp = (ev: MouseEvent) => {
      if (!strokeActive) return;
      finishStroke(ev.clientX, ev.clientY);
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length > 1) {
        cancelStroke();
        return;
      }
      const touch = ev.touches[0];
      if (!touch) return;
      if (beginStroke(touch.clientX, touch.clientY, ev.target) && ev.cancelable) {
        ev.preventDefault();
      }
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 1) {
        cancelStroke();
        return;
      }
      if (!strokeActive) return;
      const touch = ev.touches[0];
      if (!touch) return;
      if (ev.cancelable) ev.preventDefault();
      moveStroke(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (ev: TouchEvent) => {
      if (!strokeActive) return;
      const touch = ev.changedTouches[0];
      finishStroke(touch?.clientX, touch?.clientY);
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      cancelStroke();
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [ready, mode, drawStyle, pushHistorySnapshot, syncSelectedVertex]);

  // Phím tắt thao tác nhanh trên máy tính khi đang vẽ / chỉnh sửa thửa đất (F1 phóng to, F2 thu nhỏ, F3 hoàn tác)
  useEffect(() => {
    if (mode === "idle") return;

    const TAP_ZOOM_STEP = 0.45;
    let activeZoomKey: "F1" | "F2" | null = null;
    let holdDelayTimer: number | null = null;
    let holdRafId = 0;
    let holdStartMs = 0;
    let lastFrameMs = 0;
    let lastUiSyncMs = 0;
    let currentHoldZoom = 0;
    let pendingTargetZoom: number | null = null;
    let pendingTargetUntilMs = 0;
    let lastUndoRepeatMs = 0;

    const clampZoom = (z: number, map: Leaflet.Map) => {
      const minZ = map.getMinZoom() || 9;
      const maxZ = map.getMaxZoom() || MAX_MAP_ZOOM;
      return Math.min(maxZ, Math.max(minZ, z));
    };

    const stopKeyZoom = () => {
      if (holdDelayTimer !== null) {
        window.clearTimeout(holdDelayTimer);
        holdDelayTimer = null;
      }
      if (holdRafId) {
        window.cancelAnimationFrame(holdRafId);
        holdRafId = 0;
      }
      const wasHolding = keyZoomHoldingRef.current;
      keyZoomHoldingRef.current = false;
      activeZoomKey = null;

      const map = mapRef.current;
      if (map) {
        map.options.zoomSnap = defaultZoomSnapRef.current;
        if (wasHolding) {
          setZoomLevel(map.getZoom());
          if (modeRef.current !== "idle" && verticesRef.current.length > 0) {
            redrawDraftRef.current(verticesRef.current);
          }
        }
      }
    };

    const startHoldZoomLoop = (key: "F1" | "F2") => {
      const map = mapRef.current;
      if (!map || holdRafId) return;
      const dir = key === "F1" ? 1 : -1;
      smoothZoomRef.current?.cancel();
      (map as unknown as { _stop?: () => void })._stop?.();
      map.options.zoomSnap = 0;
      keyZoomHoldingRef.current = true;
      currentHoldZoom = map.getZoom();
      const now = performance.now();
      holdStartMs = now;
      lastFrameMs = now;
      lastUiSyncMs = now;

      const step = (frameNow: number) => {
        const activeMap = mapRef.current;
        if (!activeMap || activeZoomKey !== key) {
          stopKeyZoom();
          return;
        }
        const dt = Math.min(0.05, Math.max(0, (frameNow - lastFrameMs) / 1000));
        lastFrameMs = frameNow;
        const heldSec = (frameNow - holdStartMs) / 1000;
        // Bắt đầu tốc độ vừa phải (1.75 mức/giây), nhấn giữ lâu tự tăng tốc mượt lên 3.8 mức/giây để phóng sâu nhanh
        const speedPerSec = Math.min(3.8, 1.75 + heldSec * 1.35);
        const nextZoom = clampZoom(currentHoldZoom + dir * speedPerSec * dt, activeMap);
        if (Math.abs(nextZoom - currentHoldZoom) > 0.0001) {
          currentHoldZoom = nextZoom;
          const anchor = hoverLatLngRef.current ?? activeMap.getCenter();
          activeMap.setZoomAround(anchor, currentHoldZoom, { animate: false });
          if (frameNow - lastUiSyncMs >= 90) {
            lastUiSyncMs = frameNow;
            setZoomLevel(currentHoldZoom);
          }
        }
        holdRafId = window.requestAnimationFrame(step);
      };

      holdRafId = window.requestAnimationFrame(step);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (document.querySelector('.modal-overlay, [role="dialog"][aria-modal="true"]')) return;

      // F1: phóng to, F2: thu nhỏ (chặn hành vi mở Trợ giúp mặc định của trình duyệt)
      if ((ev.key === "F1" || ev.key === "F2") && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        ev.preventDefault();
        ev.stopPropagation();
        const map = mapRef.current;
        if (!map) return;

        if (ev.repeat) {
          if (activeZoomKey === ev.key && !holdRafId) {
            if (holdDelayTimer !== null) {
              window.clearTimeout(holdDelayTimer);
              holdDelayTimer = null;
            }
            startHoldZoomLoop(ev.key);
          }
          return;
        }

        if (activeZoomKey && activeZoomKey !== ev.key) {
          stopKeyZoom();
        }
        activeZoomKey = ev.key;
        const dir = ev.key === "F1" ? 1 : -1;
        const now = performance.now();
        const baseZoom =
          pendingTargetZoom !== null && now < pendingTargetUntilMs ? pendingTargetZoom : map.getZoom();
        const nextZoom = clampZoom(baseZoom + dir * TAP_ZOOM_STEP, map);
        pendingTargetZoom = nextZoom;
        pendingTargetUntilMs = now + 260;

        map.options.zoomSnap = 0;
        const anchor = hoverLatLngRef.current ?? map.getCenter();
        map.setZoomAround(anchor, nextZoom, { animate: true });

        if (holdDelayTimer !== null) window.clearTimeout(holdDelayTimer);
        holdDelayTimer = window.setTimeout(() => {
          holdDelayTimer = null;
          if (activeZoomKey === ev.key) {
            startHoldZoomLoop(ev.key);
          }
        }, 165);
        return;
      }

      // F3: hoàn tác đỉnh vừa vẽ / chỉnh sửa (chặn thanh Tìm kiếm F3 mặc định của trình duyệt)
      if (ev.key === "F3" && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        ev.preventDefault();
        ev.stopPropagation();
        if (saving) return;
        const now = performance.now();
        if (ev.repeat && now - lastUndoRepeatMs < 180) return;
        lastUndoRepeatMs = now;
        handleUndo();
        return;
      }

      const target = ev.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        handleRedo();
        return;
      }
      if (ev.key === "Backspace") {
        ev.preventDefault();
        handleUndo();
        return;
      }
      if (ev.key === "Enter" && verticesRef.current.length >= 3 && !saving) {
        ev.preventDefault();
        finishDraftRef.current();
      }
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if ((ev.key === "F1" || ev.key === "F2") && activeZoomKey === ev.key) {
        ev.preventDefault();
        stopKeyZoom();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", stopKeyZoom);
    return () => {
      stopKeyZoom();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", stopKeyZoom);
    };
  }, [mode, saving, handleUndo, handleRedo]);

  // Vẽ mốc đỉnh địa chính và chiều dài cạnh khi phóng sát (Z >= 17) vào thửa đang chọn
  useEffect(() => {
    const L = leafletRef.current;
    const dimGroup = dimensionGroupRef.current;
    if (!ready || !L || !dimGroup) return;

    if (mode !== "idle" || draft || comparison || !selectedFeature || zoomLevel < 17) {
      dimGroup.clearLayers();
      return;
    }

    const timer = window.setTimeout(() => {
      if (!mapRef.current || !dimensionGroupRef.current) return;
      dimensionGroupRef.current.clearLayers();
      renderCadastralDimensions(L, dimensionGroupRef.current, selectedFeature.geometry, isLowEndDevice(), mapRef.current);
    }, 110);

    return () => window.clearTimeout(timer);
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
    editingCode: mode === "edit" ? selectedCode : null,
    drawingActive: mode !== "idle",
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
    changeDrawStyle("point");
    changeMode("draw");
    setMessage(null);
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
    changeDrawStyle("point");
    changeMode("gps");
    setMessage(null);

    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = L.latLng(position.coords.latitude, position.coords.longitude);
        const points = verticesRef.current;
        const last = points[points.length - 1];
        if (!last || wgs84DistanceMeters(last.lat, last.lng, next.lat, next.lng) >= 1.8) {
          pushHistorySnapshot(points);
          verticesRef.current = [...points, next];
          redrawDraftRef.current(verticesRef.current);
          setPreview(previewFromLatLngs(verticesRef.current));
          if (points.length === 0) map?.setView(next, 18.5);
        }
        setGpsAccuracy(Math.round(position.coords.accuracy));
      },
      (error) => {
        setGpsAccuracy(null);
        setMessage({
          tone: "error",
          text:
            error.code === 1
              ? "Cần cấp quyền định vị cho trình duyệt để ghi GPS."
              : "Tín hiệu GPS yếu, bạn có thể chấm trực tiếp các đỉnh trên bản đồ.",
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
    changeDrawStyle("point");
    changeMode("compare");
    setMessage(null);
  };

  const startEditShape = useCallback(
    (targetFeature?: PlotFeature | null, clearForRedraw = false) => {
      if (!canEditShape) return;
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
      setUpdateAreaOnEdit(true);
      changeDrawStyle("point");
      changeMode("edit");

      // Ẩn nền màu đa giác cũ và đóng nhãn giữa thửa để nhìn rõ tán cây sầu riêng trên ảnh vệ tinh khi vẽ lại hoặc sửa
      const targetLayer = plotLayersRef.current.get(feature.properties.code);
      if (targetLayer) {
        targetLayer.setStyle({
          fillOpacity: 0,
          opacity: 0.42,
          weight: 1.5,
          dashArray: "5 5",
        });
        targetLayer.closeTooltip();
      }

      const initialPoints = extractOpenRingLatLngs(L, feature);
      if (map && initialPoints.length > 0) {
        const bounds = L.latLngBounds(initialPoints);
        if (bounds.isValid()) {
          const shouldAnimate = map.getZoom() >= 16.5;
          map.fitBounds(bounds.pad(0.42), {
            maxZoom: baseLayer === "satellite" ? 18.6 : 19.5,
            animate: shouldAnimate,
          });
        }
      }

      if (clearForRedraw) {
        if (initialPoints.length > 0) {
          pushHistorySnapshot(initialPoints);
        }
        verticesRef.current = [];
        redrawDraftRef.current([]);
        setPreview(EMPTY_PREVIEW);
        setMessage({
          tone: "info",
          text: `Đang vẽ lại thửa ${feature.properties.code}${feature.properties.owner ? ` (${feature.properties.owner})` : ""
            }. Chấm từng góc vườn hoặc chọn Vẽ nét cong trên ảnh vệ tinh.`,
        });
      } else {
        verticesRef.current = initialPoints;
        redrawDraftRef.current(initialPoints);
        setPreview(previewFromLatLngs(initialPoints));
        setMessage(null);
      }
    },
    [baseLayer, canEditShape, changeDrawStyle, changeMode, pushHistorySnapshot, resetDraftState, selectedFeature, setSelectedCode],
  );

  const inspectPlotOnMap = useCallback(
    (feature: PlotFeature) => {
      const L = leafletRef.current;
      const map = mapRef.current;
      resetDraftState();
      changeMode("idle");
      setSelectedCode(feature.properties.code);
      setMessage(null);
      if (L && map) {
        const pts = extractOpenRingLatLngs(L, feature);
        if (pts.length > 0) {
          const bounds = L.latLngBounds(pts);
          if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.45), { maxZoom: 19 });
          }
        }
      }
    },
    [changeMode, resetDraftState, setSelectedCode],
  );

  useEffect(() => {
    if (!ready || !plots || plots.features.length === 0) return;
    if (pendingPlotAction) {
      const target = plots.features.find((f) => f.properties.code === pendingPlotAction.code);
      const timer = window.setTimeout(() => {
        if (target) {
          if (pendingPlotAction.action === "redraw" && canEditShape) {
            startEditShape(target, true);
          } else if (pendingPlotAction.action === "edit" && canEditShape) {
            startEditShape(target, false);
          } else {
            inspectPlotOnMap(target);
          }
        }
        onPendingPlotActionHandled?.();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const storedEditCode = consumePendingEditPlotCode();
    const codeToEdit = pendingEditCode || storedEditCode;
    if (!codeToEdit) return;
    const target = plots.features.find((f) => f.properties.code === codeToEdit);
    if (!target) return;
    const timer = window.setTimeout(() => {
      if (canEditShape) {
        startEditShape(target, false);
      } else {
        inspectPlotOnMap(target);
      }
      onPendingEditHandled?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    plots,
    canEditShape,
    pendingPlotAction,
    onPendingPlotActionHandled,
    pendingEditCode,
    onPendingEditHandled,
    startEditShape,
    inspectPlotOnMap,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEditEvent = (event: Event) => {
      const storedEditCode = consumePendingEditPlotCode();
      const code = (event as CustomEvent<string>).detail || storedEditCode;
      if (!code || !plots) return;
      const target = plots.features.find((f) => f.properties.code === code);
      if (target) {
        if (canEditShape) startEditShape(target, false);
        else inspectPlotOnMap(target);
      }
    };
    window.addEventListener(ADMIN_EDIT_PLOT_EVENT, onEditEvent);
    return () => window.removeEventListener(ADMIN_EDIT_PLOT_EVENT, onEditEvent);
  }, [canEditShape, inspectPlotOnMap, plots, startEditShape]);

  const cancelDraft = useCallback(() => {
    resetDraftState();
    changeMode("idle");
    setMessage(null);
  }, [changeMode, resetDraftState]);

  const closePanel = useCallback(() => {
    cancelDraft();
    setSelectedCode(null);
  }, [cancelDraft, setSelectedCode]);

  const zoomIn = () => {
    if (smoothZoomRef.current) smoothZoomRef.current.zoomBy(0.85);
    else mapRef.current?.zoomIn(0.85);
  };
  const zoomOut = () => {
    if (smoothZoomRef.current) smoothZoomRef.current.zoomBy(-0.85);
    else mapRef.current?.zoomOut(0.85);
  };

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
      draftVerticesRef.current = [];
      hasDraftFormInitRef.current = false;
      draftGroupRef.current?.clearLayers();
      setComparison(null);
      compareGroupRef.current?.clearLayers();
      setPreview(EMPTY_PREVIEW);
      changeMode("idle");
      setSelectedCode(data.feature.properties.code);
      setMessage({
        tone: "ok",
        text: data.persisted
          ? "Đã lưu thông tin ranh giới thửa đất."
          : "Đã lưu tạm ranh giới thửa đất trong phiên hiện tại.",
      });
      toast.success(`Đã lưu thửa đất ${data.feature.properties.code}`);
      onChanged?.();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Không lưu được thửa đất.",
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
          ? "Đã lưu kết quả đo đạc thực địa."
          : "Đã lưu tạm kết quả đo đạc trong phiên hiện tại.",
      });
      toast.success("Đã lưu kết quả đo đạc thực địa");
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

    if (file.size > 10 * 1024 * 1024) {
      setMessage({
        tone: "error",
        text: "Tệp GeoJSON không được vượt quá 10 MB.",
      });
      return;
    }

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
        text: `Đã nhập ${data.imported ?? 0} thửa từ ${file.name}${data.persisted ? " thành công." : " (lưu tạm trong phiên hiện tại)."
          }`,
      });
      toast.success(`Đã nhập ${data.imported ?? 0} thửa đất`);
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
  // Khi đang vẽ/sửa (mode !== "idle"), dồn toàn bộ điều khiển vào DrawHint để không mở 2 bảng che khuất bản đồ
  const showPanel = mode === "idle" && Boolean(draft || comparison || (message && !selectedFeature));

  const panelRef = useRef<HTMLElement>(null);
  const panelHeadRef = useRef<HTMLDivElement>(null);

  const handleDismissPanel = useCallback(() => {
    const el = panelRef.current;
    if (el) {
      const closeDuration = animatePopupExit(el, null, "sheet");
      if (closeDuration <= 0) {
        closePanel();
        return;
      }
      window.setTimeout(() => {
        closePanel();
      }, closeDuration);
      return;
    }
    closePanel();
  }, [closePanel]);

  useEffect(() => {
    if (!showPanel || !panelRef.current) return;
    const el = panelRef.current;
    delete el.dataset.closing;
    el.style.removeProperty("animation");
    el.style.removeProperty("transition");
    el.style.removeProperty("transform");
    el.style.removeProperty("opacity");
    el.style.removeProperty("pointer-events");
  }, [showPanel]);

  useSheetSwipe({
    sheetRef: panelRef,
    handleRef: panelHeadRef,
    onDismiss: handleDismissPanel,
    enabled: showPanel,
  });

  const closeSelectedPopup = useCallback(() => {
    setSelectedCode(null);
  }, [setSelectedCode]);

  useBackLayer(Boolean(showPopup && selectedFeature), closeSelectedPopup);
  useBackLayer(Boolean(draft || comparison), handleDismissPanel);
  useBackLayer(mode !== "idle", cancelDraft);

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
    <div
      className={`plotmap-shell ${mode !== "idle" ? "drawing" : ""} ${mode !== "idle" && drawStyle === "freehand" ? "is-freehand" : ""
        }`}
    >
      <div ref={mapElementRef} className="plotmap-canvas" />

      <MapToolbar
        baseLayer={baseLayer}
        mode={mode}
        ready={ready}
        canCompare={Boolean(selectedFeature || comparison)}
        canEditShape={canEditShape && Boolean(selectedFeature)}
        importing={importing}
        onBaseLayerChange={setBaseLayer}
        onDraw={startDraw}
        onGps={startGps}
        onCompare={startCompare}
        onEditShape={canEditShape ? () => startEditShape() : undefined}
        onImport={() => fileInputRef.current?.click()}
      />

      <MapZoomControls
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fitPlots}
        onFocusSelected={selectedFeature && mode === "idle" ? focusSelectedPlot : undefined}
        zoomLevel={ready ? zoomLevel : undefined}
        imageryDateLabel={
          ready && baseLayer === "satellite" ? imageryDateLabel : null
        }
        drawingActive={mode !== "idle"}
      />

      {mode !== "idle" && (
        <DrawHint
          mode={mode}
          plotCode={selectedFeature?.properties.code}
          ownerName={selectedFeature?.properties.owner}
          drawStyle={drawStyle}
          onDrawStyleChange={changeDrawStyle}
          preview={preview}
          declaredAreaHa={selectedFeature?.properties.areaHa}
          updateArea={updateAreaOnEdit}
          onUpdateAreaChange={setUpdateAreaOnEdit}
          gpsAccuracy={gpsAccuracy}
          saving={saving}
          canUndo={historyCounts.undo > 0}
          canRedo={historyCounts.redo > 0}
          selectedVertexIndex={selectedVertexIndex}
          message={message}
          onFinish={finishDraft}
          onCancel={cancelDraft}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDeleteSelectedVertex={handleDeleteSelectedVertex}
          onClearVertices={handleClearVertices}
          onResetOriginal={mode === "edit" ? resetEditOriginal : undefined}
          onFlyToCoord={handleFlyToCoord}
        />
      )}

      {loading && <LoadingToastBridge label="Đang tải dữ liệu thửa…" />}

      {showPanel && (
        <aside ref={panelRef} className="plotmap-panel">
          <div ref={panelHeadRef} className="pt-sheet-topbar">
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
                onResumeEdit={draft.vertexCount >= 3 ? resumeDraftEdit : undefined}
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
          </div>
        </aside>
      )}

      {showPopup && selectedFeature && (
        <PlotPopup
          feature={selectedFeature}
          overlaps={overlaps}
          onCompare={startCompare}
          onEditShape={canEditShape ? () => startEditShape(selectedFeature, false) : undefined}
          onRedrawShape={canEditShape ? () => startEditShape(selectedFeature, true) : undefined}
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
