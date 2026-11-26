"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "leaflet/dist/leaflet.css";
import "./portal.css";
import type * as Leaflet from "leaflet";
import {
  ExternalLink,
  QrCode,
  ChevronDown,
  ChevronUp,
} from "@/components/ui/PublicIcon";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { renderCadastralDimensions } from "@/components/map/map-helpers";
import {
  attachSmoothMapZoom,
  createCrispCanvasRenderer,
  createGoogleSatelliteLayer,
  createGoogleStreetsLayer,
  createLatestSatelliteLayer,
  fetchSatelliteCaptureInfo,
  MAX_MAP_ZOOM,
  preconnectMapTileOrigins,
  type SmoothMapZoomHandle,
} from "@/components/map/map-layers";
import { isLowEndDevice } from "@/lib/network";
import { attachSmoothSheetSettle } from "@/lib/popup-motion";
import type { PortalPlot } from "@/types/portal";
import { PLOT_STATUS } from "@/lib/portal-labels";
import { useBackLayer } from "@/lib/back-navigation";
import { lockRootScroll } from "@/lib/scroll-lock";

interface Props {
  plot: PortalPlot;
  householdName: string;
  householdVillageName?: string | null;
  householdCommuneLocation?: string | null;
  onClose: () => void;
  onOpenSignboard?: (plot: PortalPlot) => void;
  chinaSafe?: boolean;
}

function resolvePlotLocationText(
  plot: PortalPlot,
  householdVillageName?: string | null,
  householdCommuneLocation?: string | null,
): string {
  const v = (plot.village ?? householdVillageName ?? "").trim();
  const z = (plot.zoneCode ?? plot.code ?? "").trim();
  const fallbackCommune =
    /ea\s*kh[aă]l|ea\s*k'?s[oô]/i.test(v) || /^66-PUC-SR0001-/i.test(z)
      ? "Xã Ea Khăl, Tỉnh Đắk Lắk"
      : "Xã Krông Búk, Tỉnh Đắk Lắk";
  const c =
    (plot.communeLocation ?? "").trim() ||
    (!plot.village && householdCommuneLocation ? householdCommuneLocation.trim() : "") ||
    fallbackCommune;
  if (v && c) {
    const vNorm = v.toLowerCase();
    const cNorm = c.toLowerCase();
    const cFirst = cNorm.split(",")[0]?.trim() ?? "";
    if (cNorm.startsWith(vNorm) || vNorm === cFirst) return c;
    if (vNorm.includes(cNorm)) return v;
    return [v, c].join(", ");
  }
  return [v, c].filter(Boolean).join(", ") || "Chưa cập nhật";
}

type LayerMode = "satellite" | "satellite-google" | "streets";

let leafletModulePromise: Promise<typeof import("leaflet")> | null = null;
function loadLeaflet() {
  if (!leafletModulePromise) {
    leafletModulePromise = import("leaflet");
  }
  return leafletModulePromise;
}

const SOURCE_LABEL = {
  declared: "Tự khai báo",
  measured: "Đo thực địa",
  cadastral: "Địa chính",
  demo: "Mẫu",
} as const;

/** Thoát ký tự HTML trước khi chèn dữ liệu (mã thửa, tên hộ, giống…) vào nội dung popup Leaflet (chống XSS). */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function PlotMapModal({
  plot,
  householdName,
  householdVillageName,
  householdCommuneLocation,
  onClose,
  onOpenSignboard,
  chinaSafe = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const streetLayerRef = useRef<Leaflet.Layer | null>(null);
  const satLayerRef = useRef<Leaflet.Layer | null>(null);
  const satGoogleLayerRef = useRef<Leaflet.Layer | null>(null);
  const layerCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polygonLayerRef = useRef<Leaflet.GeoJSON | null>(null);

  const [layerMode, setLayerMode] = useState<LayerMode>("satellite");
  const layerModeRef = useRef<LayerMode>("satellite");
  const [imageryDateLabel, setImageryDateLabel] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 640) {
      return false; // Trên di động: mặc định thu gọn để toàn bộ bản đồ tràn ngập màn hình
    }
    return true;
  });
  const [mounted] = useState(() => typeof document !== "undefined");

  // Vuốt lên để mở rộng popup, vuốt xuống để thu gọn / tắt popup (cập nhật trực tiếp trên DOM qua rAF, không setState mỗi frame)
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const touchStartRef = useRef<{
    y: number;
    x: number;
    time: number;
    source: "topbar" | "popup";
  } | null>(null);
  const hasDraggedRef = useRef(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingDragYRef = useRef(0);

  useEffect(() => attachSmoothSheetSettle(popupRef.current, null, isClosingRef), []);

  const flushDragDom = useCallback(
    (y: number, dragging: boolean) => {
      const popup = popupRef.current;
      const topbar = topbarRef.current;
      if (popup) {
        popup.classList.toggle("is-dragging", dragging);
        popup.style.transform = y !== 0 ? `translate3d(0, ${y}px, 0)` : "";
      }
      if (topbar) {
        topbar.style.transition = dragging ? "none" : "";
        topbar.style.transform =
          !infoExpanded && y > 0 ? `translate3d(0, ${Math.min(y * 0.25, 24)}px, 0)` : "";
      }
    },
    [infoExpanded],
  );

  const scheduleDragDom = useCallback(
    (y: number) => {
      pendingDragYRef.current = y;
      if (dragRafRef.current !== null) return;
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
        flushDragDom(pendingDragYRef.current, true);
      });
    },
    [flushDragDom],
  );

  const resetDragDom = useCallback(() => {
    if (dragRafRef.current !== null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    pendingDragYRef.current = 0;
    flushDragDom(0, false);
  }, [flushDragDom]);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  // Đóng modal êm ái với animation thu gọn đồng bộ (300ms)
  const handleRequestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    if (dragRafRef.current !== null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const popupEl = popupRef.current;
    if (popupEl) {
      popupEl.classList.remove("is-dragging");
      popupEl.dataset.animating = "true";
      popupEl.style.willChange = "transform";
      popupEl.style.setProperty("animation", "none", "important");
    }
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  const startTouch = (source: "topbar" | "popup", e: React.TouchEvent) => {
    if (isClosing) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = {
      y: touch.clientY,
      x: touch.clientX,
      time: Date.now(),
      source,
    };
    hasDraggedRef.current = false;
  };
  const handleTopbarTouchStart = (e: React.TouchEvent) => startTouch("topbar", e);
  const handlePopupTouchStart = (e: React.TouchEvent) => startTouch("popup", e);

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isClosing) return;
    const touch = e.touches[0];
    if (!touch) return;

    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const { source } = touchStartRef.current;

    if (Math.abs(deltaY) <= Math.abs(deltaX)) return;

    // 1. Kéo xuống (Swipe Down)
    if (deltaY > 5) {
      if (source === "popup" && popupRef.current && popupRef.current.scrollTop > 0) {
        return;
      }
      hasDraggedRef.current = true;
      const dampened = deltaY <= 50 ? deltaY : 50 + Math.pow(deltaY - 50, 0.88);
      scheduleDragDom(Math.max(0, dampened));
      if (e.cancelable) e.preventDefault();
      return;
    }

    // 2. Kéo lên trên popup (Swipe Up để mở rộng thông tin thửa đất)
    if (source === "popup" && deltaY < -5) {
      hasDraggedRef.current = true;
      const absY = Math.abs(deltaY);
      const upwardDampened = infoExpanded
        ? -Math.min(16, Math.pow(absY, 0.72))
        : -Math.min(42, Math.pow(absY, 0.84));
      scheduleDragDom(upwardDampened);
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isClosing) return;
    const { y: startY, time: startTime, source } = touchStartRef.current;
    touchStartRef.current = null;

    const touch = e.changedTouches[0];
    if (!touch) {
      resetDragDom();
      return;
    }

    const deltaY = touch.clientY - startY;
    const deltaTime = Math.max(1, Date.now() - startTime);
    const velocity = deltaY / deltaTime; // px per ms

    if (source === "popup") {
      // Vuốt lên -> Mở rộng popup thông tin thửa đất
      if (deltaY < -20 || (velocity < -0.15 && deltaY < -10)) {
        resetDragDom();
        setInfoExpanded(true);
        return;
      }

      // Vuốt xuống khi popup đang mở rộng -> Thu gọn popup về thanh đáy
      if (infoExpanded && (deltaY > 36 || (velocity > 0.22 && deltaY > 16))) {
        resetDragDom();
        setInfoExpanded(false);
        return;
      }

      // Vuốt xuống khi popup đang thu gọn -> Đóng bản đồ
      if (!infoExpanded && (deltaY > 55 || (velocity > 0.28 && deltaY > 22))) {
        handleRequestClose();
        return;
      }

      resetDragDom();
      return;
    }

    // Trên thanh topbar: vuốt xuống để tắt bản đồ
    if (deltaY > 65 || (velocity > 0.3 && deltaY > 25)) {
      handleRequestClose();
    } else {
      resetDragDom();
    }
  };

  // Kéo chuột trên Desktop / giả lập Mobile đối với thanh handle & popup
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isClosing) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a")) return;

    const startY = e.clientY;
    const startX = e.clientX;
    const startTime = Date.now();
    hasDraggedRef.current = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaX = moveEvent.clientX - startX;
      if (Math.abs(deltaY) <= Math.abs(deltaX)) return;

      if (deltaY > 5) {
        hasDraggedRef.current = true;
        const dampened = deltaY <= 50 ? deltaY : 50 + Math.pow(deltaY - 50, 0.88);
        scheduleDragDom(Math.max(0, dampened));
      } else if (deltaY < -5) {
        hasDraggedRef.current = true;
        const absY = Math.abs(deltaY);
        const upwardDampened = infoExpanded
          ? -Math.min(16, Math.pow(absY, 0.72))
          : -Math.min(42, Math.pow(absY, 0.84));
        scheduleDragDom(upwardDampened);
      }
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const deltaY = upEvent.clientY - startY;
      const deltaTime = Math.max(1, Date.now() - startTime);
      const velocity = deltaY / deltaTime;

      // Vuốt lên -> Mở rộng popup
      if (deltaY < -20 || (velocity < -0.15 && deltaY < -10)) {
        resetDragDom();
        setInfoExpanded(true);
        return;
      }

      // Vuốt xuống khi đang mở -> Thu gọn popup
      if (infoExpanded && (deltaY > 36 || (velocity > 0.22 && deltaY > 16))) {
        resetDragDom();
        setInfoExpanded(false);
        return;
      }

      // Vuốt xuống khi đang thu gọn -> Đóng bản đồ
      if (!infoExpanded && (deltaY > 55 || (velocity > 0.28 && deltaY > 22))) {
        handleRequestClose();
        return;
      }

      resetDragDom();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  useBackLayer(true, handleRequestClose);

  useEffect(() => {
    const unlockScroll = lockRootScroll();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      unlockScroll();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleRequestClose]);

  const lat = plot.lat ?? 13.125;
  const lng = plot.lng ?? 108.185;
  const status = PLOT_STATUS[plot.status] ?? PLOT_STATUS.pending;

  useEffect(() => {
    if (!mounted) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let dimTimer: ReturnType<typeof setTimeout> | null = null;
    let readyRaf: number | null = null;
    let smoothZoom: SmoothMapZoomHandle | null = null;

    preconnectMapTileOrigins({ chinaSafe });
    void fetchSatelliteCaptureInfo(lat, lng).then((info) => {
      if (!disposed && info?.dateLabel) {
        setImageryDateLabel(info.dateLabel);
      }
    });

    const init = async () => {
      try {
        const imported = (await loadLeaflet()) as unknown as {
          default?: typeof import("leaflet");
        };
        const L = imported.default ?? (imported as unknown as typeof import("leaflet"));
        if (disposed || !containerRef.current) return;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const leafletContainer = containerRef.current as HTMLElement & { _leaflet_id?: number };
        if (leafletContainer && leafletContainer._leaflet_id) {
          delete leafletContainer._leaflet_id;
        }

        const lowEnd = isLowEndDevice();

        let parsedGeojson: unknown = null;
        let prebuiltPoly: Leaflet.GeoJSON | null = null;
        if (plot.geometryJson) {
          try {
            parsedGeojson = JSON.parse(plot.geometryJson);
            prebuiltPoly = L.geoJSON(parsedGeojson as import("geojson").GeoJsonObject, {
              style: {
                color: "#10b981",
                weight: 3.5,
                opacity: 0.95,
                fillColor: "#059669",
                fillOpacity: 0.22,
              },
            });
          } catch {
            parsedGeojson = null;
            prebuiltPoly = null;
          }
        }

        const map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          minZoom: 10,
          maxZoom: MAX_MAP_ZOOM,
          zoomSnap: 0,
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
        });

        // Chốt khung nhìn ban đầu một lần duy nhất TRƯỚC KHI gắn lớp mảnh vệ tinh để không tải rồi hủy mảnh thừa
        const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
        const polyBounds = prebuiltPoly?.getBounds();
        if (polyBounds && polyBounds.isValid()) {
          map.fitBounds(polyBounds, {
            paddingTopLeft: [isMobile ? 70 : 60, 20],
            paddingBottomRight: [20, isMobile ? 80 : 60],
            maxZoom: 18,
            animate: false,
          });
        } else {
          map.setView([lat, lng], 17.5, { animate: false });
        }

        if (disposed) {
          map.remove();
          return;
        }

        mapRef.current = map;
        smoothZoom = attachSmoothMapZoom(L, map);
        L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);

        // 1. Lớp vệ tinh mới nhất (Esri Maxar Vivid cập nhật mới nhất; ở chế độ chinaSafe chỉ nạp ảnh vệ tinh thực tế không phụ thuộc Google)
        const satellite = createLatestSatelliteLayer(L, lowEnd, MAX_MAP_ZOOM, undefined, { chinaSafe });
        satLayerRef.current = satellite;

        if (chinaSafe) {
          satGoogleLayerRef.current = null;
          streetLayerRef.current = null;
          satellite.addTo(map);
        } else {
          const satelliteGoogle = createGoogleSatelliteLayer(L, lowEnd, MAX_MAP_ZOOM);
          satGoogleLayerRef.current = satelliteGoogle;

          const streets = createGoogleStreetsLayer(L, lowEnd, MAX_MAP_ZOOM);
          streetLayerRef.current = streets;

          if (layerModeRef.current === "satellite") {
            satellite.addTo(map);
          } else if (layerModeRef.current === "satellite-google") {
            satelliteGoogle.addTo(map);
          } else {
            streets.addTo(map);
          }
        }

        const dimensionGroup = L.layerGroup().addTo(map);

        // 4. Vẽ ranh giới thửa đất kèm mốc đỉnh địa chính & chiều dài từng cạnh (mét) khi phóng sát
        if (prebuiltPoly && parsedGeojson) {
          const poly = prebuiltPoly.addTo(map);
          polygonLayerRef.current = poly;

          poly.bindPopup(
            `
              <div class="pt-leaflet-card pt-leaflet-card-poly">
                <div class="pt-leaflet-card-head">Thửa đất ${escapeHtml(plot.code)}</div>
                <div class="pt-leaflet-card-rows">
                  <div class="pt-leaflet-card-row"><span>Chủ hộ</span><strong>${escapeHtml(householdName)}</strong></div>
                  <div class="pt-leaflet-card-row"><span>Diện tích</span><strong>${escapeHtml(Number(plot.areaHa).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 4 }))} ha</strong></div>
                  <div class="pt-leaflet-card-row"><span>Giống</span><strong>${escapeHtml(plot.variety || "Chưa cập nhật")}</strong></div>
                </div>
              </div>
            `,
            { className: "pt-balanced-popup", maxWidth: 280 },
          );

          const syncDimensions = () => {
            if (disposed) return;
            const z = map.getZoom();
            poly.setStyle({
              fillOpacity: z >= 18 ? 0.14 : 0.24,
              weight: z >= 18 ? 3.8 : 3.2,
            });
            if (z >= 17) {
              renderCadastralDimensions(
                L,
                dimensionGroup,
                parsedGeojson as import("geojson").GeoJsonObject,
                lowEnd,
                map,
              );
            } else {
              dimensionGroup.clearLayers();
            }
          };

          const scheduleDimensions = () => {
            if (dimTimer) clearTimeout(dimTimer);
            dimTimer = setTimeout(() => {
              dimTimer = null;
              syncDimensions();
            }, 110);
          };
          const cancelDimensions = () => {
            if (dimTimer) {
              clearTimeout(dimTimer);
              dimTimer = null;
            }
          };

          syncDimensions();
          map.on("zoomstart", cancelDimensions);
          map.on("zoomend", scheduleDimensions);
        }

        // 4. Marker định vị tâm thửa đất với radar xung điện
        const pinIcon = L.divIcon({
          className: "pt-mapmodal-pin-wrap",
          html: `
            <div class="pt-mapmodal-radar"></div>
            <div class="pt-mapmodal-pin-core">
              <span class="pt-mapmodal-pin-icon" aria-hidden="true"></span>
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        L.marker([lat, lng], { icon: pinIcon }).addTo(map).bindPopup(
          `
          <div class="pt-leaflet-card pt-leaflet-card-pin">
            <strong class="pt-leaflet-pin-title">Vị trí trung tâm thửa đất ${escapeHtml(plot.code)}</strong>
            <span class="pt-leaflet-pin-coords">Tọa độ: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}</span>
          </div>
        `,
          { className: "pt-balanced-popup", offset: [0, -6], maxWidth: 320 },
        );

        // Giữ map responsive an toàn, tránh vòng lặp resize gây giật lag
        let lastW = 0;
        let lastH = 0;

        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const { width, height } = entry.contentRect;
              if (Math.abs(width - lastW) > 6 || Math.abs(height - lastH) > 6) {
                lastW = width;
                lastH = height;
                if (resizeTimer) clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                  if (!disposed && mapRef.current) {
                    mapRef.current.invalidateSize({ pan: false });
                  }
                }, 120);
              }
            }
          });
          ro.observe(containerRef.current);
        }

        readyRaf = window.requestAnimationFrame(() => {
          readyRaf = null;
          if (!disposed && mapRef.current) {
            mapRef.current.invalidateSize({ pan: false });
            setReady(true);
          }
        });
      } catch (err) {
        console.error("PlotMapModal init error:", err);
        setReady(true);
      }
    };

    void init();

    return () => {
      disposed = true;
      if (readyRaf !== null) window.cancelAnimationFrame(readyRaf);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (dimTimer) clearTimeout(dimTimer);
      if (layerCleanupTimerRef.current) clearTimeout(layerCleanupTimerRef.current);
      smoothZoom?.destroy();
      ro?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      streetLayerRef.current = null;
      satLayerRef.current = null;
      satGoogleLayerRef.current = null;
      polygonLayerRef.current = null;
    };
  }, [mounted, lat, lng, plot.code, plot.geometryJson, plot.areaHa, plot.variety, householdName, chinaSafe]);

  // Đổi lớp bản đồ mượt mà: gắn lớp mới trước rồi mới gỡ lớp cũ sau 180ms để không chớp nền tối
  const switchLayer = (mode: LayerMode) => {
    if (mode === layerMode) return;
    const map = mapRef.current;
    const street = streetLayerRef.current;
    const sat = satLayerRef.current;
    const satGoogle = satGoogleLayerRef.current;
    if (!map || !street || !sat || !satGoogle) return;

    const target =
      mode === "satellite" ? sat : mode === "satellite-google" ? satGoogle : street;
    if (!map.hasLayer(target)) {
      target.addTo(map);
    }

    if (layerCleanupTimerRef.current) {
      clearTimeout(layerCleanupTimerRef.current);
    }
    layerCleanupTimerRef.current = setTimeout(() => {
      layerCleanupTimerRef.current = null;
      if (!mapRef.current) return;
      const candidates: Array<[LayerMode, Leaflet.Layer]> = [
        ["satellite", sat],
        ["satellite-google", satGoogle],
        ["streets", street],
      ];
      for (const [key, layer] of candidates) {
        if (key !== mode && map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      }
    }, 180);

    if (mode === "satellite" || mode === "satellite-google") {
      if (map.getZoom() < 17) {
        if (polygonLayerRef.current) {
          const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
          map.fitBounds(polygonLayerRef.current.getBounds(), {
            paddingTopLeft: [isMobile ? 70 : 60, 20],
            paddingBottomRight: [20, isMobile ? 80 : 60],
            maxZoom: mode === "satellite-google" ? 19 : 18,
          });
        } else {
          map.setZoom(18);
        }
      }
    } else if (map.getZoom() > 16) {
      map.setView([lat, lng], 16, { animate: true });
    }
    layerModeRef.current = mode;
    setLayerMode(mode);
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`pt-mapmodal-fullscreen ${isClosing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Bản đồ thửa đất ${plot.code}`}
      style={{
        opacity: isClosing ? 0 : undefined,
        transition: isClosing ? "opacity 285ms ease-out" : undefined,
      }}
    >
      {/* 1. TOÀN CẢNH BẢN ĐỒ TRÀN VIỀN (100% VIEWPORT) */}
      <div ref={containerRef} className="pt-mapmodal-canvas-fullscreen" />

      {/* Hiệu ứng loading nhẹ khi khởi tạo */}
      {!ready && <div className="pt-mapmodal-loading-curtain" />}

      {/* 2. THANH ĐIỀU HƯỚNG NỔI TRÊN ĐỈNH (TOP BAR) */}
      <div
        ref={topbarRef}
        className="pt-mapmodal-topbar"
        style={{
          transform: isClosing ? "translateY(-24px)" : undefined,
          opacity: isClosing ? 0 : undefined,
          transition: "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease",
        }}
        onTouchStart={handleTopbarTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Huy hiệu mã thửa nổi bật góc trái */}
        <div className="pt-mapmodal-top-tag">
          <strong className="pt-mapmodal-top-code">{plot.code}</strong>
          <span className="pt-mapmodal-top-sub">{householdName}</span>
        </div>

        {/* Cụm công cụ điều khiển nổi góc phải */}
        <div className="pt-mapmodal-top-actions">
          {!chinaSafe && (
            <div className="pt-mapmodal-layer-pill">
              <button
                type="button"
                className={`pt-mapmodal-pill-btn ${layerMode === "satellite" ? "is-active" : ""}`}
                onClick={() => switchLayer("satellite")}
                title="Ảnh vệ tinh Maxar Vivid cập nhật mới nhất"
              >
                Vệ tinh mới
              </button>
              <button
                type="button"
                className={`pt-mapmodal-pill-btn ${layerMode === "satellite-google" ? "is-active" : ""}`}
                onClick={() => switchLayer("satellite-google")}
                title="Ảnh vệ tinh Google hỗ trợ phóng sâu tới Z22"
              >
                Google HD
              </button>
              <button
                type="button"
                className={`pt-mapmodal-pill-btn ${layerMode === "streets" ? "is-active" : ""}`}
                onClick={() => switchLayer("streets")}
                title="Chuyển chế độ xem bản đồ giao thông chi tiết"
              >
                Bản đồ
              </button>
            </div>
          )}

          <button
            type="button"
            className="pt-mapmodal-close-round-btn"
            onClick={handleRequestClose}
            title="Đóng bản đồ (Esc)"
            aria-label="Đóng bản đồ toàn cảnh"
          >
            <CloseCircleIcon size={30} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* 3. POPUP NỔI HIỂN THỊ THÔNG TIN THỬA ĐẤT CỦA HỘ ĐÓ */}
      <div
        ref={popupRef}
        className={`pt-mapmodal-floating-popup ${infoExpanded ? "is-expanded" : "is-minimized"} ${isClosing ? "is-closing" : ""}`}
        onTouchStart={handlePopupTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Đầu popup: Thanh kéo handle + Tiêu đề + Nút thu gọn / mở rộng */}
        <div
          className="pt-mapmodal-popup-header"
          onClick={() => {
            if (hasDraggedRef.current) return;
            setInfoExpanded((prev) => !prev);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setInfoExpanded((prev) => !prev);
            }
          }}
          title={
            infoExpanded
              ? "Vuốt xuống hoặc bấm để thu gọn thông tin"
              : "Vuốt lên để mở rộng hoặc vuốt xuống để tắt"
          }
        >
          <div className="pt-mapmodal-popup-header-row">
            <div className="pt-mapmodal-popup-header-main">
              <div className="pt-mapmodal-popup-title-line">
                <span className="pt-mapmodal-popup-code">{householdName}</span>
              </div>
              <div className="pt-mapmodal-popup-owner">
                <span>
                  {resolvePlotLocationText(plot, householdVillageName, householdCommuneLocation)}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="pt-mapmodal-popup-toggle-btn"
              aria-label={infoExpanded ? "Thu gọn thông tin" : "Mở rộng thông tin"}
              onClick={(e) => {
                e.stopPropagation();
                setInfoExpanded((prev) => !prev);
              }}
            >
              {infoExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
        </div>

        {/* Nội dung chi tiết popup (trượt mở/đóng mượt mà khi vuốt lên/xuống) */}
        <div
          className={`pt-mapmodal-popup-body-wrap ${infoExpanded ? "is-expanded" : ""}`}
          aria-hidden={!infoExpanded}
        >
          <div className="pt-mapmodal-popup-body-inner">
            <div className="pt-mapmodal-popup-body">
              <div className="pt-mapmodal-popup-grid">
                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Trạng thái</span>
                  <div className="pt-mapmodal-stat-right">
                    <strong className={`pt-mapmodal-stat-val is-tone-${status.tone}`}>
                      {status.label}
                    </strong>
                  </div>
                </div>

                {plot.variety && (
                  <div className="pt-mapmodal-popup-stat">
                    <span className="pt-mapmodal-stat-label">Giống cây</span>
                    <div className="pt-mapmodal-stat-right">
                      <strong className="pt-mapmodal-stat-val">{plot.variety}</strong>
                    </div>
                  </div>
                )}

                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Diện tích</span>
                  <div className="pt-mapmodal-stat-right">
                    <strong className="pt-mapmodal-stat-val">
                      {(plot.areaHa ?? 0).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ha
                    </strong>
                    <span className="pt-mapmodal-stat-sub">
                      ({((plot.areaHa ?? 0) * 10000).toLocaleString("vi-VN")} m²)
                    </span>
                  </div>
                </div>

                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Số thửa / Tờ bản đồ</span>
                  <div className="pt-mapmodal-stat-right">
                    <strong className="pt-mapmodal-stat-val">
                      Thửa #{plot.parcel || "-"} - Tờ #{plot.sheet || "-"}
                    </strong>
                    <span className="pt-mapmodal-stat-sub">
                      Nguồn: {SOURCE_LABEL[plot.source] ?? "Khảo sát thực địa"}
                    </span>
                  </div>
                </div>

                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Mã vùng trồng</span>
                  <div className="pt-mapmodal-stat-right">
                    <strong className="pt-mapmodal-stat-val">
                      {plot.zoneCode || "Chưa có mã vùng"}
                    </strong>
                    <span className="pt-mapmodal-stat-sub">
                      {plot.plantedYear ? `Trồng năm ${plot.plantedYear}` : "Năm trồng: Chưa cập nhật"}
                    </span>
                  </div>
                </div>

                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Tọa độ tâm WGS84</span>
                  <div className="pt-mapmodal-stat-right">
                    <strong className="pt-mapmodal-stat-val pt-mapmodal-coords-text">
                      {`${lat.toFixed(7).replace(/0+$/, "").replace(/\.(\d{0,4})$/, (_, d: string) => `.${d.padEnd(5, "0")}`)}, ${lng.toFixed(7).replace(/0+$/, "").replace(/\.(\d{0,4})$/, (_, d: string) => `.${d.padEnd(5, "0")}`)}`}
                    </strong>
                    <span className="pt-mapmodal-stat-sub">
                      {imageryDateLabel && layerMode === "satellite"
                        ? `Ảnh vệ tinh chụp ${imageryDateLabel}`
                        : "Định vị vệ tinh GPS"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Các nút tác vụ dưới đáy popup */}
              {(!chinaSafe || onOpenSignboard) && (
                <div className="pt-mapmodal-popup-actions">
                  {!chinaSafe && (
                    <a
                      href={`https://www.google.com/maps?q=${lat},${lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pt-mapmodal-popup-action-btn pt-mapmodal-action-gmaps"
                      title="Mở ứng dụng Google Maps để nhận chỉ đường tới tận thửa đất"
                    >
                      <ExternalLink size={15} strokeWidth={2.2} />
                      <span>Chỉ đường Google Maps</span>
                    </a>
                  )}

                  {onOpenSignboard && (
                    <button
                      type="button"
                      className="pt-mapmodal-popup-action-btn pt-mapmodal-action-qr"
                      onClick={() => onOpenSignboard(plot)}
                      title="Xem và in biển cắm vườn"
                    >
                      <QrCode size={15} strokeWidth={2.2} />
                      <span>Biển cắm vườn</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
