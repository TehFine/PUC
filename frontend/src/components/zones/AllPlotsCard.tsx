"use client";

import { useMemo, useState } from "react";
import type { PlotFeature } from "@/types/geo";
import PlotRow from "./PlotRow";

interface AllPlotsCardProps {
  features: PlotFeature[];
  zoneCount: number;
  onSelectPlot?: (code: string) => void;
}

function foldSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

export default function AllPlotsCard({ features, zoneCount, onSelectPlot }: AllPlotsCardProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = foldSearch(query);
    if (!q) return features;
    return features.filter((feature) => {
      const p = feature.properties;
      const haystack = foldSearch(
        `${p.owner || ""} ${p.code || ""} ${p.village || ""} ${p.zone || ""} ${p.parcel || ""}`,
      );
      return haystack.includes(q);
    });
  }, [features, query]);

  return (
    <aside className="card zones-sheet-card zones-sheet-list">
      <div className="zones-sidebar-head" style={{ alignItems: "center" }}>
        <div className="zones-sidebar-title" style={{ fontVariantNumeric: "tabular-nums" }}>
          {filtered.length}/{features.length} thửa
        </div>
        <span className="badge badge-gray" style={{ fontVariantNumeric: "tabular-nums" }}>
          {zoneCount} mã vùng
        </span>
      </div>

      <div className="zones-sheet-search-wrap">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên hộ, mã thửa, thôn..."
          className="zones-sheet-search-input"
          aria-label="Tìm hộ hoặc mã thửa"
        />
      </div>

      <div className="zones-zone-list">
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: "18px 8px" }}>
            Không tìm thấy hộ hoặc thửa đất phù hợp.
          </div>
        ) : (
          filtered.map((feature) => (
            <PlotRow
              key={feature.properties.code}
              feature={feature}
              onSelect={onSelectPlot}
            />
          ))
        )}
      </div>
    </aside>
  );
}
