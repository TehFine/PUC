"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { mapHarvest, mapContract, mapEnterprise } from "@/lib/mappers";
import { KpiChartView, type ChartPoint, type KpiChartSpec } from "@/components/ui/charts/KpiCharts";
import { QrCode, Printer, FileText, Building2, Package, Tag, CheckCircle2 } from "lucide-react";
import type { HarvestLot } from "@/types/entities";
import BatchQrModal from "@/components/harvest/BatchQrModal";

const statusClass: Record<string, string> = {
  green: "badge-green",
  gold: "badge-gold",
  blue: "badge-blue",
  red: "badge-red",
};

const contractStatusBadge: Record<string, { label: string; cls: string }> = {
  active: { label: "Đang hiệu lực", cls: "badge-green" },
  completed: { label: "Đã hoàn thành", cls: "badge-blue" },
  expired: { label: "Hết hạn", cls: "badge-red" },
};

const pts = (labels: string[], values: number[]): ChartPoint[] => values.map((value, i) => ({ label: labels[i], value }));
const MONTHS = ["T5", "T6", "T7", "T8", "T9", "T10"];
const oneDecimal = (v: number) => v.toFixed(1).replace(".", ",");

const KPIS: { val: string; label: string; sub: string; chart: KpiChartSpec; suffix?: string }[] = [
  {
    val: "142 tấn",
    label: "Đã thu hoạch",
    sub: "Vụ 2024",
    chart: {
      kind: "area",
      tone: "lime",
      unit: " tấn",
      highlight: "max",
      caption: "Sản lượng tập trung cao điểm tháng 8",
      data: pts(MONTHS, [12, 21, 28, 33, 26, 22]),
    },
  },
  {
    val: "38 lô",
    label: "Lô hàng tạo ra",
    sub: "28 lô đã xuất khẩu",
    chart: { kind: "gauge", tone: "lime", value: 74, caption: "28/38 lô xuất khẩu" },
  },
  {
    val: "3 HĐ",
    label: "Hợp đồng bao tiêu",
    sub: "330 tấn liên kết",
    suffix: "theo doanh nghiệp",
    chart: {
      kind: "bars",
      tone: "ink",
      unit: " tấn",
      highlight: "max",
      data: pts(["Vĩnh Phát", "Rồng Đỏ", "Tây Nguyên"], [120, 150, 60]),
    },
  },
  {
    val: "8.2 tỷ",
    label: "Tổng doanh thu (VND)",
    sub: "Tăng 18% so vụ trước",
    chart: {
      kind: "area",
      tone: "ink",
      unit: " tỷ",
      highlight: "max",
      formatValue: oneDecimal,
      caption: "Doanh thu tăng 18% so với vụ trước",
      data: pts(MONTHS, [0.7, 1.3, 1.9, 2.2, 1.2, 0.9]),
    },
  },
];

type HarvestTab = "lots" | "contracts" | "enterprises";

export default function Harvest() {
  const [tab, setTab] = useState<HarvestTab>("lots");
  const { data: harvestData } = useResource("harvest", mapHarvest);
  const { data: contractData } = useResource("contracts", mapContract);
  const { data: enterpriseData } = useResource("enterprises", mapEnterprise);
  const [printingLot, setPrintingLot] = useState<HarvestLot | null>(null);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Chuỗi Cung Ứng &amp; Lô Hàng</h1>
          <div className="page-header-sub">
            Quản lý hợp đồng bao tiêu, cơ sở đóng gói (PHC), kiểm soát sơ chế &amp; cấp tem truy xuất QR
          </div>
        </div>
        <div className="header-actions">
          {tab === "lots" && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => harvestData[0] && setPrintingLot(harvestData[0])}
            >
              <Printer size={15} />
              <span>In dải tem nhanh</span>
            </button>
          )}
          <button type="button" className="btn btn-primary">
            {tab === "lots" ? "+ Tạo lô hàng mới" : tab === "contracts" ? "+ Thêm hợp đồng bao tiêu" : "+ Thêm doanh nghiệp"}
          </button>
        </div>
      </div>

      <div className="kpi-grid-4">
        {KPIS.map(({ val, label, sub, chart, suffix }, i) => (
          <div key={i} className="kpi-card has-chart">
            <div className="kpi-head">
              <div className="kpi-val">{val}</div>
              <div className="kpi-meta">
                <div className="kpi-label">{label}</div>
                <div className="kpi-trend up">{sub}</div>
              </div>
            </div>
            <KpiChartView chart={chart} label={label} suffix={suffix} />
          </div>
        ))}
      </div>

      {/* Thanh chuyển tab quy trình chuỗi liên kết */}
      <div className="tab-bar" style={{ marginTop: 20, marginBottom: 16 }}>
        <button
          type="button"
          className={`tab-btn ${tab === "lots" ? "active" : ""}`}
          onClick={() => setTab("lots")}
        >
          <Package size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />
          Lô thu hoạch &amp; Xuất khẩu ({harvestData.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "contracts" ? "active" : ""}`}
          onClick={() => setTab("contracts")}
        >
          <FileText size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />
          Hợp đồng thu mua bao tiêu ({contractData.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "enterprises" ? "active" : ""}`}
          onClick={() => setTab("enterprises")}
        >
          <Building2 size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />
          Doanh nghiệp &amp; Nhà đóng gói PHC ({enterpriseData.length})
        </button>
      </div>

      {/* ─── TAB 1: DANH SÁCH LÔ THU HOẠCH ─── */}
      {tab === "lots" && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Danh sách lô thu hoạch &amp; Xuất khẩu</div>
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
                <option>Đang lấy mẫu</option>
              </select>
            </div>
          </div>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Mã lô</th>
                  <th>Ngày thu</th>
                  <th>Tổng KL (kg)</th>
                  <th>Số hộ</th>
                  <th>Doanh nghiệp thu mua</th>
                  <th>Mã nhà đóng gói (PHC)</th>
                  <th>Thị trường</th>
                  <th>Tem QR Lô</th>
                  <th>Trạng thái</th>
                  <th>Thao tác tem &amp; hồ sơ</th>
                </tr>
              </thead>
              <tbody>
                {harvestData.map((h, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45", fontWeight: 700 }}>{h.code}</td>
                    <td>{h.date}</td>
                    <td style={{ fontWeight: 600 }}>{Number(h.weight.replace(/\./g, "")).toLocaleString("vi-VN")} kg</td>
                    <td style={{ textAlign: "center" }}>{h.households}</td>
                    <td style={{ fontSize: 12 }}>
                      <strong style={{ color: "#14372f" }}>{h.buyer}</strong>
                      {h.contractCode && (
                        <div style={{ fontSize: 11, color: "#64748b" }}>HĐ: {h.contractCode}</div>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: "#f0fdf4",
                          color: "#166534",
                          border: "1px solid #bbf7d0",
                          fontFamily: "monospace",
                        }}
                      >
                        {h.packhouseCode || "VN-DLPH-0089"}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 6,
                          fontSize: 10.5,
                          fontWeight: 500,
                          background: h.market === "Trung Quốc" ? "#fbf6ea" : "#eef4fa",
                          color: h.market === "Trung Quốc" ? "#8a6415" : "#235f92",
                          border: `1px solid ${h.market === "Trung Quốc" ? "#ece1c5" : "#d6e4f0"}`,
                        }}
                      >
                        {h.market}
                      </span>
                    </td>
                    <td>
                      <a
                        href={`/trace/${h.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline btn-sm"
                        title="Xem trang quét mã QR truy xuất nguồn gốc"
                        style={{
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontWeight: 600,
                          color: "#166534",
                        }}
                      >
                        <QrCode size={14} strokeWidth={2.2} />
                        <span>{h.qr}</span>
                      </a>
                    </td>
                    <td>
                      <span className={`badge ${statusClass[h.statusType]}`}>{h.status}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          title="Cấp và in tem dán từng quả sầu riêng hoặc thùng carton"
                          onClick={() => setPrintingLot(h)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                        >
                          <Printer size={13} strokeWidth={2.2} />
                          <span>In tem QR</span>
                        </button>
                        <a
                          href={`/trace/${h.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <QrCode size={13} strokeWidth={2.2} />
                          <span>Xem tra cứu</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 2: HỢP ĐỒNG LIÊN KẾT BAO TIÊU (BƯỚC 1 TRONG HÌNH) ─── */}
      {tab === "contracts" && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Hợp đồng thu mua bao tiêu nông sản (HTX ↔ Doanh nghiệp)</div>
            <span className="badge badge-green">Bước 1: Xác định vùng trồng &amp; Hợp đồng liên kết</span>
          </div>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Số hợp đồng</th>
                  <th>Tên hợp đồng &amp; Nội dung cam kết</th>
                  <th>Doanh nghiệp đối tác</th>
                  <th>Mã nhà đóng gói (PHC)</th>
                  <th>Ngày ký</th>
                  <th>Thời hạn</th>
                  <th>Sản lượng cam kết</th>
                  <th>Đơn giá thỏa thuận</th>
                  <th>Thị trường</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {contractData.map((c) => {
                  const b = contractStatusBadge[c.status] || { label: c.status, cls: "badge-green" };
                  return (
                    <tr key={c.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#1e3a8a" }}>
                        {c.code}
                      </td>
                      <td>
                        <strong style={{ display: "block", color: "#14372f", fontSize: 13 }}>{c.title}</strong>
                        {c.notes && <small style={{ color: "#64748b" }}>{c.notes}</small>}
                      </td>
                      <td>
                        <strong style={{ color: "#166534" }}>{c.enterpriseName}</strong>
                      </td>
                      <td>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#f0fdf4",
                            color: "#166534",
                            border: "1px solid #bbf7d0",
                            fontFamily: "monospace",
                          }}
                        >
                          {c.packhouseCode || "VN-DLPH-0089"}
                        </span>
                      </td>
                      <td>{c.signedOn}</td>
                      <td>{c.validUntil}</td>
                      <td style={{ fontWeight: 600, color: "#0f172a" }}>{c.targetTons} Tấn</td>
                      <td style={{ color: "#b45309", fontWeight: 600 }}>{c.priceGuarantee || "Thỏa thuận"}</td>
                      <td>
                        <span
                          style={{
                            padding: "2px 7px",
                            borderRadius: 6,
                            fontSize: 10.5,
                            fontWeight: 500,
                            background: c.market === "Trung Quốc" ? "#fbf6ea" : "#eef4fa",
                            color: c.market === "Trung Quốc" ? "#8a6415" : "#235f92",
                          }}
                        >
                          {c.market}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${b.cls}`}>{b.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: DOANH NGHIỆP & CƠ SỞ ĐÓNG GÓI PHC ─── */}
      {tab === "enterprises" && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left">Hồ sơ pháp lý Doanh nghiệp &amp; Cơ sở đóng gói (Packhouse)</div>
            <span className="badge badge-green">Mã PHC phê duyệt bởi Cục BVTV / GACC</span>
          </div>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Mã DN</th>
                  <th>Tên Doanh nghiệp</th>
                  <th>Mã số thuế</th>
                  <th>Đại diện pháp luật</th>
                  <th>Điện thoại</th>
                  <th>Mã cơ sở đóng gói (PHC)</th>
                  <th>Địa chỉ cơ sở</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {enterpriseData.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#166534" }}>{e.code}</td>
                    <td>
                      <strong style={{ color: "#14372f", fontSize: 13.5 }}>{e.name}</strong>
                    </td>
                    <td style={{ fontFamily: "monospace" }}>{e.taxCode || "—"}</td>
                    <td>{e.representative || "—"}</td>
                    <td>{e.phone || "—"}</td>
                    <td>
                      <span
                        style={{
                          padding: "3px 9px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          background: "#ecfdf5",
                          color: "#065f46",
                          border: "1px solid #a7f3d0",
                          fontFamily: "monospace",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <CheckCircle2 size={13} color="#059669" />
                        <span>{e.packhouseCode || "VN-DLPH-0089"}</span>
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "#475569", maxWidth: 260 }}>{e.address || "—"}</td>
                    <td>
                      <span className={`badge ${e.status === "active" ? "badge-green" : "badge-red"}`}>
                        {e.status === "active" ? "Đang hoạt động" : "Ngừng hoạt động"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal in tem QR khi được chọn */}
      {printingLot && (
        <BatchQrModal lot={printingLot} onClose={() => setPrintingLot(null)} />
      )}
    </>
  );
}
