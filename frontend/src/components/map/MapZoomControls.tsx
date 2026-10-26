interface MapZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export default function MapZoomControls({ onZoomIn, onZoomOut, onFit }: MapZoomControlsProps) {
  return (
    <div className="plotmap-zoom">
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
