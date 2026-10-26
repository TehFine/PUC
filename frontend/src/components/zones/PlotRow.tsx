import { STATUS_BADGE } from "@/constants/plot-badges";
import type { PlotFeature } from "@/types/geo";
import { STATUS_LABELS } from "@/types/geo";
import { formatHa } from "@/utils/plot-utils";
import { plotArea } from "./zone-data";

export default function PlotRow({ feature }: { feature: PlotFeature }) {
  const props = feature.properties;
  return (
    <div className="zg-item">
      <span className="badge badge-gray" style={{ fontFamily: "monospace", fontSize: 10.5 }}>
        {props.code}
      </span>
      <span className="zg-meta">
        {props.owner || "—"} · {formatHa(plotArea(feature))}
      </span>
      <span className={`badge ${STATUS_BADGE[props.status]}`} style={{ fontSize: 9.5 }}>
        {STATUS_LABELS[props.status]}
      </span>
    </div>
  );
}
