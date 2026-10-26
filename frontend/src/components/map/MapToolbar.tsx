import type { BaseLayer, Mode } from "./map-types";

interface MapToolbarProps {
  baseLayer: BaseLayer;
  mode: Mode;
  ready: boolean;
  canCompare: boolean;
  importing: boolean;
  onBaseLayerChange: (layer: BaseLayer) => void;
  onDraw: () => void;
  onGps: () => void;
  onCompare: () => void;
  onImport: () => void;
}

export default function MapToolbar({
  baseLayer,
  mode,
  ready,
  canCompare,
  importing,
  onBaseLayerChange,
  onDraw,
  onGps,
  onCompare,
  onImport,
}: MapToolbarProps) {
  return (
    <div className="plotmap-toolbar">
      <div className="map-toolgroup">
        <button
          type="button"
          className={`map-tool ${baseLayer === "map" ? "active" : ""}`}
          onClick={() => onBaseLayerChange("map")}
        >
          Bản đồ tối
        </button>
        <button
          type="button"
          className={`map-tool ${baseLayer === "satellite" ? "active" : ""}`}
          onClick={() => onBaseLayerChange("satellite")}
        >
          Vệ tinh
        </button>
      </div>
      <div className="map-toolgroup map-toolgroup-col">
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
