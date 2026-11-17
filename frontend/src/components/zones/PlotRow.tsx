import { STATUS_BADGE } from "@/constants/plot-badges";
import type { PlotFeature } from "@/types/geo";
import { STATUS_LABELS } from "@/types/geo";
import { formatHa } from "@/utils/plot-utils";
import { getZoneColor, plotArea } from "./zone-data";

export default function PlotRow({ feature }: { feature: PlotFeature }) {
  const props = feature.properties;
  const zc = getZoneColor(props.zone || props.code);
  return (
    <div className="zg-item">
      <span
        className="badge"
        style={{
          fontFamily: "var(--font-num-stack)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.01em",
          fontSize: 12,
          fontWeight: 700,
          color: zc.text,
        }}
      >
        {props.code}
      </span>
      <span className="zg-meta">
        {props.owner || "-"} - {formatHa(plotArea(feature))}
      </span>
      <span className={`badge ${STATUS_BADGE[props.status]}`}>
        {STATUS_LABELS[props.status]}
      </span>
    </div>
  );
}
