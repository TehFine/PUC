"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Maximize2 } from "lucide-react";
import { createGoogleSatelliteLayer } from "@/components/map/map-layers";
import { isLowEndDevice } from "@/lib/network";
import type { PortalPlot } from "@/types/portal";

interface Props {
  plot: PortalPlot;
  onOpen: (plot: PortalPlot) => void;
}

export default function PlotMiniMap({ plot, onOpen }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const [inView, setInView] = useState(
    () => typeof window !== "undefined" && typeof IntersectionObserver === "undefined",
  );
  const [loaded, setLoaded] = useState(false);

  const lat = plot.lat ?? 13.125;
  const lng = plot.lng ?? 108.185;

  // Chỉ khởi tạo Leaflet & tải tile vệ tinh khi thẻ thửa đất lọt gần vùng nhìn thấy,
  // tránh cấp phát đồng loạt hàng chục canvas/tile trên điện thoại ít RAM.
  useEffect(() => {
    const el = wrapperRef.current;
    if (inView || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let roTimer: ReturnType<typeof setTimeout> | null = null;
    let initTimer: ReturnType<typeof setTimeout> | null = null;

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

      const lowEnd = isLowEndDevice();

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
        fadeAnimation: !lowEnd,
        zoomAnimation: false,
      }).setView([lat, lng], 16);

      if (disposed) {
        map.remove();
        return;
      }

      mapRef.current = map;

      // Chỉ dùng 1 lớp vệ tinh Hybrid tích hợp sẵn nhãn đường/thôn (nhẹ RAM tối đa trên điện thoại cấu hình thấp).
      const satLayer = createGoogleSatelliteLayer(L, lowEnd, 20, lowEnd ? 0 : 1);
      satLayer.options.updateWhenIdle = true;
      satLayer.addTo(map);

      if (plot.geometryJson) {
        try {
          const geojson = JSON.parse(plot.geometryJson);
          const polygonLayer = L.geoJSON(geojson, {
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
      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (Math.abs(width - lastW) > 6 || Math.abs(height - lastH) > 6) {
              lastW = width;
              lastH = height;
              if (roTimer) clearTimeout(roTimer);
              roTimer = setTimeout(() => {
                if (!disposed && mapRef.current) mapRef.current.invalidateSize({ pan: false });
              }, 140);
            }
          }
        });
        ro.observe(containerRef.current);
      }

      initTimer = setTimeout(() => {
        if (!disposed && mapRef.current) {
          mapRef.current.invalidateSize({ pan: false });
          setLoaded(true);
        }
      }, 100);
    };

    void init();

    return () => {
      disposed = true;
      if (initTimer) clearTimeout(initTimer);
      if (roTimer) clearTimeout(roTimer);
      ro?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [inView, lat, lng, plot.geometryJson]);

  return (
    <div
      ref={wrapperRef}
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
