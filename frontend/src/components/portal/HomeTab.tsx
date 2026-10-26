"use client";

import { usePortal } from "@/hooks/use-portal";
import { daysSince, formatKg, HOUSEHOLD_STATUS, SCHEDULE_KIND } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalList, PortalOverview, PortalScheduleItem } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import { Card, Pill, StateBlock } from "./ui";

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
          <div>
            <p className="pt-hero-kicker">Mã hộ {household.code}</p>
            <h1 className="pt-hero-title">{household.name}</h1>
            <p className="pt-hero-sub">
              {household.villageName}
              {household.villageLeader ? ` · Trưởng thôn ${household.villageLeader}` : ""}
            </p>
          </div>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <dl className="pt-hero-stats">
          <div>
            <dt>Thửa đất</dt>
            <dd>{household.plotCount}</dd>
          </div>
          <div>
            <dt>Diện tích</dt>
            <dd>{household.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha</dd>
          </div>
          <div>
            <dt>Đã giao HTX</dt>
            <dd>{formatKg(stats.harvestTotalKg)}</dd>
          </div>
        </dl>
      </section>

      <div className="pt-quick">
        <button type="button" className="pt-quick-btn" onClick={() => onNavigate("diary")}>
          <span aria-hidden="true">📝</span> Ghi nhật ký
        </button>
        <button type="button" className="pt-quick-btn" onClick={() => onNavigate("diary")}>
          <span aria-hidden="true">🧪</span> Ghi phun thuốc
        </button>
        <button type="button" className="pt-quick-btn" onClick={() => onNavigate("requests")}>
          <span aria-hidden="true">📨</span> Gửi hồ sơ
        </button>
      </div>

      <Card title="Nhắc nhở & thông báo">
        {reminders.length === 0 ? (
          <p className="pt-muted">Mọi thứ đều ổn. Hiện chưa có nhắc nhở nào. 🌱</p>
        ) : (
          <ul className="pt-reminders">
            {reminders.map((reminder) => (
              <li key={reminder.text}>
                <button type="button" className={`pt-reminder pt-reminder-${reminder.tone}`} onClick={() => onNavigate(reminder.to)}>
                  <span>{reminder.text}</span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {schedule.data && schedule.data.data.length > 0 && (
        <Card title="Lịch kiểm tra sắp tới">
          <ul className="pt-list">
            {schedule.data.data.slice(0, 3).map((item) => (
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
        </Card>
      )}

      <p className="pt-muted pt-center">
        Cần hỗ trợ? Liên hệ trưởng thôn hoặc cán bộ HTX.
      </p>
    </div>
  );
}
