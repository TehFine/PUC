"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import {
  X,
  MapPin,
  ExternalLink,
  RotateCcw,
  QrCode,
  ChevronDown,
  ChevronUp,
  Maximize2,
  TreePine,
  ShieldCheck,
  Layers,
} from "lucide-react";
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

export default function PlotMapModal({ plot, householdName, onClose, onOpenSignboard }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const streetLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const satLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const polygonLayerRef = useRef<Leaflet.GeoJSON | null>(null);

  const [layerMode, setLayerMode] = useState<LayerMode>("satellite");
  const [ready, setReady] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(true);

  const lat = plot.lat ?? 12.72245;
  const lng = plot.lng ?? 108.14746;
  const status = PLOT_STATUS[plot.status];

  useEffect(() => {
    let disposed = false;

    const init = async () => {
      const imported = (await import("leaflet")) as unknown as {
        default?: typeof import("leaflet");
      };
      const L = imported.default ?? (imported as unknown as typeof import("leaflet"));
      if (disposed || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: false, // Tự đặt controls hoặc dùng nút nổi
        attributionControl: false,
        preferCanvas: true,
      }).setView([lat, lng], 17);

      mapRef.current = map;

      // 1. Lớp đường phố Carto Voyager
      const streets = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, subdomains: "abcd" },
      );
      streetLayerRef.current = streets;

      // 2. Lớp vệ tinh Esri World Imagery
      const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 18, maxZoom: 20 },
      );
      satLayerRef.current = satellite;

      // Mặc định vệ tinh tràn viền nhìn rõ từng cây sầu riêng
      satellite.addTo(map);

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
              <strong style="font-size: 14px; color: #065f46;">Thửa đất ${plot.code}</strong><br/>
              <span>Chủ hộ: <b>${householdName}</b></span><br/>
              <span>Diện tích: <b>${plot.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha</b></span><br/>
              <span>Giống: <b>${plot.variety || "Sầu riêng"}</b></span>
            </div>
          `);

          map.fitBounds(poly.getBounds(), { padding: [60, 60], maxZoom: 18 });
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
          <strong>Vị trí trung tâm thửa đất ${plot.code}</strong><br/>
          Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}
        </div>
      `);

      setTimeout(() => {
        if (!disposed && map) {
          map.invalidateSize();
          setReady(true);
        }
      }, 150);
    };

    void init();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", handleKeyDown);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng, plot, householdName, onClose]);

  // Đổi lớp bản đồ
  const switchLayer = (mode: LayerMode) => {
    if (!mapRef.current || !streetLayerRef.current || !satLayerRef.current) return;
    if (mode === "satellite") {
      mapRef.current.removeLayer(streetLayerRef.current);
      satLayerRef.current.addTo(mapRef.current);
    } else {
      mapRef.current.removeLayer(satLayerRef.current);
      streetLayerRef.current.addTo(mapRef.current);
    }
    setLayerMode(mode);
  };

  // Căn giữa lại thửa đất
  const resetBounds = () => {
    if (!mapRef.current) return;
    if (polygonLayerRef.current) {
      mapRef.current.fitBounds(polygonLayerRef.current.getBounds(), { padding: [60, 60], maxZoom: 18 });
    } else {
      mapRef.current.setView([lat, lng], 17);
    }
  };

  return (
    <div className="pt-mapmodal-fullscreen" role="dialog" aria-modal="true" aria-label={`Bản đồ thửa đất ${plot.code}`}>
      {/* 1. TOÀN CẢNH BẢN ĐỒ TRÀN VIỀN (100% VIEWPORT) */}
      <div ref={containerRef} className="pt-mapmodal-canvas-fullscreen" />

      {/* Hiệu ứng loading nhẹ khi khởi tạo */}
      {!ready && <div className="pt-mapmodal-loading-curtain" />}

      {/* 2. THANH ĐIỀU HƯỚNG NỔI TRÊN ĐỈNH (TOP BAR) */}
      <div className="pt-mapmodal-topbar">
        {/* Huy hiệu mã thửa nổi bật góc trái */}
        <div className="pt-mapmodal-top-tag">
          <strong className="pt-mapmodal-top-code">#{plot.code}</strong>
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
            className="pt-mapmodal-round-btn"
            onClick={resetBounds}
            title="Căn giữa lại thửa đất"
            aria-label="Căn giữa lại thửa đất"
          >
            <RotateCcw size={16} />
          </button>

          <button
            type="button"
            className="pt-mapmodal-close-round-btn"
            onClick={onClose}
            title="Đóng bản đồ (Esc)"
            aria-label="Đóng bản đồ toàn cảnh"
          >
            <X size={20} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* 3. POPUP NỔI HIỂN THỊ THÔNG TIN THỬA ĐẤT CỦA HỘ ĐÓ */}
      <div className={`pt-mapmodal-floating-popup ${infoExpanded ? "is-expanded" : "is-minimized"}`}>
        {/* Đầu popup: Tiêu đề + Nút thu gọn / mở rộng */}
        <div
          className="pt-mapmodal-popup-header"
          onClick={() => setInfoExpanded((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setInfoExpanded((prev) => !prev);
            }
          }}
          title={infoExpanded ? "Thu gọn thông tin để xem trọn bản đồ" : "Mở rộng xem chi tiết thông tin thửa đất"}
        >
          <div className="pt-mapmodal-popup-header-main">
            <div className="pt-mapmodal-popup-title-line">
              <span className="pt-mapmodal-popup-code">#{plot.code}</span>
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

        {/* Nội dung chi tiết popup (ẩn khi thu gọn để xem map) */}
        {infoExpanded && (
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
                  title="Xem và in biển cắm đầu lô vườn QR"
                >
                  <QrCode size={15} strokeWidth={2.2} />
                  <span>Biển cắm vườn QR</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
