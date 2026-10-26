import { formatHa } from "@/utils/plot-utils";
import type { PlotFeature } from "@/types/geo";
import PlotRow from "./PlotRow";
import type { ZoneRowData } from "./zone-data";

interface ZoneDetailCardProps {
  zone: ZoneRowData | null;
  plots: PlotFeature[];
}

export default function ZoneDetailCard({ zone, plots }: ZoneDetailCardProps) {
  return (
    <aside className="card zones-sheet-card zones-sheet-zone">
      {zone && (
        <>
          <div className="zones-sidebar-head">
            <div>
              <div className="zones-sidebar-kicker">Mã vùng</div>
              <div className="zones-sidebar-title">{zone.code}</div>
            </div>
            <span className={`badge ${zone.cls}`}>{zone.status}</span>
          </div>

          <div className="zone-stats embedded">
            <div className="zs-item">
              <div className="zs-val">{zone.count}</div>
              <div className="zs-label">Thửa</div>
            </div>
            <div className="zs-item">
              <div className="zs-val">{formatHa(zone.area)}</div>
              <div className="zs-label">Diện tích</div>
            </div>
            <div className="zs-item">
              <div className="zs-val">{zone.village}</div>
              <div className="zs-label">Thôn</div>
            </div>
          </div>

          <div className="zones-sidebar-head zones-sidebar-head-sub">
            <span className="zones-sidebar-title">Thửa trong vùng</span>
            <span className="zones-sidebar-count">{plots.length}</span>
          </div>

          <div className="zones-zone-list">
            {plots.length === 0 && (
              <div className="empty-state" style={{ padding: 20 }}>
                Chưa có thửa trong vùng này
              </div>
            )}
            {plots.map((feature) => (
              <PlotRow key={feature.properties.code} feature={feature} />
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
