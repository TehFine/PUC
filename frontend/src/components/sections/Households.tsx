"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { mapHousehold } from "@/lib/mappers";

const statusClass: Record<string, string> = {
  green: "badge-green",
  gold:  "badge-gold",
  red:   "badge-red",
  blue:  "badge-blue",
};

export default function Households() {
  const { data: households } = useResource("households", mapHousehold);
  const [search,  setSearch]  = useState("");
  const [village, setVillage] = useState("all");
  const [status,  setStatus]  = useState("all");

  const filtered = households.filter((h) => {
    const matchSearch =
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.code.toLowerCase().includes(search.toLowerCase()) ||
      h.cccd.includes(search);
    const matchVillage = village === "all" || h.village === village;
    const matchStatus  = status  === "all" || h.status  === status;
    return matchSearch && matchVillage && matchStatus;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Quản lý Hộ Nông Dân</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Import Excel</button>
          <button className="btn btn-primary">Thêm hộ mới</button>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo tên, CCCD, mã vùng…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={village} onChange={(e) => setVillage(e.target.value)}>
          <option value="all">Tất cả thôn</option>
          {["Thôn 1","Thôn 2","Thôn 3","Thôn 4","Thôn 5","Thôn 6"].map(v => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Mọi trạng thái</option>
          <option>Đủ chuẩn XK</option>
          <option>Cần cải thiện</option>
          <option>Vi phạm</option>
          <option>Chờ duyệt</option>
        </select>
        <select className="filter-select">
          <option>Năm 2024</option>
          <option>Năm 2023</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Họ &amp; Tên</th>
              <th>CCCD</th>
              <th>Số ĐT</th>
              <th>Thôn / Tổ</th>
              <th>Số thửa</th>
              <th>Diện tích</th>
              <th>Mã vùng trồng</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, i) => (
              <tr key={h.id}>
                <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{h.name}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>{h.cccd}</td>
                <td style={{ color: "var(--text-secondary)" }}>{h.phone}</td>
                <td>{h.village}</td>
                <td style={{ textAlign: "center", fontWeight: 600 }}>{h.plots}</td>
                <td style={{ fontWeight: 500 }}>{h.area} ha</td>
                <td>
                  <span style={{
                    fontFamily: "monospace", fontSize: 12,
                    background: "#f0fdf4", color: "#166534",
                    border: "1px solid #bbf7d0",
                    padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                  }}>
                    {h.code}
                  </span>
                </td>
                <td>
                  <span className={`badge ${statusClass[h.statusType]}`}>{h.status}</span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-outline btn-sm">Xem</button>
                    <button className="btn btn-outline btn-sm">Sửa</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="empty-state">Không tìm thấy hộ phù hợp</td></tr>
            )}
          </tbody>
        </table>
        <div className="table-footer">
          <span>Hiển thị {filtered.length} / 248 hộ</span>
          <div className="pagination">
            {[1,2,3,"…",17].map((p, i) => (
              <button key={i} className={`pg-btn ${p === 1 ? "active" : ""}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
