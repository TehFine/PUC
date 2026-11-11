"use client";

import { useMemo } from "react";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { usePortal } from "@/hooks/use-portal";
import { daysSince, HOUSEHOLD_STATUS, relativeDayLabel, SCHEDULE_KIND } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalList, PortalOverview, PortalReminder, PortalScheduleItem, PortalViolation } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import { SectionDivider, StateBlock } from "./ui";

const SCHEDULE_THEMES = [
  { capsuleBg: "linear-gradient(180deg, #10b981 0%, #059669 100%)" },
  { capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)" },
  { capsuleBg: "linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)" },
  { capsuleBg: "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)" },
];

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

interface ActionItem {
  id: string;
  title: string;
  detail?: string | null;
  to: PortalTabId;
}

function getConciseViolationTitle(v?: PortalViolation | null, count = 1, isDiaryIdle = false): string {
  if (!v) {
    if (isDiaryIdle) return "Chưa ghi nhật ký";
    return count > 1 ? `Khắc phục vi phạm (${count})` : "Khắc phục vi phạm";
  }
  const lower = v.title.toLowerCase();
  if (lower.includes("nhật ký")) return "Chưa ghi nhật ký";
  if (lower.includes("thuốc") || lower.includes("bảo vệ thực vật")) return "Vi phạm dùng thuốc";
  if (lower.includes("mẫu") || lower.includes("kiểm nghiệm")) return "Mẫu kiểm nghiệm chưa đạt";
  if (lower.includes("biển") || lower.includes("cắm vườn")) return "Chưa cắm biển vườn";
  const cleaned = v.title.replace(/^(khắc phục|vi phạm|cảnh báo)[:\s\-]+/i, "").trim();
  if (cleaned.length > 24) return "Khắc phục vi phạm";
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Khắc phục vi phạm";
}

function normalizeReminderTab(tab: string): PortalTabId {
  const clean = tab.trim().toLowerCase();
  if (clean === "plots" || clean === "diary" || clean === "stamps" || clean === "inspection" || clean === "learn") {
    return clean;
  }
  if (clean === "harvest") return "stamps";
  if (clean === "training") return "learn";
  return "diary";
}

function getConciseReminderTitle(rem: PortalReminder): string {
  const raw = (rem.title || "").trim();
  const lower = raw.toLowerCase();

  if (rem.kind === "journal") {
    return "Chưa ghi nhật ký 7 ngày";
  }

  if (rem.kind === "schedule") {
    if (lower.startsWith("lấy mẫu")) return "Lấy mẫu kiểm nghiệm";
    if (lower.startsWith("phúc tra")) return "Phúc tra vi phạm";
    if (lower.startsWith("kiểm tra thực địa")) return "Kiểm tra thực địa";
    if (lower.startsWith("kiểm tra định kỳ")) return "Kiểm tra định kỳ VietGAP";
    if (lower.startsWith("kiểm tra đột xuất")) return "Kiểm tra đột xuất";
    return raw.length > 32 ? getConciseScheduleTitle(raw) : raw;
  }

  if (rem.kind === "violation") {
    if (lower.includes("nhật ký")) return "Chưa ghi nhật ký 7 ngày";
    if (lower.includes("thuốc") || lower.includes("bảo vệ thực vật") || lower.includes("bvtv")) {
      return "Vi phạm dùng thuốc BVTV";
    }
    if (lower.includes("mẫu") || lower.includes("kiểm nghiệm")) return "Mẫu kiểm nghiệm chưa đạt";
    if (lower.includes("biển") || lower.includes("cắm vườn")) return "Chưa cắm biển vườn";
    return raw;
  }

  if (rem.kind === "training" && raw.length > 34) {
    const cleaned = raw.replace(/^(tập huấn kỹ thuật|lớp tập huấn|tập huấn)\s+/i, "").trim();
    if (cleaned) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return raw;
}

function buildActionItems(overview: PortalOverview, firstViolation?: PortalViolation | null): ActionItem[] {
  if (Array.isArray(overview.reminders)) {
    let hasDiaryReminder = false;
    return overview.reminders
      .filter((rem) => {
        const clean = (rem.tab || "").trim().toLowerCase();
        if (clean === "requests" || clean === "approvals" || clean === "training" || rem.kind === "training") return false;
        const isDiaryReminder =
          rem.kind === "journal" ||
          (rem.kind === "violation" && rem.title.toLowerCase().includes("nhật ký"));
        if (isDiaryReminder) {
          if (hasDiaryReminder) return false;
          hasDiaryReminder = true;
        }
        return true;
      })
      .map((rem, idx) => ({
        id: `${rem.kind}-${idx}`,
        title: getConciseReminderTitle(rem),
        detail: rem.detail,
        to: rem.kind === "violation" || rem.kind === "journal" || rem.kind === "isolation"
          ? "diary"
          : normalizeReminderTab(rem.tab),
      }));
  }

  const { stats, lastTest } = overview;
  const idle = daysSince(stats.lastJournalOn);
  const isDiaryIdle = idle === null || idle >= 7;
  const items: ActionItem[] = [];

  const hasDiaryViolation = Boolean(
    firstViolation &&
      (firstViolation.title.toLowerCase().includes("nhật ký") ||
        firstViolation.description?.toLowerCase().includes("nhật ký")),
  );

  if (isDiaryIdle || hasDiaryViolation) {
    items.push({
      id: "diary",
      title: "Chưa ghi nhật ký",
      to: "diary",
    });
  }

  const isNonDiaryViolation = Boolean(firstViolation && !hasDiaryViolation);
  if (stats.openViolations > 0 && isNonDiaryViolation) {
    items.push({
      id: "violations",
      title: getConciseViolationTitle(firstViolation, stats.openViolations),
      to: "diary",
    });
  }

  if (lastTest?.result === "fail") {
    items.push({
      id: "test-fail",
      title: "Mẫu kiểm nghiệm chưa đạt",
      to: "inspection",
    });
  }

  return items;
}

export default function HomeTab({
  onNavigate,
}: {
  onNavigate: (tab: PortalTabId) => void;
}) {
  const overview = usePortal<PortalOverview>("overview");
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");
  const violations = usePortal<PortalList<PortalViolation>>("violations");

  const openViolationsList = useMemo(() => {
    return violations.data?.data?.filter((v) => v.status === "open") || [];
  }, [violations.data]);

  const actionItems = useMemo<ActionItem[]>(() => {
    if (!overview.data) return [];
    return buildActionItems(overview.data, openViolationsList[0]);
  }, [overview.data, openViolationsList]);

  if (overview.loading || overview.error || !overview.data) {
    return <StateBlock loading={overview.loading} error={overview.error} />;
  }

  const { household, stats } = overview.data;
  const status = HOUSEHOLD_STATUS[household.status] ?? HOUSEHOLD_STATUS.pending;
  const areaFormatted = household.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const harvestDisplay =
    stats.harvestTotalKg >= 1000
      ? {
          num: (stats.harvestTotalKg / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
          unit: "tấn",
        }
      : {
          num: stats.harvestTotalKg.toLocaleString("vi-VN", { maximumFractionDigits: 1 }),
          unit: "kg",
        };
  const pucCode = household.code ? household.code.replace(/-(?:H|T)\d+$/i, "") : "—";

  const handleActionClick = (target: PortalTabId) => {
    onNavigate(target);
  };

  return (
    <div className="pt-stack">
      <section className="pt-hero-shell" aria-label="Tổng quan hộ canh tác">
        <div className="pt-spec-rows">
          <header className="pt-spec-head">
            <span className="pt-spec-kicker">Chủ hộ</span>
            <h1 className="pt-spec-title">{household.name}</h1>
          </header>

          <div className="pt-spec-zone-row">
            <span className="pt-spec-kicker">Mã vùng</span>
            <span className="pt-spec-val-code">{pucCode}</span>
          </div>

          <button
            type="button"
            className="pt-spec-metric"
            onClick={() => onNavigate("plots")}
          >
            <span className="pt-spec-metric-bar">
              <span className="pt-spec-kicker">Số thửa</span>
            </span>
            <span className="pt-spec-metric-body">
              <span aria-hidden="true" />
              <span className="pt-spec-big-val">
                <span className="pt-spec-big-num">{household.plotCount}</span>
                <span className="pt-spec-unit">Thửa đất</span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="pt-spec-metric"
            onClick={() => onNavigate("plots")}
          >
            <span className="pt-spec-metric-bar">
              <span className="pt-spec-kicker">Diện tích</span>
            </span>
            <span className="pt-spec-metric-body">
              <span aria-hidden="true" />
              <span className="pt-spec-big-val">
                <span className="pt-spec-big-num">{areaFormatted}</span>
                <span className="pt-spec-unit">ha</span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="pt-spec-metric"
            onClick={() => onNavigate("stamps")}
          >
            <span className="pt-spec-metric-bar">
              <span className="pt-spec-kicker">Sản lượng</span>
            </span>
            <span className="pt-spec-metric-body">
              <span aria-hidden="true" />
              <span className="pt-spec-big-val">
                <span className="pt-spec-big-num">{harvestDisplay.num}</span>
                <span className="pt-spec-unit">{harvestDisplay.unit}</span>
              </span>
            </span>
          </button>

          <div className="pt-spec-detail-row">
            <span className="pt-spec-kicker">Chứng nhận</span>
            <div className="pt-spec-val-stack">
              <span>{status.label}</span>
            </div>
          </div>

          <div className="pt-spec-detail-row">
            <span className="pt-spec-kicker">Địa bàn</span>
            <div className="pt-spec-val-stack">
              <span>{household.villageName || "HTX Cư Né"}</span>
              {household.villageLeader && (
                <span>
                  <span>Trưởng thôn</span>: {household.villageLeader}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pt-hero-footer">
          <button
            type="button"
            className="pt-widget-topbar-btn is-primary pt-hero-diary-btn"
            onClick={() => onNavigate("diary")}
            title="Mở nhật ký canh tác để ghi chép hoạt động"
          >
            Ghi nhật ký
          </button>
        </div>
      </section>

      <SectionDivider />

      {/* Widget Nhắc nhở */}
      <section className="pt-reminders-widget pt-home-reminders-widget" aria-label="Nhắc nhở và nhiệm vụ hôm nay">
        <div className="pt-widget-topbar">
          <div className="pt-widget-topbar-info">
            <h2 className="pt-widget-topbar-title">Nhắc nhở</h2>
          </div>
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
                    className="pt-widget-item pt-reminder-item"
                    onClick={() => handleActionClick(item.to)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleActionClick(item.to);
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
                    <div className="pt-reminder-item-content">
                      <span className="pt-widget-item-text pt-reminder-item-title">
                        {item.title}
                      </span>
                      {item.detail && (
                        <span className="pt-reminder-item-detail">
                          {item.detail}
                        </span>
                      )}
                    </div>
                    <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <SectionDivider />

      {/* Lịch kiểm tra */}
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
              <span>Xem tất cả</span>
              <DetailArrowIcon className="pt-schedule-link-arrow" size={20} />
            </button>
          )}
        </div>

        {!schedule.data || schedule.data.data.length === 0 ? (
          <p className="pt-muted pt-schedule-empty">Hiện chưa có lịch kiểm tra hoặc lấy mẫu nào sắp tới.</p>
        ) : (
          <div className="pt-vietgap-timeline" role="list">
            {schedule.data.data.slice(0, 4).map((item, idx, arr) => {
              const theme = SCHEDULE_THEMES[idx % SCHEDULE_THEMES.length];
              const isLast = idx === arr.length - 1;
              const kicker = getScheduleKicker(item);
              const conciseTitle = getConciseScheduleTitle(item.title);
              const relNote = relativeDayLabel(item.scheduledOn);
              const formattedDate = formatDate(item.scheduledOn);

              return (
                <div key={item.id} className="pt-vietgap-step">
                  <div className="pt-vietgap-segment">
                    <div className="pt-vietgap-track-col" aria-hidden="true">
                      <div
                        className="pt-vietgap-capsule pt-home-timeline-capsule"
                        style={{ background: theme.capsuleBg }}
                      >
                        <div className="pt-vietgap-dot" />
                        <div className="pt-vietgap-dot" />
                      </div>
                    </div>

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
                        {relNote && <span className="pt-timeline-rel">({relNote})</span>}
                      </div>
                    </div>
                  </div>

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
    </div>
  );
}
