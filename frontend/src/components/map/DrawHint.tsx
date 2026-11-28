import { useState } from "react";
import { RadialPngIcon } from "@/components/portal/RadialIcons";
import { ConfirmDialog } from "@/components/ui/Modal";
import { formatAreaSqm, formatHa, formatPerimeterMeters } from "@/utils/plot-utils";
import type { DrawStyle, MapMessage, Mode, PreviewState } from "./map-types";

interface DrawHintProps {
  mode: Exclude<Mode, "idle">;
  plotCode?: string;
  ownerName?: string;
  drawStyle: DrawStyle;
  onDrawStyleChange: (style: DrawStyle) => void;
  preview: PreviewState;
  declaredAreaHa?: number;
  updateArea?: boolean;
  onUpdateAreaChange?: (next: boolean) => void;
  gpsAccuracy: number | null;
  saving?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedVertexIndex: number | null;
  message?: MapMessage | null;
  onFinish: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelectedVertex?: () => void;
  onClearVertices: () => void;
  onResetOriginal?: () => void;
  onFlyToCoord?: (lat: number, lng: number, addPoint: boolean) => void;
}

export default function DrawHint({
  mode,
  plotCode,
  ownerName,
  drawStyle,
  onDrawStyleChange,
  preview,
  declaredAreaHa,
  updateArea = true,
  onUpdateAreaChange,
  gpsAccuracy,
  saving = false,
  canUndo,
  canRedo,
  selectedVertexIndex,
  message,
  onFinish,
  onCancel,
  onUndo,
  onRedo,
  onDeleteSelectedVertex,
  onClearVertices,
  onResetOriginal,
  onFlyToCoord,
}: DrawHintProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"clear" | "deleteVertex" | null>(null);
  const [showCoordBox, setShowCoordBox] = useState(false);
  const [coordInput, setCoordInput] = useState("");
  const [coordError, setCoordError] = useState<string | null>(null);

  const title =
    mode === "draw"
      ? "Vẽ thửa mới"
      : mode === "gps"
        ? "Đo GPS"
        : mode === "edit"
          ? plotCode
            ? ownerName
              ? `Sửa ${plotCode} (${ownerName})`
              : `Sửa ${plotCode}`
            : "Sửa ranh giới"
          : plotCode
            ? `Đối chiếu ${plotCode}`
            : "Đối chiếu thửa";

  const guideText =
    mode === "gps"
      ? gpsAccuracy !== null
        ? "Đi dọc bờ thửa hoặc chạm bản đồ để thêm đỉnh."
        : "Đang dò GPS, có thể chạm bản đồ để đặt đỉnh."
      : drawStyle === "freehand"
        ? "Nhấn giữ rồi rê theo bờ cong để vẽ nét mượt."
        : preview.points === 0
          ? "Chạm các góc thửa trên bản đồ để bắt đầu."
          : preview.points < 3
            ? "Chấm thêm góc để tạo vùng, kéo đỉnh để chỉnh."
            : mode === "edit"
              ? "Kéo đỉnh để chỉnh góc, kéo chấm giữa cạnh để thêm đỉnh."
              : "Kéo đỉnh để chỉnh góc, chạm đỉnh #1 để khép vùng.";

  const canDeleteSelected =
    selectedVertexIndex !== null &&
    Boolean(onDeleteSelectedVertex) &&
    (mode === "edit" ? preview.points > 3 : preview.points >= 1);

  const supportsStyleSwitch = mode === "draw" || mode === "edit" || mode === "compare";

  const handleJumpCoord = (addPoint: boolean) => {
    const parts = coordInput
      .trim()
      .split(/[\s,;]+/)
      .map((item) => Number.parseFloat(item));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
      setCoordError("Nhập đúng định dạng: Vĩ độ, Kinh độ (VD: 13.1254, 108.1852).");
      return;
    }
    const [lat, lng] = parts;
    if (lat < 8 || lat > 24 || lng < 102 || lng > 110.5) {
      setCoordError("Tọa độ nằm ngoài phạm vi Việt Nam.");
      return;
    }
    setCoordError(null);
    onFlyToCoord?.(lat, lng, addPoint);
    if (addPoint) setCoordInput("");
  };

  if (collapsed) {
    const canSaveQuick = !saving && preview.points >= 3 && preview.selfIntersections === 0;
    return (
      <div className="plotmap-hint is-collapsed" role="region" aria-label={title}>
        <div className="plotmap-hint-collapsed-bar">
          <div className="plotmap-hint-collapsed-info">
            <strong>{title}</strong>
            <span>
              {preview.points} đỉnh, {formatHa(preview.areaHa)} ({formatAreaSqm(preview.areaHa)})
            </span>
          </div>
          <div className="plotmap-hint-collapsed-actions">
            {canUndo && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onUndo}
                disabled={saving}
              >
                Hoàn tác
              </button>
            )}
            {canSaveQuick && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onFinish}
              >
                Lưu
              </button>
            )}
            <button
              type="button"
              className="plotmap-hint-collapse-btn"
              onClick={() => setCollapsed(false)}
              aria-label="Mở rộng bảng điều khiển"
              title="Mở rộng bảng điều khiển"
            >
              <RadialPngIcon src="/expand.png" size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="plotmap-hint" role="region" aria-label={title}>
      <div className="plotmap-hint-toprow">
        <strong className="plotmap-hint-title">{title}</strong>
        <button
          type="button"
          className="plotmap-hint-collapse-btn"
          onClick={() => setCollapsed(true)}
          aria-label="Thu gọn bảng điều khiển"
          title="Thu gọn bảng điều khiển để nhìn rộng bản đồ"
        >
          <RadialPngIcon src="/minimize.png" size={16} />
        </button>
      </div>

      <div className="plotmap-hint-body">
        <p className="plotmap-hint-guide">{guideText}</p>

      {supportsStyleSwitch && (
        <div className="plotmap-drawstyle-switch" role="group" aria-label="Phương thức vẽ ranh giới">
          <button
            type="button"
            aria-pressed={drawStyle === "point"}
            className={`plotmap-drawstyle-btn ${drawStyle === "point" ? "is-active" : ""}`}
            onClick={() => onDrawStyleChange("point")}
            disabled={saving}
          >
            Chấm từng đỉnh
          </button>
          <button
            type="button"
            aria-pressed={drawStyle === "freehand"}
            className={`plotmap-drawstyle-btn ${drawStyle === "freehand" ? "is-active" : ""}`}
            onClick={() => onDrawStyleChange("freehand")}
            disabled={saving}
          >
            Vẽ nét cong
          </button>
        </div>
      )}

      <div className="plotmap-hint-stats">
        <div className="plotmap-hint-stat">
          <small>Số đỉnh</small>
          <b>{preview.points}</b>
          <span className="plotmap-hint-sub">
            {selectedVertexIndex !== null ? `Chọn #${selectedVertexIndex + 1}` : "Tự do"}
          </span>
        </div>
        <div className="plotmap-hint-stat">
          <small>Diện tích thực</small>
          <b>{formatHa(preview.areaHa)}</b>
          <span className="plotmap-hint-sub">{formatAreaSqm(preview.areaHa)}</span>
        </div>
        <div className="plotmap-hint-stat">
          <small>{mode === "gps" ? "Sai số GPS" : "Chu vi"}</small>
          <b>
            {mode === "gps"
              ? gpsAccuracy !== null
                ? `${gpsAccuracy} m`
                : "-"
              : formatPerimeterMeters(preview.perimeterKm)}
          </b>
          <span className="plotmap-hint-sub">
            {mode === "edit" && declaredAreaHa != null
              ? `Gốc: ${formatHa(declaredAreaHa)}`
              : "Chuẩn WGS84"}
          </span>
        </div>
      </div>

      {preview.selfIntersections > 0 && (
        <div className="plotmap-inline-alert is-error" role="alert">
          Có {preview.selfIntersections} cạnh cắt chéo nhau. Hãy kéo chỉnh lại đỉnh trước khi lưu.
        </div>
      )}

      {preview.selfIntersections === 0 && message && (
        <div
          className={`plotmap-inline-alert ${
            message.tone === "error" ? "is-error" : message.tone === "ok" ? "is-ok" : ""
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="plotmap-hint-edit-tools">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onUndo}
          disabled={!canUndo || saving}
          title="Hoàn tác thao tác vừa thực hiện (F3 hoặc Ctrl+Z)"
        >
          Hoàn tác
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onRedo}
          disabled={!canRedo || saving}
          title="Làm lại thao tác vừa hoàn tác (Ctrl+Y)"
        >
          Làm lại
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => setConfirmKind("clear")}
          disabled={preview.points === 0 || saving}
          title="Xóa toàn bộ đỉnh đang vẽ để chấm lại từ đầu"
        >
          Xóa vẽ lại
        </button>
      </div>

      {(canDeleteSelected || (mode === "edit" && onResetOriginal) || onFlyToCoord) && (
        <div className="plotmap-hint-subtools">
          {canDeleteSelected && selectedVertexIndex !== null && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmKind("deleteVertex")}
              disabled={saving}
            >
              Xóa đỉnh #{selectedVertexIndex + 1}
            </button>
          )}
          {mode === "edit" && onResetOriginal && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onResetOriginal}
              disabled={saving}
            >
              Khôi phục gốc
            </button>
          )}
          {onFlyToCoord && (
            <button
              type="button"
              className={`btn btn-outline btn-sm ${showCoordBox ? "is-toggled" : ""}`}
              onClick={() => {
                setShowCoordBox((prev) => !prev);
                setCoordError(null);
              }}
              disabled={saving}
            >
              Nhập tọa độ
            </button>
          )}
        </div>
      )}

      {showCoordBox && onFlyToCoord && (
        <div className="plotmap-coord-box">
          <input
            type="text"
            value={coordInput}
            onChange={(e) => setCoordInput(e.target.value)}
            placeholder="Vĩ độ, Kinh độ (VD: 13.1254, 108.1852)"
            className="plotmap-coord-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleJumpCoord(false);
              }
            }}
          />
          <div className="plotmap-coord-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => handleJumpCoord(false)}
            >
              Phóng tới
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleJumpCoord(true)}
            >
              Thêm đỉnh này
            </button>
          </div>
          {coordError && <div className="plotmap-coord-err">{coordError}</div>}
        </div>
      )}

      {mode === "edit" && onUpdateAreaChange && (
        <label className="plotmap-area-sync-check">
          <input
            type="checkbox"
            checked={updateArea}
            onChange={(e) => onUpdateAreaChange(e.target.checked)}
          />
          <span>Cập nhật diện tích hồ sơ theo ranh giới mới</span>
        </label>
      )}

        <div className="plotmap-kbd-hint" aria-label="Phím tắt bổ trợ trên máy tính">
          <span>Phím tắt:</span>
          <span><kbd>F1</kbd> phóng to</span>
          <span><kbd>F2</kbd> thu nhỏ</span>
          <span><kbd>F3</kbd> hoàn tác</span>
        </div>
      </div>

      <footer className="plotmap-hint-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>
          Hủy
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onFinish}
          disabled={saving || preview.points < 3 || preview.selfIntersections > 0}
        >
          {saving
            ? "Đang lưu…"
            : mode === "compare"
              ? "Đối chiếu"
              : mode === "edit"
                ? "Lưu hình dạng"
                : "Hoàn tất"}
        </button>
      </footer>

      {confirmKind === "deleteVertex" && onDeleteSelectedVertex && selectedVertexIndex !== null && (
        <ConfirmDialog
          title={`Xóa đỉnh #${selectedVertexIndex + 1}`}
          message={`Xác nhận xóa đỉnh #${selectedVertexIndex + 1}?`}
          confirmLabel="Xóa đỉnh"
          danger
          onConfirm={() => {
            onDeleteSelectedVertex();
            setConfirmKind(null);
          }}
          onClose={() => setConfirmKind(null)}
        />
      )}

      {confirmKind === "clear" && (
        <ConfirmDialog
          title="Xóa vẽ lại"
          message="Xóa toàn bộ các đỉnh hiện tại để vẽ lại từ đầu?"
          confirmLabel="Xóa vẽ lại"
          danger
          onConfirm={() => {
            onClearVertices();
            setConfirmKind(null);
          }}
          onClose={() => setConfirmKind(null)}
        />
      )}
    </div>
  );
}
