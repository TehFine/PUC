"use client";

import { useEffect, useMemo, useState } from "react";
import { AppleLoadingPill, SkeletonCards, SkeletonStats } from "@/components/ui/Skeleton";
import { useApi } from "@/hooks/use-api";
import BlockState from "@/components/admin/shared/BlockState";
import { onCountsChanged, requestAdminNavigate } from "@/components/admin/shared/counts-events";
import { formatVn, percent } from "@/components/admin/shared/form-utils";
import { badgeOf, SCHEDULE_KIND } from "@/components/admin/shared/labels";
import { formatDate } from "@/utils/format";
import type { DashboardSummary } from "@/types/dashboard";
import type { HouseholdStatus } from "@/types/households";

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

const RULER_TICKS = 32;

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
  const pendingRegistrations = counts.pendingRegistrations ?? 0;
  const harvestTons = counts.harvestTons ?? summary?.harvest?.tons ?? 0;
  const harvestLots = summary?.harvest?.lots ?? 0;
  const labTotal = counts.labTests ?? summary?.labTests?.total ?? 0;
  const labPassed = counts.labTestsPassed ?? summary?.labTests?.pass ?? 0;

  const qualifiedPct = totalHouseholds > 0 ? Math.round(percent(qualifiedHouseholds, totalHouseholds)) : 0;
  const labPassPct = labTotal > 0 ? Math.round(percent(labPassed, labTotal)) : 100;

  const statusCounts = useMemo(
    () => readStatusCounts(summary?.householdStatus, qualifiedHouseholds),
    [summary?.householdStatus, qualifiedHouseholds],
  );

  const statusColumns = useMemo(() => {
    const raw = [
      { key: "qualified", label: "Đủ chuẩn", shortLabel: "Đủ chuẩn", count: statusCounts.qualified, tone: "ok" as const },
      { key: "pending", label: "Chờ duyệt", shortLabel: "Chờ duyệt", count: statusCounts.pending, tone: "neutral" as const },
      { key: "improve", label: "Khắc phục", shortLabel: "Khắc phục", count: statusCounts.improve, tone: "warn" as const },
      { key: "violation", label: "Vi phạm", shortLabel: "Vi phạm", count: statusCounts.violation, tone: "danger" as const },
    ];
    const maxCount = Math.max(1, ...raw.map((r) => r.count));
    return raw.map((item) => ({
      ...item,
      ratio: Math.max(0.08, item.count / maxCount),
    }));
  }, [statusCounts]);

  const topVillages = useMemo(() => {
    const list = [...(summary?.villages ?? [])];
    list.sort((a, b) => (Number(b.plots ?? b.households) || 0) - (Number(a.plots ?? a.households) || 0));
    const top = list.slice(0, 4);
    const maxVal = Math.max(1, ...top.map((v) => Number(v.plots ?? v.households) || 0));
    return top.map((v) => {
      const plots = Number(v.plots ?? 0);
      const households = Number(v.households ?? 0);
      const metric = plots > 0 ? plots : households;
      return {
        id: v.id,
        name: v.name,
        metricLabel: plots > 0 ? `${formatVn(plots)} thửa` : `${formatVn(households)} hộ`,
        pct: Math.max(6, Math.round((metric / maxVal) * 100)),
      };
    });
  }, [summary?.villages]);

  const upcomingSchedule = summary?.upcomingSchedule ?? [];

  const actionQueue = useMemo<ActionQueueItem[]>(() => {
    const recentViolations = summary?.recentViolations ?? [];
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
    for (const p of pendingApprovals.slice(0, 3)) {
      items.push({
        key: `app-${p.id}`,
        title: p.applicantName,
        subtitle: `${p.requestType}, nộp ngày ${formatDate(p.submittedOn)}`,
        tone: "default",
      });
    }
    for (const v of recentViolations.slice(0, 2)) {
      items.push({
        key: `vio-${v.id}`,
        title: v.title,
        subtitle: `${v.householdLabel || "Hộ thành viên"}, ${formatDate(v.detectedOn)}`,
        tone: v.severity === "critical" ? "danger" : "warn",
      });
    }
    return items.slice(0, 4);
  }, [pendingRegistrations, summary?.pendingApprovals, summary?.recentViolations]);

  const totalActionCount = pendingApprovalsCount + pendingRegistrations + openViolations;
  const activeTickIndex = Math.min(
    RULER_TICKS - 1,
    Math.max(0, Math.round((labPassPct / 100) * (RULER_TICKS - 1))),
  );

  return (
    <>
      {((loading && summary) || dateStr) && (
        <div className="page-header dash-header">
          <div className="dash-header-meta" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {loading && summary && <AppleLoadingPill label="Đang cập nhật…" />}
            {dateStr && (
              <div className="dash-date-badge" title={fullDateStr || dateStr} suppressHydrationWarning>
                <span>{dateStr}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <BlockState loading={loading} error={error} empty={false} onRetry={() => void refresh()} />
      )}

      {loading && !summary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SkeletonStats count={3} label="Đang tải số liệu tổng quan…" />
          <SkeletonCards count={2} showSpinner={false} />
        </div>
      ) : (
        <div className="dash-bento">
          {/* HÀNG 1: 3 THẺ TRỌNG TÂM (HÀNH ĐỘNG CẦN XỬ LÝ - QUY MÔ VÙNG TRỒNG - CHUẨN XUẤT KHẨU) */}
          <div className="dash-bento-top">
            {/* 1. Hạng mục cần xử lý ngay */}
            <section className="dash-bento-card">
              <div className="dash-bento-body">
                <header className="dash-bento-head">
                  <h2 className="dash-bento-title">Cần xử lý</h2>
                  <span className="dash-bento-count">{formatVn(totalActionCount)}</span>
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
                {openViolations > 0 && (
                  <button
                    type="button"
                    className="dash-bento-footer-btn"
                    onClick={() => requestAdminNavigate("journal")}
                  >
                    Vi phạm
                  </button>
                )}
              </footer>
            </section>

            {/* 2. Quy mô vùng trồng & phân bổ thôn */}
            <section className="dash-bento-card">
              <div className="dash-bento-body">
                <header className="dash-bento-head">
                  <h2 className="dash-bento-title">Quy mô vùng trồng</h2>
                </header>

                <div className="dash-bento-hero">
                  <div className="dash-bento-figure">
                    <span className="dash-bento-num">{formatVn(totalAreaHa, 1)}</span>
                    <span className="dash-bento-unit">ha</span>
                  </div>
                </div>

                <div className="dash-bento-inline-specs">
                  <span>Hộ <strong>{formatVn(totalHouseholds)}</strong></span>
                  <span>Thửa <strong>{formatVn(totalPlots)}</strong></span>
                  <span>Thôn <strong>{formatVn((summary?.villages ?? []).length)}</strong></span>
                </div>

                <div className="dash-bento-bars">
                  {topVillages.length === 0 ? (
                    <p className="dash-bento-footnote">Chưa có dữ liệu phân bổ theo thôn.</p>
                  ) : (
                    topVillages.map((v) => (
                      <div key={v.id} className="dash-bento-bar-row">
                        <span className="dash-bento-bar-name">{v.name}</span>
                        <div className="dash-bento-bar-track" aria-hidden="true">
                          <div className="dash-bento-bar-fill" style={{ width: `${v.pct}%` }} />
                        </div>
                        <span className="dash-bento-bar-val">{v.metricLabel}</span>
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
                    <span className="dash-bento-num">{qualifiedPct}</span>
                    <span className="dash-bento-unit">%</span>
                  </div>
                </div>

                <div className="dash-bento-stems" role="list" aria-label="Phân bổ trạng thái nông hộ">
                  {statusColumns.map((col) => (
                    <div key={col.key} className="dash-bento-stem-col" role="listitem">
                      <span className="dash-bento-stem-val">{formatVn(col.count)}</span>
                      <div className="dash-bento-stem-track" aria-hidden="true">
                        <div
                          className={`dash-bento-stem-fill is-${col.tone}`}
                          style={{ height: `${Math.round(col.ratio * 100)}%` }}
                        />
                      </div>
                      <span className="dash-bento-stem-label">{col.shortLabel}</span>
                    </div>
                  ))}
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

                <div className="dash-bento-wide-mid">
                  <div className="dash-bento-wide-main">
                    <div className="dash-bento-figure">
                      <span className="dash-bento-num">{formatVn(harvestTons, 1)}</span>
                      <span className="dash-bento-unit">tấn</span>
                    </div>
                    <div className="dash-bento-wide-sub">
                      <span>Tổng hợp {formatVn(harvestLots)} lô thu hoạch</span>
                      <span>Tỷ lệ mẫu đạt ngưỡng MRL: {labPassPct}%</span>
                    </div>
                  </div>

                  <div className="dash-bento-kv-pair">
                    <div className="dash-bento-kv">
                      <span>Mẫu đạt</span>
                      <strong>{formatVn(labPassed)}/{formatVn(labTotal)}</strong>
                    </div>
                    <div className="dash-bento-kv">
                      <span>Vi phạm mở</span>
                      <strong className={openViolations > 0 ? "is-danger" : ""}>{formatVn(openViolations)}</strong>
                    </div>
                  </div>
                </div>

                <div className="dash-bento-ruler-wrap">
                  <div className="dash-bento-ruler-caption">
                    <span>Thước kiểm soát an toàn mẫu kiểm nghiệm</span>
                    <strong>{labPassPct}% đạt</strong>
                  </div>
                  <div className="dash-bento-ruler" aria-hidden="true">
                    {Array.from({ length: RULER_TICKS }, (_, idx) => {
                      const isPassedZone = idx <= activeTickIndex;
                      const isMarker = idx === activeTickIndex;
                      return (
                        <span
                          key={idx}
                          className={`dash-bento-tick${isPassedZone ? " is-filled" : ""}${isMarker ? " is-marker" : ""}`}
                        />
                      );
                    })}
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
                  onClick={() => requestAdminNavigate("approval")}
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
