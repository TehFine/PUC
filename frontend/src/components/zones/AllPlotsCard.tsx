import type { PlotFeature } from "@/types/geo";
import PlotRow from "./PlotRow";

interface AllPlotsCardProps {
  features: PlotFeature[];
  zoneCount: number;
}

export default function AllPlotsCard({ features, zoneCount }: AllPlotsCardProps) {
  return (
    <aside className="card zones-sheet-card zones-sheet-list">
      <div className="zones-sidebar-head">
        <div>
          <div className="zones-sidebar-kicker">Tất cả thửa đất</div>
          <div className="zones-sidebar-title">{features.length} thửa</div>
        </div>
        <span className="badge badge-gray">{zoneCount} mã vùng</span>
      </div>
      <div className="zones-zone-list">
        {features.map((feature) => (
          <PlotRow key={feature.properties.code} feature={feature} />
        ))}
      </div>
    </aside>
  );
}
