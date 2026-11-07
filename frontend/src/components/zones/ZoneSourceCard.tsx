import type { PlotSource } from "@/types/geo";
import { SOURCE_COLORS, SOURCE_LABELS } from "@/types/geo";
import { getZoneColor, type ZoneRowData } from "./zone-data";

export default function ZoneSourceCard({
  sources,
  zoneRows,
}: {
  sources: Record<string, number>;
  zoneRows?: ZoneRowData[];
}) {
  return (
    <aside className="card zone-source-card">
      {zoneRows && zoneRows.length > 0 && (
        <div className="zone-source-list" style={{ marginBottom: 8 }}>
          {zoneRows.map((zone) => {
            const zc = getZoneColor(zone.code);
            return (
              <span
                className="zone-source-item"
                key={zone.code}
                title={`${zone.code} (${zone.village})`}
                style={{
                  background: zc.bg,
                  color: zc.text,
                  padding: "3px 8px",
                  borderRadius: 7,
                  border: "none",
                }}
              >
                <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{zone.code}</span>{" "}
                <strong>{zone.count}</strong>
              </span>
            );
          })}
        </div>
      )}
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
