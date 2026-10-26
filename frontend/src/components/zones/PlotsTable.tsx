import { SOURCE_BADGE, STATUS_BADGE } from "@/constants/plot-badges";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PlotFeature } from "@/types/geo";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types/geo";
import { formatHa } from "@/utils/plot-utils";
import { plotArea, type PlotsSummary } from "./zone-data";

interface PlotsTableProps {
  features: PlotFeature[];
  loading: boolean;
  summary: PlotsSummary;
}

const emptyCellStyle = { textAlign: "center", padding: 28, color: "var(--text-muted)" } as const;

export default function PlotsTable({ features, loading, summary }: PlotsTableProps) {
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
              <th>Mã vùng</th>
              <th>Giống</th>
              <th>Năm trồng</th>
              <th>Nguồn dữ liệu</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              features.length === 0 &&
              [0, 1, 2, 3, 4].map((row) => (
                <tr key={`sk-${row}`} aria-hidden="true">
                  {Array.from({ length: 10 }, (_, cell) => (
                    <td key={cell}>
                      <Skeleton h={12} w={cell === 0 ? 70 : "80%"} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && features.length === 0 && (
              <tr>
                <td colSpan={10} style={emptyCellStyle}>
                  Chưa có thửa đất. Dùng nút “Vẽ thửa” trên bản đồ hoặc nhập GeoJSON địa chính.
                </td>
              </tr>
            )}
            {features.map((feature) => {
              const props = feature.properties;
              return (
                <tr key={props.code}>
                  <td style={{ fontFamily: "monospace", color: "var(--green-700)", fontSize: 12 }}>
                    {props.code}
                  </td>
                  <td>{props.sheet || "—"}</td>
                  <td>{props.parcel || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{props.owner || "—"}</td>
                  <td>{formatHa(plotArea(feature))}</td>
                  <td>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gold)" }}>
                      {props.zone || "—"}
                    </span>
                  </td>
                  <td>{props.variety || "—"}</td>
                  <td>{props.year ?? "—"}</td>
                  <td>
                    <span className={`badge ${SOURCE_BADGE[props.source]}`}>{SOURCE_LABELS[props.source]}</span>
                    {props.sourceRef && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                        {props.sourceRef}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[props.status]}`}>{STATUS_LABELS[props.status]}</span>
                  </td>
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
