"use client";

import { useEffect, useMemo, useState } from "react";
import { CHART_COLORS } from "@/components/ui/chart-theme";
import {
  AreaTrend,
  CapsuleDonutChart,
  KpiChartView,
  renderKpiValue,
  type ChartPoint,
  type DonutItem,
  type KpiChartSpec,
} from "@/components/ui/charts/KpiCharts";
import { StandardBenchmarkMeter } from "@/components/ui/charts/StandardBenchmarkMeter";
import { AppleLoadingPill, SkeletonCards, SkeletonStats } from "@/components/ui/Skeleton";
import { useApi } from "@/hooks/use-api";
import BlockState from "@/components/admin/shared/BlockState";
import { onCountsChanged, requestAdminNavigate } from "@/components/admin/shared/counts-events";
import { formatVn, percent } from "@/components/admin/shared/form-utils";
import { badgeOf, SCHEDULE_KIND } from "@/components/admin/shared/labels";
import { formatDate } from "@/utils/format";
import type { DashboardSummary } from "@/types/dashboard";
import type { HouseholdStatus } from "@/types/households";

function ensureTwoPoints(points: ChartPoint[], fallbackLabel = "Hiện tại"): ChartPoint[] {
  if (points.length >= 2) return points;
  if (points.length === 1) return [points[0], { label: `${points[0].label} (2)`, value: points[0].value }];
  return [
    { label: "T-1", value: 0 },
    { label: fallbackLabel, value: 0 },
  ];
}

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

export default function Dashboard() {
  const [dateStr, setDateStr] = useState("");
  const [fullDateStr, setFullDateStr] = useState("");
  const { data: summary, loading, error, refresh } = useApi<DashboardSummary>("/dashboard/summary");

  useEffect(() => {
    const id = setTimeout(() => {
      const now = new Date();
      setDateStr(
        now.toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
      setFullDateStr(
        now.toLocaleDateString("vi-VN", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => onCountsChanged(() => void refresh()), [refresh]);

  const counts = summary?.counts ?? {};
  const totalHouseholds = counts.households ?? 0;
  const totalPlots = counts.plots ?? 0;
  const totalAreaHa = counts.areaHa ?? 0;
  const qualifiedHouseholds = counts.qualifiedHouseholds ?? 0;
  const openViolations = counts.openViolations ?? 0;
  const pendingApprovalsCount = counts.pendingApprovals ?? summary?.pendingApprovals?.length ?? 0;
  const harvestTons = counts.harvestTons ?? summary?.harvest?.tons ?? 0;
  const harvestLots = summary?.harvest?.lots ?? 0;
  const labTotal = counts.labTests ?? summary?.labTests?.total ?? 0;
  const labPassed = counts.labTestsPassed ?? summary?.labTests?.pass ?? 0;
  const journalLast30 = counts.journalLast30Days ?? 0;

  const qualifiedPct = Math.round(percent(qualifiedHouseholds, Math.max(totalHouseholds, 1)));
  const labPassPct = Math.round(percent(labPassed, Math.max(labTotal, 1)));

  const trendPoints = useMemo<ChartPoint[]>(() => {
    const raw = summary?.journalTrend ?? [];
    return ensureTwoPoints(
      raw.map((pt) => ({
        label: pt.month,
        value: Number(pt.count) || 0,
      })),
    );
  }, [summary?.journalTrend]);

  const villageBars = useMemo<ChartPoint[]>(() => {
    const villages = summary?.villages ?? [];
    if (villages.length === 0) {
      return [
        { label: "T1", value: totalHouseholds },
        { label: "T2", value: qualifiedHouseholds },
      ];
    }
    return villages.map((v) => ({
      label: v.name.replace(/^Thôn\s+/i, "T"),
      value: Number(v.households) || 0,
    }));
  }, [summary?.villages, totalHouseholds, qualifiedHouseholds]);

  const villagePlotBars = useMemo<ChartPoint[]>(() => {
    const villages = summary?.villages ?? [];
    if (villages.length === 0) {
      return [
        { label: "T1", value: totalPlots },
        { label: "T2", value: Math.max(Math.round(totalPlots * 0.6), 1) },
      ];
    }
    return villages.map((v) => ({
      label: v.name.replace(/^Thôn\s+/i, "T"),
      value: Number(v.plots ?? v.households) || 0,
    }));
  }, [summary?.villages, totalPlots]);

  const statusData = useMemo<DonutItem[]>(() => {
    const st = readStatusCounts(summary?.householdStatus, qualifiedHouseholds);
    return [
      { name: "Đủ chuẩn XK", value: st.qualified, color: "#3b82f6" },
      { name: "Cần cải thiện", value: st.improve, color: "#f59e0b" },
      { name: "Chờ duyệt", value: st.pending, color: "#10b981" },
      { name: "Vi phạm", value: st.violation, color: "#ef4444" },
    ];
  }, [summary?.householdStatus, qualifiedHouseholds]);

  const standards = useMemo(() => {
    const st = readStatusCounts(summary?.householdStatus, qualifiedHouseholds);
    const nonViolationPct = Math.round(
      percent(Math.max(totalHouseholds - st.violation, 0), Math.max(totalHouseholds, 1)),
    );
    return [
      { label: "Đủ chuẩn XK", pct: qualifiedPct, color: CHART_COLORS.ok },
      { label: "Mẫu Lab đạt", pct: labPassPct, color: CHART_COLORS.ok },
      { label: "Không vi phạm", pct: nonViolationPct, color: CHART_COLORS.warn },
      {
        label: "Nhật ký 30 ngày",
        pct: Math.min(100, Math.round(percent(journalLast30, Math.max(totalHouseholds, 1)))),
        color: CHART_COLORS.ok,
      },
    ];
  }, [summary?.householdStatus, qualifiedHouseholds, totalHouseholds, qualifiedPct, labPassPct, journalLast30]);

  const kpis: { val: string; label: string; trend: string; trendType: string; chart: KpiChartSpec }[] = [
    {
      val: formatVn(totalHouseholds),
      label: "Tổng số hộ đăng ký",
      trend: `${formatVn(totalAreaHa, 1)} ha canh tác`,
      trendType: "up",
      chart: {
        kind: "bars",
        tone: "lime",
        unit: " hộ",
        highlight: "max",
        data: villageBars,
      },
    },
    {
      val: formatVn(totalPlots),
      label: "Thửa được cấp mã",
      trend: `${(summary?.villages ?? []).length || 6} thôn quản lý`,
      trendType: "up",
      chart: {
        kind: "bars",
        tone: "ink",
        unit: " thửa",
        highlight: "max",
        data: villagePlotBars,
      },
    },
    {
      val: formatVn(qualifiedHouseholds),
      label: "Hộ đủ điều kiện XK",
      trend: `${qualifiedPct}% đạt chuẩn`,
      trendType: "up",
      chart: {
        kind: "gauge",
        tone: "lime",
        value: qualifiedPct,
        target: 80,
        caption: `${qualifiedHouseholds}/${totalHouseholds} hộ`,
      },
    },
    {
      val: formatVn(openViolations),
      label: "Cảnh báo vi phạm mở",
      trend: openViolations > 0 ? "Cần theo dõi xử lý" : "Không có vi phạm mở",
      trendType: openViolations > 0 ? "down" : "up",
      chart: {
        kind: "area",
        tone: "ink",
        unit: " nhật ký",
        highlight: "last",
        caption: `${formatVn(journalLast30)} bản ghi nhật ký 30 ngày qua`,
        data: trendPoints,
      },
    },
    {
      val: `${formatVn(harvestTons, 1)} tấn`,
      label: "Sản lượng thu hoạch",
      trend: `${harvestLots} lô xuất khẩu`,
      trendType: "up",
      chart: {
        kind: "area",
        tone: "lime",
        unit: " bản ghi",
        highlight: "max",
        caption: `Kiểm nghiệm đạt ${labPassed}/${labTotal} mẫu (${labPassPct}%)`,
        data: trendPoints,
      },
    },
    {
      val: formatVn(pendingApprovalsCount),
      label: "Hồ sơ chờ duyệt",
      trend:
        (counts.pendingRegistrations ?? 0) > 0
          ? `${counts.pendingRegistrations} tài khoản chờ duyệt`
          : "Cần xử lý sớm",
      trendType: "warn",
      chart: {
        kind: "gauge",
        tone: "amber",
        value: labPassPct,
        caption: `Mẫu đạt chuẩn ${labPassPct}%`,
      },
    },
  ];

  const recentViolations = summary?.recentViolations ?? [];
  const pendingApprovals = summary?.pendingApprovals ?? [];
  const upcomingSchedule = summary?.upcomingSchedule ?? [];

  return (
    <>
      <div className="page-header dash-header">
        <h1>Tổng quan</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {loading && summary && <AppleLoadingPill label="Đang cập nhật…" />}
          {dateStr && (
            <div className="dash-date-badge" title={fullDateStr || dateStr} suppressHydrationWarning>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{dateStr}</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <BlockState loading={loading} error={error} empty={false} onRetry={() => void refresh()} />
      )}

      {loading && !summary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SkeletonStats count={6} label="Đang tải số liệu tổng quan…" />
          <SkeletonCards count={2} showSpinner={false} />
        </div>
      ) : (
      <>
      <div className="kpi-grid">
        {kpis.map(({ val, label, trend, trendType, chart }, i) => (
          <div key={i} className="kpi-card has-chart">
            <div className="kpi-head">
              <div className="kpi-val">{renderKpiValue(val)}</div>
              <div className="kpi-meta">
                <div className="kpi-label">{label}</div>
                <div className={`kpi-trend ${trendType}`}>{trend}</div>
              </div>
            </div>
            <KpiChartView chart={chart} label={label} />
          </div>
        ))}
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="dash-chart-head">
            <div className="chart-title">Xu hướng ghi chép nhật ký canh tác (6 tháng)</div>
          </div>
          <AreaTrend
            data={trendPoints}
            unit=" lượt"
            highlight="last"
            height={180}
            caption="Số bản ghi nhật ký canh tác theo từng tháng trong niên vụ"
            ariaLabel="Xu hướng nhật ký canh tác 6 tháng"
          />
        </div>

        <div className="chart-card">
          <div className="chart-title">Phân bổ trạng thái hộ</div>
          <CapsuleDonutChart
            data={statusData}
            unit=" hộ"
            ariaLabel={`Phân bổ trạng thái ${totalHouseholds} hộ nông dân`}
          />
        </div>
      </div>

      <div className="dash-bottom">
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Vi phạm gần đây</div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => requestAdminNavigate("journal")}
            >
              Xem tất cả
            </button>
          </div>
          <div className="card-body">
            {recentViolations.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Không có cảnh báo vi phạm gần đây.</div>
            ) : (
              <div className="alert-list">
                {recentViolations.map((v) => (
                  <div key={v.id} className={`alert-item ${v.severity === "critical" ? "red" : "orange"}`}>
                    <div className="alert-item-body">
                      <strong>{v.title}</strong>
                      <small>
                        {v.householdLabel || "Hộ thành viên"} · {formatDate(v.detectedOn)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Hồ sơ chờ duyệt</div>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{pendingApprovalsCount} hồ sơ</span>
          </div>
          <div className="card-body">
            {pendingApprovals.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Không có hồ sơ nào đang chờ duyệt.</div>
            ) : (
              pendingApprovals.map((p) => (
                <div key={p.id} className="pending-item">
                  <div>
                    <div className="pending-item-name">{p.applicantName}</div>
                    <div className="pending-item-sub">
                      {p.code} · {p.requestType} · {formatDate(p.submittedOn)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => requestAdminNavigate("approval")}
                  >
                    Duyệt
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Lịch kiểm tra sắp tới &amp; Chỉ số</div>
          </div>
          <div className="card-body">
            {upcomingSchedule.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {upcomingSchedule.map((s) => {
                  const kind = badgeOf(SCHEDULE_KIND, s.kind);
                  return (
                    <div key={s.id} className="pending-item">
                      <div>
                        <div className="pending-item-name">{s.title}</div>
                        <div className="pending-item-sub">
                          {formatDate(s.scheduledOn)}
                          {s.officer ? ` · ${s.officer}` : ""}
                          {s.plotCount ? ` · ${s.plotCount} thửa` : ""}
                        </div>
                      </div>
                      <span className={`badge ${kind.badge}`}>{kind.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <StandardBenchmarkMeter standards={standards} />
          </div>
        </div>
      </div>
      </>
      )}
    </>
  );
}
