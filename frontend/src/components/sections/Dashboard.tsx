"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const progressData = [
  { month: "T5", vietgap: 52, gacc: 38, global: 22 },
  { month: "T6", vietgap: 58, gacc: 44, global: 28 },
  { month: "T7", vietgap: 63, gacc: 49, global: 32 },
  { month: "T8", vietgap: 68, gacc: 54, global: 36 },
  { month: "T9", vietgap: 73, gacc: 60, global: 38 },
  { month: "T10", vietgap: 78, gacc: 63, global: 41 },
];

const statusData = [
  { name: "Đủ chuẩn XK", value: 189, color: "#5ddc8c" },
  { name: "Cần cải thiện", value: 36, color: "#e0b25d" },
  { name: "Vi phạm",       value: 12, color: "#ff8a7f" },
  { name: "Chờ duyệt",     value: 11, color: "#6cb6ff" },
];

const TOOLTIP_STYLE = {
  background: "rgba(9, 31, 19, 0.94)",
  border: "1px solid rgba(198, 255, 211, 0.24)",
  borderRadius: 10, color: "#f4fff7", fontSize: 12,
  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.28)",
  backdropFilter: "blur(18px)",
};

const AXIS_TICK = { fill: "rgba(232, 252, 238, 0.75)", fontSize: 11 };

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
  { label: "VietGAP", pct: 78, color: "#35965f" },
  { label: "GACC (TQ)", pct: 63, color: "#b7791f" },
  { label: "GlobalGAP", pct: 41, color: "#c05621" },
  { label: "Kiểm dịch TV", pct: 91, color: "#35965f" },
  { label: "Hồ sơ đầy đủ", pct: 85, color: "#35965f" },
];

const KPIS = [
  { val: "248",     label: "Tổng số hộ đăng ký",  trend: "12 hộ mới tháng này", trendType: "up"   },
  { val: "312",     label: "Thửa được cấp mã",    trend: "8 thửa mới",           trendType: "up"   },
  { val: "189",     label: "Hộ đủ điều kiện XK",  trend: "76% đạt chuẩn",        trendType: "up"   },
  { val: "23",      label: "Cảnh báo vi phạm",    trend: "Giảm 5 so tháng trước",trendType: "down" },
  { val: "142 tấn", label: "Sản lượng vụ này",    trend: "Dự kiến 310 tấn",      trendType: "up"   },
  { val: "7",       label: "Hồ sơ chờ duyệt",     trend: "Cần xử lý ngay",       trendType: "warn" },
];

export default function Dashboard() {
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const id = setTimeout(() => {
      setDateStr(
        new Date().toLocaleDateString("vi-VN", {
          weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
        })
      );
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tổng quan</h1>
          <div className="page-header-sub" suppressHydrationWarning>
            Cập nhật: <strong>{dateStr}</strong>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        {KPIS.map(({ val, label, trend, trendType }, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-val">{val}</div>
            <div className="kpi-label">{label}</div>
            <div className={`kpi-trend ${trendType}`}>{trend}</div>
          </div>
        ))}
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">Tiến độ đạt chuẩn xuất khẩu theo tháng (%)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={progressData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <defs>
                {[["gV","#6fe49a"],["gG","#e8be6a"],["gGl","#f0a06a"]].map(([id,c]) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(210, 255, 222, 0.12)" />
              <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "rgba(232, 252, 238, 0.82)", paddingTop: 6 }} />
              <Area type="monotone" dataKey="vietgap" name="VietGAP" stroke="#6fe49a" fill="url(#gV)"  strokeWidth={1.8} dot={false} />
              <Area type="monotone" dataKey="gacc"    name="GACC"    stroke="#e8be6a" fill="url(#gG)"  strokeWidth={1.8} dot={false} />
              <Area type="monotone" dataKey="global"  name="GlobalGAP" stroke="#f0a06a" fill="url(#gGl)" strokeWidth={1.8} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">Phân bổ trạng thái hộ</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} dataKey="value">
                {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "rgba(232, 252, 238, 0.82)" }} />
            </PieChart>
          </ResponsiveContainer>
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
            {STANDARDS.map((s, i) => (
              <div key={i} className="std-item">
                <span className="std-label">{s.label}</span>
                <div className="std-bar"><div className="std-fill" style={{ width: `${s.pct}%`, background: s.color }} /></div>
                <span className="std-pct">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
