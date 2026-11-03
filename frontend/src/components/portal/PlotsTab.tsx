"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { QrCode } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import type { PortalOverview, PortalPlot, PortalPlots } from "@/types/portal";
import { EmptyState, StateBlock } from "./ui";

const GardenSignboardModal = dynamic(() => import("./GardenSignboardModal"), { ssr: false });
const PlotMapModal = dynamic(() => import("./PlotMapModal"), { ssr: false });

export default function PlotsTab() {
  const plots = usePortal<PortalPlots>("plots");
  const overview = usePortal<PortalOverview>("overview");
  const [signboardPlot, setSignboardPlot] = useState<PortalPlot | null>(null);
  const [mapViewPlot, setMapViewPlot] = useState<PortalPlot | null>(null);

  return (
    <div className="pt-stack">
      <section className="pt-plots-section" aria-labelledby="plots-heading">
        <StateBlock loading={plots.loading} error={plots.error} />
        {plots.data && !plots.data.available && (
          <>
            <div className="pt-plots-header">
              <div className="pt-plots-header-info">
                <h2 id="plots-heading" className="pt-plots-title">
                  Thửa đất của tôi
                </h2>
              </div>
            </div>
            <EmptyState icon="map">
              Dữ liệu bản đồ thửa đất chưa được bật trên hệ thống. Vui lòng liên hệ cán bộ HTX.
            </EmptyState>
          </>
        )}
        {plots.data?.available && plots.data.data.length === 0 && (
          <>
            <div className="pt-plots-header">
              <div className="pt-plots-header-info">
                <h2 id="plots-heading" className="pt-plots-title">
                  Thửa đất của tôi
                </h2>
              </div>
            </div>
            <EmptyState icon="plot">
              Chưa có thửa đất nào được ghi nhận cho hộ của bạn. Vui lòng liên hệ cán bộ HTX để được hướng dẫn đăng ký thửa đất.
            </EmptyState>
          </>
        )}
        {plots.data?.available && plots.data.data.length > 0 && (
          <>
            <div className="pt-plots-header">
              <div className="pt-plots-header-info">
                <h2 id="plots-heading" className="pt-plots-title">
                  Thửa đất của tôi
                </h2>
              </div>
            </div>

            <div className="pt-plot-card-list" role="list">
              {plots.data.data.map((plot) => (
                <div
                  key={plot.code}
                  role="button"
                  tabIndex={0}
                  className="pt-plot-card pt-plot-reminder-card"
                  onClick={() => setMapViewPlot(plot)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setMapViewPlot(plot);
                    }
                  }}
                  title="Bấm vào thẻ để mở bản đồ toàn cảnh thửa đất"
                  aria-label={`Thửa đất ${plot.code}, bấm để mở bản đồ toàn cảnh`}
                >
                  {/* Icon map từ public/placeholder.png */}
                  <img
                    src="/placeholder.png"
                    alt=""
                    width={26}
                    height={26}
                    className="pt-plot-trifold-icon"
                    aria-hidden="true"
                  />

                  {/* Nội dung thông tin thửa đất theo phong cách thẻ nhắc nhở */}
                  <div className="pt-plot-card-body">
                    <strong className="pt-plot-code">{plot.code}</strong>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      {plot.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha{plot.variety ? ` · ${plot.variety}` : ""}
                    </span>
                  </div>

                  {/* Icon QR code ở cuối thẻ để người dùng bấm vào xem biển QR */}
                  <div className="pt-plot-card-end">
                    <button
                      type="button"
                      className="pt-plot-qr-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSignboardPlot(plot);
                      }}
                      title={`Xem và in biển cắm vườn cho thửa ${plot.code}`}
                      aria-label={`Biển cắm vườn ${plot.code}`}
                    >
                      <QrCode size={18} strokeWidth={2.2} aria-hidden="true" />
                      <span className="pt-plot-qr-action-label">Biển QR</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {signboardPlot && (
        <GardenSignboardModal
          plot={signboardPlot}
          householdName={overview.data?.household.name || "Hộ nông dân Krông Búk"}
          onClose={() => setSignboardPlot(null)}
        />
      )}

      {mapViewPlot && (
        <PlotMapModal
          key={mapViewPlot.id || mapViewPlot.code}
          plot={mapViewPlot}
          householdName={overview.data?.household.name || "Hộ nông dân Krông Búk"}
          onClose={() => setMapViewPlot(null)}
          onOpenSignboard={(p) => {
            setMapViewPlot(null);
            setSignboardPlot(p);
          }}
        />
      )}
    </div>
  );
}
