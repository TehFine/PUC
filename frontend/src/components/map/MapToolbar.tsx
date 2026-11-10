import type { BaseLayer, Mode } from "./map-types";

interface MapToolbarProps {
  baseLayer: BaseLayer;
  mode: Mode;
  ready: boolean;
  canCompare: boolean;
  canEditShape?: boolean;
  importing: boolean;
  onBaseLayerChange: (layer: BaseLayer) => void;
  onDraw: () => void;
  onGps: () => void;
  onCompare: () => void;
  onEditShape?: () => void;
  onImport: () => void;
}

export default function MapToolbar({
  baseLayer,
  mode,
  ready,
  canCompare,
  canEditShape = false,
  importing,
  onBaseLayerChange,
  onDraw,
  onGps,
  onCompare,
  onEditShape,
  onImport,
}: MapToolbarProps) {
  return (
    <div className="plotmap-toolbar">
      <div className="map-toolgroup">
        <button
          type="button"
          className={`map-tool ${baseLayer === "satellite" ? "active" : ""}`}
          onClick={() => onBaseLayerChange("satellite")}
          title="Ảnh vệ tinh độ nét cao kèm mạng lưới đường liên thôn và ranh giới"
        >
          Vệ tinh HD
        </button>
        <button
          type="button"
          className={`map-tool ${baseLayer === "streets" ? "active" : ""}`}
          onClick={() => onBaseLayerChange("streets")}
          title="Bản đồ giao thông & địa hình chi tiết OpenStreetMap"
        >
          Đường phố
        </button>
        <button
          type="button"
          className={`map-tool ${baseLayer === "map" ? "active" : ""}`}
          onClick={() => onBaseLayerChange("map")}
          title="Bản đồ nền tối tương phản cao"
        >
          Nền tối
        </button>
      </div>
      <div className="map-toolgroup map-toolgroup-col">
        {onEditShape && (
          <button
            type="button"
            className={`map-tool ${mode === "edit" ? "active" : ""}`}
            onClick={onEditShape}
            disabled={!ready || (!canEditShape && mode !== "edit")}
            title="Chọn một thửa đất trên bản đồ rồi bấm để chỉnh sửa hình dạng ranh giới"
          >
            Sửa hình dạng
          </button>
        )}
        <button
          type="button"
          className={`map-tool ${mode === "draw" ? "active" : ""}`}
          onClick={onDraw}
          disabled={!ready}
        >
          Vẽ thửa
        </button>
        <button
          type="button"
          className={`map-tool ${mode === "gps" ? "active" : ""}`}
          onClick={onGps}
          disabled={!ready}
        >
          Đo GPS
        </button>
        <button
          type="button"
          className={`map-tool ${mode === "compare" ? "active" : ""}`}
          onClick={onCompare}
          disabled={!canCompare}
        >
          Đối chiếu
        </button>
        <button type="button" className="map-tool" onClick={onImport} disabled={importing}>
          {importing ? "Đang nhập…" : "Nhập địa chính"}
        </button>
      </div>
    </div>
  );
}
