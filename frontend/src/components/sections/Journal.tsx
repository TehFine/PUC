"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { mapJournal, mapSpray, mapViolation } from "@/lib/mappers";
import { ShareBar } from "@/components/ui/charts/KpiCharts";

type Tab = "log" | "violations" | "spray";

export default function Journal() {
  const { data: journalData } = useResource("journal", mapJournal);
  const { data: violations } = useResource("violations", mapViolation);
  const { data: sprayData } = useResource("spray", mapSpray);
  const [tab, setTab] = useState<Tab>("log");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Nhật Ký Canh Tác &amp; Tuân Thủ</h1>
          <div className="page-header-sub">Giám sát quy trình sản xuất – minh bạch hóa canh tác</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Xuất nhật ký</button>
          <button className="btn btn-primary">Ghi nhật ký</button>
        </div>
      </div>

      <div className="compliance-kpi">
        <div className="comp-kpi-item ok">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">201</div>
            <div className="comp-kpi-label">Hộ tuân thủ đầy đủ</div>
          </div>
          <ShareBar value={201} total={248} tone="lime" ariaLabel="Hộ tuân thủ đầy đủ" />
        </div>
        <div className="comp-kpi-item warn">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">24</div>
            <div className="comp-kpi-label">Hộ cần nhắc nhở</div>
          </div>
          <ShareBar value={24} total={248} tone="amber" ariaLabel="Hộ cần nhắc nhở" />
        </div>
        <div className="comp-kpi-item danger">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">3</div>
            <div className="comp-kpi-label">Vi phạm nghiêm trọng</div>
          </div>
          <ShareBar value={3} total={248} tone="rose" ariaLabel="Vi phạm nghiêm trọng" />
        </div>
        <div className="comp-kpi-item info">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">20</div>
            <div className="comp-kpi-label">Chưa cập nhật &gt;15 ngày</div>
          </div>
          <ShareBar value={20} total={248} tone="sky" ariaLabel="Chưa cập nhật trên 15 ngày" />
        </div>
      </div>

      <div className="tab-bar">
        {[
          { id: "log",        label: "Nhật ký gần đây" },
          { id: "violations", label: "Cảnh báo vi phạm", badge: 3 },
          { id: "spray",      label: "Lịch phun thuốc" },
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

      {tab === "log" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th><th>Hộ</th><th>Mã thửa</th><th>Hoạt động</th>
                <th>Chi tiết</th><th>Người ghi</th><th>Ảnh</th>
              </tr>
            </thead>
            <tbody>
              {journalData.map((j, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{j.date}</td>
                  <td style={{ fontWeight: 500 }}>{j.household}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45", fontWeight: 600 }}>{j.plotCode}</td>
                  <td>
                    <span style={{ padding: "2px 8px", background: "#f2f8f4", color: "#256b45", border: "1px solid #d5eadd", borderRadius: 6, fontSize: 11.5, fontWeight: 500 }}>
                      {j.activity}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 200 }}>{j.detail}</td>
                  <td style={{ fontSize: 12 }}>{j.recorder}</td>
                  <td style={{ textAlign: "center" }}>
                    {j.hasPhoto
                      ? <span className="badge badge-blue">Có</span>
                      : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "violations" && (
        <div>
          {violations.map((v, i) => (
            <div key={i} className={`violation-item ${v.type}`}>
              <div style={{ flex: 1 }}>
                <div className="violation-title">
                  <span className={`badge ${v.type === "critical" ? "badge-red" : "badge-orange"}`} style={{ marginRight: 8 }}>
                    {v.type === "critical" ? "Nghiêm trọng" : "Cảnh báo"}
                  </span>
                  {v.title}
                </div>
                <div className="violation-desc">{v.desc}</div>
                <div className="violation-meta">
                  <span>Hộ: {v.household}</span>
                  <span>{v.date}</span>
                  <span>Thửa: {v.plot}</span>
                </div>
              </div>
              <div className="violation-actions">
                <button className="btn btn-danger btn-sm">Xử lý</button>
                <button className="btn btn-outline btn-sm">Chi tiết</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "spray" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày phun</th><th>Hộ</th><th>Loại thuốc</th><th>Nguồn gốc</th>
                <th>Liều lượng</th><th>Diện tích</th><th>Ngày cách ly</th><th>MRL</th>
              </tr>
            </thead>
            <tbody>
              {sprayData.map((s, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap" }}>{s.date}</td>
                  <td style={{ fontWeight: 500 }}>{s.household}</td>
                  <td>{s.pesticide}</td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.source}</td>
                  <td>{s.dose}</td>
                  <td>{s.area}</td>
                  <td style={{ color: "#8a6415", fontWeight: 500 }}>{s.isolation}</td>
                  <td>
                    <span className={`badge ${s.mrlType === "green" ? "badge-green" : "badge-red"}`}>
                      {s.mrl}
                    </span>
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
