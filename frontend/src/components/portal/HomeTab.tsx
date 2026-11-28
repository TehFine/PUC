"use client";

import { useMemo } from "react";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { usePortal } from "@/hooks/use-portal";
import {
  daysSince,
  formatPortalDayHeading,
  HOUSEHOLD_STATUS,
  normalizePortalDayIso,
  SCHEDULE_KIND,
  todayIso,
} from "@/lib/portal-labels";
import type { PortalList, PortalOverview, PortalReminder, PortalScheduleItem, PortalViolation } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import type { PortalAction } from "./PortalSearch";
import { IosPwaInstallGuideBanner } from "./shared/FieldEvidenceCapture";
import { EmptyState, SectionDivider, StateBlock } from "./ui";

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
  date: string;
  title: string;
  detail?: string | null;
  plotLabel?: string | null;
  isAlert?: boolean;
  to: PortalTabId;
  action?: PortalAction;
}

interface DayGroup<T> {
  date: string;
  label: string;
  items: T[];
}

function groupByIsoDate<T>(items: ReadonlyArray<T>, getDate: (item: T) => string): DayGroup<T>[] {
  const map = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const date = normalizePortalDayIso(getDate(item));
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
}

function parseReminderDetail(raw?: string | null): { detail: string | null; plotLabel: string | null } {
  if (!raw) return { detail: null, plotLabel: null };
  let cleaned = raw.trim().replace(/^\d{2}\/\d{2}\/\d{4}\s*-\s*/, "").trim();
  let plotLabel: string | null = null;

  const trailingPlot = /^(.*?)\s*-\s*(Thửa\s+[^\s-]+.*)$/i.exec(cleaned);
  if (trailingPlot) {
    cleaned = trailingPlot[1].trim();
    plotLabel = trailingPlot[2].trim();
  } else {
    const leadingPlot = /^(Thửa\s+[^\s-]+)\s*-\s*(.+)$/i.exec(cleaned);
    if (leadingPlot) {
      plotLabel = leadingPlot[1].trim();
      cleaned = leadingPlot[2].trim();
    }
  }

  return {
    detail: cleaned || null,
    plotLabel,
  };
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

  if (rem.kind === "protocol") {
    return raw || "Đến lịch chăm sóc theo quy trình";
  }

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
  const today = todayIso();

  if (Array.isArray(overview.reminders)) {
    let hasDiaryReminder = false;
    return overview.reminders
      .filter((rem) => {
        if (rem.kind === "protocol") return false;
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
      .map((rem, idx) => {
        const parsed = parseReminderDetail(rem.detail);
        const itemDate =
          rem.kind === "journal" || rem.kind === "isolation"
            ? today
            : normalizePortalDayIso(rem.date);
        const isAlert =
          rem.kind === "violation" || rem.kind === "journal" || rem.kind === "isolation";

        return {
          id: `${rem.kind}-${idx}`,
          date: itemDate,
          title: getConciseReminderTitle(rem),
          detail: parsed.detail,
          plotLabel: parsed.plotLabel,
          isAlert,
          to: isAlert ? "diary" : normalizeReminderTab(rem.tab),
        };
      });
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
      date: today,
      title: "Chưa ghi nhật ký",
      plotLabel: firstViolation?.plotCode ? `Thửa ${firstViolation.plotCode}` : null,
      isAlert: true,
      to: "diary",
    });
  }

  const isNonDiaryViolation = Boolean(firstViolation && !hasDiaryViolation);
  if (stats.openViolations > 0 && isNonDiaryViolation) {
    items.push({
      id: "violations",
      date: normalizePortalDayIso(firstViolation?.detectedOn),
      title: getConciseViolationTitle(firstViolation, stats.openViolations),
      plotLabel: firstViolation?.plotCode ? `Thửa ${firstViolation.plotCode}` : null,
      isAlert: true,
      to: "diary",
    });
  }

  if (lastTest?.result === "fail") {
    items.push({
      id: "test-fail",
      date: normalizePortalDayIso(lastTest.sampledOn),
      title: "Mẫu kiểm nghiệm chưa đạt",
      plotLabel: lastTest.plotCode ? `Thửa ${lastTest.plotCode}` : null,
      isAlert: true,
      to: "inspection",
    });
  }

  return items;
}

export default function HomeTab({
  onNavigate,
}: {
  onNavigate: (tab: PortalTabId, action?: PortalAction) => void;
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

  const reminderGroups = useMemo(
    () => groupByIsoDate(actionItems, (item) => item.date),
    [actionItems],
  );

  const scheduleGroups = useMemo(
    () => groupByIsoDate((schedule.data?.data ?? []).slice(0, 4), (item) => item.scheduledOn),
    [schedule.data],
  );

  if (overview.loading || overview.error || !overview.data || !overview.data.household || !overview.data.stats) {
    return <StateBlock loading={overview.loading} error={overview.error} />;
  }

  const { household, stats } = overview.data;
  const status = HOUSEHOLD_STATUS[household?.status ?? "pending"] ?? HOUSEHOLD_STATUS.pending;
  const areaFormatted = (household?.areaHa ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
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
  const rawZoneCode = household.zoneCode?.trim() || "";
  const pucCode = rawZoneCode || "Chưa có mã vùng";

  const handleActionClick = (target: PortalTabId, action?: PortalAction) => {
    onNavigate(target, action);
  };

  return (
    <div className="pt-stack">
      <IosPwaInstallGuideBanner />
      <section className="pt-hero-shell" aria-label="Tổng quan hộ canh tác">
        <div className="pt-spec-rows">
          <header className="pt-spec-row is-no-meta">
            <span className="pt-spec-primary">Chủ hộ</span>
            <span className="pt-spec-sub">HTX Cư Né</span>
            <h1 className="pt-spec-val">{household.name}</h1>
          </header>

          <div className="pt-spec-row">
            <span className="pt-spec-primary">Mã vùng</span>
            <span className="pt-spec-meta">Mã vùng trồng PUC</span>
            <span className="pt-spec-sub">Định danh xuất khẩu</span>
            <span className="pt-spec-val" data-no-translate={rawZoneCode ? "true" : undefined}>
              {pucCode}
            </span>
          </div>

          <button
            type="button"
            className="pt-spec-row is-interactive"
            onClick={() => onNavigate("plots")}
          >
            <span className="pt-spec-primary">Số thửa</span>
            <span className="pt-spec-meta">Thửa đất</span>
            <span className="pt-spec-sub">Thửa đất canh tác</span>
            <span className="pt-spec-val">{household.plotCount}</span>
          </button>

          <button
            type="button"
            className="pt-spec-row is-interactive"
            onClick={() => onNavigate("plots")}
          >
            <span className="pt-spec-primary">Diện tích</span>
            <span className="pt-spec-meta">Hecta (ha)</span>
            <span className="pt-spec-sub">Tổng diện tích</span>
            <span className="pt-spec-val">{areaFormatted}</span>
          </button>

          <button
            type="button"
            className="pt-spec-row is-interactive"
            onClick={() => onNavigate("stamps")}
          >
            <span className="pt-spec-primary">Sản lượng</span>
            <span className="pt-spec-meta">
              {harvestDisplay.unit === "tấn" ? "Tấn đã góp lô" : "Kg đã góp lô"}
            </span>
            <span className="pt-spec-sub">Sản lượng đã góp lô</span>
            <span className="pt-spec-val">{harvestDisplay.num}</span>
          </button>

          <div className="pt-spec-row is-no-meta">
            <span className="pt-spec-primary">Chứng nhận</span>
            <span className="pt-spec-sub">Tiêu chuẩn VietGAP</span>
            <span className="pt-spec-val">{status.label}</span>
          </div>

          <div className="pt-spec-row">
            <span className="pt-spec-primary">Địa bàn</span>
            <span className="pt-spec-meta">
              {household.villageLeader ? (
                <>
                  <span>Trưởng thôn</span>: {household.villageLeader}
                </>
              ) : (
                "HTX Cư Né"
              )}
            </span>
            <span className="pt-spec-sub">Khu vực canh tác</span>
            <span className="pt-spec-val">{household.villageName || "HTX Cư Né"}</span>
          </div>

          <button
            type="button"
            className="pt-spec-row is-interactive"
            onClick={() => onNavigate("learn")}
            title="Xem khuyến nghị quy trình chăm sóc sầu riêng chuẩn 2026–2027 để đảm bảo thu mua đúng giá, giá cao"
          >
            <span className="pt-spec-primary">Quy trình</span>
            <span className="pt-spec-meta">Bảo chứng thu mua giá cao</span>
            <span className="pt-spec-sub">Khuyến nghị chăm sóc</span>
            <span className="pt-spec-val">2026–2027</span>
          </button>
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

      {/* Nhắc nhở */}
      <section className="pt-diary-section" aria-labelledby="reminders-heading">
        <div className="pt-diary-header">
          <h2 id="reminders-heading" className="pt-plots-title">
            Nhắc nhở
          </h2>
        </div>

        {reminderGroups.length === 0 ? (
          <EmptyState icon="empty" variant="taskCheck">Chưa có việc cần làm ngay.</EmptyState>
        ) : (
          <div className="pt-diary-day-groups">
            {reminderGroups.map((group) => (
              <div key={group.date} className="pt-diary-day-group">
                <div className="pt-diary-day-head">
                  <span className="pt-diary-day-label">{group.label}</span>
                </div>
                <ul className="pt-diary-day-card" role="list">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="pt-widget-item pt-diary-day-row"
                        onClick={() => handleActionClick(item.to, item.action)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleActionClick(item.to, item.action);
                          }
                        }}
                      >
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
                          {item.detail && (
                            <span
                              className={`pt-diary-item-sub ${item.isAlert ? "" : "is-neutral"}`.trim()}
                            >
                              {item.detail}
                            </span>
                          )}
                        </span>
                        {item.plotLabel && (
                          <span className="pt-diary-item-plot">{item.plotLabel}</span>
                        )}
                        <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <SectionDivider />

      {/* Lịch kiểm tra */}
      <section className="pt-diary-section" aria-labelledby="schedule-heading">
        <div className="pt-diary-header">
          <h2 id="schedule-heading" className="pt-plots-title">
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

        <StateBlock loading={schedule.loading} error={schedule.error} />
        {!schedule.loading && !schedule.error && scheduleGroups.length === 0 && (
          <EmptyState icon="calendar" variant="schedule">Chưa có lịch kiểm tra sắp tới.</EmptyState>
        )}
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
                    return (
                      <li key={item.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          className="pt-widget-item pt-diary-day-row"
                          onClick={() => onNavigate("inspection")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onNavigate("inspection");
                            }
                          }}
                          title="Bấm để xem chi tiết đợt kiểm tra"
                        >
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
                            {item.officer && (
                              <span className="pt-diary-item-sub is-neutral">
                                Cán bộ: {item.officer}
                              </span>
                            )}
                          </span>
                          <span className="pt-diary-item-plot">{kicker}</span>
                          <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
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
    </div>
  );
}
