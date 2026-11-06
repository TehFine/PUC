"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Printer, QrCode, Users } from "lucide-react";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import { formatVn } from "@/components/admin/catalog/form-utils";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { useDebounced } from "@/components/admin/catalog/use-debounced";
import DeclarationReviewModal from "@/components/admin/harvest/DeclarationReviewModal";
import { ContractFormModal, EnterpriseFormModal } from "@/components/admin/harvest/EnterpriseContractModals";
import HarvestLotFormModal, { LOT_STATUS_LABELS } from "@/components/admin/harvest/HarvestLotFormModal";
import LotContributionsModal from "@/components/admin/harvest/LotContributionsModal";
import { StampAllocationModal, StampListModal } from "@/components/admin/harvest/StampModals";
import BatchQrModal from "@/components/harvest/BatchQrModal";
import { KpiChartView, renderKpiValue, type ChartPoint, type KpiChartSpec } from "@/components/ui/charts/KpiCharts";
import { Modal } from "@/components/ui/Modal";
import { useApiList } from "@/hooks/use-api";
import type {
  ContractRecord,
  EnterpriseRecord,
  HarvestDeclarationRecord,
  HarvestDeclarationStatus,
  HarvestLotRecord,
  StampAllocationRecord,
} from "@/types/harvest";

type HarvestTab = "lots" | "declarations" | "stamps" | "contracts" | "enterprises";

const CONTRACT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Đang hiệu lực", cls: "badge-green" },
  completed: { label: "Đã hoàn thành", cls: "badge-blue" },
  expired: { label: "Hết hạn", cls: "badge-red" },
};

const DECLARATION_STATUS_BADGE: Record<HarvestDeclarationStatus, { label: string; cls: string }> = {
  submitted: { label: "Chờ xác nhận", cls: "badge-gold" },
  confirmed: { label: "Đã xác nhận", cls: "badge-green" },
  rejected: { label: "Từ chối", cls: "badge-red" },
};

export default function Harvest() {
  const [tab, setTab] = useState<HarvestTab>("lots");

  // 1. Lô thu hoạch
  const [lotQ, setLotQ] = useState("");
  const [lotMarket, setLotMarket] = useState("");
  const [lotStatus, setLotStatus] = useState("");
  const debouncedLotQ = useDebounced(lotQ);
  const lots = useApiList<HarvestLotRecord>("harvest", {
    q: debouncedLotQ,
    market: lotMarket,
    status: lotStatus,
  });
  const allLots = useApiList<HarvestLotRecord>("harvest");
  const [editingLot, setEditingLot] = useState<HarvestLotRecord | "new" | null>(null);
  const [deletingLot, setDeletingLot] = useState<HarvestLotRecord | null>(null);
  const [contribLot, setContribLot] = useState<HarvestLotRecord | null>(null);
  const [printingLot, setPrintingLot] = useState<HarvestLotRecord | null>(null);

  // 2. Khai báo thu hoạch
  const [declQ, setDeclQ] = useState("");
  const [declStatus, setDeclStatus] = useState("");
  const debouncedDeclQ = useDebounced(declQ);
  const declarations = useApiList<HarvestDeclarationRecord>("harvest-declarations", {
    q: debouncedDeclQ,
    status: declStatus,
  });
  const [reviewingDecl, setReviewingDecl] = useState<{ item: HarvestDeclarationRecord; mode: "confirm" | "reject" } | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ title: string; url: string } | null>(null);

  // 3. Cấp phát tem nông hộ
  const [stampQ, setStampQ] = useState("");
  const debouncedStampQ = useDebounced(stampQ);
  const stampAllocations = useApiList<StampAllocationRecord>("stamp-allocations", { q: debouncedStampQ });
  const [creatingStampAllocation, setCreatingStampAllocation] = useState(false);
  const [revokingAllocation, setRevokingAllocation] = useState<StampAllocationRecord | null>(null);
  const [viewingStampsAllocation, setViewingStampsAllocation] = useState<StampAllocationRecord | null>(null);

  // 4. Hợp đồng & Doanh nghiệp
  const [contractQ, setContractQ] = useState("");
  const debouncedContractQ = useDebounced(contractQ);
  const contracts = useApiList<ContractRecord>("contracts", { q: debouncedContractQ });
  const [editingContract, setEditingContract] = useState<ContractRecord | "new" | null>(null);
  const [deletingContract, setDeletingContract] = useState<ContractRecord | null>(null);

  const [entQ, setEntQ] = useState("");
  const debouncedEntQ = useDebounced(entQ);
  const enterprises = useApiList<EnterpriseRecord>("enterprises", { q: debouncedEntQ });
  const [editingEnterprise, setEditingEnterprise] = useState<EnterpriseRecord | "new" | null>(null);
  const [deletingEnterprise, setDeletingEnterprise] = useState<EnterpriseRecord | null>(null);

  // Tính KPI thực từ dữ liệu backend
  const kpis = useMemo(() => {
    const lotRows = allLots.rows;
    const totalTons = lotRows.reduce((sum, l) => sum + Number(l.weightTons || 0), 0);
    const exportedCount = lotRows.filter((l) => l.status === "exported" || l.status === "delivered").length;
    const exportedPct = lotRows.length > 0 ? Math.round((exportedCount / lotRows.length) * 100) : 0;
    const contractRows = contracts.rows;
    const totalContractTons = contractRows.reduce((sum, c) => sum + Number(c.targetTons || 0), 0);
    const totalStamps = stampAllocations.rows.reduce((sum, s) => sum + Number(s.quantityAllocated || 0), 0);
    const activatedStamps = stampAllocations.rows.reduce((sum, s) => sum + Number(s.activatedCount || 0), 0);

    const lotPoints: ChartPoint[] =
      lotRows.length > 0
        ? lotRows
            .slice(0, 6)
            .reverse()
            .map((l) => ({ label: l.code.replace(/^LO-\d+-/, "#"), value: Number(l.weightTons || 0) }))
        : [{ label: "Lô", value: 0 }];

    const contractPoints: ChartPoint[] =
      contractRows.length > 0
        ? contractRows.slice(0, 4).map((c) => ({
            label: (c.enterpriseName || c.code).slice(0, 12),
            value: Number(c.targetTons || 0),
          }))
        : [{ label: "HĐ", value: 0 }];

    const stampPct = totalStamps > 0 ? Math.round((activatedStamps / totalStamps) * 100) : 0;

    return [
      {
        val: `${formatVn(totalTons, 1)} tấn`,
        label: "Tổng sản lượng lô",
        sub: `${lotRows.length} lô thu hoạch`,
        chart: {
          kind: "area" as const,
          tone: "lime" as const,
          unit: " tấn",
          highlight: "max" as const,
          caption: "Sản lượng các lô gần nhất",
          data: lotPoints,
        } satisfies KpiChartSpec,
      },
      {
        val: `${lotRows.length} lô`,
        label: "Lô hàng tạo ra",
        sub: `${exportedCount} lô đã xuất/giao`,
        chart: {
          kind: "gauge" as const,
          tone: "lime" as const,
          value: exportedPct,
          caption: `${exportedCount}/${lotRows.length} lô hoàn tất`,
        } satisfies KpiChartSpec,
      },
      {
        val: `${contractRows.length} HĐ`,
        label: "Hợp đồng bao tiêu",
        sub: `${formatVn(totalContractTons, 0)} tấn cam kết`,
        suffix: "theo hợp đồng",
        chart: {
          kind: "bars" as const,
          tone: "ink" as const,
          unit: " tấn",
          highlight: "max" as const,
          data: contractPoints,
        } satisfies KpiChartSpec,
      },
      {
        val: `${formatVn(totalStamps, 0)} tem`,
        label: "Tem nông hộ đã cấp",
        sub: `${formatVn(activatedStamps, 0)} tem đã kích hoạt`,
        chart: {
          kind: "gauge" as const,
          tone: "ink" as const,
          value: stampPct,
          caption: `${activatedStamps}/${totalStamps} tem đã dán`,
        } satisfies KpiChartSpec,
      },
    ];
  }, [allLots.rows, contracts.rows, stampAllocations.rows]);

  const handlePrimaryAction = () => {
    if (tab === "lots") setEditingLot("new");
    else if (tab === "stamps") setCreatingStampAllocation(true);
    else if (tab === "contracts") setEditingContract("new");
    else if (tab === "enterprises") setEditingEnterprise("new");
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Chuỗi Cung Ứng &amp; Lô Hàng</h1>
        </div>
        <div className="header-actions">
          {tab === "lots" && lots.rows[0] && (
            <button type="button" className="btn btn-outline" onClick={() => setPrintingLot(lots.rows[0])}>
              <Printer size={15} />
              <span>In dải tem nhanh</span>
            </button>
          )}
          {tab !== "declarations" && (
            <button type="button" className="btn btn-primary" onClick={handlePrimaryAction}>
              {tab === "lots"
                ? "Tạo lô hàng mới"
                : tab === "stamps"
                  ? "Cấp phát dải tem"
                  : tab === "contracts"
                    ? "Thêm hợp đồng bao tiêu"
                    : "Thêm doanh nghiệp"}
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid-4">
        {kpis.map(({ val, label, sub, chart, suffix }, i) => (
          <div key={i} className="kpi-card has-chart">
            <div className="kpi-head">
              <div className="kpi-val">{renderKpiValue(val)}</div>
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
        <button type="button" className={`tab-btn ${tab === "lots" ? "active" : ""}`} onClick={() => setTab("lots")}>
          Lô thu hoạch ({lots.total})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "declarations" ? "active" : ""}`}
          onClick={() => setTab("declarations")}
        >
          Đơn khai báo ({declarations.total})
        </button>
        <button type="button" className={`tab-btn ${tab === "stamps" ? "active" : ""}`} onClick={() => setTab("stamps")}>
          Cấp phát tem ({stampAllocations.total})
        </button>
        <button type="button" className={`tab-btn ${tab === "contracts" ? "active" : ""}`} onClick={() => setTab("contracts")}>
          Hợp đồng bao tiêu ({contracts.total})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "enterprises" ? "active" : ""}`}
          onClick={() => setTab("enterprises")}
        >
          Doanh nghiệp &amp; PHC ({enterprises.total})
        </button>
      </div>

      {/* ─── TAB 1: DANH SÁCH LÔ THU HOẠCH ─── */}
      {tab === "lots" && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">Danh sách lô thu hoạch &amp; Xuất khẩu</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220, padding: "5px 10px" }}
                placeholder="Tìm mã lô, đơn vị mua…"
                value={lotQ}
                onChange={(e) => setLotQ(e.target.value)}
              />
              <select
                className="filter-select"
                style={{ padding: "5px 9px" }}
                value={lotMarket}
                onChange={(e) => setLotMarket(e.target.value)}
              >
                <option value="">Mọi thị trường</option>
                <option value="Trung Quốc">Trung Quốc</option>
                <option value="Nội địa">Nội địa</option>
                <option value="Nhật Bản">Nhật Bản</option>
                <option value="Hàn Quốc">Hàn Quốc</option>
                <option value="EU">EU</option>
              </select>
              <select
                className="filter-select"
                style={{ padding: "5px 9px" }}
                value={lotStatus}
                onChange={(e) => setLotStatus(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                <option value="exported">Đã xuất khẩu</option>
                <option value="delivered">Đã giao hàng</option>
                <option value="in_transit">Đang vận chuyển</option>
                <option value="sampling">Đang lấy mẫu</option>
              </select>
            </div>
          </div>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Mã lô</th>
                  <th>Ngày thu</th>
                  <th>Khối lượng</th>
                  <th>Số hộ</th>
                  <th>Doanh nghiệp thu mua</th>
                  <th>Mã nhà đóng gói (PHC)</th>
                  <th>Thị trường</th>
                  <th>Tem QR Lô</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <ListStatusRow
                  colSpan={10}
                  loading={lots.loading}
                  error={lots.error}
                  empty={lots.rows.length === 0}
                  onRetry={lots.refresh}
                />
                {lots.rows.map((h) => {
                  const st = LOT_STATUS_LABELS[h.status] ?? LOT_STATUS_LABELS.sampling;
                  const tons = Number(h.weightTons || 0);
                  const kg = Math.round(tons * 1000);
                  return (
                    <tr key={h.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45", fontWeight: 700 }}>{h.code}</td>
                      <td>{h.harvestedOn ? h.harvestedOn.slice(0, 10) : "—"}</td>
                      <td style={{ fontWeight: 600 }}>
                        {formatVn(tons, 2)} tấn
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>{formatVn(kg, 0)} kg</div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          title="Quản lý danh sách hộ đóng góp trong lô"
                          onClick={() => setContribLot(h)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <Users size={13} />
                          <span>{h.householdCount ?? 0} hộ</span>
                        </button>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <strong style={{ color: "#14372f" }}>{h.enterpriseName || h.buyer}</strong>
                        {h.contractCode && <div style={{ fontSize: 11, color: "#64748b" }}>HĐ: {h.contractCode}</div>}
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
                          href={`/trace/${encodeURIComponent(h.code)}`}
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
                          <span>{h.qrCode || h.code}</span>
                        </a>
                      </td>
                      <td>
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                      </td>
                      <td className="table-actions-cell">
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            title="Cấp và in tem dán từng quả sầu riêng hoặc thùng carton"
                            onClick={() => setPrintingLot(h)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            <Printer size={13} strokeWidth={2.2} />
                            <span>In dải tem</span>
                          </button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setContribLot(h)}>
                            Hộ đóng góp
                          </button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingLot(h)}>
                            Sửa
                          </button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingLot(h)}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 2: KHAI BÁO THU HOẠCH TỪ HỘ DÂN ─── */}
      {tab === "declarations" && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">Danh sách khai báo thu hoạch từ nông hộ</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220, padding: "5px 10px" }}
                placeholder="Tìm theo hộ, mã thửa…"
                value={declQ}
                onChange={(e) => setDeclQ(e.target.value)}
              />
              <select
                className="filter-select"
                style={{ padding: "5px 9px" }}
                value={declStatus}
                onChange={(e) => setDeclStatus(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                <option value="submitted">Chờ xác nhận</option>
                <option value="confirmed">Đã xác nhận</option>
                <option value="rejected">Từ chối</option>
              </select>
            </div>
          </div>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Ngày thu</th>
                  <th>Hộ nông dân</th>
                  <th>Thôn</th>
                  <th>Mã thửa</th>
                  <th>Tổng KL (kg)</th>
                  <th>Phân loại A / B</th>
                  <th>Ảnh thực tế</th>
                  <th>Ghi chú / Phản hồi</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <ListStatusRow
                  colSpan={10}
                  loading={declarations.loading}
                  error={declarations.error}
                  empty={declarations.rows.length === 0}
                  onRetry={declarations.refresh}
                />
                {declarations.rows.map((d) => {
                  const st = DECLARATION_STATUS_BADGE[d.status] ?? DECLARATION_STATUS_BADGE.submitted;
                  return (
                    <tr key={d.id}>
                      <td>{d.harvestedOn ? d.harvestedOn.slice(0, 10) : "—"}</td>
                      <td>
                        <strong style={{ color: "#14372f" }}>{d.householdName || `#${d.householdId}`}</strong>
                        {d.householdCode && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.householdCode}</div>}
                      </td>
                      <td>{d.villageName || "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{d.plotCode}</td>
                      <td style={{ fontWeight: 600 }}>{formatVn(Number(d.weightKg), 1)} kg</td>
                      <td style={{ fontSize: 12 }}>
                        A: {d.gradeAKg !== null ? `${formatVn(Number(d.gradeAKg), 1)} kg` : "—"} · B:{" "}
                        {d.gradeBKg !== null ? `${formatVn(Number(d.gradeBKg), 1)} kg` : "—"}
                      </td>
                      <td>
                        {d.photoUrl ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() =>
                              setPreviewPhoto({
                                title: `Ảnh thu hoạch – ${d.householdName || d.plotCode}`,
                                url: d.photoUrl!,
                              })
                            }
                          >
                            Xem ảnh
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Không có</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 220 }}>
                        {d.note && <div>{d.note}</div>}
                        {d.reviewNote && (
                          <div style={{ color: d.status === "rejected" ? "#b73c20" : "#166534", fontWeight: 500 }}>
                            HTX: {d.reviewNote}
                          </div>
                        )}
                        {!d.note && !d.reviewNote && "—"}
                      </td>
                      <td>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="table-actions-cell">
                        {d.status === "submitted" ? (
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setReviewingDecl({ item: d, mode: "confirm" })}
                            >
                              Xác nhận
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setReviewingDecl({ item: d, mode: "reject" })}
                            >
                              Từ chối
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Đã xử lý</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: CẤP PHÁT TEM NÔNG HỘ ─── */}
      {tab === "stamps" && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">Quản lý cấp phát dải tem QR cho nông hộ</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220, padding: "5px 10px" }}
                placeholder="Tìm mã đợt, hộ dân, vụ mùa…"
                value={stampQ}
                onChange={(e) => setStampQ(e.target.value)}
              />
            </div>
          </div>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Mã cấp phát</th>
                  <th>Ngày cấp</th>
                  <th>Hộ nông dân</th>
                  <th>Mã thửa</th>
                  <th>Vụ mùa</th>
                  <th>Số lượng cấp</th>
                  <th>Đã kích hoạt</th>
                  <th>Dải Serial</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <ListStatusRow
                  colSpan={10}
                  loading={stampAllocations.loading}
                  error={stampAllocations.error}
                  empty={stampAllocations.rows.length === 0}
                  onRetry={stampAllocations.refresh}
                />
                {stampAllocations.rows.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#166534" }}>
                      {s.allocationCode}
                    </td>
                    <td>{s.allocatedOn ? s.allocatedOn.slice(0, 10) : "—"}</td>
                    <td>
                      <strong>{s.householdName || `#${s.householdId}`}</strong>
                      {s.householdCode && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.householdCode}</div>}
                    </td>
                    <td>{s.plotCode || "—"}</td>
                    <td>{s.season}</td>
                    <td style={{ fontWeight: 600, textAlign: "center" }}>{formatVn(s.quantityAllocated, 0)} tem</td>
                    <td style={{ textAlign: "center" }}>
                      <strong>{s.activatedCount ?? 0}</strong> / {s.quantityAllocated}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 11.5 }}>
                      {s.fromSerial} → {s.toSerial}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          s.status === "active" ? "badge-green" : s.status === "revoked" ? "badge-red" : "badge-blue"
                        }`}
                      >
                        {s.status === "active" ? "Đang hiệu lực" : s.status === "revoked" ? "Đã thu hồi" : "Hoàn tất"}
                      </span>
                    </td>
                    <td className="table-actions-cell">
                      <div className="table-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingStampsAllocation(s)}>
                          Xem danh sách tem
                        </button>
                        {s.status === "active" && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setRevokingAllocation(s)}>
                            Thu hồi
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 4: HỢP ĐỒNG LIÊN KẾT BAO TIÊU ─── */}
      {tab === "contracts" && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">Hợp đồng thu mua bao tiêu nông sản (HTX ↔ Doanh nghiệp)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220, padding: "5px 10px" }}
                placeholder="Tìm số hợp đồng, tiêu đề…"
                value={contractQ}
                onChange={(e) => setContractQ(e.target.value)}
              />
            </div>
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
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <ListStatusRow
                  colSpan={11}
                  loading={contracts.loading}
                  error={contracts.error}
                  empty={contracts.rows.length === 0}
                  onRetry={contracts.refresh}
                />
                {contracts.rows.map((c) => {
                  const b = CONTRACT_STATUS_BADGE[c.status] || { label: c.status, cls: "badge-green" };
                  return (
                    <tr key={c.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#1e3a8a" }}>{c.code}</td>
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
                      <td>{c.signedOn ? c.signedOn.slice(0, 10) : "—"}</td>
                      <td>{c.validUntil ? c.validUntil.slice(0, 10) : "—"}</td>
                      <td style={{ fontWeight: 600, color: "#0f172a" }}>{formatVn(c.targetTons, 1)} tấn</td>
                      <td style={{ color: "#b45309", fontWeight: 600 }}>{c.priceGuarantee || "Thỏa thuận"}</td>
                      <td>{c.market || "—"}</td>
                      <td>
                        <span className={`badge ${b.cls}`}>{b.label}</span>
                      </td>
                      <td className="table-actions-cell">
                        <div className="table-actions">
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingContract(c)}>
                            Sửa
                          </button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingContract(c)}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 5: DOANH NGHIỆP & CƠ SỞ ĐÓNG GÓI PHC ─── */}
      {tab === "enterprises" && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">Hồ sơ pháp lý Doanh nghiệp &amp; Cơ sở đóng gói (Packhouse)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220, padding: "5px 10px" }}
                placeholder="Tìm mã DN, tên doanh nghiệp…"
                value={entQ}
                onChange={(e) => setEntQ(e.target.value)}
              />
            </div>
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
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <ListStatusRow
                  colSpan={9}
                  loading={enterprises.loading}
                  error={enterprises.error}
                  empty={enterprises.rows.length === 0}
                  onRetry={enterprises.refresh}
                />
                {enterprises.rows.map((e) => (
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
                    <td className="table-actions-cell">
                      <div className="table-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingEnterprise(e)}>
                          Sửa
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingEnterprise(e)}>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals Lô thu hoạch */}
      {editingLot && (
        <HarvestLotFormModal
          initial={editingLot === "new" ? null : editingLot}
          enterprises={enterprises.rows}
          contracts={contracts.rows}
          onClose={() => setEditingLot(null)}
          onSaved={() => {
            setEditingLot(null);
            void lots.refresh();
            void allLots.refresh();
          }}
        />
      )}
      {deletingLot && (
        <ConfirmAction
          title="Xóa lô thu hoạch"
          message={
            <>
              Bạn có chắc chắn muốn xóa lô <strong>{deletingLot.code}</strong>?
            </>
          }
          path={`/harvest/${deletingLot.id}`}
          successMessage="Đã xóa lô thu hoạch."
          onClose={() => setDeletingLot(null)}
          onDone={() => {
            setDeletingLot(null);
            void lots.refresh();
            void allLots.refresh();
          }}
        />
      )}
      {contribLot && (
        <LotContributionsModal
          lot={contribLot}
          onClose={() => setContribLot(null)}
          onChanged={() => {
            void lots.refresh();
            void allLots.refresh();
          }}
        />
      )}
      {printingLot && <BatchQrModal lot={printingLot} onClose={() => setPrintingLot(null)} />}

      {/* Modals Khai báo thu hoạch */}
      {reviewingDecl && (
        <DeclarationReviewModal
          declaration={reviewingDecl.item}
          mode={reviewingDecl.mode}
          onClose={() => setReviewingDecl(null)}
          onDone={() => {
            setReviewingDecl(null);
            void declarations.refresh();
          }}
        />
      )}
      {previewPhoto && (
        <Modal
          title={previewPhoto.title}
          onClose={() => setPreviewPhoto(null)}
          width={640}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setPreviewPhoto(null)}>
              Đóng
            </button>
          }
        >
          <div style={{ textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPhoto.url}
              alt={previewPhoto.title}
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 12, objectFit: "contain" }}
            />
          </div>
        </Modal>
      )}

      {/* Modals Cấp phát tem nông hộ */}
      {creatingStampAllocation && (
        <StampAllocationModal
          onClose={() => setCreatingStampAllocation(false)}
          onSaved={() => {
            setCreatingStampAllocation(false);
            void stampAllocations.refresh();
          }}
        />
      )}
      {revokingAllocation && (
        <ConfirmAction
          title="Thu hồi dải tem nông hộ"
          message={
            <>
              Bạn có chắc chắn muốn thu hồi dải tem <strong>{revokingAllocation.allocationCode}</strong> của hộ{" "}
              <strong>{revokingAllocation.householdName || revokingAllocation.householdCode}</strong>? Các tem chưa kích hoạt sẽ bị vô hiệu hóa.
            </>
          }
          path={`/stamp-allocations/${revokingAllocation.id}/revoke`}
          method="post"
          confirmLabel="Thu hồi dải tem"
          successMessage="Đã thu hồi dải tem."
          onClose={() => setRevokingAllocation(null)}
          onDone={() => {
            setRevokingAllocation(null);
            void stampAllocations.refresh();
          }}
        />
      )}
      {viewingStampsAllocation && (
        <StampListModal allocation={viewingStampsAllocation} onClose={() => setViewingStampsAllocation(null)} />
      )}

      {/* Modals Hợp đồng */}
      {editingContract && (
        <ContractFormModal
          initial={editingContract === "new" ? null : editingContract}
          enterprises={enterprises.rows}
          onClose={() => setEditingContract(null)}
          onSaved={() => {
            setEditingContract(null);
            void contracts.refresh();
          }}
        />
      )}
      {deletingContract && (
        <ConfirmAction
          title="Xóa hợp đồng bao tiêu"
          message={
            <>
              Bạn có chắc chắn muốn xóa hợp đồng <strong>{deletingContract.code}</strong>?
            </>
          }
          path={`/contracts/${deletingContract.id}`}
          successMessage="Đã xóa hợp đồng."
          onClose={() => setDeletingContract(null)}
          onDone={() => {
            setDeletingContract(null);
            void contracts.refresh();
          }}
        />
      )}

      {/* Modals Doanh nghiệp */}
      {editingEnterprise && (
        <EnterpriseFormModal
          initial={editingEnterprise === "new" ? null : editingEnterprise}
          onClose={() => setEditingEnterprise(null)}
          onSaved={() => {
            setEditingEnterprise(null);
            void enterprises.refresh();
          }}
        />
      )}
      {deletingEnterprise && (
        <ConfirmAction
          title="Xóa doanh nghiệp"
          message={
            <>
              Bạn có chắc chắn muốn xóa doanh nghiệp <strong>{deletingEnterprise.name}</strong>?
            </>
          }
          path={`/enterprises/${deletingEnterprise.id}`}
          successMessage="Đã xóa doanh nghiệp."
          onClose={() => setDeletingEnterprise(null)}
          onDone={() => {
            setDeletingEnterprise(null);
            void enterprises.refresh();
          }}
        />
      )}
    </>
  );
}
