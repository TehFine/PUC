import { formatHa } from "@/utils/plot-utils";
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
  updateArea = false,
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
              ? "Chế độ chỉnh sửa hình dạng thửa đất"
              : "Chế độ đối chiếu"}
      </strong>
      <p>
        {mode === "draw"
          ? "Bấm các đỉnh của thửa trên bản đồ. Cần ít nhất 3 điểm, sau đó chọn Hoàn tất."
          : mode === "gps"
            ? "Di chuyển dọc ranh thửa để ghi điểm GPS. Có thể bấm thêm điểm thủ công."
            : mode === "edit"
              ? "• Kéo thả các chấm tròn trắng ở góc để dịch chuyển đỉnh thửa đất.\n• Kéo chấm nhỏ ở giữa cạnh (hoặc bấm lên bản đồ) để thêm đỉnh mới.\n• Bấm chuột phải vào một đỉnh để xóa đỉnh đó, hoặc chọn “Vẽ lại từ đầu”."
              : "Vẽ polygon đo lại thực địa để so khớp với thửa khai báo đang chọn."}
      </p>
      {mode === "edit" && preview && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#f8fafc",
            fontSize: 12.5,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Số đỉnh hiện tại:</span>
            <strong>{preview.points} đỉnh</strong>
          </div>
          {declaredAreaHa != null && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Diện tích hồ sơ:</span>
              <strong>{formatHa(declaredAreaHa)}</strong>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)" }}>Diện tích hình đang vẽ:</span>
            <strong style={{ color: "#0f766e" }}>{formatHa(preview.areaHa)}</strong>
          </div>
          {onUpdateAreaChange && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              <input
                type="checkbox"
                checked={updateArea}
                onChange={(e) => onUpdateAreaChange(e.target.checked)}
              />
              <span>Cập nhật luôn diện tích hồ sơ theo hình vẽ mới</span>
            </label>
          )}
          {onFinish && onCancel && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={onFinish}
                disabled={saving || preview.points < 3}
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
