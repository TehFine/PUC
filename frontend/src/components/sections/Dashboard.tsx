"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import InsightLineChart, { type InsightPoint } from "@/components/ui/charts/InsightLineChart";
import { SkeletonCards, SkeletonStats } from "@/components/ui/Skeleton";
import { refreshMountedApiQueries, useApi } from "@/hooks/use-api";
import BlockState from "@/components/admin/shared/BlockState";
import {
  onCountsChanged,
  requestAdminNavigate,
  requestApprovalTab,
  requestJournalTab,
} from "@/components/admin/shared/counts-events";
import { formatVn, percent } from "@/components/admin/shared/form-utils";
import { badgeOf, SCHEDULE_KIND } from "@/components/admin/shared/labels";
import { getServerCalibratedDate } from "@/lib/api-client";
import { formatDate } from "@/utils/format";
import type { DashboardSummary } from "@/types/dashboard";
import type { HouseholdStatus } from "@/types/households";

type ActivityRangeDays = 7 | 14 | 30;

function readStatusCounts(
  raw: DashboardSummary["householdStatus"],
  fallbackQualified: number,
): Record<HouseholdStatus, number> {
  const counts: Record<HouseholdStatus, number> = {
    qualified: 0,
    improve: 0,
    pending: 0,
    violation: 0,
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && item.status in counts) counts[item.status] = Number(item.count) || 0;
    }
  } else if (raw && typeof raw === "object") {
    for (const key of Object.keys(counts) as HouseholdStatus[]) {
      counts[key] = Number(raw[key]) || 0;
    }
  } else {
    counts.qualified = fallbackQualified;
  }
  return counts;
}

interface ActionQueueItem {
  key: string;
  title: string;
  subtitle: string;
  tone?: "danger" | "warn" | "default";
}

function buildFallbackDays(days: ActivityRangeDays): InsightPoint[] {
  const out: InsightPoint[] = [];
  const calibrated = getServerCalibratedDate();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(calibrated.getTime() - offset * 86_400_000);
    const parts = fmt.formatToParts(d);
    const dd = parts.find((p) => p.type === "day")?.value ?? "01";
    const mm = parts.find((p) => p.type === "month")?.value ?? "01";
    const yyyy = parts.find((p) => p.type === "year")?.value ?? "2026";
    out.push({ label: `${dd}/${mm}`, dateIso: `${yyyy}-${mm}-${dd}`, value: 0 });
  }
  return out;
}

/** Nội suy số học êm ái (320ms) khi dữ liệu trực tiếp thay đổi, không gây giật bố cục. */
function useSmoothNumber(target: number, decimals = 0): number {
  const [display, setDisplay] = useState(target);
  const currentRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = currentRef.current;
    const eps = Math.pow(10, -(decimals + 2));
    const skipAnim =
      Math.abs(target - from) < eps ||
      typeof window === "undefined" ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const startAt = performance.now();
    const duration = 320;
    const factor = Math.pow(10, decimals);

    const tick = (now: number) => {
      if (skipAnim) {
        rafRef.current = 0;
        currentRef.current = target;
        setDisplay(target);
        return;
      }
      const p = Math.min(Math.max((now - startAt) / duration, 0), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const raw = from + (target - from) * eased;
      const rounded = decimals > 0 ? Math.round(raw * factor) / factor : Math.round(raw);
      currentRef.current = raw;
      setDisplay(rounded);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
        currentRef.current = target;
        setDisplay(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [target, decimals]);

  return display;
}

export default function Dashboard() {
  const { can } = useAuth();
  const canViewActivityChart = can("journal", "read") || can("spray", "read");
  const [rangeDays, setRangeDays] = useState<ActivityRangeDays>(7);
  const [dateStr, setDateStr] = useState("");
  const [fullDateStr, setFullDateStr] = useState("");
  const { data: summary, loading, error, refresh } = useApi<DashboardSummary>("/dashboard/summary");

  useEffect(() => {
    const updateClockDate = () => {
      const now = getServerCalibratedDate();
      setDateStr(
        now.toLocaleDateString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
      setFullDateStr(
        now.toLocaleDateString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
    };
    const id = setTimeout(updateClockDate, 0);
    return () => clearTimeout(id);
  }, []);

  // Đồng bộ tức thì khi có sự kiện thay đổi số đếm quản trị (ngoài luồng SSE data-sync tự động)
  useEffect(() => onCountsChanged(() => refreshMountedApiQueries("/dashboard")), []);

  // Nhịp đối chiếu nền êm ái (20 giây khi tab đang mở, dùng ETag 304 0-byte nếu không đổi)
  // đảm bảo cập nhật cả khi dữ liệu CSDL được ghi trực tiếp từ tiến trình bên ngoài.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshMountedApiQueries("/dashboard");
      }
    }, 20_000);
    return () => window.clearInterval(interval);
  }, []);

  const counts = summary?.counts ?? {};
  const totalHouseholds = counts.households ?? 0;
  const totalPlots = counts.plots ?? 0;
  const totalAreaHa = counts.areaHa ?? 0;
  const qualifiedHouseholds = counts.qualifiedHouseholds ?? 0;
  const openViolations = counts.openViolations ?? 0;
  const pendingRegistrations = counts.pendingRegistrations ?? 0;
  const pendingDeclarations = counts.pendingDeclarations ?? 0;
  const harvestTons = counts.harvestTons ?? summary?.harvest?.tons ?? 0;
  const harvestLots = summary?.harvest?.lots ?? 0;
  const labTotal = counts.labTests ?? summary?.labTests?.total ?? 0;
  const labPassed = counts.labTestsPassed ?? summary?.labTests?.pass ?? 0;

  const qualifiedPct = totalHouseholds > 0 ? Math.round(percent(qualifiedHouseholds, totalHouseholds)) : 0;
  const labPassPct = labTotal > 0 ? Math.round(percent(labPassed, labTotal)) : null;

  const smoothAreaHa = useSmoothNumber(totalAreaHa, 1);
  const smoothHouseholds = useSmoothNumber(totalHouseholds, 0);
  const smoothPlots = useSmoothNumber(totalPlots, 0);
  const smoothQualifiedPct = useSmoothNumber(qualifiedPct, 0);
  const smoothHarvestTons = useSmoothNumber(harvestTons, 1);

  const statusCounts = useMemo(
    () => readStatusCounts(summary?.householdStatus, qualifiedHouseholds),
    [summary?.householdStatus, qualifiedHouseholds],
  );

  const activitySeries = useMemo<InsightPoint[]>(() => {
    const raw = summary?.dailyActivity;
    if (raw && raw.length >= 2) {
      const sliced = raw.length > rangeDays ? raw.slice(raw.length - rangeDays) : raw;
      return sliced.map((item) => ({
        label: item.label,
        dateIso: item.date,
        value: Number(item.count) || 0,
        journalCount: Number(item.journalCount ?? item.count) || 0,
        sprayCount: Number(item.sprayCount) || 0,
        householdCount: Number(item.householdCount) || 0,
      }));
    }
    return buildFallbackDays(rangeDays);
  }, [summary?.dailyActivity, rangeDays]);

  const periodTotal = useMemo(
    () => activitySeries.reduce((sum, pt) => sum + (Number(pt.value) || 0), 0),
    [activitySeries],
  );
  const todayCount = activitySeries.length > 0 ? Number(activitySeries[activitySeries.length - 1]?.value) || 0 : 0;
  const smoothPeriodTotal = useSmoothNumber(periodTotal, 0);
  const smoothTodayCount = useSmoothNumber(todayCount, 0);

  const topVillages = useMemo(() => {
    const list = [...(summary?.villages ?? [])];
    list.sort((a, b) => (Number(b.plots ?? b.households) || 0) - (Number(a.plots ?? a.households) || 0));
    const top = list.slice(0, 4);
    return top.map((v) => {
      const plots = Number(v.plots ?? 0);
      const households = Number(v.households ?? 0);
      return {
        id: v.id,
        name: v.name,
        metricLabel: plots > 0 ? `${formatVn(plots)} thửa` : `${formatVn(households)} hộ`,
      };
    });
  }, [summary?.villages]);

  const upcomingSchedule = summary?.upcomingSchedule ?? [];

  const actionQueue = useMemo<ActionQueueItem[]>(() => {
    const recentOpenViolations = (summary?.recentViolations ?? []).filter((v) => v.status !== "resolved");
    const pendingApprovals = summary?.pendingApprovals ?? [];
    const items: ActionQueueItem[] = [];
    if (pendingRegistrations > 0) {
      items.push({
        key: "reg",
        title: "Tài khoản nông dân chờ kích hoạt",
        subtitle: `${formatVn(pendingRegistrations)} đăng ký mới cần xác nhận`,
        tone: "warn",
      });
    }
    if (pendingDeclarations > 0) {
      items.push({
        key: "decl",
        title: "Khai báo thu hái chờ xác nhận",
        subtitle: `${formatVn(pendingDeclarations)} đợt khai báo sản lượng từ nông hộ`,
        tone: "warn",
      });
    }
    for (const p of pendingApprovals.slice(0, 3)) {
      items.push({
        key: `app-${p.id}`,
        title: p.applicantName,
        subtitle: `${p.requestType}, nộp ngày ${formatDate(p.submittedOn)}`,
        tone: "default",
      });
    }
    for (const v of recentOpenViolations.slice(0, 2)) {
      items.push({
        key: `vio-${v.id}`,
        title: v.title,
        subtitle: `${v.householdLabel || "Hộ thành viên"}, ${formatDate(v.detectedOn)}`,
        tone: v.severity === "critical" ? "danger" : "warn",
      });
    }
    return items.slice(0, 4);
  }, [pendingRegistrations, pendingDeclarations, summary?.pendingApprovals, summary?.recentViolations]);

  return (
    <>
      {dateStr && (
        <div className="page-header dash-header">
          <div className="dash-header-meta" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <div className="dash-date-badge" title={fullDateStr || dateStr} suppressHydrationWarning>
              <span>{dateStr}</span>
            </div>
          </div>
        </div>
      )}

      {error && !summary && (
        <BlockState loading={loading} error={error} empty={false} onRetry={() => void refresh()} />
      )}

      {loading && !summary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SkeletonStats count={3} label="Đang tải số liệu tổng quan…" />
          <SkeletonCards count={2} showSpinner={false} />
        </div>
      ) : (
        <div className="dash-bento">
          {/* BIỂU ĐỒ XU HƯỚNG HOẠT ĐỘNG CANH TÁC & PHUN THUỐC THỜI GIAN THỰC */}
          {canViewActivityChart && (
            <section className="dash-bento-card dash-insight-card">
              <div className="dash-insight-body">
                <header className="dash-insight-head">
                  <h2 className="dash-insight-title">Nhật ký canh tác</h2>
                  <div className="dash-insight-kpis" aria-live="polite">
                    <span>
                      Tổng {rangeDays} ngày: <strong>{formatVn(smoothPeriodTotal)}</strong> lượt
                    </span>
                    <span>
                      Hôm nay: <strong>{formatVn(smoothTodayCount)}</strong> lượt
                    </span>
                  </div>
                </header>
                <InsightLineChart
                  data={activitySeries}
                  metricLabel="Lượt ghi nhận"
                  ariaLabel={`Biểu đồ lượt ghi nhận nhật ký canh tác ${rangeDays} ngày gần nhất`}
                />
                <div className="dash-insight-foot">
                  <div className="dash-insight-range" role="group" aria-label="Khung thời gian biểu đồ">
                    {([7, 14, 30] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        className={`dash-insight-range-btn${rangeDays === days ? " is-active" : ""}`}
                        aria-pressed={rangeDays === days}
                        onClick={() => setRangeDays(days)}
                      >
                        {days} ngày
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* HÀNG 1: 3 THẺ TRỌNG TÂM (HÀNH ĐỘNG CẦN XỬ LÝ - QUY MÔ VÙNG TRỒNG - CHUẨN XUẤT KHẨU) */}
          <div className="dash-bento-top">
            {/* 1. Hạng mục cần xử lý ngay */}
            <section className="dash-bento-card">
              <div className="dash-bento-body">
                <header className="dash-bento-head is-centered">
                  <h2 className="dash-bento-title">Cần xử lý</h2>
                </header>

                {actionQueue.length === 0 ? (
                  <div className="dash-bento-clean-list">
                    <div className="dash-bento-clean-row">
                      <span>Hồ sơ chờ xét duyệt</span>
                      <strong>0</strong>
                    </div>
                    <div className="dash-bento-clean-row">
                      <span>Tài khoản chờ kích hoạt</span>
                      <strong>0</strong>
                    </div>
                    <div className="dash-bento-clean-row">
                      <span>Cảnh báo vi phạm mở</span>
                      <strong>0</strong>
                    </div>
                    <p className="dash-bento-footnote">Toàn bộ hồ sơ và nhật ký đang ở trạng thái ổn định.</p>
                  </div>
                ) : (
                  <div className="dash-bento-alert-list">
                    {actionQueue.map((item) => (
                      <div key={item.key} className="dash-bento-alert-row">
                        <div className="dash-bento-alert-copy">
                          <strong className={item.tone === "danger" ? "is-danger" : item.tone === "warn" ? "is-warn" : ""}>
                            {item.title}
                          </strong>
                          <span>{item.subtitle}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <footer className="dash-bento-footer">
                <button
                  type="button"
                  className="dash-bento-footer-btn"
                  onClick={() => requestAdminNavigate("approval")}
                >
                  Hồ sơ
                </button>
                {pendingDeclarations > 0 && (
                  <button
                    type="button"
                    className="dash-bento-footer-btn"
                    onClick={() => requestAdminNavigate("harvest")}
                  >
                    Thu hoạch
                  </button>
                )}
                {openViolations > 0 && (
                  <button
                    type="button"
                    className="dash-bento-footer-btn"
                    onClick={() => requestJournalTab("violations")}
                  >
                    Vi phạm
                  </button>
                )}
              </footer>
            </section>

            {/* 2. Quy mô vùng trồng & phân bổ thôn */}
            <section className="dash-bento-card">
              <div className="dash-bento-body">
                <header className="dash-bento-head is-centered">
                  <h2 className="dash-bento-title">Quy mô vùng trồng</h2>
                </header>

                <div className="dash-bento-hero is-centered">
                  <div className="dash-bento-figure">
                    <span className="dash-bento-num">{formatVn(smoothAreaHa, 1)}</span>
                    <span className="dash-bento-unit">ha</span>
                  </div>
                </div>

                <div className="dash-bento-inline-specs is-centered">
                  <span>Hộ <strong>{formatVn(smoothHouseholds)}</strong></span>
                  <span>Thửa <strong>{formatVn(smoothPlots)}</strong></span>
                  <span>Thôn <strong>{formatVn((summary?.villages ?? []).length)}</strong></span>
                </div>

                <div className="dash-bento-clean-list">
                  {topVillages.length === 0 ? (
                    <p className="dash-bento-footnote">Chưa có dữ liệu phân bổ theo thôn.</p>
                  ) : (
                    topVillages.map((v) => (
                      <div key={v.id} className="dash-bento-clean-row">
                        <span>{v.name}</span>
                        <strong>{v.metricLabel}</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <footer className="dash-bento-footer">
                <button
                  type="button"
                  className="dash-bento-footer-btn"
                  onClick={() => requestAdminNavigate("zones")}
                >
                  Bản đồ vùng trồng
                </button>
              </footer>
            </section>

            {/* 3. Hồ sơ đủ điều kiện xuất khẩu */}
            <section className="dash-bento-card">
              <div className="dash-bento-body">
                <header className="dash-bento-head">
                  <h2 className="dash-bento-title">Chuẩn xuất khẩu</h2>
                  <span className={`dash-bento-tag ${qualifiedPct >= 75 ? "is-ok" : "is-warn"}`}>
                    {formatVn(qualifiedHouseholds)}/{formatVn(totalHouseholds)} hộ
                  </span>
                </header>

                <div className="dash-bento-hero">
                  <div className="dash-bento-figure">
                    <span className="dash-bento-num">{smoothQualifiedPct}</span>
                    <span className="dash-bento-unit">%</span>
                  </div>
                </div>

                <div className="dash-bento-clean-list" aria-label="Phân bổ trạng thái nông hộ">
                  <div className="dash-bento-clean-row">
                    <span>Đủ chuẩn</span>
                    <strong>{formatVn(statusCounts.qualified)}</strong>
                  </div>
                  <div className="dash-bento-clean-row">
                    <span>Chờ duyệt</span>
                    <strong>{formatVn(statusCounts.pending)}</strong>
                  </div>
                  <div className="dash-bento-clean-row">
                    <span>Khắc phục</span>
                    <strong>{formatVn(statusCounts.improve)}</strong>
                  </div>
                  <div className="dash-bento-clean-row">
                    <span>Vi phạm</span>
                    <strong className={statusCounts.violation > 0 ? "is-danger" : ""}>
                      {formatVn(statusCounts.violation)}
                    </strong>
                  </div>
                </div>
              </div>

              <footer className="dash-bento-footer">
                <button
                  type="button"
                  className="dash-bento-footer-btn"
                  onClick={() => requestAdminNavigate("households")}
                >
                  Danh sách nông hộ
                </button>
              </footer>
            </section>
          </div>

          {/* HÀNG 2: 2 THẺ BẤT ĐỐI XỨNG (SẢN LƯỢNG & KIỂM NGHIỆM - LỊCH KIỂM TRA THỰC ĐỊA) */}
          <div className="dash-bento-bottom">
            {/* 4. Sản lượng thu hoạch & an toàn tồn dư MRL */}
            <section className="dash-bento-card">
              <div className="dash-bento-body">
                <header className="dash-bento-head">
                  <h2 className="dash-bento-title">Sản lượng và kiểm nghiệm</h2>
                </header>

                <div className="dash-bento-wide-mid" style={{ marginBottom: 14 }}>
                  <div className="dash-bento-wide-main">
                    <div className="dash-bento-figure">
                      <span className="dash-bento-num">{formatVn(smoothHarvestTons, 1)}</span>
                      <span className="dash-bento-unit">tấn</span>
                    </div>
                    <div className="dash-bento-wide-sub">
                      <span>Tổng hợp {formatVn(harvestLots)} lô thu hoạch</span>
                      <span>
                        {labPassPct !== null
                          ? `Tỷ lệ mẫu đạt ngưỡng MRL: ${labPassPct}%`
                          : "Kiểm nghiệm: chưa có phiếu"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="dash-bento-clean-list">
                  <div className="dash-bento-clean-row">
                    <span>Phiếu kiểm nghiệm đạt</span>
                    <strong>{labTotal > 0 ? `${formatVn(labPassed)}/${formatVn(labTotal)}` : "0"}</strong>
                  </div>
                  <div className="dash-bento-clean-row">
                    <span>Vi phạm mở</span>
                    <strong className={openViolations > 0 ? "is-danger" : ""}>{formatVn(openViolations)}</strong>
                  </div>
                </div>
              </div>

              <footer className="dash-bento-footer">
                <button
                  type="button"
                  className="dash-bento-footer-btn"
                  onClick={() => requestAdminNavigate("testing")}
                >
                  Kiểm nghiệm
                </button>
                <button
                  type="button"
                  className="dash-bento-footer-btn is-primary"
                  onClick={() => requestAdminNavigate("harvest")}
                >
                  Lô hàng
                </button>
              </footer>
            </section>

            {/* 5. Lịch kiểm tra sắp tới */}
            <section className="dash-bento-card">
              <div className="dash-bento-body">
                <header className="dash-bento-head">
                  <h2 className="dash-bento-title">Lịch kiểm tra thực địa</h2>
                  <span className={`dash-bento-tag ${openViolations === 0 ? "is-ok" : "is-danger"}`}>
                    {openViolations === 0 ? "Không vi phạm mở" : `${formatVn(openViolations)} vi phạm mở`}
                  </span>
                </header>

                <div className="dash-bento-hero">
                  <div className="dash-bento-figure">
                    <span className="dash-bento-num">{formatVn(upcomingSchedule.length)}</span>
                    <span className="dash-bento-unit">đợt</span>
                  </div>
                </div>

                {upcomingSchedule.length === 0 ? (
                  <div className="dash-bento-empty">
                    Chưa có đợt kiểm tra thực địa mới trong danh sách sắp tới.
                  </div>
                ) : (
                  <div className="dash-bento-schedule-list">
                    {upcomingSchedule.slice(0, 4).map((s) => {
                      const kind = badgeOf(SCHEDULE_KIND, s.kind);
                      return (
                        <div key={s.id} className="dash-bento-schedule-row">
                          <div className="dash-bento-schedule-main">
                            <strong>{s.title}</strong>
                            <span>
                              {s.officer ? `${s.officer}, ` : ""}
                              {s.plotCount ? `${formatVn(s.plotCount)} thửa` : kind.label}
                            </span>
                          </div>
                          <span className="dash-bento-schedule-date">{formatDate(s.scheduledOn)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <footer className="dash-bento-footer">
                <button
                  type="button"
                  className="dash-bento-footer-btn"
                  onClick={() => requestApprovalTab("schedule")}
                >
                  Xem lịch kiểm tra
                </button>
              </footer>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
