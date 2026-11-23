"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ADMIN_EDIT_PLOT_EVENT, hasPendingEditPlotCode } from "@/components/admin/shared/counts-events";
import type { PendingPlotAction } from "@/components/map/MapView";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { MapSkeleton } from "@/components/ui/Skeleton";
import AllPlotsCard from "@/components/zones/AllPlotsCard";
import PlotsTable from "@/components/zones/PlotsTable";
import ZoneDetailCard from "@/components/zones/ZoneDetailCard";
import ZoneSourceCard from "@/components/zones/ZoneSourceCard";
import ZonesOverviewCard from "@/components/zones/ZonesOverviewCard";
import { buildZoneRows, summarizePlots } from "@/components/zones/zone-data";
import { canRedrawPlotShapeByRole } from "@/constants/roles";
import { usePlots } from "@/hooks/use-plots";
import {
  ADMIN_LAST_URL_KEY,
  clearPersistedUiValue,
  readInitialUrlSubTab,
  useBackLayer,
  usePersistedState,
  useUrlSubTab,
} from "@/lib/back-navigation";
import { animatePopupExit } from "@/lib/popup-motion";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

type ZoneView = "map" | "list";
type SheetMode = "overview" | "zone" | "list" | null;
const isZoneView = (raw: string): raw is ZoneView => raw === "map" || raw === "list";

export default function Zones() {
  const { session, can } = useAuth();
  const canEditPlotShape = canRedrawPlotShapeByRole(session?.user.role) && can("plots", "update");
  const { plots, loading, error, refresh } = usePlots();
  const [view, setView] = useState<ZoneView>(() =>
    hasPendingEditPlotCode() ? "map" : readInitialUrlSubTab("sub", "map", isZoneView, ADMIN_LAST_URL_KEY),
  );
  const [sheet, setSheet] = usePersistedState<SheetMode>(
    "admin:zones:sheet",
    null,
    (v): v is SheetMode => v === null || v === "overview" || v === "zone" || v === "list",
  );
  const [activeZone, setActiveZone] = usePersistedState<string | null>(
    "admin:zones:active-zone",
    null,
    (v): v is string | null => v === null || typeof v === "string",
  );
  const [pendingPlotAction, setPendingPlotAction] = useState<PendingPlotAction | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetBackdropRef = useRef<HTMLDivElement>(null);
  const sheetHeadRef = useRef<HTMLDivElement>(null);
  const backdropDownRef = useRef(false);
  const isClosingSheetRef = useRef(false);
  const features = useMemo(() => plots?.features ?? [], [plots]);

  const closeSheet = useCallback(() => {
    if (isClosingSheetRef.current) return;
    const el = sheetRef.current;
    if (el && isMobile) {
      isClosingSheetRef.current = true;
      const closeDuration = animatePopupExit(el, sheetBackdropRef.current, "sheet");
      window.setTimeout(() => {
        isClosingSheetRef.current = false;
        setSheet(null);
      }, closeDuration);
      return;
    }
    setSheet(null);
  }, [isMobile, setSheet]);

  useEffect(() => {
    if (!isMobile || !sheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeSheet();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, sheet, closeSheet]);

  const selectZoneView = useUrlSubTab<ZoneView>(
    "sub",
    view,
    setView,
    "map",
    (raw): raw is ZoneView => raw === "map" || raw === "list",
  );
  useBackLayer(Boolean(isMobile && sheet), closeSheet);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEditPlot = () => {
      setSheet(null);
      if (view !== "map") {
        selectZoneView("map");
      }
    };
    window.addEventListener(ADMIN_EDIT_PLOT_EVENT, onEditPlot);
    return () => window.removeEventListener(ADMIN_EDIT_PLOT_EVENT, onEditPlot);
  }, [selectZoneView, setSheet, view]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    delete el.dataset.closing;
    el.style.removeProperty("animation");
    el.style.removeProperty("transition");
    el.style.removeProperty("transform");
    el.style.removeProperty("opacity");
    el.style.removeProperty("pointer-events");
  }, [sheet]);

  useSheetSwipe({
    sheetRef,
    handleRef: sheetHeadRef,
    onDismiss: closeSheet,
    enabled: isMobile && Boolean(sheet),
  });

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

  const openPlotOnMap = useCallback(
    (code: string, action: PendingPlotAction["action"] = "inspect") => {
      setPendingPlotAction({ code, action, seq: Date.now() });
      setSheet(null);
      if (view !== "map") {
        selectZoneView("map");
      }
    },
    [selectZoneView, setSheet, view],
  );

  return (
    <div className="zones-page">
      {error && <div className="plotmap-note plotmap-note-error">{error}</div>}

      <div className="zones-topbar">
        <div className="zone-view-tabs">
          <button
            type="button"
            className={`zone-view-tab ${listActive ? "" : "active"}`}
            onClick={() => {
              clearPersistedUiValue("admin:map:selected-plot");
              selectZoneView("map");
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
                selectZoneView("map");
                setSheet("list");
                return;
              }
              setSheet(null);
              selectZoneView("list");
            }}
          >
            Danh sách thửa
            <span className="zone-view-count">{features.length}</span>
          </button>
        </div>
      </div>

      {view === "map" ? (
        <div className="zones-workspace">
          {isMobile && sheet && (
            <div
              ref={sheetBackdropRef}
              className="zones-sheet-backdrop"
              aria-hidden="true"
              onPointerDown={(e) => {
                backdropDownRef.current = e.target === e.currentTarget;
              }}
              onClick={(e) => {
                const startedOnBackdrop = backdropDownRef.current;
                backdropDownRef.current = false;
                if (startedOnBackdrop && e.target === e.currentTarget) {
                  closeSheet();
                }
              }}
            />
          )}
          <div
            ref={sheetRef}
            className={`zones-left-col${sheet ? " sheet-open" : ""}`}
            data-sheet={sheet ?? "none"}
          >
            <div ref={sheetHeadRef} className="sheet-head pt-sheet-topbar">
              <div className="sheet-head-row">
                <span className="sheet-title">
                  {sheet === "list"
                    ? "Danh sách thửa"
                    : sheet === "zone"
                      ? activeZoneRow?.code ?? "Chi tiết vùng"
                      : "Tổng quan vùng trồng"}
                </span>
                <button type="button" className="pp-close" onClick={closeSheet} aria-label="Đóng">
                  <CloseCircleIcon size={28} />
                </button>
              </div>
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
            <ZoneSourceCard sources={summary.sources} zoneRows={zoneRows} />
            {isMobile && sheet === "zone" && (
              <ZoneDetailCard
                zone={activeZoneRow}
                plots={activeZonePlots}
                onSelectPlot={(code) => openPlotOnMap(code, "inspect")}
              />
            )}
            {isMobile && sheet === "list" && (
              <AllPlotsCard
                features={features}
                zoneCount={summary.zones}
                onSelectPlot={(code) => openPlotOnMap(code, "inspect")}
              />
            )}
          </div>

          <div className="zones-map-area">
            <MapView
              plots={plots}
              loading={loading}
              canEditShape={canEditPlotShape}
              onChanged={refresh}
              pendingPlotAction={pendingPlotAction}
              onPendingPlotActionHandled={() => setPendingPlotAction(null)}
            />
          </div>
        </div>
      ) : (
        <PlotsTable
          features={features}
          loading={loading}
          summary={summary}
          onEditPlot={canEditPlotShape ? (code) => openPlotOnMap(code, "edit") : undefined}
          onRedrawPlot={canEditPlotShape ? (code) => openPlotOnMap(code, "redraw") : undefined}
        />
      )}
    </div>
  );
}
