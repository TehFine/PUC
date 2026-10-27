"use client";

import { useEffect } from "react";
import { Lock, X } from "lucide-react";
import { SOURCE_BADGE, STATUS_BADGE } from "@/constants/plot-badges";
import type { PlotFeature } from "@/types/geo";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types/geo";
import { featureLabel, formatHa, polygonAreaHa, type PlotOverlap } from "@/utils/plot-utils";
import { maskPersonName } from "@/utils/privacy";

interface PlotPopupProps {
  feature: PlotFeature;
  overlaps: PlotOverlap[];
  onCompare: () => void;
  onClose: () => void;
}

/**
 * Popup làm mờ nền bản đồ, hiện khi bấm vào một thửa đã được vẽ.
 * Chỉ hiển thị thông tin quy hoạch của thửa; thông tin cá nhân (họ tên đầy đủ, nguồn nhập, chủ hộ của thửa chồng lấn…) được ẩn.
 */
export default function PlotPopup({ feature, overlaps, onCompare, onClose }: PlotPopupProps) {
  const props = feature.properties;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const facts: Array<{ label: string; value: string; wide?: boolean }> = [
    { label: "Số tờ / số thửa", value: `${props.sheet || "—"} / ${props.parcel || "—"}` },
    { label: "Thôn", value: props.village || "—" },
    { label: "Mã vùng trồng", value: props.zone || "—" },
    { label: "Năm trồng", value: props.year ? String(props.year) : "—" },
    { label: "Giống", value: props.variety || "—", wide: true },
    { label: "Chủ hộ", value: maskPersonName(props.owner), wide: true },
  ];

  return (
    <div
      className="plotmap-popup-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="plotmap-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`Thông tin thửa ${props.code}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pp-head">
          <div>
            <div className="pp-kicker">Thửa đất · {props.code}</div>
            <h3 className="pp-title">Tờ/thửa {featureLabel(feature)}</h3>
          </div>
          <button type="button" className="pp-close" onClick={onClose} aria-label="Đóng">
            <X size={16} strokeWidth={2.2} />
          </button>
        </header>

        <div className="pp-badges">
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
              <dd>{fact.value}</dd>
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

        <div className="pp-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onCompare}>
            Đối chiếu thửa này
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}
