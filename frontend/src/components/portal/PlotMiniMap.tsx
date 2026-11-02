"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Maximize2 } from "lucide-react";
import type { PortalPlot } from "@/types/portal";

interface Props {
  plot: PortalPlot;
  onOpen: (plot: PortalPlot) => void;
}

export default function PlotMiniMap({ plot, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  const lat = plot.lat ?? 12.72245;
  const lng = plot.lng ?? 108.14746;

  useEffect(() => {
    let disposed = false;

    const init = async () => {
      const imported = (await import("leaflet")) as unknown as {
        default?: typeof import("leaflet");
      };
      const L = imported.default ?? (imported as unknown as typeof import("leaflet"));
      if (disposed || !containerRef.current) return;

      // Xóa bản đồ cũ nếu có
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        preferCanvas: true,
      }).setView([lat, lng], 16);

      mapRef.current = map;

      // Lớp vệ tinh hybrid độ nét cao Esri World Imagery (siêu nét, ổn định 100%)
      const satBase = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 18, maxZoom: 20, attribution: "Esri" }
      );
      const satLabels = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 18, maxZoom: 20 }
      );
      L.layerGroup([satBase, satLabels]).addTo(map);

      // Vẽ ranh giới polygon nếu có
      let polygonLayer: Leaflet.GeoJSON | null = null;
      if (plot.geometryJson) {
        try {
          const geojson = JSON.parse(plot.geometryJson);
          polygonLayer = L.geoJSON(geojson, {
            style: {
              color: "#059669",
              weight: 2.5,
              fillColor: "#10b981",
              fillOpacity: 0.35,
            },
          }).addTo(map);
          map.fitBounds(polygonLayer.getBounds(), { padding: [10, 10], maxZoom: 17 });
        } catch {
          // Bỏ qua lỗi JSON
        }
      }

      // Marker mũi tên định vị xoay theo góc như ảnh mẫu
      const arrowIcon = L.divIcon({
        className: "pt-minimap-marker-wrap",
        html: `
          <div class="pt-minimap-pin-pulse"></div>
          <div class="pt-minimap-pin-arrow">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#059669" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([lat, lng], { icon: arrowIcon, interactive: false }).addTo(map);

      let lastW = 0;
      let lastH = 0;
      let roTimer: ReturnType<typeof setTimeout> | null = null;
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (Math.abs(width - lastW) > 6 || Math.abs(height - lastH) > 6) {
              lastW = width;
              lastH = height;
              if (roTimer) clearTimeout(roTimer);
              roTimer = setTimeout(() => {
                if (!disposed && map) map.invalidateSize({ pan: false });
              }, 120);
            }
          }
        });
        ro.observe(containerRef.current);
      }

      // Đảm bảo kích thước chuẩn
      const timer = setTimeout(() => {
        if (!disposed && map) {
          map.invalidateSize({ pan: false });
          setLoaded(true);
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        if (roTimer) clearTimeout(roTimer);
        if (ro) ro.disconnect();
      };
    };

    void init();

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng, plot.geometryJson]);

  return (
    <div
      className="pt-plot-minimap"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(plot)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(plot);
        }
      }}
      title="Bấm để mở bung toàn cảnh bản đồ thửa đất"
      aria-label={`Bản đồ thửa đất ${plot.code}, bấm để xem toàn cảnh`}
    >
      {/* Container Leaflet map */}
      <div ref={containerRef} className="pt-plot-minimap-canvas" />

      {/* Hiệu ứng mờ khi tải */}
      {!loaded && <div className="pt-plot-minimap-loading" />}

      {/* Nút phóng to / xem toàn cảnh khi hover */}
      <div className="pt-plot-minimap-overlay" aria-hidden="true">
        <div className="pt-plot-minimap-expand-btn">
          <Maximize2 size={14} strokeWidth={2.4} />
          <span>Toàn cảnh</span>
        </div>
      </div>
    </div>
  );
}
