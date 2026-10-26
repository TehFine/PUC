"use client";

import { useResource } from "@/hooks/use-resource";
import { mapHarvest } from "@/lib/mappers";

const statusClass: Record<string, string> = {
  green: "badge-green", gold: "badge-gold", blue: "badge-blue", red: "badge-red",
};

const KPIS = [
  { val: "142 tấn", label: "Đã thu hoạch",         sub: "Vụ 2024"             },
  { val: "38 lô",   label: "Lô hàng tạo ra",        sub: "28 lô đã xuất khẩu" },
  { val: "6 DN",    label: "Doanh nghiệp thu mua",  sub: "Liên kết HTX"       },
  { val: "8.2 tỷ",  label: "Tổng doanh thu (VND)",  sub: "Tăng 18% so vụ trước"  },
];

export default function Harvest() {
  const { data: harvestData } = useResource("harvest", mapHarvest);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Thu Hoạch &amp; Lô Hàng</h1>
          <div className="page-header-sub">Quản lý sản lượng, truy xuất nguồn gốc, QR Code lô hàng</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Thống kê</button>
          <button className="btn btn-primary">Tạo lô hàng</button>
        </div>
      </div>

      <div className="kpi-grid-4">
        {KPIS.map(({ val, label, sub }, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-val">{val}</div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-trend up">{sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-header-left">Danh sách lô hàng</div>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="filter-select" style={{ padding: "5px 9px" }}>
              <option>Mọi thị trường</option>
              <option>Trung Quốc</option>
              <option>Nội địa</option>
            </select>
            <select className="filter-select" style={{ padding: "5px 9px" }}>
              <option>Mọi trạng thái</option>
              <option>Đã xuất</option>
              <option>Đang vận chuyển</option>
            </select>
          </div>
        </div>
        <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Mã lô</th><th>Ngày thu</th><th>Tổng KL (kg)</th>
                <th>Số hộ</th><th>Doanh nghiệp thu mua</th><th>Thị trường</th>
                <th>QR Code</th><th>Trạng thái</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {harvestData.map((h, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45", fontWeight: 600 }}>{h.code}</td>
                  <td>{h.date}</td>
                  <td style={{ fontWeight: 500 }}>{Number(h.weight.replace(/\./g, "")).toLocaleString("vi-VN")} kg</td>
                  <td style={{ textAlign: "center" }}>{h.households}</td>
                  <td style={{ fontSize: 12 }}>{h.buyer}</td>
                  <td>
                    <span style={{
                      padding: "2px 7px", borderRadius: 6, fontSize: 10.5, fontWeight: 500,
                      background: h.market === "Trung Quốc" ? "#fbf6ea" : "#eef4fa",
                      color: h.market === "Trung Quốc" ? "#8a6415" : "#235f92",
                      border: `1px solid ${h.market === "Trung Quốc" ? "#ece1c5" : "#d6e4f0"}`,
                    }}>
                      {h.market}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-outline btn-sm">{h.qr}</button>
                  </td>
                  <td><span className={`badge ${statusClass[h.statusType]}`}>{h.status}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-outline btn-sm">Xem</button>
                      <button className="btn btn-outline btn-sm">Chứng từ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
