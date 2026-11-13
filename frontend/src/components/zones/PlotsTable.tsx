import { useMemo } from "react";
import { SOURCE_BADGE, STATUS_BADGE } from "@/constants/plot-badges";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PlotFeature } from "@/types/geo";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types/geo";
import { formatCoords, formatHa, plotCenterCoords } from "@/utils/plot-utils";
import { getZoneColor, plotArea, type PlotsSummary } from "./zone-data";

interface PlotsTableProps {
  features: PlotFeature[];
  loading: boolean;
  summary: PlotsSummary;
  onEditPlot?: (code: string) => void;
}

const emptyCellStyle = { textAlign: "center", padding: 28, color: "var(--text-muted)" } as const;

export default function PlotsTable({ features, loading, summary, onEditPlot }: PlotsTableProps) {
  const preparedRows = useMemo(
    () =>
      features.map((feature) => {
        const props = feature.properties;
        return {
          props,
          areaText: formatHa(plotArea(feature)),
          center: plotCenterCoords(feature),
          zc: getZoneColor(props.zone || props.code),
        };
      }),
    [features],
  );

  return (
    <div className="card zones-list-card">
      <div className="card-header">
        <span>Danh sách thửa đất</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
          {summary.persisted > 0 ? `${summary.persisted} thửa từ PostGIS` : "Đang dùng dữ liệu mẫu"}
        </span>
      </div>
      <div className="table-wrap zones-table">
        <table>
          <thead>
            <tr>
              <th>Mã thửa</th>
              <th>Số tờ</th>
              <th>Số thửa</th>
              <th>Hộ sở hữu</th>
              <th>Diện tích</th>
              <th>Định vị (Vĩ độ, Kinh độ)</th>
              <th>Mã vùng</th>
              <th>Giống</th>
              <th>Nguồn dữ liệu</th>
              <th>Trạng thái</th>
              {onEditPlot && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {loading &&
              features.length === 0 &&
              [0, 1, 2, 3, 4].map((row) => (
                <tr key={`sk-${row}`} aria-hidden="true">
                  {Array.from({ length: onEditPlot ? 11 : 10 }, (_, cell) => (
                    <td key={cell}>
                      <Skeleton h={12} w={cell === 0 ? 70 : "80%"} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && features.length === 0 && (
              <tr>
                <td colSpan={onEditPlot ? 11 : 10} style={emptyCellStyle}>
                  Chưa có thửa đất. Dùng nút “Vẽ thửa” trên bản đồ hoặc nhập GeoJSON địa chính.
                </td>
              </tr>
            )}
            {preparedRows.map(({ props, areaText, center, zc }) => {
              return (
                <tr key={props.code} style={{ background: zc.rowTint }}>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--font-num-stack)",
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "0.015em",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: zc.text,
                        background: zc.bg,
                        border: "none",
                        padding: "4px 10px",
                        borderRadius: 8,
                        display: "inline-block",
                      }}
                    >
                      {props.code}
                    </span>
                  </td>
                  <td>{props.sheet || "—"}</td>
                  <td>{props.parcel || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{props.owner || "—"}</td>
                  <td>{areaText}</td>
                  <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "var(--text-secondary)" }}>
                    {formatCoords(center?.lat, center?.lng)}
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--font-num-stack)",
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "0.015em",
                        fontSize: 12,
                        fontWeight: 600,
                        background: zc.bg,
                        color: zc.text,
                        border: "none",
                        padding: "4px 10px",
                        borderRadius: 8,
                        display: "inline-block",
                      }}
                    >
                      {props.zone || "—"}
                    </span>
                  </td>
                  <td>{props.variety || "—"}</td>
                  <td>
                    <span className={`badge ${SOURCE_BADGE[props.source] ?? "badge-gray"}`}>
                      {SOURCE_LABELS[props.source] ?? "Khảo sát"}
                    </span>
                    {props.sourceRef && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                        {props.sourceRef}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[props.status] ?? "badge-gray"}`}>
                      {STATUS_LABELS[props.status] ?? "Chờ duyệt"}
                    </span>
                  </td>
                  {onEditPlot && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => onEditPlot(props.code)}
                        title="Mở bản đồ để chỉnh sửa hình dạng ranh giới thửa đất này"
                      >
                        Sửa hình dạng
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {features.length} thửa · {formatHa(summary.totalArea)}
        </span>
        <span>Nguồn: PostGIS khi có DATABASE_URL, ngược lại dùng dữ liệu mẫu</span>
      </div>
    </div>
  );
}
