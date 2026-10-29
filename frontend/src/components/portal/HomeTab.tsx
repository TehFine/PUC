"use client";

import { useRef, useState, useLayoutEffect, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import { daysSince, formatKg, HOUSEHOLD_STATUS, SCHEDULE_KIND } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalList, PortalOverview, PortalScheduleItem } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import { Card, StateBlock } from "./ui";
import HomeCharts from "./HomeCharts";

function getHeroPath(w: number, h: number, badgeW: number, badgeH: number, badgeRight: number): string {
  const r = 28; // Corner radius
  const gap = 6; // Reduced tight gap between dock and card (~6px)
  const notchH = badgeH + gap; // Shelf is exactly gap below the badge
  const rDock = badgeH / 2; // Radius of dock semicircular cap
  const rConcave = rDock + gap; // Concentric arc radius hugging the dock cap
  const rConvex = 14; // Convex fillet transitioning smoothly from top edge
  const rShelfCorner = Math.min(20, Math.max(12, r)); // Smooth corner under the dock on right

  // Dock pill left edge in absolute container coords
  const pillLeft = w - badgeRight - badgeW;

  // Center of dock semicircle cap & concentric concave arc
  const c1x = pillLeft + rDock;
  const c1y = rDock;

  // Center of convex fillet tangent to top horizontal edge (y = 0)
  const dy = c1y - rConvex;
  const dist = rConcave + rConvex;
  const dx = Math.sqrt(Math.max(0, dist * dist - dy * dy));
  const c2x = c1x - dx;
  const c2y = rConvex;

  // Tangent point where convex fillet meets concave arc
  const t = rConvex / dist;
  const xtan = c2x + t * (c1x - c2x);
  const ytan = c2y + t * (c1y - c2y);

  // Shelf point where concave arc reaches bottom and becomes horizontal
  const xshelf = c1x;

  return [
    `M ${r},0`,
    `L ${c2x},0`,
    `A ${rConvex},${rConvex} 0 0 1 ${xtan},${ytan}`,
    `A ${rConcave},${rConcave} 0 0 0 ${xshelf},${notchH}`,
    `L ${w - rShelfCorner},${notchH}`,
    `A ${rShelfCorner},${rShelfCorner} 0 0 1 ${w},${notchH + rShelfCorner}`,
    `L ${w},${h - r}`,
    `A ${r},${r} 0 0 1 ${w - r},${h}`,
    `L ${r},${h}`,
    `A ${r},${r} 0 0 1 0,${h - r}`,
    `L 0,${r}`,
    `A ${r},${r} 0 0 1 ${r},0`,
    "Z",
  ].join(" ");
}

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

  const shellRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{
    w: number;
    h: number;
    badgeW: number;
    badgeH: number;
    badgeRight: number;
  }>({
    w: 800,
    h: 360,
    badgeW: 185,
    badgeH: 38,
    badgeRight: 0,
  });

  useLayoutEffect(() => {
    if (!shellRef.current) return;
    let rafId: number | null = null;

    const updateDims = () => {
      if (!shellRef.current) return;
      const w = shellRef.current.offsetWidth;
      const h = shellRef.current.offsetHeight;
      const bW = badgeRef.current?.offsetWidth ?? 180;
      const bH = badgeRef.current?.offsetHeight ?? 38;
      const badgeRight = 0; // Thẳng hàng với mép ngoài bên phải của thẻ

      setDims((prev) => {
        if (
          prev.w === w &&
          prev.h === h &&
          prev.badgeW === bW &&
          prev.badgeH === bH &&
          prev.badgeRight === badgeRight
        ) {
          return prev;
        }
        return { w, h, badgeW: bW, badgeH: bH, badgeRight };
      });
    };

    updateDims();

    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateDims();
      });
    });

    ro.observe(shellRef.current);
    if (badgeRef.current) ro.observe(badgeRef.current);

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [overview.data]);

  const upcoming = schedule.data?.data[0];
  const reminders = useMemo<Reminder[]>(() => {
    if (!overview.data) return [];
    return buildReminders(overview.data, upcoming);
  }, [overview.data, upcoming]);

  const pathD = useMemo(
    () => getHeroPath(dims.w, dims.h, dims.badgeW, dims.badgeH, dims.badgeRight),
    [dims.w, dims.h, dims.badgeW, dims.badgeH, dims.badgeRight]
  );

  if (overview.loading || overview.error || !overview.data) {
    return <StateBlock loading={overview.loading} error={overview.error} />;
  }

  const { household, stats } = overview.data;
  const status = HOUSEHOLD_STATUS[household.status];

  return (
    <div className="pt-stack">
      <div
        ref={shellRef}
        className="pt-hero-shell"
        style={{
          "--hero-badge-w": `${dims.badgeW}px`,
          "--hero-badge-h": `${dims.badgeH}px`,
        } as React.CSSProperties}
      >
        <div ref={badgeRef} className="pt-hero-notch-badge" title="Đạt chuẩn xuất khẩu">
          <span>{household.status === "qualified" ? "ĐẠT CHUẨN XUẤT KHẨU" : status.label.toUpperCase()}</span>
        </div>

        <svg
          className="pt-hero-svg"
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="ptHeroGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f8fafc" />
            </linearGradient>
          </defs>
          <path
            d={pathD}
            fill="url(#ptHeroGrad)"
            stroke="rgba(15, 23, 42, 0.08)"
            strokeWidth="1.2"
          />
        </svg>

        <section className="pt-hero">
          <div className="pt-hero-top">
            <span className="pt-hero-code-val">{household.code}</span>
          </div>

          <div className="pt-hero-body">
            <h1 className="pt-hero-farmer-name">{household.name}</h1>

            <div className="pt-hero-meta-grid" role="region" aria-label="Thông số canh tác">
              <div className="pt-hero-meta-col">
                <span className="pt-hero-meta-title">Số thửa</span>
                <span className="pt-hero-meta-val">{household.plotCount} thửa</span>
              </div>
              <div className="pt-hero-meta-col">
                <span className="pt-hero-meta-title">Diện tích</span>
                <span className="pt-hero-meta-val">{household.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha</span>
              </div>
              <div className="pt-hero-meta-col">
                <span className="pt-hero-meta-title">Sản lượng</span>
                <span className="pt-hero-meta-val">{formatKg(stats.harvestTotalKg)}</span>
              </div>
            </div>

            <p className="pt-hero-bio">
              {household.villageName}
              {household.villageLeader ? ` · Trưởng thôn: ${household.villageLeader}` : ""}
              {" · Hộ canh tác sầu riêng VietGAP liên kết Hợp tác xã Krông Búk, Đắk Lắk."}
            </p>

            <div className="pt-hero-bottom">
              <div className="pt-hero-bottom-left">
                <span className="pt-hero-bottom-kicker">Mã vùng trồng</span>
                <span className="pt-hero-bottom-highlight">PUC-KRB-001</span>
              </div>
              <button
                type="button"
                className="pt-hero-cta-btn"
                onClick={() => onNavigate("diary")}
                title="Mở nhật ký canh tác để ghi chép hoạt động"
              >
                <span>Ghi nhật ký</span>
                <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </div>
        </section>
      </div>


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
