"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { getZoneColor } from "@/components/zones/zone-data";
import {
  animatePopupExit,
  attachSmoothSheetSettle,
} from "@/lib/popup-motion";
import type { PlotFeature, PlotStatus } from "@/types/geo";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types/geo";
import {
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

const STATUS_TONE_CLASS: Record<PlotStatus, string> = {
  approved: "is-approved",
  improve: "is-warn",
  pending: "is-warn",
  violation: "is-danger",
};

/**
 * Bảng thông tin thửa đất nằm bên cạnh phải bản đồ trên máy tính
 * và chuyển thành ngăn kéo đáy (bottom sheet) chia khu vực rõ ràng trên di động.
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
      const closeDuration = animatePopupExit(el, null, "sheet");
      if (closeDuration <= 0) {
        onClose();
        return;
      }
      window.setTimeout(() => {
        onClose();
      }, closeDuration);
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    isClosingRef.current = false;
    const el = popupRef.current;
    if (!el) return;
    delete el.dataset.closing;
    el.style.removeProperty("animation");
    el.style.removeProperty("transition");
    el.style.transform = "";
    el.style.opacity = "";
    el.style.pointerEvents = "";

    return attachSmoothSheetSettle(el, null, isClosingRef);
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

  const sheetParcelValue =
    props.sheet || props.parcel
      ? `Tờ ${props.sheet || "-"}, Thửa ${props.parcel || "-"}`
      : "Chưa cập nhật";

  return (
    <section
      ref={popupRef}
      className="plotmap-popup"
      role="dialog"
      aria-modal="false"
      aria-label={`Thông tin hộ ${props.owner || props.code}`}
      onClick={(event) => event.stopPropagation()}
    >
      {/* Phần đầu cố định: Chỉ hiển thị tên nông hộ và nút đóng */}
      <div ref={headRef} className="pt-sheet-topbar pp-topbar">
        <header className="pp-head">
          <h3 className="pp-title">{props.owner || `Thửa ${props.code}`}</h3>
          <button type="button" className="pp-close" onClick={handleClose} aria-label="Đóng">
            <CloseCircleIcon size={28} strokeWidth={2.2} />
          </button>
        </header>
      </div>

      {/* Thân cuộn chia thành các khu vực riêng biệt */}
      <div className="pp-body">
        {/* Khu vực 1: Diện tích */}
        <div className="pp-section">
          <div className="pp-sec-head">Diện tích đo đạc</div>
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
        </div>

        {/* Khu vực 2: Định danh vùng trồng */}
        <div className="pp-section">
          <div className="pp-sec-head">Định danh vùng trồng</div>
          <dl className="pp-grid">
            <div className="pp-cell">
              <dt>Mã thửa</dt>
              <dd className="pp-code-val">{props.code || "-"}</dd>
            </div>
            <div className="pp-cell">
              <dt>Trạng thái</dt>
              <dd className={`pp-status-val ${STATUS_TONE_CLASS[props.status]}`}>
                {STATUS_LABELS[props.status]}
              </dd>
            </div>
            <div className="pp-cell is-wide">
              <dt>Mã vùng trồng</dt>
              <dd className="pp-zone-val" style={{ color: zc.text }}>
                {props.zone || zc.zoneCode || "-"}
              </dd>
            </div>
            <div className="pp-cell">
              <dt>Khu vực</dt>
              <dd>{props.village || "-"}</dd>
            </div>
            <div className="pp-cell">
              <dt>Nguồn dữ liệu</dt>
              <dd>{SOURCE_LABELS[props.source]}</dd>
            </div>
          </dl>
        </div>

        {/* Khu vực 3: Địa chính và canh tác */}
        <div className="pp-section">
          <div className="pp-sec-head">Địa chính và canh tác</div>
          <dl className="pp-grid">
            <div className="pp-cell">
              <dt>Tờ và số thửa</dt>
              <dd>{sheetParcelValue}</dd>
            </div>
            <div className="pp-cell">
              <dt>Số đỉnh ranh giới</dt>
              <dd>{vertexCount} đỉnh</dd>
            </div>
            <div className="pp-cell is-wide">
              <dt>Giống cây trồng</dt>
              <dd>
                {props.variety || "-"}
                {props.year ? ` (Trồng năm ${props.year})` : ""}
              </dd>
            </div>
            <div className="pp-cell is-wide">
              <dt>Tọa độ tâm GPS</dt>
              <dd>{formatCoords(center?.lat, center?.lng)}</dd>
            </div>
          </dl>
        </div>

        {/* Khu vực 4: Kiểm tra ranh giới */}
        <div className="pp-section">
          <div className="pp-sec-head">Kiểm tra ranh giới</div>
          {overlaps.length > 0 ? (
            <div className="pp-overlap danger">
              <strong>Chồng lấn với {overlaps.length} thửa</strong>
              <p>
                {overlaps.map((overlap) => `${overlap.code} (${formatHa(overlap.areaHa)})`).join(", ")}
              </p>
            </div>
          ) : (
            <div className="pp-overlap ok">
              <strong>Không phát hiện chồng lấn</strong>
              <p>Ranh giới thửa không giao cắt với các thửa đất khác trong hệ thống.</p>
            </div>
          )}
        </div>
      </div>

      {/* Thanh nút hành động cố định dưới cùng */}
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
