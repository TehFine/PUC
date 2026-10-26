import type { PlotSource } from "@/types/geo";
import { SOURCE_COLORS, SOURCE_LABELS } from "@/types/geo";

export default function ZoneSourceCard({ sources }: { sources: Record<string, number> }) {
  return (
    <aside className="card zone-source-card">
      <div className="zone-source-list">
        {(Object.keys(SOURCE_LABELS) as PlotSource[]).map((source) => (
          <span className="zone-source-item" key={source}>
            <i style={{ background: SOURCE_COLORS[source] }} />
            {SOURCE_LABELS[source]} <strong>{sources[source] ?? 0}</strong>
          </span>
        ))}
      </div>
    </aside>
  );
}
