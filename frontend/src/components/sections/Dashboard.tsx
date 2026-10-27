"use client";

import { useEffect, useState } from "react";
import { CHART_COLORS } from "@/components/ui/chart-theme";
import { AreaTrend, CapsuleDonutChart, KpiChartView, type ChartPoint, type DonutItem, type KpiChartSpec } from "@/components/ui/charts/KpiCharts";
import { StandardBenchmarkMeter } from "@/components/ui/charts/StandardBenchmarkMeter";

const MONTHS = ["T5", "T6", "T7", "T8", "T9", "T10"];
const series = (values: number[]): ChartPoint[] => values.map((value, i) => ({ label: MONTHS[i], value }));

const progressData = [
  { month: "T5", vietgap: 52, gacc: 38, global: 22 },
  { month: "T6", vietgap: 58, gacc: 44, global: 28 },
  { month: "T7", vietgap: 63, gacc: 49, global: 32 },
  { month: "T8", vietgap: 68, gacc: 54, global: 36 },
  { month: "T9", vietgap: 73, gacc: 60, global: 38 },
  { month: "T10", vietgap: 78, gacc: 63, global: 41 },
];

const statusData: DonutItem[] = [
  { name: "Đủ chuẩn XK",   value: 189, color: "#3b82f6" },
  { name: "Cần cải thiện", value: 36,  color: "#f59e0b" },
  { name: "Chờ duyệt",     value: 11,  color: "#10b981" },
  { name: "Vi phạm",       value: 12,  color: "#64748b" },
];


const ALERTS = [
  { type: "red",    title: "Nguyễn Văn A – Phun thuốc ngoài danh mục (Carbaryl 80%)", sub: "Thôn 3 · 2 giờ trước" },
  { type: "orange", title: "Trần Thị B – Chưa ghi nhật ký 15 ngày",                  sub: "Thôn 5 · 8 giờ trước" },
  { type: "orange", title: "Lê Văn C – Tồn dư Chlorpyrifos vượt ngưỡng",             sub: "Thôn 1 · Hôm qua" },
  { type: "yellow", title: "Phạm Văn D – Sắp đến hạn kiểm tra định kỳ",              sub: "Thôn 2 · 2 ngày nữa" },
  { type: "yellow", title: "Hoàng Thị E – Chứng chỉ VietGAP sắp hết hạn",            sub: "Thôn 4 · 7 ngày nữa" },
];

const PENDING = [
  { id: "KB-2024-0249", name: "Võ Thị Phương", type: "Nhập mới" },
  { id: "KB-2024-0250", name: "Đặng Văn Giang", type: "Cập nhật thửa" },
  { id: "KB-2024-0251", name: "Bùi Thị Hoa", type: "Gia hạn mã vùng" },
  { id: "KB-2024-0252", name: "Ngô Văn Ích", type: "Nhập mới" },
  { id: "KB-2024-0253", name: "Lý Thị Kim", type: "Bổ sung tài liệu" },
];

const STANDARDS = [
  { label: "VietGAP", pct: 78, color: CHART_COLORS.ok },
  { label: "GACC (TQ)", pct: 63, color: CHART_COLORS.warn },
  { label: "GlobalGAP", pct: 41, color: CHART_COLORS.bad },
  { label: "Kiểm dịch TV", pct: 91, color: CHART_COLORS.ok },
  { label: "Hồ sơ đầy đủ", pct: 85, color: CHART_COLORS.ok },
];

const KPIS: { val: string; label: string; trend: string; trendType: string; chart: KpiChartSpec }[] = [
  { val: "248",     label: "Tổng số hộ đăng ký",  trend: "12 hộ mới tháng này", trendType: "up",
    chart: { kind: "area", tone: "lime", unit: " hộ", highlight: "last", caption: "Gia tăng ổn định qua 6 tháng niên vụ", data: series([196, 204, 215, 226, 236, 248]) } },
  { val: "312",     label: "Thửa được cấp mã",    trend: "8 thửa mới",           trendType: "up",
    chart: { kind: "bars", tone: "ink", unit: " thửa", highlight: "max", data: series([18, 24, 21, 29, 17, 8]) } },
  { val: "189",     label: "Hộ đủ điều kiện XK",  trend: "76% đạt chuẩn",        trendType: "up",
    chart: { kind: "gauge", tone: "lime", value: 76, target: 80, caption: "189/248 hộ" } },
  { val: "23",      label: "Cảnh báo vi phạm",    trend: "Giảm 5 so tháng trước",trendType: "down",
    chart: { kind: "area", tone: "ink", unit: " cảnh báo", highlight: "last", caption: "Kiểm soát dư lượng giúp giảm 44% vi phạm", data: series([41, 38, 35, 31, 28, 23]) } },
  { val: "142 tấn", label: "Sản lượng vụ này",    trend: "Dự kiến 310 tấn",      trendType: "up",
    chart: { kind: "area", tone: "lime", unit: " tấn", highlight: "max", caption: "Sản lượng thu hoạch đạt đỉnh vào tháng 8", data: series([12, 21, 28, 33, 26, 22]) } },
  { val: "7",       label: "Hồ sơ chờ duyệt",     trend: "Cần xử lý ngay",       trendType: "warn",
    chart: { kind: "bars", tone: "amber", unit: " hồ sơ", highlight: "last", data: series([4, 6, 3, 8, 5, 7]) } },
];

export default function Dashboard() {
  const [dateStr, setDateStr] = useState("");
  const [fullDateStr, setFullDateStr] = useState("");
  const [stdTab, setStdTab] = useState<"vietgap" | "gacc" | "global">("vietgap");

  useEffect(() => {
    const id = setTimeout(() => {
      const now = new Date();
      setDateStr(
        now.toLocaleDateString("vi-VN", {
          day: "2-digit", month: "2-digit", year: "numeric",
        })
      );
      setFullDateStr(
        now.toLocaleDateString("vi-VN", {
          weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
        })
      );
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <div className="page-header dash-header">
        <h1>Tổng quan</h1>
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

      <div className="kpi-grid">
        {KPIS.map(({ val, label, trend, trendType, chart }, i) => (
          <div key={i} className="kpi-card has-chart">
            <div className="kpi-head">
              <div className="kpi-val">{val}</div>
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
            <div className="chart-title">Tiến độ xuất khẩu theo chuẩn (%)</div>
            <div className="dash-chart-tabs" role="tablist" aria-label="Bộ tiêu chuẩn xuất khẩu">
              {[
                { key: "vietgap", label: "VietGAP 78%" },
                { key: "gacc", label: "GACC 63%" },
                { key: "global", label: "GlobalGAP 41%" },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={stdTab === t.key}
                  className={`dash-tab-btn ${stdTab === t.key ? "is-active" : ""}`}
                  onClick={() => setStdTab(t.key as "vietgap" | "gacc" | "global")}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <AreaTrend
            data={progressData.map((d) => ({ label: d.month, value: d[stdTab] }))}
            unit="%"
            highlight="last"
            height={180}
            caption="Tỷ lệ nông hộ đáp ứng các bộ tiêu chuẩn xuất khẩu chính ngạch qua các tháng"
            ariaLabel="Tiến độ đạt chuẩn xuất khẩu"
          />
        </div>

        <div className="chart-card">
          <div className="chart-title">Phân bổ trạng thái hộ</div>
          <CapsuleDonutChart
            data={statusData}
            unit=" hộ"
            ariaLabel="Phân bổ trạng thái 248 hộ nông dân"
          />
        </div>
      </div>

      <div className="dash-bottom">
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Cảnh báo gần đây</div>
          </div>
          <div className="card-body">
            <div className="alert-list">
              {ALERTS.map((a, i) => (
                <div key={i} className={`alert-item ${a.type}`}>
                  <div className="alert-item-body">
                    <strong>{a.title}</strong>
                    <small>{a.sub}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Hồ sơ chờ duyệt</div>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>7 hồ sơ</span>
          </div>
          <div className="card-body">
            {PENDING.map((p, i) => (
              <div key={i} className="pending-item">
                <div>
                  <div className="pending-item-name">{p.name}</div>
                  <div className="pending-item-sub">{p.id} · {p.type}</div>
                </div>
                <button className="btn btn-primary btn-sm">Duyệt</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Chỉ số tiêu chuẩn</div>
          </div>
          <div className="card-body">
            <StandardBenchmarkMeter standards={STANDARDS} />
          </div>
        </div>
      </div>
    </>
  );
}
