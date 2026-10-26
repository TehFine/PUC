"use client";

import { useResource } from "@/hooks/use-resource";
import { mapLabTest } from "@/lib/mappers";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const cdData = [
  { plot: "TH1", cd: 0.02 },
  { plot: "TH2", cd: 0.04 },
  { plot: "TH3", cd: 0.03 },
  { plot: "TH4", cd: 0.01 },
  { plot: "TH5", cd: 0.05 },
  { plot: "TH6", cd: 0.02 },
];

const residueData = [
  { name: "TH1", residue: 0.03 },
  { name: "TH2", residue: 0.05 },
  { name: "TH3", residue: 0.12 },
  { name: "TH4", residue: 0.02 },
  { name: "TH5", residue: 0.08 },
  { name: "TH6", residue: 0.04 },
];

const passData = [
  { name: "Đạt",       value: 38, color: "#5ddc8c" },
  { name: "Không đạt", value: 7,  color: "#ff8a7f" },
];

const TOOLTIP_STYLE = {
  background: "rgba(9, 31, 19, 0.94)",
  border: "1px solid rgba(198, 255, 211, 0.24)",
  borderRadius: 10, color: "#f4fff7", fontSize: 12,
  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.28)",
  backdropFilter: "blur(18px)",
};

const AXIS_TICK = { fill: "rgba(232, 252, 238, 0.75)", fontSize: 11 };

export default function Testing() {
  const { data: testingData } = useResource("testing", mapLabTest);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Kiểm Nghiệm Chất Lượng</h1>
          <div className="page-header-sub">Cadmium · Vàng O · Dư lượng BVTV · Kiểm dịch thực vật</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Nhập kết quả lab</button>
          <button className="btn btn-primary">Kế hoạch lấy mẫu</button>
        </div>
      </div>

      <div className="charts-row-3">
        <div className="chart-card">
          <div className="chart-title">Cadmium (Cd) – mg/kg</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cdData} margin={{ left: -20, right: 8, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(210, 255, 222, 0.12)" />
              <XAxis dataKey="plot" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="cd" name="Cd (mg/kg)" radius={[2,2,0,0]}>
                {cdData.map((e, i) => (
                  <Cell key={i} fill={e.cd > 0.04 ? "#ff8a7f" : "#5ddc8c"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
            Giới hạn GACC: 0.05 mg/kg · Đỏ = vượt ngưỡng
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Dư lượng thuốc BVTV – ppm</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={residueData} margin={{ left: -20, right: 8, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(210, 255, 222, 0.12)" />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="residue" name="Dư lượng (ppm)" stroke="#e8be6a" strokeWidth={1.8} dot={{ fill: "#e8be6a", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">Tỷ lệ mẫu đạt / không đạt</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={passData} cx="50%" cy="50%" innerRadius={46} outerRadius={70} paddingAngle={2} dataKey="value">
                {passData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "rgba(232, 252, 238, 0.82)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11.5, color: "#9df6b6", textAlign: "center", fontWeight: 600 }}>
            84.4% mẫu đạt tiêu chuẩn xuất khẩu
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-header-left">Kết quả kiểm nghiệm gần đây</div>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>45 mẫu · 22/10/2024</span>
        </div>
        <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Mã mẫu</th><th>Hộ / Thửa</th><th>Ngày lấy mẫu</th>
                <th>Cd (mg/kg)</th><th>Vàng O</th><th>Dư lượng TBV</th>
                <th>Chlorpyrifos</th><th>Kết quả</th><th>Đơn vị lab</th>
              </tr>
            </thead>
            <tbody>
              {testingData.map((t, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45", fontWeight: 600 }}>{t.code}</td>
                  <td style={{ fontSize: 12 }}>{t.household}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{t.sampleDate}</td>
                  <td style={{ textAlign: "center", color: parseFloat(t.cd) > 0.04 ? "#c0392b" : "#256b45", fontWeight: 600 }}>{t.cd}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge ${t.yellowO === "Âm tính" ? "badge-green" : "badge-red"}`}>{t.yellowO}</span>
                  </td>
                  <td style={{ textAlign: "center", color: parseFloat(t.residue) > 0.1 ? "#c0392b" : "var(--text-primary)", fontWeight: 500 }}>{t.residue}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge ${t.chlorpyrifos === "KPH" ? "badge-green" : "badge-red"}`}>{t.chlorpyrifos}</span>
                  </td>
                  <td><span className={`badge ${t.resultType === "green" ? "badge-green" : "badge-red"}`}>{t.result}</span></td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.lab}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
