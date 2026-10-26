import type { Mode } from "./map-types";

export default function ModeNote({ mode }: { mode: Exclude<Mode, "idle"> }) {
  return (
    <div className="plotmap-mode-note">
      <strong>
        {mode === "draw" ? "Chế độ vẽ thửa" : mode === "gps" ? "Chế độ GPS" : "Chế độ đối chiếu"}
      </strong>
      <p>
        {mode === "draw"
          ? "Bấm các đỉnh của thửa trên bản đồ. Cần ít nhất 3 điểm, sau đó chọn Hoàn tất."
          : mode === "gps"
            ? "Di chuyển dọc ranh thửa để ghi điểm GPS. Có thể bấm thêm điểm thủ công."
            : "Vẽ polygon đo lại thực địa để so khớp với thửa khai báo đang chọn."}
      </p>
    </div>
  );
}
