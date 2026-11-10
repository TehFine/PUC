interface MapZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onFocusSelected?: () => void;
  zoomLevel?: number;
}

export default function MapZoomControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onFocusSelected,
  zoomLevel,
}: MapZoomControlsProps) {
  return (
    <div className="plotmap-zoom">
      {typeof zoomLevel === "number" && (
        <span className="map-zoom-badge" title="Mức thu phóng hiện tại (tối đa Z22)">
          Z{zoomLevel.toFixed(1).replace(/\.0$/, "")}
        </span>
      )}
      {onFocusSelected && (
        <button
          type="button"
          className="map-tool"
          onClick={onFocusSelected}
          title="Phóng sát tới thửa đất đang chọn để xem kích thước các cạnh (mét)"
        >
          Sát thửa
        </button>
      )}
      <button type="button" className="map-tool" onClick={onZoomIn}>
        Phóng to
      </button>
      <button type="button" className="map-tool" onClick={onZoomOut}>
        Thu nhỏ
      </button>
      <button type="button" className="map-tool" onClick={onFit}>
        Toàn bộ
      </button>
    </div>
  );
}
