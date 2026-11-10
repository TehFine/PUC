"use client";

import { useCallback, useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { SOURCE_BADGE, STATUS_BADGE } from "@/constants/plot-badges";
import { getZoneColor } from "@/components/zones/zone-data";
import type { PlotFeature } from "@/types/geo";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types/geo";
import {
  featureLabel,
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
  onFocusPlot?: () => void;
  onClose: () => void;
}

/**
 * Bảng thông tin thửa đất nằm bên cạnh phải bản đồ (không làm mờ nền bản đồ phía sau).
 * Chỉ hiển thị thông tin quy hoạch của thửa; thông tin cá nhân (họ tên đầy đủ, nguồn nhập, chủ hộ của thửa chồng lấn…) được ẩn.
 */
export default function PlotPopup({
  feature,
  overlaps,
  onCompare,
  onEditShape,
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
  const facts: Array<{ label: string; value: string; wide?: boolean; isZone?: boolean }> = [
    { label: "Số thửa / tờ bản đồ", value: `${props.parcel || "—"} / ${props.sheet || "—"}` },
    { label: "Thôn / Tổ", value: props.village || "—" },
    { label: "Mã vùng trồng", value: props.zone || "—", isZone: true },
    { label: "Giống", value: props.variety || "—" },
    { label: "Định vị GPS", value: formatCoords(center?.lat, center?.lng), wide: true },
    { label: "Chủ hộ", value: props.owner || "—", wide: true },
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
        <div className="pt-sheet-handle-zone" title="Kéo hoặc vuốt xuống để đóng">
          <div className="pt-sheet-handle-bar" />
        </div>
        <header className="pp-head">
          <div>
            <div className="pp-kicker" style={{ color: zc.text }}>
              Thửa đất · {props.code}
            </div>
            <h3 className="pp-title">Tờ/thửa {featureLabel(feature)}</h3>
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
            background: zc.bg,
            color: zc.text,
            border: "none",
            borderRadius: 8,
            padding: "4px 9px",
            fontFamily: "monospace",
          }}
        >
          {props.zone || zc.zoneCode}
        </span>
        <span className={`badge ${STATUS_BADGE[props.status]}`}>{STATUS_LABELS[props.status]}</span>
        <span className={`badge ${SOURCE_BADGE[props.source]}`}>{SOURCE_LABELS[props.source]}</span>
      </div>

      <div className="pp-areas">
        <div>
          <span>Diện tích khai báo</span>
          <strong>{formatHa(props.areaHa)}</strong>
        </div>
        <div>
          <span>Diện tích trên bản đồ</span>
          <strong>{formatHa(polygonAreaHa(feature.geometry))}</strong>
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
                      fontFamily: "monospace",
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
          <p>{overlaps.map((overlap) => `${overlap.code} (${formatHa(overlap.areaHa)})`).join(" · ")}</p>
        </div>
      ) : (
        <div className="pp-overlap ok">
          <strong>Không phát hiện chồng lấn</strong>
          <p>Thửa không giao với thửa nào khác trong dữ liệu hiện có.</p>
        </div>
      )}

      <p className="pp-privacy">
        <Lock size={12} strokeWidth={2.2} />
        Họ tên đầy đủ, số điện thoại, CCCD và nguồn nhập dữ liệu được ẩn khỏi cửa sổ này.
      </p>

      <div className="pp-actions" style={{ flexWrap: "wrap" }}>
        {onFocusPlot && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onFocusPlot}
            title="Phóng to sát thửa đất (Z18.5) để xem ranh giới chi tiết và số đo từng cạnh"
          >
            Phóng sát thửa
          </button>
        )}
        {onEditShape && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onEditShape}>
            Sửa hình dạng thửa
          </button>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={onCompare}>
          Đối chiếu thửa này
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleClose}>
          Đóng
        </button>
      </div>
    </section>
  );
}
