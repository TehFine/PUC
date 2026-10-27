"use client";

import { ChevronRight } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import { daysSince, formatKg, HOUSEHOLD_STATUS, SCHEDULE_KIND } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalList, PortalOverview, PortalScheduleItem } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import { Card, Pill, StateBlock } from "./ui";
import HomeCharts from "./HomeCharts";

interface Reminder {
  tone: "red" | "gold" | "blue" | "green";
  text: string;
  to: PortalTabId;
}

function buildReminders(overview: PortalOverview, upcoming: PortalScheduleItem | undefined): Reminder[] {
  const { stats, lastTest } = overview;
  const reminders: Reminder[] = [];
  if (stats.openViolations > 0) {
    reminders.push({ tone: "red", text: `Có ${stats.openViolations} thông báo vi phạm cần khắc phục.`, to: "inspection" });
  }
  const idle = daysSince(stats.lastJournalOn);
  if (idle === null) reminders.push({ tone: "gold", text: "Bạn chưa ghi nhật ký canh tác lần nào.", to: "diary" });
  else if (idle >= 7) reminders.push({ tone: "gold", text: `Đã ${idle} ngày chưa ghi nhật ký canh tác (quy định tối thiểu 7 ngày/lần).`, to: "diary" });
  if (lastTest?.result === "fail") {
    reminders.push({ tone: "red", text: `Mẫu ${lastTest.code} (${lastTest.plotCode}) chưa đạt. Liên hệ cán bộ HTX để được hướng dẫn.`, to: "inspection" });
  }
  if (upcoming) {
    reminders.push({ tone: "blue", text: `${formatDate(upcoming.scheduledOn)}: ${upcoming.title}.`, to: "inspection" });
  }
  if (stats.pendingApprovals > 0) {
    reminders.push({ tone: "blue", text: `${stats.pendingApprovals} hồ sơ của bạn đang chờ HTX duyệt.`, to: "requests" });
  }
  return reminders;
}

export default function HomeTab({ onNavigate }: { onNavigate: (tab: PortalTabId) => void }) {
  const overview = usePortal<PortalOverview>("overview");
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");

  if (overview.loading || overview.error || !overview.data) {
    return <StateBlock loading={overview.loading} error={overview.error} />;
  }

  const { household, stats } = overview.data;
  const status = HOUSEHOLD_STATUS[household.status];
  const upcoming = schedule.data?.data[0];
  const reminders = buildReminders(overview.data, upcoming);

  return (
    <div className="pt-stack">
      <section className="pt-hero">
        <div className="pt-hero-top">
          <div className="pt-hero-main">
            <h1 className="pt-hero-title">{household.name}</h1>
            <p className="pt-hero-sub">
              {household.villageName}
              {household.villageLeader ? ` · Trưởng thôn: ${household.villageLeader}` : ""}
            </p>
          </div>
          <div className="pt-hero-badge-wrap">
            <span className="pt-hero-kicker">Mã hộ: {household.code}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
        </div>
        <dl className="pt-hero-stats">
          <div className="pt-stat-item pt-stat-plots">
            <dt>Thửa đất canh tác</dt>
            <dd>{household.plotCount} <span className="pt-stat-unit">thửa</span></dd>
          </div>
          <div className="pt-stat-item is-highlight pt-stat-area">
            <dt>Tổng diện tích</dt>
            <dd>{household.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} <span className="pt-stat-unit">ha</span></dd>
          </div>
          <div className="pt-stat-item pt-stat-yield">
            <dt>Sản lượng đã giao HTX</dt>
            <dd>{formatKg(stats.harvestTotalKg)}</dd>
          </div>
        </dl>
      </section>


      <HomeCharts />

      <div className="pt-home-grid">
        <Card
          title="Nhắc nhở & thông báo"
          action={
            reminders.length > 0 ? (
              <span className="pt-badge-alert">{reminders.length} việc cần chú ý</span>
            ) : undefined
          }
        >
          {reminders.length === 0 ? (
            <p className="pt-muted">Mọi thứ đều ổn. Hiện chưa có nhắc nhở nào.</p>
          ) : (
            <ul className="pt-reminders">
              {reminders.map((reminder) => (
                <li key={reminder.text}>
                  <button type="button" className={`pt-reminder pt-reminder-${reminder.tone}`} onClick={() => onNavigate(reminder.to)}>
                    <span>{reminder.text}</span>
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Lịch kiểm tra sắp tới"
          action={
            schedule.data && schedule.data.data.length > 0 ? (
              <button
                type="button"
                className="pt-btn-link"
                onClick={() => onNavigate("inspection")}
              >
                Xem chi tiết &rarr;
              </button>
            ) : undefined
          }
        >
          {(!schedule.data || schedule.data.data.length === 0) ? (
            <p className="pt-muted">Hiện chưa có lịch kiểm tra hoặc lấy mẫu nào sắp tới.</p>
          ) : (
            <ul className="pt-list">
              {schedule.data.data.slice(0, 3).map((item) => (
                <li key={item.id} className="pt-row">
                  <div className="pt-date">{formatDate(item.scheduledOn)}</div>
                  <div className="pt-row-main">
                    <strong>{item.title}</strong>
                    <span>
                      {SCHEDULE_KIND[item.kind]} · Cán bộ {item.officer}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="pt-muted pt-center" style={{ marginTop: 8 }}>
        Cần hỗ trợ? Liên hệ Ban quản lý HTX Nông nghiệp Krông Búk hoặc Trưởng thôn.
      </p>
    </div>
  );
}
