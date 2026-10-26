import { formatHa } from "@/utils/plot-utils";
import type { Mode, PreviewState } from "./map-types";

interface DrawHintProps {
  mode: Exclude<Mode, "idle">;
  preview: PreviewState;
  gpsAccuracy: number | null;
  onFinish: () => void;
  onCancel: () => void;
}

export default function DrawHint({ mode, preview, gpsAccuracy, onFinish, onCancel }: DrawHintProps) {
  return (
    <div className="plotmap-hint">
      <div className="plotmap-hint-text">
        <strong>
          {mode === "draw" ? "Vẽ thửa mới" : mode === "gps" ? "Đo GPS thực địa" : "Vẽ polygon đo lại"}
        </strong>
        <span>
          {mode === "gps"
            ? gpsAccuracy !== null
              ? `Sai số ±${gpsAccuracy} m · ${preview.points} điểm`
              : `Đang chờ tín hiệu GPS · ${preview.points} điểm`
            : `${preview.points} điểm · ${formatHa(preview.areaHa)} · ${preview.perimeterKm.toFixed(2)} km`}
        </span>
      </div>
      <div className="plotmap-hint-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onFinish}>
          {mode === "compare" ? "Đối chiếu" : "Hoàn tất"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </div>
  );
}
