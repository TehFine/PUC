import { formatHa, formatPercent } from "@/utils/plot-utils";
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
  return (
    <>
      <div className="plotmap-source">
        <span className="badge badge-orange">Đối chiếu khai báo và đo lại</span>
      </div>
      <div className="plotmap-compare-grid">
        <div><span>Khai báo</span><strong>{formatHa(result.declaredAreaHa)}</strong></div>
        <div><span>Đo lại</span><strong>{formatHa(result.measuredAreaHa)}</strong></div>
        <div><span>Trùng nhau</span><strong>{formatHa(result.overlapAreaHa)}</strong></div>
        <div><span>Tỷ lệ trùng</span><strong>{formatPercent(result.overlapRatio * 100)}</strong></div>
        <div>
          <span>Chênh lệch</span>
          <strong>
            {result.differenceHa >= 0 ? "+" : ""}
            {formatHa(result.differenceHa)}
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
          <p>Polygon đo lại trùng khớp với dữ liệu khai báo.</p>
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
