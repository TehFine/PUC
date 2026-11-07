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
  return (
    <div className="plotmap-hint">
      <div className="plotmap-hint-text">
        <strong>
          {mode === "draw"
            ? "Vẽ thửa mới"
            : mode === "gps"
              ? "Đo GPS thực địa"
              : mode === "edit"
                ? "Chỉnh sửa hình dạng thửa"
                : "Vẽ polygon đo lại"}
        </strong>
        <span>
          {mode === "gps"
            ? gpsAccuracy !== null
              ? `Sai số ±${gpsAccuracy} m · ${preview.points} điểm`
              : `Đang chờ tín hiệu GPS · ${preview.points} điểm`
            : mode === "edit"
              ? `${preview.points} đỉnh · ${formatHa(preview.areaHa)} · Kéo đỉnh để chỉnh, kéo điểm giữa cạnh để thêm đỉnh`
              : `${preview.points} điểm · ${formatHa(preview.areaHa)} · ${preview.perimeterKm.toFixed(2)} km`}
        </span>
      </div>
      <div className="plotmap-hint-actions" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {mode === "edit" && onUndoVertex && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onUndoVertex}
            disabled={preview.points <= 3 || saving}
            title="Xóa đỉnh cuối cùng"
          >
            Xóa đỉnh cuối
          </button>
        )}
        {mode === "edit" && onClearVertices && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClearVertices}
            disabled={saving}
            title="Xóa toàn bộ đỉnh hiện tại để bấm vẽ lại từ đầu trên bản đồ"
          >
            Vẽ lại từ đầu
          </button>
        )}
        {mode === "edit" && onResetOriginal && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onResetOriginal}
            disabled={saving}
            title="Khôi phục hình dạng ban đầu của thửa đất"
          >
            Khôi phục gốc
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={onFinish} disabled={saving}>
          {saving
            ? "Đang lưu…"
            : mode === "compare"
              ? "Đối chiếu"
              : mode === "edit"
                ? "Lưu hình dạng"
                : "Hoàn tất"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={saving}>
          Hủy
        </button>
      </div>
    </div>
  );
}
