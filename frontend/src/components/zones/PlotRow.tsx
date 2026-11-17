import { STATUS_BADGE } from "@/constants/plot-badges";
import type { PlotFeature } from "@/types/geo";
import { STATUS_LABELS } from "@/types/geo";
import { formatHa } from "@/utils/plot-utils";
import { getZoneColor, plotArea } from "./zone-data";

interface PlotRowProps {
  feature: PlotFeature;
  onSelect?: (code: string) => void;
}

export default function PlotRow({ feature, onSelect }: PlotRowProps) {
  const props = feature.properties;
  const zc = getZoneColor(props.zone || props.code);
  const areaLabel = formatHa(plotArea(feature));
  const ownerLabel = props.owner || "Chưa gán chủ hộ";

  const content = (
    <>
      <div className="zg-plot-main">
        <strong className="zg-plot-owner">{ownerLabel}</strong>
        <span className="zg-plot-sub">
          <span style={{ color: zc.text, fontWeight: 700 }}>{props.code}</span>
          {props.village ? `, ${props.village}` : ""}
          {`, ${areaLabel}`}
        </span>
      </div>
      <span className={`badge ${STATUS_BADGE[props.status]}`}>
        {STATUS_LABELS[props.status]}
      </span>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className="zg-item zg-item-btn"
        onClick={() => onSelect(props.code)}
      >
        {content}
      </button>
    );
  }

  return <div className="zg-item">{content}</div>;
}
