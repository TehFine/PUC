"use client";

import { useState } from "react";
import { CalendarCheck2 } from "@/components/ui/PublicIcon";
import { usePortal } from "@/hooks/use-portal";
import { formatDate } from "@/utils/format";
import type {
  PortalHarvest,
  PortalHarvestNotice,
  PortalList,
  PortalOverview,
  PortalPlot,
  PortalPlots,
} from "@/types/portal";
import { HarvestAssetTagCard, HarvestLotQrModal } from "./harvest/HarvestLotTicket";
import { EmptyState, SectionDivider, StateBlock } from "./ui";

interface Props {
  overview?: PortalOverview | null;
  plots?: PortalPlot[];
}

export default function StampsTab({ overview, plots = [] }: Props) {
  const plotsData = usePortal<PortalPlots>("plots");
  const harvest = usePortal<PortalList<PortalHarvest>>("harvest");
  const noticesQuery = usePortal<PortalList<PortalHarvestNotice>>("harvest-notices");

  const effectivePlots = plots.length > 0 ? plots : (plotsData.data?.data ?? []);
  const resolvedPucCode =
    effectivePlots[0]?.zoneCode ||
    (overview?.household?.code ? overview.household.code.replace(/-(?:H|T)\d+$/i, "") : "66-PUC-SR0001-00728");

  const notices = noticesQuery.data?.data ?? [];
  const [selectedLotForQr, setSelectedLotForQr] = useState<PortalHarvest | null>(null);

  return (
    <div className="portal-tab-content">
      {/* ─── THÔNG BÁO LỊCH THU HOẠCH DỰ KIẾN TỪ HTX (NẾU CÓ) ─── */}
      {notices.length > 0 && (
        <>
          <section className="pt-harvest-notices-section" aria-labelledby="harvest-notices-heading">
            <div className="pt-schedule-header pt-harvest-lots-header">
              <h2 id="harvest-notices-heading" className="pt-schedule-title">
                Lịch thu hoạch dự kiến từ HTX
              </h2>
              <span className="pt-harvest-lots-count">{notices.length} thông báo</span>
            </div>
            <div className="pt-harvest-notice-list">
              {notices.map((item) => (
                <article key={item.id} className="pt-harvest-notice-card">
                  <div className="pt-harvest-notice-icon" aria-hidden="true">
                    <CalendarCheck2 size={18} strokeWidth={2.1} />
                  </div>
                  <div className="pt-harvest-notice-body">
                    <div className="pt-harvest-notice-top">
                      <h3 className="pt-harvest-notice-title">{item.title}</h3>
                      <span className="pt-harvest-notice-date">
                        {item.createdAt ? formatDate(item.createdAt.slice(0, 10)) : "—"}
                      </span>
                    </div>
                    {item.body && <p className="pt-harvest-notice-desc">{item.body}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <SectionDivider />
        </>
      )}

      {/* ─── LÔ HÀNG ĐÃ XUẤT KHO & TEM QR ─── */}
      <section className="pt-harvest-lots-section" aria-labelledby="harvest-lots-heading">
        <div className="pt-schedule-header pt-harvest-lots-header">
          <h2 id="harvest-lots-heading" className="pt-schedule-title">
            Lô hàng xuất kho
          </h2>
          {harvest.data && harvest.data.data.length > 0 && (
            <span className="pt-harvest-lots-count">{harvest.data.data.length} lô</span>
          )}
        </div>

        <div className="pt-harvest-lots-view">
          <StateBlock loading={harvest.loading} error={harvest.error} />
          {harvest.data && harvest.data.data.length === 0 && (
            <EmptyState icon="harvest">
              Chưa có lô thu hoạch nào được xuất kho.
            </EmptyState>
          )}
          {harvest.data && harvest.data.data.length > 0 && (
            <div className="pt-asset-card-grid">
              {harvest.data.data.map((lot) => (
                <HarvestAssetTagCard
                  key={lot.id}
                  lot={lot}
                  pucCode={resolvedPucCode}
                  onOpenModal={() => setSelectedLotForQr(lot)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── MODAL TICKET VOUCHER CHI TIẾT TEM ĐIỆN TỬ ─── */}
      {selectedLotForQr && (
        <HarvestLotQrModal
          lot={selectedLotForQr}
          pucCode={resolvedPucCode}
          onClose={() => setSelectedLotForQr(null)}
        />
      )}

      <style jsx>{`
        .portal-tab-content {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
        }
        .pt-harvest-notices-section {
          margin-bottom: 22px;
        }
        .pt-harvest-notice-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pt-harvest-notice-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px 18px;
          border-radius: 20px;
          background: #ffffff;
          box-shadow: 0 4px 20px rgba(20, 55, 47, 0.045);
        }
        .pt-harvest-notice-icon {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: #eefbf3;
          color: #15803d;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pt-harvest-notice-body {
          flex: 1;
          min-width: 0;
        }
        .pt-harvest-notice-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .pt-harvest-notice-title {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.35;
        }
        .pt-harvest-notice-date {
          font-size: 12px;
          font-weight: 500;
          color: #94a3b8;
          white-space: nowrap;
        }
        .pt-harvest-notice-desc {
          margin: 5px 0 0;
          font-size: 13.5px;
          line-height: 1.5;
          color: #475569;
        }
        .pt-harvest-rules-section {
          max-width: 720px;
          margin-bottom: 22px;
          padding: 0 0 4px;
        }
        .portal-tab-content > :global(.pt-section-divider) {
          margin: 0 auto 22px;
        }
        .pt-harvest-rules-section .pt-schedule-header,
        .pt-harvest-lots-header {
          padding: 0 2px 12px;
        }
        .pt-harvest-rules-section .pt-schedule-title,
        .pt-harvest-lots-header .pt-schedule-title {
          font-size: 1.2rem;
          font-weight: 750;
          color: var(--ink);
          margin: 0;
          letter-spacing: -0.015em;
        }
        .pt-harvest-lots-count {
          display: inline-flex;
          align-items: center;
          padding: 3.5px 10px;
          border-radius: 999px;
          background: rgba(20, 55, 47, 0.06);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          line-height: 1.2;
        }
        .pt-harvest-lots-section {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
