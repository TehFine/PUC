import { formatAreaSqm, formatHa } from "@/utils/plot-utils";
import type { Mode, PreviewState } from "./map-types";

interface ModeNoteProps {
  mode: Exclude<Mode, "idle">;
  preview?: PreviewState;
  declaredAreaHa?: number;
  updateArea?: boolean;
  onUpdateAreaChange?: (next: boolean) => void;
  saving?: boolean;
  onFinish?: () => void;
  onCancel?: () => void;
}

export default function ModeNote({
  mode,
  preview,
  declaredAreaHa,
  updateArea = true,
  onUpdateAreaChange,
  saving = false,
  onFinish,
  onCancel,
}: ModeNoteProps) {
  return (
    <div className="plotmap-mode-note">
      <strong>
        {mode === "draw"
          ? "Chế độ vẽ thửa"
          : mode === "gps"
            ? "Chế độ GPS"
            : mode === "edit"
              ? "Chế độ sửa ranh giới thửa đất"
              : "Chế độ đối chiếu"}
      </strong>
      <p>
        {mode === "draw"
          ? "Chấm các góc thửa hoặc vẽ nét cong dọc ranh giới, không giới hạn số đỉnh."
          : mode === "gps"
            ? "Di chuyển dọc ranh thửa để ghi tọa độ GPS hoặc chạm bản đồ thêm đỉnh."
            : mode === "edit"
              ? "Kéo thả các đỉnh ở góc, kéo chấm giữa cạnh để chèn thêm đỉnh mới, hoặc vẽ nét cong."
              : "Vẽ đa giác thực địa để đối chiếu với ranh giới khai báo."}
      </p>
      {mode === "edit" && preview && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid #e2e5e3",
            background: "#f7f7f5",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Số đỉnh hiện tại</span>
            <strong>{preview.points} đỉnh</strong>
          </div>
          {declaredAreaHa != null && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Diện tích hồ sơ</span>
              <strong>{formatHa(declaredAreaHa)}</strong>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Diện tích thực tế</span>
            <strong>
              {formatHa(preview.areaHa)} ({formatAreaSqm(preview.areaHa)})
            </strong>
          </div>
          {onUpdateAreaChange && (
            <label className="plotmap-area-sync-check" style={{ marginTop: 2 }}>
              <input
                type="checkbox"
                checked={updateArea}
                onChange={(e) => onUpdateAreaChange(e.target.checked)}
              />
              <span>Cập nhật diện tích hồ sơ theo ranh giới mới</span>
            </label>
          )}
          {onFinish && onCancel && (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={onFinish}
                disabled={saving || preview.points < 3 || preview.selfIntersections > 0}
              >
                {saving ? "Đang lưu…" : "Lưu hình dạng"}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onCancel}
                disabled={saving}
              >
                Hủy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
