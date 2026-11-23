"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import {
  createLatestSatelliteLayer,
  preconnectMapTileOrigins,
  warmSatelliteTilesAt,
} from "@/components/map/map-layers";
import { isLowEndDevice } from "@/lib/network";
import { TRACE_UI_COPY, type TraceLang } from "./trace-i18n";

export interface CoarseZoneOverviewMapProps {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  zoom?: number;
  label: string;
  privacyNote?: string;
  pucCode: string;
  adminLocation?: string;
  lang?: TraceLang;
}

let leafletPromise: Promise<typeof import("leaflet")> | null = null;
function loadLeaflet() {
  if (!leafletPromise) {
    leafletPromise = import("leaflet");
  }
  return leafletPromise;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Bản đồ vệ tinh tương tác thực tế vùng trồng (Esri Maxar Vivid kết hợp nhãn địa danh):
 * - Chỉ hiển thị duy nhất lớp ảnh vệ tinh thực địa độ phân giải cao.
 * - Chỉ khoanh vùng phạm vi chung cấp vùng trồng (tọa độ làm tròn 2 chữ số thập phân),
 *   không vẽ ranh giới từng thửa đất cá nhân nhằm bảo mật dữ liệu nông hộ.
 */
export default function CoarseZoneOverviewMap({
  centerLat,
  centerLng,
  radiusMeters,
  zoom = 14,
  label,
  pucCode,
  adminLocation,
  lang = "vi",
}: CoarseZoneOverviewMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);

  const t = TRACE_UI_COPY[lang].zone;

  const safeLat = Number.isFinite(centerLat) ? Number(centerLat.toFixed(2)) : 13.12;
  const safeLng = Number.isFinite(centerLng) ? Number(centerLng.toFixed(2)) : 108.22;
  const safeRadius = Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 2500;
  const initialZoom = Math.min(16, Math.max(12, Number.isFinite(zoom) ? Math.max(zoom, 14) : 14));

  const dirLat = lang === "vi" ? "B" : "N";
  const dirLng = lang === "vi" ? "Đ" : "E";
  const coordLabel = `${safeLat.toFixed(2)}°${dirLat}, ${safeLng.toFixed(2)}°${dirLng}`;
  const recenterLabel =
    lang === "zh" ? "回到产区中心" : lang === "en" ? "Reset View" : "Về tâm vùng";

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    preconnectMapTileOrigins();
    warmSatelliteTilesAt(safeLat, safeLng, initialZoom);

    void loadLeaflet().then((mod) => {
      if (cancelled || !containerRef.current) return;
      const L = ((mod as unknown as { default?: typeof import("leaflet") }).default ?? mod) as typeof import("leaflet");
      const lowEnd = isLowEndDevice();

      const map = L.map(containerRef.current, {
        center: [safeLat, safeLng],
        zoom: initialZoom,
        minZoom: 10,
        maxZoom: 19,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });
      mapRef.current = map;

      L.control.zoom({ position: "bottomright" }).addTo(map);

      const satLayer = createLatestSatelliteLayer(L, lowEnd, 19, 2);
      satLayer.addTo(map);

      L.circle([safeLat, safeLng], {
        radius: safeRadius,
        color: "#86efac",
        weight: 2,
        dashArray: "6 5",
        fillColor: "#22c55e",
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(map);

      const subLine = adminLocation ? `${coordLabel} - ${adminLocation}` : `${coordLabel} (${t.coarseCenterTag})`;
      const plaqueIcon = L.divIcon({
        className: "tr-sat-plaque-icon",
        iconSize: [260, 48],
        iconAnchor: [130, 24],
        html: `<div class="tr-sat-plaque-card">
          <strong class="tr-sat-plaque-code">${escapeHtml(pucCode)}</strong>
          <span class="tr-sat-plaque-sub">${escapeHtml(subLine)}</span>
        </div>`,
      });
      L.marker([safeLat, safeLng], { icon: plaqueIcon, interactive: false }).addTo(map);

      requestAnimationFrame(() => {
        if (!cancelled) map.invalidateSize({ pan: false });
      });

      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize({ pan: false });
        });
        resizeObserver.observe(containerRef.current);
      }
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [safeLat, safeLng, safeRadius, initialZoom, pucCode, adminLocation, coordLabel, t.coarseCenterTag]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([safeLat, safeLng], initialZoom, { animate: true });
  };

  return (
    <div className="tr-coarse-map-block">
      <div className="tr-coarse-map-head">
        <span className="tr-coarse-map-title">{t.coarseMapTitle(pucCode)}</span>
        <div className="tr-coarse-map-controls">
          <button
            type="button"
            className="tr-coarse-map-reset"
            onClick={handleRecenter}
          >
            {recenterLabel}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="tr-coarse-map-canvas is-satellite-live"
        role="region"
        aria-label={label}
      />

      <p className="tr-coarse-map-note">{t.coarsePrivacyNote}</p>
    </div>
  );
}
