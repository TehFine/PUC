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
    <aside className="card zone-source-card" aria-label="Thống kê mã vùng và nguồn dữ liệu thửa">
      {zoneRows && zoneRows.length > 0 && (
        <div className="zone-source-list zone-source-zones">
          {zoneRows.map((zone) => {
            const zc = getZoneColor(zone.code);
            return (
              <div
                className="zone-source-row"
                key={zone.code}
                title={`${zone.code} (${zone.village})`}
              >
                <span className="zone-source-code" style={{ color: zc.text }}>
                  {zone.code}
                </span>
                <strong className="zone-source-count">{zone.count}</strong>
              </div>
            );
          })}
        </div>
      )}
      <div className="zone-source-list zone-source-origins">
        {(Object.keys(SOURCE_LABELS) as PlotSource[]).map((source) => (
          <div className="zone-source-row" key={source}>
            <span className="zone-source-label">
              <i
                className="zone-source-swatch"
                style={{ background: SOURCE_COLORS[source] }}
                aria-hidden="true"
              />
              <span>{SOURCE_LABELS[source]}</span>
            </span>
            <strong className="zone-source-count">{sources[source] ?? 0}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}
