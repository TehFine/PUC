"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { mapApproval, mapMinute, mapSchedule } from "@/lib/mappers";

const priorityClass: Record<string, string> = { red: "badge-red", gold: "badge-gold", blue: "badge-blue" };
const resultClass:   Record<string, string> = { green: "badge-green", red: "badge-red", gold: "badge-gold" };

type Tab = "pending" | "schedule" | "minutes";

export default function Approval() {
  const { data: pendingApprovals } = useResource("approvals", mapApproval);
  const { data: scheduleItems } = useResource("schedule", mapSchedule);
  const { data: minutesData } = useResource("minutes", mapMinute);
  const [tab, setTab] = useState<Tab>("pending");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Duyệt &amp; Kiểm Chứng Hồ Sơ</h1>
          <div className="page-header-sub">7 hồ sơ đang chờ · 4 lịch kiểm tra sắp tới</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Lịch kiểm tra</button>
          <button className="btn btn-primary">Tạo biên bản</button>
        </div>
      </div>

      <div className="tab-bar">
        {[
          { id: "pending",  label: "Chờ duyệt",     badge: 7 },
          { id: "schedule", label: "Lịch kiểm tra" },
          { id: "minutes",  label: "Biên bản" },
        ].map(({ id, label, badge }) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id as Tab)}
          >
            {label}
            {badge && <span className="tab-badge">{badge}</span>}
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã hồ sơ</th><th>Hộ nông dân</th><th>Loại yêu cầu</th>
                <th>Ngày nộp</th><th>Tài liệu</th><th>Ưu tiên</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45", fontWeight: 600 }}>{p.id}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.type}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{p.date}</td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ background: "#f4f5f3", padding: "2px 8px", borderRadius: 6, fontSize: 11.5 }}>
                      {p.docs} file
                    </span>
                  </td>
                  <td><span className={`badge ${priorityClass[p.priorityType]}`}>{p.priority}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-primary btn-sm">Duyệt</button>
                      <button className="btn btn-outline btn-sm">Xem</button>
                      <button className="btn btn-danger btn-sm">Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "schedule" && (
        <div className="schedule-grid">
          {scheduleItems.map((s, i) => (
            <div key={i} className="schedule-card">
              <div className="schedule-card-date">{s.date}</div>
              <div className="schedule-card-title">{s.title}</div>
              <div className="schedule-card-meta">
                Cán bộ: {s.officer}<br />
                {s.plots} thửa cần kiểm tra<br />
                {s.type}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 5 }}>
                <button className="btn btn-primary btn-sm">Chi tiết</button>
                <button className="btn btn-outline btn-sm">Sửa</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "minutes" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Số biên bản</th><th>Ngày kiểm tra</th><th>Địa điểm / Phạm vi</th>
                <th>Cán bộ kiểm tra</th><th>Kết quả</th><th>Tài liệu</th>
              </tr>
            </thead>
            <tbody>
              {minutesData.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45", fontWeight: 600 }}>{m.no}</td>
                  <td>{m.date}</td>
                  <td>{m.location}</td>
                  <td>{m.officer}</td>
                  <td><span className={`badge ${resultClass[m.resultType]}`}>{m.result}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-outline btn-sm">PDF</button>
                      <button className="btn btn-outline btn-sm">Xem</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
