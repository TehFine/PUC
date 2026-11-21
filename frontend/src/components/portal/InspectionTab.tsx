"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { usePortal } from "@/hooks/use-portal";
import { usePersistedRecordSelection } from "@/lib/back-navigation";
import { lazyChunk } from "@/lib/lazy-chunk";
import {
  formatPortalDayHeading,
  normalizePortalDayIso,
  SCHEDULE_KIND,
} from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalLabTest, PortalList, PortalScheduleItem } from "@/types/portal";
import { SectionDivider, StateBlock } from "./ui";

const LabTestCertificateModal = dynamic(() => lazyChunk(() => import("./LabTestCertificateModal")), { ssr: false });

function getScheduleKicker(item: PortalScheduleItem): string {
  if (item.title && item.title.toLowerCase().startsWith("lấy mẫu")) {
    return "Lấy mẫu";
  }
  return SCHEDULE_KIND[item.kind] ?? "Kiểm tra";
}

export default function InspectionTab() {
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");
  const tests = usePortal<PortalList<PortalLabTest>>("lab-tests");
  const [selectedTest, setSelectedTest] = usePersistedRecordSelection(
    "portal:inspection:test",
    tests.data?.data,
    (t) => t.id,
    tests.loading && !tests.data,
  );

  const scheduleGroups = useMemo(() => {
    const map = new Map<string, { date: string; label: string; items: PortalScheduleItem[] }>();
    for (const item of schedule.data?.data ?? []) {
      const date = normalizePortalDayIso(item.scheduledOn);
      const existing = map.get(date);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(date, {
          date,
          label: formatPortalDayHeading(date),
          items: [item],
        });
      }
    }
    return Array.from(map.values());
  }, [schedule.data]);

  return (
    <div className="pt-stack">
      {/* 1. KẾT QUẢ KIỂM NGHIỆM */}
      <section className="pt-diary-section" aria-labelledby="lab-tests-heading">
        <div className="pt-diary-header">
          <h2 id="lab-tests-heading" className="pt-plots-title">
            Kết quả kiểm nghiệm
          </h2>
        </div>
        <StateBlock loading={tests.loading} error={tests.error} />
        {tests.data && tests.data.data.length > 0 && (
          <ul className="pt-list pt-lab-test-list">
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
                <div className="pt-lab-test-title">
                  <span className="pt-lab-test-code">{test.code} - Thửa {test.plotCode}</span>
                </div>
                <div className="pt-lab-test-right">
                  <div className="pt-lab-test-time">{formatDate(test.sampledOn)}</div>
                  <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SectionDivider />

      {/* 2. LỊCH KIỂM TRA SẮP TỚI */}
      <section className="pt-diary-section" aria-labelledby="inspection-schedule-heading">
        <div className="pt-diary-header">
          <h2 id="inspection-schedule-heading" className="pt-plots-title">
            Lịch kiểm tra
          </h2>
        </div>
        <StateBlock loading={schedule.loading} error={schedule.error} />
        {scheduleGroups.length > 0 && (
          <div className="pt-diary-day-groups">
            {scheduleGroups.map((group) => (
              <div key={group.date} className="pt-diary-day-group">
                <div className="pt-diary-day-head">
                  <span className="pt-diary-day-label">{group.label}</span>
                </div>
                <ul className="pt-diary-day-card" role="list">
                  {group.items.map((item) => {
                    const kicker = getScheduleKicker(item);
                    const metaParts: string[] = [];
                    if (item.officer) metaParts.push(`Cán bộ: ${item.officer}`);
                    if (item.note) metaParts.push(item.note);

                    return (
                      <li key={item.id}>
                        <div className="pt-diary-day-row is-static">
                          <img
                            src="/note.png?v=2"
                            alt=""
                            width={20}
                            height={20}
                            loading="lazy"
                            decoding="async"
                            className="pt-widget-note-icon"
                            aria-hidden="true"
                          />
                          <span className="pt-diary-item-body">
                            <span className="pt-diary-item-title">{item.title}</span>
                            {metaParts.length > 0 && (
                              <span className="pt-diary-item-sub is-neutral">
                                {metaParts.join(", ")}
                              </span>
                            )}
                          </span>
                          <span className="pt-diary-item-plot">{kicker}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
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
