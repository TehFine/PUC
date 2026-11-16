import { formatAreaSqm, formatHa, formatPercent } from "@/utils/plot-utils";
import type { ComparisonState } from "./map-types";

interface ComparisonResultProps {
  comparison: ComparisonState;
  measuredBy: string;
  saving: boolean;
  saved: boolean;
  onMeasuredByChange: (value: string) => void;
  onSave: () => void;
  onRedraw: () => void;
  onClose: () => void;
}

export default function ComparisonResult({
  comparison,
  measuredBy,
  saving,
  saved,
  onMeasuredByChange,
  onSave,
  onRedraw,
  onClose,
}: ComparisonResultProps) {
  const { result } = comparison;
  const diffAbs = Math.abs(result.differenceHa);
  const diffLabel =
    diffAbs < 0.0001
      ? "Khớp 0,00 ha"
      : result.differenceHa > 0
        ? `Rộng hơn ${formatHa(diffAbs)}`
        : `Hẹp hơn ${formatHa(diffAbs)}`;

  return (
    <>
      <div className="plotmap-source">
        <span className="badge badge-orange">Đối chiếu khai báo và đo lại</span>
      </div>
      <div className="plotmap-compare-grid">
        <div>
          <span>Khai báo</span>
          <strong>{formatHa(result.declaredAreaHa)}</strong>
          <small className="plotmap-metric-sub">{formatAreaSqm(result.declaredAreaHa)}</small>
        </div>
        <div>
          <span>Đo lại</span>
          <strong>{formatHa(result.measuredAreaHa)}</strong>
          <small className="plotmap-metric-sub">{formatAreaSqm(result.measuredAreaHa)}</small>
        </div>
        <div>
          <span>Trùng nhau</span>
          <strong>{formatHa(result.overlapAreaHa)}</strong>
          <small className="plotmap-metric-sub">{formatAreaSqm(result.overlapAreaHa)}</small>
        </div>
        <div>
          <span>Tỷ lệ trùng</span>
          <strong>{formatPercent(result.overlapRatio * 100)}</strong>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span>Chênh lệch diện tích</span>
          <strong>
            {diffLabel} ({formatAreaSqm(diffAbs)})
          </strong>
        </div>
      </div>
      <div className={`plotmap-warnbox ${result.needsReview ? "danger" : "ok"}`}>
        <div className="plotmap-warn-title">
          {result.needsReview ? "Cần kiểm tra lại" : "Trong ngưỡng cho phép"}
        </div>
        {result.needsReview ? (
          result.warnings.map((warning) => <p key={warning}>{warning}</p>)
        ) : (
          <p>Ranh giới đo lại trùng khớp tốt với dữ liệu khai báo.</p>
        )}
      </div>
      <label className="map-field full">
        <span>Người đo</span>
        <input value={measuredBy} onChange={(event) => onMeasuredByChange(event.target.value)} />
      </label>
      <div className="plotmap-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || saved}>
          {saved ? "Đã lưu kết quả đo" : saving ? "Đang lưu…" : "Lưu kết quả đo"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onRedraw}>
          Vẽ lại
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
          Đóng
        </button>
      </div>
    </>
  );
}
