"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import {
  MapPin,
  ExternalLink,
  QrCode,
  ChevronDown,
  ChevronUp,
  Maximize2,
  TreePine,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import type { PortalPlot } from "@/types/portal";
import { PLOT_STATUS } from "@/lib/portal-labels";
import { Pill } from "./ui";

interface Props {
  plot: PortalPlot;
  householdName: string;
  onClose: () => void;
  onOpenSignboard?: (plot: PortalPlot) => void;
}

type LayerMode = "satellite" | "streets";

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

export default function PlotMapModal({ plot, householdName, onClose, onOpenSignboard }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const streetLayerRef = useRef<Leaflet.Layer | null>(null);
  const satLayerRef = useRef<Leaflet.Layer | null>(null);
  const polygonLayerRef = useRef<Leaflet.GeoJSON | null>(null);

  const [layerMode, setLayerMode] = useState<LayerMode>("satellite");
  const [ready, setReady] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 640) {
      return false; // Trên di động: mặc định thu gọn để toàn bộ bản đồ tràn ngập màn hình
    }
    return true;
  });
  const [mounted] = useState(() => typeof document !== "undefined");

  // Vuốt lên để mở rộng popup, vuốt xuống để thu gọn / tắt popup (Swipe up & down)
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const touchStartRef = useRef<{
    y: number;
    x: number;
    time: number;
    source: "topbar" | "popup";
  } | null>(null);
  const hasDraggedRef = useRef(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Đóng modal êm ái với animation mượt mà (smooth graceful exit)
  const handleRequestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 320);
  }, [isClosing, onClose]);

  const handleTouchStart = (source: "topbar" | "popup") => (e: React.TouchEvent) => {
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
      setIsDragging(true);
      const dampened = deltaY <= 50 ? deltaY : 50 + Math.pow(deltaY - 50, 0.88);
      setDragY(Math.max(0, dampened));
      if (e.cancelable) e.preventDefault();
      return;
    }

    // 2. Kéo lên trên popup (Swipe Up để mở rộng thông tin thửa đất)
    if (source === "popup" && deltaY < -5) {
      hasDraggedRef.current = true;
      setIsDragging(true);
      const absY = Math.abs(deltaY);
      const upwardDampened = infoExpanded
        ? -Math.min(16, Math.pow(absY, 0.72))
        : -Math.min(42, Math.pow(absY, 0.84));
      setDragY(upwardDampened);
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isClosing) return;
    const { y: startY, time: startTime, source } = touchStartRef.current;
    touchStartRef.current = null;
    setIsDragging(false);

    const touch = e.changedTouches[0];
    if (!touch) {
      setDragY(0);
      return;
    }

    const deltaY = touch.clientY - startY;
    const deltaTime = Math.max(1, Date.now() - startTime);
    const velocity = deltaY / deltaTime; // px per ms

    if (source === "popup") {
      // Vuốt lên -> Mở rộng popup thông tin thửa đất
      if (deltaY < -20 || (velocity < -0.15 && deltaY < -10)) {
        setInfoExpanded(true);
        setDragY(0);
        return;
      }

      // Vuốt xuống khi popup đang mở rộng -> Thu gọn popup về thanh đáy
      if (infoExpanded && (deltaY > 36 || (velocity > 0.22 && deltaY > 16))) {
        setInfoExpanded(false);
        setDragY(0);
        return;
      }

      // Vuốt xuống khi popup đang thu gọn -> Đóng bản đồ
      if (!infoExpanded && (deltaY > 55 || (velocity > 0.28 && deltaY > 22))) {
        handleRequestClose();
        return;
      }

      setDragY(0);
      return;
    }

    // Trên thanh topbar: vuốt xuống để tắt bản đồ
    if (deltaY > 65 || (velocity > 0.3 && deltaY > 25)) {
      handleRequestClose();
    } else {
      setDragY(0);
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
        setIsDragging(true);
        const dampened = deltaY <= 50 ? deltaY : 50 + Math.pow(deltaY - 50, 0.88);
        setDragY(Math.max(0, dampened));
      } else if (deltaY < -5) {
        hasDraggedRef.current = true;
        setIsDragging(true);
        const absY = Math.abs(deltaY);
        const upwardDampened = infoExpanded
          ? -Math.min(16, Math.pow(absY, 0.72))
          : -Math.min(42, Math.pow(absY, 0.84));
        setDragY(upwardDampened);
      }
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsDragging(false);

      const deltaY = upEvent.clientY - startY;
      const deltaTime = Math.max(1, Date.now() - startTime);
      const velocity = deltaY / deltaTime;

      // Vuốt lên -> Mở rộng popup
      if (deltaY < -20 || (velocity < -0.15 && deltaY < -10)) {
        setInfoExpanded(true);
        setDragY(0);
        return;
      }

      // Vuốt xuống khi đang mở -> Thu gọn popup
      if (infoExpanded && (deltaY > 36 || (velocity > 0.22 && deltaY > 16))) {
        setInfoExpanded(false);
        setDragY(0);
        return;
      }

      // Vuốt xuống khi đang thu gọn -> Đóng bản đồ
      if (!infoExpanded && (deltaY > 55 || (velocity > 0.28 && deltaY > 22))) {
        handleRequestClose();
        return;
      }

      setDragY(0);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleRequestClose]);

  const lat = plot.lat ?? 12.72245;
  const lng = plot.lng ?? 108.14746;
  const status = PLOT_STATUS[plot.status];

  useEffect(() => {
    if (!mounted) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        const imported = (await import("leaflet")) as unknown as {
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

        const map = L.map(containerRef.current, {
          zoomControl: false, // Tự đặt controls hoặc dùng nút nổi
          attributionControl: false,
          preferCanvas: true,
        }).setView([lat, lng], 17);

        if (disposed) {
          map.remove();
          return;
        }

        mapRef.current = map;

        // 1. Lớp vệ tinh hybrid độ nét cao Esri World Imagery (siêu nét, hiển thị ranh giới & nhãn buôn thôn chuẩn xác, không bị chặn)
        const satBase = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxNativeZoom: 18,
            maxZoom: 20,
            attribution: "Esri, Maxar, Earthstar Geographics",
          },
        );
        const satLabels = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          {
            maxNativeZoom: 18,
            maxZoom: 20,
          },
        );
        const satellite = L.layerGroup([satBase, satLabels]);
        satLayerRef.current = satellite;

        // 2. Lớp bản đồ đường xá Esri World Street Map (rõ tên thôn buôn, đường liên xã Krông Búk).
        //    Dùng cùng máy chủ Esri với lớp vệ tinh để nằm trong danh sách img-src của CSP (next.config.ts).
        //    Esri chỉ có dữ liệu đường xá khu vực Krông Búk đến zoom 17 (zoom 18+ trả ô "Map data not yet available"),
        //    nên giới hạn maxNativeZoom = 17 để Leaflet tự phóng to ảnh zoom 17 khi người dùng zoom sâu hơn.
        const streets = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          {
            maxNativeZoom: 17,
            maxZoom: 20,
            attribution: "Esri, HERE, Garmin, © OpenStreetMap",
          },
        );
        streetLayerRef.current = streets;

        // Mặc định nạp lớp theo layerMode
        if (layerMode === "satellite") {
          satellite.addTo(map);
        } else {
          streets.addTo(map);
        }

        // 3. Vẽ ranh giới thửa đất nếu có
        if (plot.geometryJson) {
          try {
            const geojson = JSON.parse(plot.geometryJson);
            const poly = L.geoJSON(geojson, {
              style: {
                color: "#10b981",
                weight: 3.5,
                opacity: 0.95,
                fillColor: "#059669",
                fillOpacity: 0.28,
              },
            }).addTo(map);
            polygonLayerRef.current = poly;

            poly.bindPopup(`
              <div style="font-family: inherit; font-size: 13px; line-height: 1.5; color: #0f172a; padding: 2px 0;">
                <strong style="font-size: 14px; color: #065f46;">Thửa đất ${escapeHtml(plot.code)}</strong><br/>
                <span>Chủ hộ: <b>${escapeHtml(householdName)}</b></span><br/>
                <span>Diện tích: <b>${escapeHtml(Number(plot.areaHa).toLocaleString("vi-VN", { maximumFractionDigits: 2 }))} ha</b></span><br/>
                <span>Giống: <b>${escapeHtml(plot.variety || "Sầu riêng")}</b></span>
              </div>
            `);

            const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
            map.fitBounds(poly.getBounds(), {
              paddingTopLeft: [isMobile ? 70 : 60, 20],
              paddingBottomRight: [20, isMobile ? 80 : 60],
              maxZoom: 18,
            });
          } catch {
            // Bỏ qua lỗi json
          }
        }

        // 4. Marker định vị tâm thửa đất với radar xung điện
        const pinIcon = L.divIcon({
          className: "pt-mapmodal-pin-wrap",
          html: `
            <div class="pt-mapmodal-radar"></div>
            <div class="pt-mapmodal-pin-core">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#059669" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        L.marker([lat, lng], { icon: pinIcon }).addTo(map).bindPopup(`
          <div style="font-family: inherit; font-size: 13px; color: #0f172a;">
            <strong>Vị trí trung tâm thửa đất ${escapeHtml(plot.code)}</strong><br/>
            Tọa độ: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}
          </div>
        `);

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

        setTimeout(() => {
          if (!disposed && mapRef.current) {
            mapRef.current.invalidateSize({ pan: false });
            setReady(true);
          }
        }, 100);
      } catch (err) {
        console.error("PlotMapModal init error:", err);
        setReady(true);
      }
    };

    void init();

    return () => {
      disposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      ro?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      streetLayerRef.current = null;
      satLayerRef.current = null;
      polygonLayerRef.current = null;
    };
  }, [mounted, lat, lng, plot.code, plot.geometryJson, plot.areaHa, plot.variety, householdName]);

  // Đổi lớp bản đồ mượt mà, chống lặp layer
  const switchLayer = (mode: LayerMode) => {
    if (mode === layerMode) return;
    const map = mapRef.current;
    const street = streetLayerRef.current;
    const sat = satLayerRef.current;
    if (!map || !street || !sat) return;

    if (mode === "satellite") {
      if (map.hasLayer(street)) map.removeLayer(street);
      if (!map.hasLayer(sat)) sat.addTo(map);
    } else {
      if (map.hasLayer(sat)) map.removeLayer(sat);
      if (!map.hasLayer(street)) street.addTo(map);
    }
    setLayerMode(mode);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [infoExpanded]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`pt-mapmodal-fullscreen ${isClosing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Bản đồ thửa đất ${plot.code}`}
      style={{
        opacity: isClosing
          ? 0
          : !infoExpanded && dragY > 0
            ? Math.max(0.45, 1 - dragY / 850)
            : undefined,
        transition: isDragging
          ? "none"
          : isClosing
            ? "opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1)"
            : "opacity 0.28s ease",
      }}
    >
      {/* 1. TOÀN CẢNH BẢN ĐỒ TRÀN VIỀN (100% VIEWPORT) */}
      <div ref={containerRef} className="pt-mapmodal-canvas-fullscreen" />

      {/* Hiệu ứng loading nhẹ khi khởi tạo */}
      {!ready && <div className="pt-mapmodal-loading-curtain" />}

      {/* 2. THANH ĐIỀU HƯỚNG NỔI TRÊN ĐỈNH (TOP BAR) */}
      <div
        className="pt-mapmodal-topbar"
        style={{
          transform: isClosing
            ? "translateY(-24px)"
            : !infoExpanded && dragY > 0
              ? `translateY(${Math.min(dragY * 0.25, 24)}px)`
              : undefined,
          opacity: isClosing
            ? 0
            : !infoExpanded && dragY > 0
              ? Math.max(0.4, 1 - dragY / 260)
              : undefined,
          transition: isDragging
            ? "none"
            : isClosing
              ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease"
              : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease",
        }}
        onTouchStart={handleTouchStart("topbar")}
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
          <div className="pt-mapmodal-layer-pill">
            <button
              type="button"
              className={`pt-mapmodal-pill-btn ${layerMode === "satellite" ? "is-active" : ""}`}
              onClick={() => switchLayer("satellite")}
              title="Chuyển chế độ xem ảnh vệ tinh"
            >
              Vệ tinh
            </button>
            <button
              type="button"
              className={`pt-mapmodal-pill-btn ${layerMode === "streets" ? "is-active" : ""}`}
              onClick={() => switchLayer("streets")}
              title="Chuyển chế độ xem bản đồ giao thông"
            >
              Bản đồ
            </button>
          </div>

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
        className={`pt-mapmodal-floating-popup ${infoExpanded ? "is-expanded" : "is-minimized"} ${isDragging ? "is-dragging" : ""} ${isClosing ? "is-closing" : ""}`}
        style={{
          transform: isClosing
            ? "translateY(115%)"
            : dragY !== 0
              ? `translateY(${dragY}px)`
              : undefined,
          opacity: isClosing
            ? 0
            : !infoExpanded && dragY > 0
              ? Math.max(0.65, 1 - dragY / 650)
              : undefined,
          transition: isDragging
            ? "none"
            : isClosing
              ? "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease"
              : "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease, max-height 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onTouchStart={handleTouchStart("popup")}
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
          <div className="pt-mapmodal-popup-handle" aria-hidden="true" />
          <div className="pt-mapmodal-popup-header-row">
            <div className="pt-mapmodal-popup-header-main">
              <div className="pt-mapmodal-popup-title-line">
                <span className="pt-mapmodal-popup-code">{plot.code}</span>
                {plot.variety && (
                  <span className="pt-mapmodal-popup-variety">{plot.variety}</span>
                )}
                <Pill tone={status.tone}>{status.label}</Pill>
              </div>
              <div className="pt-mapmodal-popup-owner">
                <span>Chủ hộ: <strong>{householdName}</strong></span>
                <span className="pt-mapmodal-popup-dot">·</span>
                <span>{plot.village || "Thôn 1"}, Krông Búk</span>
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
                  <span className="pt-mapmodal-stat-label">Diện tích</span>
                  <strong className="pt-mapmodal-stat-val">
                    {plot.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha
                  </strong>
                  <span className="pt-mapmodal-stat-sub">
                    ({(plot.areaHa * 10000).toLocaleString("vi-VN")} m²)
                  </span>
                </div>

                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Số thửa / Tờ bản đồ</span>
                  <strong className="pt-mapmodal-stat-val">
                    Thửa #{plot.parcel || "—"} · Tờ #{plot.sheet || "—"}
                  </strong>
                  <span className="pt-mapmodal-stat-sub">
                    Nguồn: {SOURCE_LABEL[plot.source]}
                  </span>
                </div>

                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Mã vùng trồng</span>
                  <strong className="pt-mapmodal-stat-val">
                    {plot.zoneCode || "PUC-KRB-001"}
                  </strong>
                  <span className="pt-mapmodal-stat-sub">
                    {plot.plantedYear ? `Trồng năm ${plot.plantedYear}` : "Cây thuần thục"}
                  </span>
                </div>

                <div className="pt-mapmodal-popup-stat">
                  <span className="pt-mapmodal-stat-label">Tọa độ tâm WGS84</span>
                  <strong className="pt-mapmodal-stat-val pt-mapmodal-coords-text">
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                  </strong>
                  <span className="pt-mapmodal-stat-sub">Định vị vệ tinh GPS</span>
                </div>
              </div>

              {/* Các nút tác vụ dưới đáy popup */}
              <div className="pt-mapmodal-popup-actions">
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
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
