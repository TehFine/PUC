"use client";

import { usePortal } from "@/hooks/use-portal";
import { SCHEDULE_KIND } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalLabTest, PortalList, PortalScheduleItem, PortalViolation } from "@/types/portal";
import { Card, EmptyState, Pill, StateBlock } from "./ui";

export default function InspectionTab() {
  const violations = usePortal<PortalList<PortalViolation>>("violations");
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");
  const tests = usePortal<PortalList<PortalLabTest>>("lab-tests");

  return (
    <div className="pt-stack">
      <div className="pt-grid-2">
        <Card title="Thông báo vi phạm">
          <StateBlock loading={violations.loading} error={violations.error} />
          {violations.data && violations.data.data.length === 0 && <EmptyState icon="ok">Hộ bạn chưa có thông báo vi phạm nào.</EmptyState>}
          {violations.data && violations.data.data.length > 0 && (
            <ul className="pt-list">
              {violations.data.data.map((item) => (
                <li key={item.id} className={`pt-notice pt-notice-${item.severity}`}>
                  <div className="pt-notice-head">
                    <strong>{item.title}</strong>
                    {item.status === "resolved" ? <Pill tone="green">Đã khắc phục</Pill> : <Pill tone={item.severity === "critical" ? "red" : "gold"}>{item.severity === "critical" ? "Nghiêm trọng" : "Cảnh báo"}</Pill>}
                  </div>
                  <p className="pt-notice-meta">
                    {formatDate(item.detectedOn)}
                    {item.plotCode ? ` · Thửa ${item.plotCode}` : ""}
                  </p>
                  {item.description && <p>{item.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Lịch kiểm tra">
          <StateBlock loading={schedule.loading} error={schedule.error} />
          {schedule.data && schedule.data.data.length === 0 && <EmptyState icon="calendar">Hiện chưa có lịch kiểm tra nào sắp tới.</EmptyState>}
          {schedule.data && schedule.data.data.length > 0 && (
            <ul className="pt-list">
              {schedule.data.data.map((item) => (
                <li key={item.id} className="pt-row">
                  <div className="pt-date">{formatDate(item.scheduledOn)}</div>
                  <div className="pt-row-main">
                    <strong>{item.title}</strong>
                    <span>
                      {SCHEDULE_KIND[item.kind]} · {item.officer}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Kết quả kiểm nghiệm">
        <StateBlock loading={tests.loading} error={tests.error} />
        {tests.data && tests.data.data.length === 0 && <EmptyState icon="lab">Chưa có kết quả kiểm nghiệm nào.</EmptyState>}
        {tests.data && tests.data.data.length > 0 && (
          <ul className="pt-list">
            {tests.data.data.map((test) => (
              <li key={test.id} className="pt-test">
                <div className="pt-notice-head">
                  <strong>
                    {test.code} · Thửa {test.plotCode}
                  </strong>
                  <Pill tone={test.result === "pass" ? "green" : "red"}>{test.result === "pass" ? "Đạt" : "Không đạt"}</Pill>
                </div>
                <p className="pt-notice-meta">
                  Lấy mẫu {formatDate(test.sampledOn)} · {test.lab}
                </p>
                <dl className="pt-test-grid">
                  <div>
                    <dt>Cadimi</dt>
                    <dd>{test.cdMgKg} mg/kg</dd>
                  </div>
                  <div>
                    <dt>Tồn dư</dt>
                    <dd>{test.residueMgKg} mg/kg</dd>
                  </div>
                  <div>
                    <dt>Chlorpyrifos</dt>
                    <dd>{test.chlorpyrifosMgKg === null ? "KPH" : `${test.chlorpyrifosMgKg} mg/kg`}</dd>
                  </div>
                  <div>
                    <dt>Vàng O</dt>
                    <dd>{test.yellowOPositive ? "Dương tính" : "Âm tính"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
