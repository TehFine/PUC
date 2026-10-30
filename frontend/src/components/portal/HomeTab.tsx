"use client";

import { useRef, useState, useLayoutEffect, useMemo, useEffect } from "react";
import { Plus } from "lucide-react";
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

interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  to: PortalTabId;
}

function buildTasks(
  overview: PortalOverview,
  upcoming: PortalScheduleItem | undefined,
  localOverrides: Record<string, boolean>
): TaskItem[] {
  const { stats, lastTest } = overview;
  const idle = daysSince(stats.lastJournalOn);
  const items: TaskItem[] = [];

  // 1. Mã số vùng trồng hợp lệ
  items.push({
    id: "puc-code",
    title: "Mã vùng trồng PUC-KRB-001 hợp lệ",
    done: localOverrides["puc-code"] ?? true,
    to: "plots",
  });

  // 2. Hồ sơ nông hộ
  items.push({
    id: "profile",
    title: "Hồ sơ nông hộ hoàn tất",
    done: localOverrides["profile"] ?? true,
    to: "plots",
  });

  // 3. Mẫu kiểm nghiệm VietGAP (nếu đạt)
  if (lastTest?.result !== "fail") {
    items.push({
      id: "test-pass",
      title: "Mẫu kiểm nghiệm đạt chuẩn VietGAP",
      done: localOverrides["test-pass"] ?? true,
      to: "inspection",
    });
  }

  // 4. Trạng thái nhật ký: tiêu đề ngắn gọn theo yêu cầu:
  // "nếu chưa ghi nhật ký thì để là chưa ghi nhật ký, còn cụ thể là bao nhiêu thì sẽ để chi tiết trong tab nhật ký sau"
  if (idle === null || idle >= 7) {
    items.push({
      id: "diary",
      title: "Chưa ghi nhật ký",
      done: localOverrides["diary"] ?? false,
      to: "diary",
    });
  } else {
    items.push({
      id: "diary",
      title: "Đã ghi nhật ký canh tác",
      done: localOverrides["diary"] ?? true,
      to: "diary",
    });
  }

  // 5. Vi phạm nếu có
  if (stats.openViolations > 0) {
    items.push({
      id: "violations",
      title: "Khắc phục vi phạm",
      done: localOverrides["violations"] ?? false,
      to: "inspection",
    });
  }

  // 6. Kiểm tra mẫu không đạt nếu có
  if (lastTest?.result === "fail") {
    items.push({
      id: "test-fail",
      title: "Kiểm tra mẫu chưa đạt",
      done: localOverrides["test-fail"] ?? false,
      to: "inspection",
    });
  }

  // 7. Lịch kiểm tra sắp tới nếu có
  if (upcoming) {
    items.push({
      id: "upcoming",
      title: "Lịch kiểm tra sắp tới",
      done: localOverrides["upcoming"] ?? false,
      to: "inspection",
    });
  }

  // 8. Hồ sơ chờ phê duyệt nếu có
  if (stats.pendingApprovals > 0) {
    items.push({
      id: "approvals",
      title: "Hồ sơ chờ phê duyệt",
      done: localOverrides["approvals"] ?? false,
      to: "requests",
    });
  }

  // Sắp xếp: các việc đã xong (done = true) lên trên, các việc cần làm (done = false) ở dưới
  // Giống chính xác phong cách thiết kế widget trong hình ảnh tham khảo
  return items.sort((a, b) => {
    if (a.done === b.done) return 0;
    return a.done ? -1 : 1;
  });
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
      if (w === 0 || h === 0) return;
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

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            rafId = null;
            updateDims();
          });
          break;
        }
      }
    });

    ro.observe(shellRef.current);
    if (badgeRef.current) ro.observe(badgeRef.current);

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [overview.data]);

  const upcoming = schedule.data?.data[0];
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({});
  const [timeStr, setTimeStr] = useState<string>("14:17");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      setTimeStr(`${h}:${m}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  const tasks = useMemo<TaskItem[]>(() => {
    if (!overview.data) return [];
    return buildTasks(overview.data, upcoming, localDone);
  }, [overview.data, upcoming, localDone]);

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

      {/* Widget Nhắc nhở theo phong cách Tasks for Today */}
      <section className="pt-reminders-widget" aria-label="Nhắc nhở và nhiệm vụ hôm nay">
        <div className="pt-widget-topbar">
          <div className="pt-widget-topbar-info">
            <h2 className="pt-widget-topbar-title">Nhắc nhở</h2>
            <span className="pt-widget-topbar-time">{timeStr}</span>
          </div>
          <button
            type="button"
            className="pt-widget-topbar-btn"
            onClick={() => onNavigate("diary")}
            title="Xem chi tiết nhật ký canh tác"
          >
            Chi tiết
          </button>
        </div>

        <div className="pt-widget-sheet">
          <h3 className="pt-widget-sheet-title">Nhiệm vụ hôm nay</h3>

          <ul className="pt-widget-list" role="list">
            {tasks.map((task) => (
              <li key={task.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="pt-widget-item"
                  onClick={() => onNavigate(task.to)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onNavigate(task.to);
                    }
                  }}
                >
                  <button
                    type="button"
                    className="pt-widget-check-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocalDone((prev) => ({
                        ...prev,
                        [task.id]: !(prev[task.id] ?? task.done),
                      }));
                    }}
                    title={task.done ? "Đánh dấu chưa hoàn thành" : "Đánh dấu đã hoàn thành"}
                    aria-label={`${task.done ? "Hoàn thành" : "Chưa hoàn thành"}: ${task.title}`}
                  >
                    {task.done ? (
                      <span className="pt-widget-check pt-widget-check-done" aria-hidden="true">
                        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3.5 8.5 6.5 11.5 12.5 5" />
                        </svg>
                      </span>
                    ) : (
                      <span className="pt-widget-check pt-widget-check-pending" aria-hidden="true" />
                    )}
                  </button>
                  <span className={`pt-widget-item-text ${task.done ? "pt-widget-text-done" : "pt-widget-text-pending"}`}>
                    {task.title}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="pt-widget-plus-btn"
            onClick={() => onNavigate("diary")}
            title="Thêm nhật ký canh tác"
            aria-label="Thêm nhật ký canh tác"
          >
            <Plus size={22} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Thẻ Lịch kiểm tra đặt ngay dưới thẻ Nhắc nhở với tiêu đề cô đọng */}
      <Card
        title="Lịch kiểm tra"
        action={
          schedule.data && schedule.data.data.length > 0 ? (
            <button
              type="button"
              className="pt-btn-link"
              onClick={() => onNavigate("inspection")}
            >
              Xem tất cả &rarr;
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

      {/* Biểu đồ canh tác & sản lượng */}
      <HomeCharts />
    </div>
  );
}
