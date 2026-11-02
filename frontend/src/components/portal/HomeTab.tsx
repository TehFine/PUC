"use client";

import { useRef, useState, useLayoutEffect, useMemo, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import { useResource } from "@/hooks/use-resource";
import { daysSince, formatKg, HOUSEHOLD_STATUS, SCHEDULE_KIND } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { TrainingDto } from "@/types/api";
import type { PortalList, PortalOverview, PortalScheduleItem, PortalViolation } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import { Sheet, StateBlock } from "./ui";
import { getTrainingKicker, TrainingDetailModal } from "./LearnTab";

const SCHEDULE_THEMES = [
  { capsuleBg: "linear-gradient(180deg, #10b981 0%, #059669 100%)" },
  { capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)" },
  { capsuleBg: "linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)" },
  { capsuleBg: "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)" },
];

const TRAINING_THEMES = [
  { capsuleBg: "linear-gradient(180deg, #10b981 0%, #059669 100%)" },
  { capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)" },
  { capsuleBg: "linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)" },
  { capsuleBg: "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)" },
];

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

function getScheduleKicker(item: PortalScheduleItem): string {
  if (item.title && item.title.toLowerCase().startsWith("lấy mẫu")) {
    return "Lấy mẫu";
  }
  return SCHEDULE_KIND[item.kind] ?? "Kiểm tra";
}

function getConciseScheduleTitle(title: string): string {
  if (!title) return "Đợt kiểm tra";
  let cleaned = title
    .replace(/^Kiểm tra định kỳ\s+/i, "")
    .replace(/^Kiểm tra đột xuất\s+/i, "")
    .replace(/^Kiểm tra thực địa\s+/i, "Thực địa ")
    .replace(/^Lấy mẫu kiểm nghiệm\s+/i, "")
    .replace(/^Lấy mẫu\s+/i, "")
    .replace(/^Phúc tra hộ vi phạm\s+/i, "Hộ vi phạm ")
    .replace(/^Phúc tra\s+/i, "")
    .trim();
  if (cleaned.toLowerCase().startsWith("kiểm tra ")) {
    cleaned = cleaned.replace(/^kiểm tra\s+/i, "");
  }
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : title;
}

const keepTraining = (item: TrainingDto) => item;

function getRelativeScheduleNote(dateStr: string | null | undefined): string {
  if (!dateStr) return "(Dự kiến)";
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return "(Dự kiến)";
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "(Hôm nay)";
  if (diffDays === 1) return "(Ngày mai)";
  if (diffDays > 1 && diffDays <= 30) return `(Còn ${diffDays} ngày)`;
  if (diffDays > 30) return "(Tháng tới)";
  if (diffDays === -1) return "(Hôm qua)";
  if (diffDays < -1) return "(Đã diễn ra)";
  return "(Dự kiến)";
}

interface ActionItem {
  id: string;
  title: string;
  to: PortalTabId;
}

function getConciseViolationTitle(v?: PortalViolation | null, count = 1, isDiaryIdle = false): string {
  if (!v) {
    if (isDiaryIdle) return "Chưa ghi nhật ký";
    return count > 1 ? `Khắc phục vi phạm (${count})` : "Khắc phục vi phạm";
  }
  const lower = v.title.toLowerCase();
  if (lower.includes("nhật ký")) {
    return "Chưa ghi nhật ký";
  }
  if (lower.includes("thuốc") || lower.includes("bảo vệ thực vật")) {
    return "Vi phạm dùng thuốc";
  }
  if (lower.includes("mẫu") || lower.includes("kiểm nghiệm")) {
    return "Mẫu kiểm nghiệm chưa đạt";
  }
  if (lower.includes("biển") || lower.includes("cắm vườn")) {
    return "Chưa cắm biển vườn";
  }
  // Loại bỏ các tiền tố hành chính dài dòng như "Khắc phục:", "Vi phạm:", "Cảnh báo:"
  let cleaned = v.title
    .replace(/^(khắc phục|vi phạm|cảnh báo)[:\s\-]+/i, "")
    .trim();
  if (cleaned.length > 24) {
    return "Khắc phục vi phạm";
  }
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Khắc phục vi phạm";
}

function buildActionItems(overview: PortalOverview, firstViolation?: PortalViolation | null): ActionItem[] {
  const { stats, lastTest } = overview;
  const idle = daysSince(stats.lastJournalOn);
  const isDiaryIdle = idle === null || idle >= 7;
  const items: ActionItem[] = [];

  // Kiểm tra xem có vấn đề về nhật ký canh tác hay không (quá hạn 7 ngày hoặc có nhắc nhở từ HTX)
  const hasDiaryViolation = Boolean(
    firstViolation &&
      (firstViolation.title.toLowerCase().includes("nhật ký") ||
        firstViolation.description?.toLowerCase().includes("nhật ký")),
  );

  // 1. NHẬT KÝ CANH TÁC: Việc của nhật ký -> Bấm vào chuyển THẲNG sang tab "diary" để ghi chép ngay
  if (isDiaryIdle || hasDiaryViolation) {
    items.push({
      id: "diary",
      title: "Chưa ghi nhật ký",
      to: "diary",
    });
  }

  // 2. KIỂM TRA & GIÁM SÁT: Chỉ hiển thị nếu có vi phạm thực tế về kiểm tra / thanh tra thực địa (không phải nhật ký)
  const isNonDiaryViolation = Boolean(firstViolation && !hasDiaryViolation);
  if (stats.openViolations > 0 && isNonDiaryViolation) {
    items.push({
      id: "violations",
      title: getConciseViolationTitle(firstViolation, stats.openViolations),
      to: "inspection",
    });
  }

  // 3. Kiểm tra mẫu không đạt -> việc của kiểm tra thì chuyển sang tab "inspection"
  if (lastTest?.result === "fail") {
    items.push({
      id: "test-fail",
      title: "Kiểm tra mẫu chưa đạt",
      to: "inspection",
    });
  }

  return items;
}

export default function HomeTab({ onNavigate }: { onNavigate: (tab: PortalTabId) => void }) {
  const overview = usePortal<PortalOverview>("overview");
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");
  const violations = usePortal<PortalList<PortalViolation>>("violations");
  const training = useResource<TrainingDto, TrainingDto>("training", keepTraining);
  const [selectedTraining, setSelectedTraining] = useState<TrainingDto | null>(null);

  const openViolationsList = useMemo(() => {
    return violations.data?.data?.filter((v) => v.status === "open") || [];
  }, [violations.data]);

  // Chỉ đưa những lịch tập huấn trong vòng thời gian khoảng 10 ngày trở lại để tránh làm rối màn hình trang chủ
  const urgentTrainings = useMemo(() => {
    if (!training.data || training.data.length === 0) return [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return training.data
      .filter((item) => {
        if (item.completed || !item.heldOn) return false;
        const target = new Date(item.heldOn);
        if (isNaN(target.getTime())) return false;
        const tgt = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        const diffDays = Math.round((tgt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 10;
      })
      .sort((a, b) => {
        const tA = a.heldOn ? new Date(a.heldOn).getTime() : 0;
        const tB = b.heldOn ? new Date(b.heldOn).getTime() : 0;
        return tA - tB;
      });
  }, [training.data]);

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
    badgeW: 215,
    badgeH: 60,
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
      const bW = badgeRef.current?.offsetWidth ?? 215;
      const bH = badgeRef.current?.offsetHeight ?? 60;
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

  const actionItems = useMemo<ActionItem[]>(() => {
    if (!overview.data) return [];
    return buildActionItems(overview.data, openViolationsList[0]);
  }, [overview.data, openViolationsList]);

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

            <div className="pt-hero-bio-block">
              <div className="pt-hero-bio-line">
                <svg className="pt-hero-bio-dot" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                  <circle cx="4" cy="4" r="3" />
                </svg>
                <span className="pt-hero-bio-text">{household.villageName}</span>
              </div>
              {household.villageLeader && (
                <>
                  <div className="pt-hero-bio-sep" aria-hidden="true" />
                  <div className="pt-hero-bio-line">
                    <svg className="pt-hero-bio-dot" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                      <circle cx="4" cy="4" r="3" />
                    </svg>
                    <span className="pt-hero-bio-text">Trưởng thôn: {household.villageLeader}</span>
                  </div>
                </>
              )}
              <div className="pt-hero-bio-sep" aria-hidden="true" />
              <div className="pt-hero-bio-line">
                <svg className="pt-hero-bio-dot" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                  <circle cx="4" cy="4" r="3" />
                </svg>
                <span className="pt-hero-bio-text">
                  Hộ canh tác sầu riêng VietGAP liên kết Hợp tác xã Krông Búk, Đắk Lắk.
                </span>
              </div>
            </div>

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
          </div>
          <button
            type="button"
            className="pt-widget-topbar-btn"
            onClick={() => onNavigate(actionItems[0]?.to || "diary")}
            title="Xem chi tiết nội dung cần làm"
          >
            Chi tiết
          </button>
        </div>

        <div className="pt-widget-sheet">
          {actionItems.length === 0 ? (
            <p className="pt-muted" style={{ padding: "4px 2px 14px", margin: 0 }}>
              Mọi thứ đều ổn. Hiện chưa có việc cần làm ngay.
            </p>
          ) : (
            <ul className="pt-widget-list" role="list">
              {actionItems.map((item) => (
                <li key={item.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    className="pt-widget-item"
                    onClick={() => onNavigate(item.to)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onNavigate(item.to);
                      }
                    }}
                  >
                    <img
                      src="/note.png?v=2"
                      alt=""
                      width={20}
                      height={20}
                      className="pt-widget-note-icon"
                      aria-hidden="true"
                    />
                    <span className="pt-widget-item-text">{item.title}</span>
                    <ChevronRight className="pt-widget-item-arrow" size={17} aria-hidden="true" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Lịch kiểm tra hiển thị trực tiếp trên nền giao diện (không dùng thẻ bao quanh) */}
      <section className="pt-schedule-section" aria-labelledby="schedule-heading">
        <div className="pt-schedule-header">
          <h2 id="schedule-heading" className="pt-schedule-title">
            Lịch kiểm tra
          </h2>
          {schedule.data && schedule.data.data.length > 0 && (
            <button
              type="button"
              className="pt-schedule-link"
              onClick={() => onNavigate("inspection")}
            >
              Xem tất cả &rarr;
            </button>
          )}
        </div>

        {(!schedule.data || schedule.data.data.length === 0) ? (
          <p className="pt-muted pt-schedule-empty">Hiện chưa có lịch kiểm tra hoặc lấy mẫu nào sắp tới.</p>
        ) : (
          <div className="pt-vietgap-timeline" role="list">
            {schedule.data.data.slice(0, 4).map((item, idx, arr) => {
              const theme = SCHEDULE_THEMES[idx % SCHEDULE_THEMES.length];
              const isLast = idx === arr.length - 1;
              const kicker = getScheduleKicker(item);
              const conciseTitle = getConciseScheduleTitle(item.title);
              const relNote = getRelativeScheduleNote(item.scheduledOn);
              const formattedDate = formatDate(item.scheduledOn);

              return (
                <div key={item.id} className="pt-vietgap-step">
                  <div className="pt-vietgap-segment">
                    {/* Trục Timeline dải capsule dày + chấm tròn trắng đồng bộ chuẩn VietGAP */}
                    <div className="pt-vietgap-track-col" aria-hidden="true">
                      <div
                        className="pt-vietgap-capsule pt-home-timeline-capsule"
                        style={{ background: theme.capsuleBg }}
                      >
                        <div className="pt-vietgap-dot" />
                        <div className="pt-vietgap-dot" />
                      </div>
                    </div>

                    {/* Thẻ nội dung */}
                    <div
                      className="pt-training-clean-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => onNavigate("inspection")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onNavigate("inspection");
                        }
                      }}
                      title="Nhấn để xem chi tiết đợt kiểm tra trong tab riêng"
                    >
                      <div className="pt-timeline-content">
                        <span className="pt-timeline-kicker">{kicker}</span>
                        <h3 className="pt-timeline-title">{conciseTitle}</h3>
                      </div>
                      <div className="pt-timeline-meta">
                        <span className="pt-timeline-date">{formattedDate}</span>
                        {relNote && <span className="pt-timeline-rel">{relNote}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Đoạn nối chuyển tiếp giữa các đợt (3 mini dots thẳng hàng với trục capsule) */}
                  {!isLast && (
                    <div className="pt-vietgap-transfer" aria-hidden="true">
                      <div className="pt-vietgap-transfer-track">
                        <div className="pt-vietgap-mini-dot" />
                        <div className="pt-vietgap-mini-dot" />
                        <div className="pt-vietgap-mini-dot" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Lớp tập huấn sắp diễn ra hiển thị trực tiếp trên nền giao diện, thiết kế theo style lịch kiểm tra, lọc trong vòng 10 ngày */}
      <section className="pt-schedule-section" aria-labelledby="training-schedule-heading">
        <div className="pt-schedule-header">
          <h2 id="training-schedule-heading" className="pt-schedule-title">
            Lớp tập huấn sắp tới
          </h2>
          {training.data && training.data.length > 0 && (
            <button
              type="button"
              className="pt-schedule-link"
              onClick={() => onNavigate("learn")}
            >
              Xem tất cả &rarr;
            </button>
          )}
        </div>

        {urgentTrainings.length === 0 ? (
          <p className="pt-muted pt-schedule-empty">
            {training.loading
              ? "Đang tải lịch tập huấn..."
              : "Hiện không có lớp tập huấn nào diễn ra trong 10 ngày tới."}
          </p>
        ) : (
          <div className="pt-vietgap-timeline" role="list">
            {urgentTrainings.slice(0, 4).map((item, idx, arr) => {
              const theme = TRAINING_THEMES[idx % TRAINING_THEMES.length];
              const isLast = idx === arr.length - 1;
              const kicker = getTrainingKicker(item.title);
              const relNote = item.heldOn ? getRelativeScheduleNote(item.heldOn) : "";
              const formattedDate = formatDate(item.heldOn);

              return (
                <div key={item.id} className="pt-vietgap-step">
                  <div className="pt-vietgap-segment">
                    {/* Trục Timeline dải capsule dày + chấm tròn trắng đồng bộ chuẩn VietGAP */}
                    <div className="pt-vietgap-track-col" aria-hidden="true">
                      <div
                        className="pt-vietgap-capsule pt-home-timeline-capsule"
                        style={{ background: theme.capsuleBg }}
                      >
                        <div className="pt-vietgap-dot" />
                        <div className="pt-vietgap-dot" />
                      </div>
                    </div>

                    {/* Thẻ nội dung */}
                    <div
                      className="pt-training-clean-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTraining(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedTraining(item);
                        }
                      }}
                      title="Nhấn để xem chi tiết khóa tập huấn và đăng ký"
                    >
                      <div className="pt-timeline-content">
                        <span className="pt-timeline-kicker">{kicker}</span>
                        <h3 className="pt-timeline-title">{item.title}</h3>
                      </div>
                      <div className="pt-timeline-meta">
                        <span className="pt-timeline-date">{formattedDate}</span>
                        {relNote && <span className="pt-timeline-rel">{relNote}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Đoạn nối chuyển tiếp giữa các khóa (3 mini dots thẳng hàng với trục capsule) */}
                  {!isLast && (
                    <div className="pt-vietgap-transfer" aria-hidden="true">
                      <div className="pt-vietgap-transfer-track">
                        <div className="pt-vietgap-mini-dot" />
                        <div className="pt-vietgap-mini-dot" />
                        <div className="pt-vietgap-mini-dot" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Popup chi tiết khóa tập huấn khi bấm vào item từ trang chủ */}
      {selectedTraining && (
        <Sheet
          title="Thông tin lớp tập huấn"
          onClose={() => setSelectedTraining(null)}
        >
          <TrainingDetailModal
            item={selectedTraining}
            onClose={() => setSelectedTraining(null)}
          />
        </Sheet>
      )}
    </div>
  );
}
