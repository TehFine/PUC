import { formatHa } from "@/utils/plot-utils";
import type { Mode, PreviewState } from "./map-types";

interface DrawHintProps {
  mode: Exclude<Mode, "idle">;
  preview: PreviewState;
  gpsAccuracy: number | null;
  saving?: boolean;
  onFinish: () => void;
  onCancel: () => void;
  onUndoVertex?: () => void;
  onClearVertices?: () => void;
  onResetOriginal?: () => void;
}

export default function DrawHint({
  mode,
  preview,
  gpsAccuracy,
  saving = false,
  onFinish,
  onCancel,
  onUndoVertex,
  onClearVertices,
  onResetOriginal,
}: DrawHintProps) {
  const title =
    mode === "draw"
      ? "Vẽ thửa mới"
      : mode === "gps"
        ? "Đo GPS thực địa"
        : mode === "edit"
          ? "Chỉnh sửa hình dạng thửa"
          : "Vẽ polygon đo lại";

  const subtitle =
    mode === "gps"
      ? gpsAccuracy !== null
        ? "Di chuyển quanh ranh thửa để ghi tọa độ"
        : "Đang chờ tín hiệu định vị vệ tinh…"
      : mode === "edit"
        ? "Kéo đỉnh để chỉnh, kéo giữa cạnh để thêm đỉnh"
        : "Chạm lần lượt các góc thửa trên bản đồ";

  const hasEditTools = Boolean(
    mode === "edit" && (onUndoVertex || onClearVertices || onResetOriginal),
  );

  return (
    <div className="plotmap-hint" role="region" aria-label={title}>
      <div className="plotmap-hint-head">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>

      <div className="plotmap-hint-stats">
        <div className="plotmap-hint-stat">
          <small>{mode === "edit" ? "Số đỉnh" : "Số điểm"}</small>
          <b>{preview.points}</b>
        </div>
        <div className="plotmap-hint-stat">
          <small>Diện tích</small>
          <b>{formatHa(preview.areaHa)}</b>
        </div>
        <div className="plotmap-hint-stat">
          <small>{mode === "gps" ? "Sai số" : "Chu vi"}</small>
          <b>
            {mode === "gps"
              ? gpsAccuracy !== null
                ? `±${gpsAccuracy} m`
                : "—"
              : `${preview.perimeterKm.toFixed(2)} km`}
          </b>
        </div>
      </div>

      {hasEditTools && (
        <div className="plotmap-hint-edit-tools">
          {onUndoVertex && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onUndoVertex}
              disabled={preview.points <= 3 || saving}
              title="Xóa đỉnh cuối cùng"
            >
              Xóa đỉnh
            </button>
          )}
          {onClearVertices && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClearVertices}
              disabled={saving}
              title="Xóa toàn bộ đỉnh hiện tại để bấm vẽ lại từ đầu trên bản đồ"
            >
              Vẽ lại
            </button>
          )}
          {onResetOriginal && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onResetOriginal}
              disabled={saving}
              title="Khôi phục hình dạng ban đầu của thửa đất"
            >
              Khôi phục
            </button>
          )}
        </div>
      )}

      <div className="plotmap-hint-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={saving}>
          Hủy
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onFinish} disabled={saving}>
          {saving
            ? "Đang lưu…"
            : mode === "compare"
              ? "Đối chiếu"
              : mode === "edit"
                ? "Lưu hình"
                : "Hoàn tất"}
        </button>
      </div>
    </div>
  );
}
