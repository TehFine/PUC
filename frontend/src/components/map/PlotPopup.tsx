"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { SOURCE_BADGE, STATUS_BADGE } from "@/constants/plot-badges";
import { getZoneColor } from "@/components/zones/zone-data";
import type { PlotFeature } from "@/types/geo";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types/geo";
import {
  featureLabel,
  formatAreaSqm,
  formatCoords,
  formatHa,
  plotCenterCoords,
  polygonAreaHa,
  type PlotOverlap,
} from "@/utils/plot-utils";

interface PlotPopupProps {
  feature: PlotFeature;
  overlaps: PlotOverlap[];
  onCompare: () => void;
  onEditShape?: () => void;
  onRedrawShape?: () => void;
  onFocusPlot?: () => void;
  onClose: () => void;
}

/**
 * Bảng thông tin thửa đất nằm bên cạnh phải bản đồ (không làm mờ nền bản đồ phía sau).
 */
export default function PlotPopup({
  feature,
  overlaps,
  onCompare,
  onEditShape,
  onRedrawShape,
  onFocusPlot,
  onClose,
}: PlotPopupProps) {
  const props = feature.properties;
  const popupRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const el = popupRef.current;
    if (el) {
      el.style.animation = "none";
      el.style.pointerEvents = "none";
      el.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease";
      el.style.transform = "translate3d(0, 105%, 0)";
      el.style.opacity = "0";
      setTimeout(() => {
        isClosingRef.current = false;
        onClose();
      }, 220);
      return;
    }
    isClosingRef.current = false;
    onClose();
  }, [onClose]);

  useEffect(() => {
    isClosingRef.current = false;
    if (popupRef.current) {
      popupRef.current.style.transition = "";
      popupRef.current.style.transform = "";
      popupRef.current.style.opacity = "";
      popupRef.current.style.pointerEvents = "";
    }
  }, [feature.properties.code]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  useSheetSwipe({ sheetRef: popupRef, handleRef: headRef, onDismiss: handleClose });

  const center = plotCenterCoords(feature);
  const zc = getZoneColor(props.zone || props.code);
  const mapAreaHa = polygonAreaHa(feature.geometry);
  const rawRing = feature.geometry?.coordinates?.[0] ?? [];
  const vertexCount =
    rawRing.length > 1 &&
    rawRing[0][0] === rawRing[rawRing.length - 1][0] &&
    rawRing[0][1] === rawRing[rawRing.length - 1][1]
      ? rawRing.length - 1
      : rawRing.length;

  const facts: Array<{ label: string; value: string; wide?: boolean; isZone?: boolean }> = [
    { label: "Số thửa / tờ bản đồ", value: `${props.parcel || "-"} / ${props.sheet || "-"}` },
    { label: "Số đỉnh ranh giới", value: `${vertexCount} đỉnh` },
    { label: "Mã vùng trồng", value: props.zone || "-", isZone: true },
    { label: "Thôn / Tổ", value: props.village || "-" },
    { label: "Giống cây", value: props.variety || "-", wide: true },
    { label: "Định vị GPS", value: formatCoords(center?.lat, center?.lng), wide: true },
    { label: "Chủ hộ", value: props.owner || "-", wide: true },
  ];

  return (
    <section
      ref={popupRef}
      className="plotmap-popup"
      role="dialog"
      aria-modal="false"
      aria-label={`Thông tin thửa ${props.code}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div ref={headRef} className="pt-sheet-topbar">
        <header className="pp-head">
          <div>
            <div className="pp-kicker" style={{ color: zc.text }}>
              Thửa {props.code}
              {featureLabel(feature) ? `, tờ/thửa ${featureLabel(feature)}` : ""}
            </div>
            <h3 className="pp-title">{props.owner || `Thửa ${props.code}`}</h3>
          </div>
          <button type="button" className="pp-close" onClick={handleClose} aria-label="Đóng">
            <CloseCircleIcon size={28} strokeWidth={2.2} />
          </button>
        </header>
      </div>

      <div className="pp-badges">
        <span
          className="badge"
          style={{
            color: zc.text,
            fontWeight: 700,
            fontFamily: "var(--font-num-stack)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.01em",
          }}
        >
          {props.zone || zc.zoneCode}
        </span>
        <span className={`badge ${STATUS_BADGE[props.status]}`}>{STATUS_LABELS[props.status]}</span>
        <span className={`badge ${SOURCE_BADGE[props.source]}`}>{SOURCE_LABELS[props.source]}</span>
      </div>

      <div className="pp-areas">
        <div>
          <span>Diện tích hồ sơ</span>
          <strong>{formatHa(props.areaHa)}</strong>
          <small className="pp-area-sub">{formatAreaSqm(props.areaHa)}</small>
        </div>
        <div>
          <span>Diện tích bản đồ</span>
          <strong>{formatHa(mapAreaHa)}</strong>
          <small className="pp-area-sub">{formatAreaSqm(mapAreaHa)}</small>
        </div>
      </div>

      <dl className="pp-facts">
        {facts.map((fact) => (
          <div key={fact.label} className={fact.wide ? "wide" : undefined}>
            <dt>{fact.label}</dt>
            <dd
              style={
                fact.isZone
                  ? {
                      color: zc.text,
                      fontWeight: 700,
                      fontFamily: "var(--font-num-stack)",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "0.01em",
                    }
                  : undefined
              }
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {overlaps.length > 0 ? (
        <div className="pp-overlap danger">
          <strong>Chồng lấn với {overlaps.length} thửa</strong>
          <p>{overlaps.map((overlap) => `${overlap.code} (${formatHa(overlap.areaHa)})`).join(", ")}</p>
        </div>
      ) : (
        <div className="pp-overlap ok">
          <strong>Không phát hiện chồng lấn</strong>
          <p>Ranh giới thửa không giao cắt với các thửa đất khác trong hệ thống.</p>
        </div>
      )}

      <p className="pp-privacy">
        Số điện thoại, CCCD và tài liệu định danh cá nhân được bảo mật khỏi cửa sổ tra cứu nhanh.
      </p>

      <div className="pp-actions">
        {onRedrawShape && (
          <button
            type="button"
            className="pp-btn pp-btn-primary"
            onClick={onRedrawShape}
            title="Xóa khung tạm hiện tại để chấm hoặc vẽ lại ranh giới thực tế của hộ trên ảnh vệ tinh"
          >
            Vẽ lại hình dạng
          </button>
        )}
        {onEditShape && (
          <button
            type="button"
            className={onRedrawShape ? "pp-btn pp-btn-secondary" : "pp-btn pp-btn-primary"}
            onClick={onEditShape}
            title="Kéo dời các đỉnh ranh giới hiện có của thửa đất"
          >
            Sửa hình dạng
          </button>
        )}
        {onFocusPlot && (
          <button
            type="button"
            className="pp-btn pp-btn-secondary"
            onClick={onFocusPlot}
            title="Phóng sát thửa đất để xem ranh giới chi tiết và số đo từng cạnh"
          >
            Phóng sát thửa
          </button>
        )}
        <button type="button" className="pp-btn pp-btn-secondary" onClick={onCompare}>
          Đối chiếu thửa này
        </button>
        <button type="button" className="pp-btn pp-btn-ghost" onClick={handleClose}>
          Đóng
        </button>
      </div>
    </section>
  );
}
