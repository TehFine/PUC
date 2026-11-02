"use client";

import { useState } from "react";
import { usePortal } from "@/hooks/use-portal";
import { relativeDayLabel, SCHEDULE_KIND } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalLabTest, PortalList, PortalScheduleItem } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import LabTestCertificateModal from "./LabTestCertificateModal";
import { Card, EmptyState, Pill, StateBlock } from "./ui";

const ROUTE_THEMES = [
  {
    capsuleBg: "linear-gradient(180deg, #f59e0b 0%, #fbbf24 100%)",
    tagBg: "#fef3c7",
    tagColor: "#b45309",
    titleColor: "#92400e",
  },
  {
    capsuleBg: "linear-gradient(180deg, #f43f5e 0%, #fb7185 100%)",
    tagBg: "#ffe4e6",
    tagColor: "#be123c",
    titleColor: "#9f1239",
  },
  {
    capsuleBg: "linear-gradient(180deg, #10b981 0%, #34d399 100%)",
    tagBg: "#d1fae5",
    tagColor: "#047857",
    titleColor: "#065f46",
  },
  {
    capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)",
    tagBg: "#dbeafe",
    tagColor: "#1d4ed8",
    titleColor: "#1e40af",
  },
];

export default function InspectionTab({ onNavigate: _onNavigate }: { onNavigate?: (tab: PortalTabId) => void }) {
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");
  const tests = usePortal<PortalList<PortalLabTest>>("lab-tests");
  const [selectedTest, setSelectedTest] = useState<PortalLabTest | null>(null);

  return (
    <div className="pt-stack">
      {/* 1. KẾT QUẢ KIỂM NGHIỆM */}
      <Card title="Kết quả kiểm nghiệm">
        <StateBlock loading={tests.loading} error={tests.error} />
        {tests.data && tests.data.data.length === 0 && (
          <EmptyState icon="lab">Chưa có kết quả kiểm nghiệm nào.</EmptyState>
        )}
        {tests.data && tests.data.data.length > 0 && (
          <ul className="pt-list">
            {tests.data.data.map((test) => (
              <li
                key={test.id}
                className="pt-lab-test-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTest(test)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedTest(test);
                  }
                }}
                title="Bấm để xem chi tiết kết quả kiểm nghiệm"
              >
                <div className="pt-lab-test-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{test.code} · Thửa {test.plotCode}</span>
                  <Pill tone={test.result === "pass" ? "green" : "red"}>
                    {test.result === "pass" ? "Đạt" : "Không đạt"}
                  </Pill>
                </div>
                <div className="pt-lab-test-time">{formatDate(test.sampledOn)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 2. LỊCH KIỂM TRA SẮP TỚI */}
      <section className="pt-schedule-section" aria-labelledby="inspection-schedule-heading">
        <div className="pt-schedule-header">
          <h2 id="inspection-schedule-heading" className="pt-schedule-title">
            Lịch kiểm tra
          </h2>
        </div>
        <StateBlock loading={schedule.loading} error={schedule.error} />
        {schedule.data && schedule.data.data.length === 0 && (
          <EmptyState icon="calendar">Hiện chưa có lịch kiểm tra nào sắp tới.</EmptyState>
        )}
        {schedule.data && schedule.data.data.length > 0 && (
          <div className="pt-transit-timeline" role="list">
            {schedule.data.data.map((item, idx, arr) => {
              const theme = ROUTE_THEMES[idx % ROUTE_THEMES.length];
              const isLast = idx === arr.length - 1;
              const rel = relativeDayLabel(item.scheduledOn);
              const kindLabel = SCHEDULE_KIND[item.kind] ?? item.kind;

              return (
                <div key={item.id} className="pt-transit-step">
                  <div className="pt-transit-segment">
                    <div className="pt-transit-track-col" aria-hidden="true">
                      <div className="pt-transit-capsule" style={{ background: theme.capsuleBg }}>
                        <div className="pt-transit-dot" />
                        <div className="pt-transit-dot" />
                      </div>
                    </div>

                    <div className="pt-transit-content">
                      <div className="pt-transit-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <h3 className="pt-transit-title" style={{ color: theme.titleColor }}>
                          {item.title}
                        </h3>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: theme.tagBg,
                            color: theme.tagColor,
                          }}
                        >
                          {kindLabel}
                        </span>
                      </div>

                      <div className="pt-transit-meta-row">
                        <div className="pt-transit-meta-item">
                          <span className="pt-transit-date-highlight">{formatDate(item.scheduledOn)}</span>
                          {rel && <span className="pt-transit-rel-badge">({rel})</span>}
                        </div>
                        <div className="pt-transit-meta-item">
                          <span>Cán bộ:</span>
                          <strong>{item.officer}</strong>
                        </div>
                      </div>

                      {item.note && <p className="pt-transit-desc">{item.note}</p>}
                    </div>
                  </div>

                  {!isLast && (
                    <div className="pt-transit-transfer" aria-hidden="true">
                      <div className="pt-transit-transfer-track">
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedTest && (
        <LabTestCertificateModal
          test={selectedTest}
          onClose={() => setSelectedTest(null)}
        />
      )}
    </div>
  );
}
