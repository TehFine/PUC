"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { MapSkeleton } from "@/components/ui/Skeleton";
import AllPlotsCard from "@/components/zones/AllPlotsCard";
import PlotsTable from "@/components/zones/PlotsTable";
import ZoneDetailCard from "@/components/zones/ZoneDetailCard";
import ZoneSourceCard from "@/components/zones/ZoneSourceCard";
import ZonesOverviewCard from "@/components/zones/ZonesOverviewCard";
import { buildZoneRows, summarizePlots } from "@/components/zones/zone-data";
import { usePlots } from "@/hooks/use-plots";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

type ZoneView = "map" | "list";
type SheetMode = "overview" | "zone" | "list" | null;

export default function Zones() {
  const { plots, loading, error, refresh } = usePlots();
  const [view, setView] = useState<ZoneView>("map");
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const features = useMemo(() => plots?.features ?? [], [plots]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const summary = useMemo(() => summarizePlots(features), [features]);
  const zoneRows = useMemo(() => buildZoneRows(features), [features]);

  const listActive = view === "list" || (isMobile && sheet === "list");

  const activeZoneRow = useMemo(
    () => zoneRows.find((zone) => zone.code === activeZone) ?? null,
    [zoneRows, activeZone],
  );

  const activeZonePlots = useMemo(
    () => features.filter((feature) => feature.properties.zone === activeZone),
    [features, activeZone],
  );

  const openZone = (code: string) => {
    setActiveZone(code);
    setSheet("zone");
  };

  return (
    <div className="zones-page">
      {error && <div className="plotmap-note plotmap-note-error">{error}</div>}

      <div className="zones-topbar">
        <div className="zone-view-tabs">
          <button
            type="button"
            className={`zone-view-tab ${listActive ? "" : "active"}`}
            onClick={() => {
              setView("map");
              setSheet(null);
            }}
          >
            Bản đồ toàn cảnh
          </button>
          <button
            type="button"
            className={`zone-view-tab ${listActive ? "active" : ""}`}
            onClick={() => {
              if (isMobile) {
                setView("map");
                setSheet("list");
                return;
              }
              setSheet(null);
              setView("list");
            }}
          >
            Danh sách thửa
            <span className="zone-view-count">{features.length}</span>
          </button>
        </div>
      </div>

      {view === "map" ? (
        <div className="zones-workspace">
          <div className={`zones-left-col${sheet ? " sheet-open" : ""}`} data-sheet={sheet ?? "none"}>
            <div className="sheet-head">
              <span className="sheet-grip" />
              <span className="sheet-title">
                {sheet === "list"
                  ? "Danh sách thửa"
                  : sheet === "zone"
                    ? activeZoneRow?.code ?? "Chi tiết vùng"
                    : "Tổng quan vùng trồng"}
              </span>
              <button type="button" className="map-tool" onClick={() => setSheet(null)}>
                Đóng
              </button>
            </div>

            {sheet && (
              <div className="sheet-tabs" role="tablist" aria-label="Nội dung bảng điều khiển">
                <button
                  type="button"
                  role="tab"
                  aria-selected={sheet === "overview"}
                  className={`sheet-tab ${sheet === "overview" ? "active" : ""}`}
                  onClick={() => setSheet("overview")}
                >
                  Tổng quan
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sheet === "list"}
                  className={`sheet-tab ${sheet === "list" ? "active" : ""}`}
                  onClick={() => setSheet("list")}
                >
                  Danh sách
                </button>
                {activeZoneRow && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sheet === "zone"}
                    className={`sheet-tab ${sheet === "zone" ? "active" : ""}`}
                    onClick={() => setSheet("zone")}
                  >
                    Vùng
                  </button>
                )}
              </div>
            )}

            <ZonesOverviewCard
              plotCount={features.length}
              summary={summary}
              zoneRows={zoneRows}
              isMobile={isMobile}
              onOpenZone={openZone}
            />
            <ZoneSourceCard sources={summary.sources} />
            <ZoneDetailCard zone={activeZoneRow} plots={activeZonePlots} />
            <AllPlotsCard features={features} zoneCount={summary.zones} />
          </div>

          <div className="zones-map-area">
            <MapView plots={plots} loading={loading} onChanged={refresh} />
          </div>

          <button type="button" className="map-sheet-btn" onClick={() => setSheet("overview")}>
            {features.length} thửa
          </button>
        </div>
      ) : (
        <PlotsTable features={features} loading={loading} summary={summary} />
      )}
    </div>
  );
}
