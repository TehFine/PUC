import { formatHa } from "@/utils/plot-utils";
import { SoftBars } from "@/components/ui/charts/KpiCharts";
import type { PlotsSummary, ZoneRowData } from "./zone-data";

interface ZonesOverviewCardProps {
  plotCount: number;
  summary: PlotsSummary;
  zoneRows: ZoneRowData[];
  isMobile: boolean;
  onOpenZone: (code: string) => void;
}

export default function ZonesOverviewCard({
  plotCount,
  summary,
  zoneRows,
  isMobile,
  onOpenZone,
}: ZonesOverviewCardProps) {
  const areaByZone = [...zoneRows]
    .sort((a, b) => b.area - a.area)
    .slice(0, 8)
    .map((zone) => {
      const match = zone.code.match(/VT-(\d+)/i);
      const shortLabel = match
        ? `VT-${parseInt(match[1], 10).toString().padStart(2, "0")}`
        : zone.code.replace(/^[A-Z]{2,4}-/, "");
      return {
        label: zone.code,
        shortLabel,
        value: Math.round(zone.area * 100) / 100,
      };
    });
  const formatArea = (v: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <aside className="card zones-sidebar">
      <div className="zones-sidebar-head">
        <div>
          <div className="zones-sidebar-kicker">Tổng quan dữ liệu</div>
          <div className="zones-sidebar-title">{plotCount} thửa đất</div>
        </div>
        <span className="badge badge-gray">{summary.zones} mã vùng</span>
      </div>

      <div className="zone-stats embedded">
        <div className="zs-item">
          <div className="zs-val">{plotCount}</div>
          <div className="zs-label">Thửa hiển thị</div>
        </div>
        <div className="zs-item">
          <div className="zs-val">{formatHa(summary.totalArea)}</div>
          <div className="zs-label">Tổng diện tích</div>
        </div>
        <div className="zs-item">
          <div className="zs-val">{summary.zones}</div>
          <div className="zs-label">Mã vùng</div>
        </div>
      </div>

      {areaByZone.length > 1 && (
        <div className="zones-chart">
          <div className="zones-chart-title">Diện tích theo mã vùng</div>
          <SoftBars
            data={areaByZone}
            tone="lime"
            unit=" ha"
            height={130}
            highlight="max"
            formatValue={formatArea}
            ariaLabel="Diện tích theo mã vùng"
          />
        </div>
      )}

      <div className="zones-sidebar-head zones-sidebar-head-sub">
        <span className="zones-sidebar-title">Nhóm mã vùng</span>
        <span className="zones-sidebar-count">{zoneRows.length}</span>
      </div>

      <div className="zones-zone-list">
        {zoneRows.map((zone) => (
          <div
            key={zone.code}
            className="zg-item"
            onClick={isMobile ? () => onOpenZone(zone.code) : undefined}
            role={isMobile ? "button" : undefined}
            tabIndex={isMobile ? 0 : undefined}
            onKeyDown={
              isMobile
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenZone(zone.code);
                    }
                  }
                : undefined
            }
          >
            <span className="badge badge-gray" style={{ fontFamily: "monospace", fontSize: 10.5 }}>
              {zone.code}
            </span>
            <span className="zg-meta">
              {zone.village} · {zone.count} thửa · {formatHa(zone.area)}
            </span>
            <span className={`badge ${zone.cls}`}>
              {zone.status}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
