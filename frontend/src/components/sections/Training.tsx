"use client";

import { useResource } from "@/hooks/use-resource";
import { mapTraining } from "@/lib/mappers";
import { KpiChartView, type ChartPoint, type KpiChartSpec } from "@/components/ui/charts/KpiCharts";

const MONTHS = ["T5", "T6", "T7", "T8", "T9", "T10"];
const pts = (values: number[]): ChartPoint[] => values.map((value, i) => ({ label: MONTHS[i], value }));
const oneDecimal = (v: number) => v.toFixed(1).replace(".", ",");

const KPIS: { val: string; label: string; sub: string; chart: KpiChartSpec }[] = [
  { val: "6",     label: "Khóa học tổ chức",      sub: "Năm 2024",
    chart: { kind: "bars", tone: "lime", unit: " khóa", highlight: "max", data: pts([1, 2, 1, 0, 1, 1]) } },
  { val: "248",   label: "Lượt nông dân tham dự", sub: "82% tỷ lệ tham gia",
    chart: { kind: "area", tone: "ink", unit: " lượt", highlight: "max", caption: "Tỷ lệ tham gia các khóa đạt 82%", data: pts([30, 48, 41, 33, 52, 44]) } },
  { val: "183",   label: "Chứng nhận đã cấp",     sub: "VietGAP + GACC",
    chart: { kind: "gauge", tone: "lime", value: 74, caption: "183/248 lượt" } },
  { val: "4.7/5", label: "Đánh giá trung bình",   sub: "Từ nông dân tham dự",
    chart: { kind: "area", tone: "ink", unit: "/5", highlight: "last", formatValue: oneDecimal, caption: "Mức độ hài lòng đạt đỉnh 4.8 điểm", data: pts([4.4, 4.6, 4.5, 4.8, 4.6, 4.7]) } },
];

export default function Training() {
  const { data: trainingCourses } = useResource("training", mapTraining);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tập Huấn &amp; Đào Tạo</h1>
          <div className="page-header-sub">Nâng cao năng lực nông dân – điều kiện đạt tiêu chuẩn xuất khẩu</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Danh sách tham dự</button>
          <button className="btn btn-primary">Tạo lớp tập huấn</button>
        </div>
      </div>

      <div className="kpi-grid-4">
        {KPIS.map(({ val, label, sub, chart }, i) => (
          <div key={i} className="kpi-card has-chart">
            <div className="kpi-head">
              <div className="kpi-val">{val}</div>
              <div className="kpi-meta">
                <div className="kpi-label">{label}</div>
                <div className="kpi-trend up">{sub}</div>
              </div>
            </div>
            <KpiChartView chart={chart} label={label} />
          </div>
        ))}
      </div>

      <div className="training-grid">
        {trainingCourses.map((c, i) => (
          <div key={i} className="training-card">
            <div className="training-card-top">
              <div className="training-card-title">{c.title}</div>
              <div className="training-card-date">
                {c.completed ? "Đã hoàn thành" : c.date}
              </div>
            </div>
            <div className="training-card-body">
              <div className="training-card-row">
                <span>Địa điểm</span>
                <strong>{c.location}</strong>
              </div>
              <div className="training-card-row">
                <span>Giảng viên</span>
                <strong>{c.trainer}</strong>
              </div>
              <div className="training-card-row">
                <span>Tham dự</span>
                <strong>{c.enrolled}/{c.capacity} người</strong>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 4 }}>
                  <span>Tỷ lệ đăng ký</span>
                  <span style={{ color: "var(--green-700)", fontWeight: 600 }}>{c.progress}%</span>
                </div>
                <div className="training-progress">
                  <div className="training-progress-fill" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  {c.completed ? "Chứng nhận" : "Danh sách"}
                </button>
                <button className="btn btn-outline btn-sm">Sửa</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
