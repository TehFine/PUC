import { SOURCE_BADGE, STATUS_BADGE } from "@/constants/plot-badges";
import type { PlotFeature } from "@/types/geo";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types/geo";
import { formatHa, polygonAreaHa, type PlotOverlap } from "@/utils/plot-utils";

interface PlotDetailsProps {
  feature: PlotFeature;
  overlaps: PlotOverlap[];
  onCompare: () => void;
}

export default function PlotDetails({ feature, overlaps, onCompare }: PlotDetailsProps) {
  const props = feature.properties;
  return (
    <>
      <div className="plotmap-source">
        <span className={`badge ${SOURCE_BADGE[props.source]}`}>{SOURCE_LABELS[props.source]}</span>
        <span className={`badge ${STATUS_BADGE[props.status]}`}>{STATUS_LABELS[props.status]}</span>
        {props.persisted === false && <span className="badge badge-gray">Chưa lưu DB</span>}
      </div>

      <div className="plotmap-facts">
        <div><span>Số tờ</span><strong>{props.sheet || "—"}</strong></div>
        <div><span>Số thửa</span><strong>{props.parcel || "—"}</strong></div>
        <div className="full"><span>Chủ hộ</span><strong>{props.owner || "—"}</strong></div>
        <div><span>Thôn</span><strong>{props.village || "—"}</strong></div>
        <div><span>Mã vùng</span><strong>{props.zone || "—"}</strong></div>
        <div className="full"><span>Giống</span><strong>{props.variety || "—"}</strong></div>
        <div><span>Năm trồng</span><strong>{props.year ?? "—"}</strong></div>
        <div><span>Diện tích khai báo</span><strong>{formatHa(props.areaHa)}</strong></div>
        <div className="full">
          <span>Diện tích polygon</span>
          <strong>{formatHa(polygonAreaHa(feature.geometry))}</strong>
        </div>
        {props.sourceRef && (
          <div className="full">
            <span>Nguồn nhập</span>
            <strong>{props.sourceRef}</strong>
          </div>
        )}
      </div>

      {overlaps.length > 0 ? (
        <div className="plotmap-warnbox danger">
          <div className="plotmap-warn-title">Chồng lấn với {overlaps.length} thửa</div>
          {overlaps.map((overlap) => (
            <p key={overlap.code}>
              {overlap.code} · {formatHa(overlap.areaHa)} · {overlap.owner || "Chưa có chủ hộ"}
            </p>
          ))}
        </div>
      ) : (
        <div className="plotmap-warnbox ok">
          <div className="plotmap-warn-title">Không phát hiện chồng lấn</div>
          <p>Polygon không giao với thửa nào khác trong dữ liệu hiện có.</p>
        </div>
      )}

      <div className="plotmap-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onCompare}>
          Đối chiếu thửa này
        </button>
      </div>
    </>
  );
}
