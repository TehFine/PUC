"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import { formatVn } from "@/components/admin/catalog/form-utils";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { ContractFormModal, EnterpriseFormModal } from "@/components/admin/harvest/EnterpriseContractModals";
import HarvestLotFormModal, { LOT_STATUS_LABELS } from "@/components/admin/harvest/HarvestLotFormModal";
import HarvestPlanNotifyModal from "@/components/admin/harvest/HarvestPlanNotifyModal";
import IncidentTraceModal from "@/components/admin/harvest/IncidentTraceModal";
import LotContributionsModal from "@/components/admin/harvest/LotContributionsModal";
import { StampAllocationModal, StampListModal } from "@/components/admin/harvest/StampModals";
import { toast } from "@/components/ui/Toast";
import { isCoopStaffRole } from "@/constants/roles";
import { api, errorMessage } from "@/lib/api-client";
import {
  ADMIN_LAST_URL_KEY,
  readInitialUrlSubTab,
  usePersistedEditableSelection,
  usePersistedRecordSelection,
  usePersistedState,
  useUrlSubTab,
} from "@/lib/back-navigation";

const BatchQrModal = dynamic(() => import("@/components/harvest/BatchQrModal"), { ssr: false });
const QrScannerModal = dynamic(() => import("@/components/admin/harvest/QrScannerModal"), { ssr: false });
const TraceAccessLogsModal = dynamic(() => import("@/components/admin/harvest/TraceAccessLogsModal"), { ssr: false });
const PlotQuotasModal = dynamic(() => import("@/components/admin/harvest/PlotQuotasModal"), { ssr: false });
const FieldAuditPassesModal = dynamic(() => import("@/components/admin/harvest/FieldAuditPassesModal"), { ssr: false });
import { useApi, useApiList } from "@/hooks/use-api";
import type {
  ContractRecord,
  EnterpriseRecord,
  HarvestLotRecord,
  HarvestPlanRecord,
  HarvestPlanStatus,
  StampAllocationRecord,
} from "@/types/harvest";

interface GrowingZoneRow {
  code: string;
  name: string;
  commune: string;
  district: string;
  province: string;
  status: "active" | "suspended" | "revoked" | "pending";
  statusNote?: string | null;
  validUntil?: string | null;
}

const ENTERPRISE_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Đang hoạt động", cls: "badge-green" },
  suspended: { label: "Tạm dừng PHC", cls: "badge-gold" },
  revoked: { label: "Đã thu hồi PHC", cls: "badge-red" },
  inactive: { label: "Ngừng hoạt động", cls: "badge-gray" },
};

type HarvestTab = "lots" | "plans" | "stamps" | "contracts" | "enterprises";

const CONTRACT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Đang hiệu lực", cls: "badge-green" },
  completed: { label: "Đã hoàn thành", cls: "badge-blue" },
  expired: { label: "Hết hạn", cls: "badge-red" },
};

const PLAN_STATUS_BADGE: Record<HarvestPlanStatus, { label: string; cls: string }> = {
  ready: { label: "Đủ căn cứ tính lịch", cls: "badge-gold" },
  notified: { label: "Đã thông báo hộ dân", cls: "badge-green" },
  missing_journal: { label: "Chưa có nhật ký", cls: "badge-gray" },
};

export default function Harvest() {
  const { can, session } = useAuth();
  const canReadHouseholds = can("households", "read");
  const canReadApprovals = can("approvals", "read");
  const canEditEndorsement = isCoopStaffRole(session?.user.role);
  const canReadStamps = can("stamps", "read");
  const canCreateHarvest = can("harvest", "create");
  const canUpdateHarvest = can("harvest", "update");
  const canDeleteHarvest = can("harvest", "delete");
  const canReadContracts = can("contracts", "read");
  const canCreateContract = can("contracts", "create");
  const canUpdateContract = can("contracts", "update");
  const canDeleteContract = can("contracts", "delete");
  const canReadEnterprises = can("enterprises", "read");
  const canCreateEnterprise = can("enterprises", "create");
  const canUpdateEnterprise = can("enterprises", "update");
  const canDeleteEnterprise = can("enterprises", "delete");
  const canCreateStamps = can("stamps", "create");
  const canUpdateStamps = can("stamps", "update");

  const isHarvestTab = (raw: string): raw is HarvestTab =>
    raw === "lots" ||
    raw === "plans" ||
    raw === "stamps" ||
    raw === "contracts" ||
    raw === "enterprises";

  const [tab, setTab] = useState<HarvestTab>(() =>
    readInitialUrlSubTab("sub", "lots", isHarvestTab, ADMIN_LAST_URL_KEY),
  );
  const selectTab = useUrlSubTab<HarvestTab>(
    "sub",
    tab,
    setTab,
    "lots",
    isHarvestTab,
  );

  // 1. Lô thu hoạch
  const [lotQ, setLotQ] = useState("");
  const [lotMarket, setLotMarket] = usePersistedState("admin:harvest:market", "");
  const [lotStatus, setLotStatus] = usePersistedState("admin:harvest:status", "");
  const debouncedLotQ = useDebounced(lotQ);
  const hasLotFilter = Boolean(debouncedLotQ || lotMarket || lotStatus);
  const allLots = useApiList<HarvestLotRecord>("harvest");
  const filteredLots = useApiList<HarvestLotRecord>(hasLotFilter ? "harvest" : null, {
    q: debouncedLotQ,
    market: lotMarket,
    status: lotStatus,
  });
  const lots = hasLotFilter ? filteredLots : allLots;
  const [editingLot, setEditingLot] = usePersistedEditableSelection(
    "admin:harvest:edit-lot",
    allLots.rows,
    (r) => r.id,
    allLots.loading,
  );
  const [deletingLot, setDeletingLot] = useState<HarvestLotRecord | null>(null);
  const [contribLot, setContribLot] = usePersistedRecordSelection(
    "admin:harvest:contrib-lot",
    allLots.rows,
    (r) => r.id,
    allLots.loading,
  );
  const [printingLot, setPrintingLot] = usePersistedRecordSelection(
    "admin:harvest:print-lot",
    allLots.rows,
    (r) => r.id,
    allLots.loading,
  );
  const [incidentLotCode, setIncidentLotCode] = usePersistedState<string | null>(
    "admin:harvest:incident-code",
    null,
    (v): v is string | null => v === null || typeof v === "string",
  );
  const [scanningQr, setScanningQr] = usePersistedState("admin:harvest:scan-qr", false);
  const [viewingTraceLogs, setViewingTraceLogs] = usePersistedState("admin:harvest:trace-logs", false);
  const [viewingPlotQuotas, setViewingPlotQuotas] = usePersistedState("admin:harvest:plot-quotas", false);
  const [viewingFieldPasses, setViewingFieldPasses] = usePersistedState("admin:harvest:field-passes", false);

  // 2. Dự báo & tính lịch thu hoạch từ nhật ký chăm sóc
  const [planQ, setPlanQ] = useState("");
  const [planStatus, setPlanStatus] = usePersistedState("admin:harvest:plan-status", "");
  const debouncedPlanQ = useDebounced(planQ);
  const harvestPlans = useApiList<HarvestPlanRecord>(canReadHouseholds ? "harvest-plan" : null, {
    q: debouncedPlanQ,
    status: planStatus,
  });
  const [notifyingPlan, setNotifyingPlan] = usePersistedRecordSelection(
    "admin:harvest:notify-plan",
    harvestPlans.rows,
    (r) => r.householdId,
    harvestPlans.loading,
  );

  // 3. Cấp phát tem nông hộ
  const [stampQ, setStampQ] = useState("");
  const debouncedStampQ = useDebounced(stampQ);
  const stampAllocations = useApiList<StampAllocationRecord>(canReadStamps ? "stamp-allocations" : null, { q: debouncedStampQ });
  const [creatingStampAllocation, setCreatingStampAllocation] = usePersistedState("admin:harvest:create-stamp", false);
  const [revokingAllocation, setRevokingAllocation] = useState<StampAllocationRecord | null>(null);
  const [viewingStampsAllocation, setViewingStampsAllocation] = usePersistedRecordSelection(
    "admin:harvest:view-stamp",
    stampAllocations.rows,
    (r) => r.id,
    stampAllocations.loading,
  );

  // 4. Hợp đồng & Doanh nghiệp
  const [contractQ, setContractQ] = useState("");
  const debouncedContractQ = useDebounced(contractQ);
  const contracts = useApiList<ContractRecord>(canReadContracts ? "contracts" : null, {
    q: debouncedContractQ,
  });
  const [editingContract, setEditingContract] = usePersistedEditableSelection(
    "admin:harvest:edit-contract",
    contracts.rows,
    (r) => r.id,
    contracts.loading,
  );
  const [deletingContract, setDeletingContract] = useState<ContractRecord | null>(null);

  const [entQ, setEntQ] = useState("");
  const debouncedEntQ = useDebounced(entQ);
  const enterprises = useApiList<EnterpriseRecord>(canReadEnterprises ? "enterprises" : null, {
    q: debouncedEntQ,
  });
  const [editingEnterprise, setEditingEnterprise] = usePersistedEditableSelection(
    "admin:harvest:edit-enterprise",
    enterprises.rows,
    (r) => r.id,
    enterprises.loading,
  );
  const [deletingEnterprise, setDeletingEnterprise] = useState<EnterpriseRecord | null>(null);
  const growingZones = useApi<{ data?: GrowingZoneRow[] }>(
    tab === "enterprises" && canReadEnterprises ? "/growing-zones" : null,
  );
  const zoneRows = growingZones.data?.data ?? [];

  const handleZoneStatusChange = async (code: string, nextStatus: GrowingZoneRow["status"]) => {
    try {
      await api.patch(`/growing-zones/${encodeURIComponent(code)}`, { status: nextStatus });
      toast.success(`Đã cập nhật trạng thái thời gian thực cho mã vùng ${code}.`);
      await growingZones.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể cập nhật trạng thái mã vùng trồng."));
    }
  };

  // Tính KPI thực từ dữ liệu backend
  const kpis = useMemo(() => {
    const lotRows = allLots.rows;
    const totalTons = lotRows.reduce((sum, l) => sum + Number(l.weightTons || 0), 0);
    const exportedCount = lotRows.filter((l) => l.status === "exported" || l.status === "delivered").length;
    const contractRows = contracts.rows;
    const totalContractTons = contractRows.reduce((sum, c) => sum + Number(c.targetTons || 0), 0);
    const totalStamps = stampAllocations.rows.reduce((sum, s) => sum + Number(s.quantityAllocated || 0), 0);
    const activatedStamps = stampAllocations.rows.reduce((sum, s) => sum + Number(s.activatedCount || 0), 0);

    return [
      {
        num: formatVn(totalTons, 1),
        unit: "tấn",
        label: "Tổng sản lượng lô",
        sub: `${lotRows.length} lô thu hoạch`,
      },
      {
        num: String(lotRows.length),
        unit: "lô",
        label: "Lô hàng tạo ra",
        sub: `${exportedCount} lô đã xuất hoặc giao`,
      },
      {
        num: String(contractRows.length),
        unit: "HĐ",
        label: "Hợp đồng bao tiêu",
        sub: `${formatVn(totalContractTons, 0)} tấn cam kết`,
      },
      {
        num: formatVn(totalStamps, 0),
        unit: "tem",
        label: "Tem nông hộ đã cấp",
        sub: `${formatVn(activatedStamps, 0)} tem đã kích hoạt`,
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
        <div className="header-actions">
          <button type="button" className="btn btn-outline" onClick={() => setScanningQr(true)}>
            <span>Quét QR</span>
          </button>
          {canReadHouseholds && (
            <button type="button" className="btn btn-outline" onClick={() => setViewingPlotQuotas(true)}>
              <span>Hạn ngạch vườn</span>
            </button>
          )}
          {canReadApprovals && (
            <button type="button" className="btn btn-outline" onClick={() => setViewingFieldPasses(true)}>
              <span>Thẻ thẩm định</span>
            </button>
          )}
          {canReadApprovals && (
            <button type="button" className="btn btn-outline" onClick={() => setViewingTraceLogs(true)}>
              <span>Nhật ký quét QR</span>
            </button>
          )}
          {canReadHouseholds && (
            <button type="button" className="btn btn-outline" onClick={() => setIncidentLotCode("")}>
              <span>Truy vết sự cố</span>
            </button>
          )}
          {tab === "lots" && lots.rows[0] && (
            <button type="button" className="btn btn-outline" onClick={() => setPrintingLot(lots.rows[0])}>
              <span>In tem lô</span>
            </button>
          )}
          {((tab === "lots" && canCreateHarvest) ||
            (tab === "stamps" && canCreateStamps) ||
            (tab === "contracts" && canCreateContract) ||
            (tab === "enterprises" && canCreateEnterprise)) && (
              <button type="button" className="btn btn-primary" onClick={handlePrimaryAction}>
                {tab === "lots"
                  ? "Tạo lô mới"
                  : tab === "stamps"
                    ? "Cấp dải tem"
                    : tab === "contracts"
                      ? "Thêm hợp đồng"
                      : "Thêm doanh nghiệp"}
              </button>
            )}
        </div>
      </div>

      <section className="news-summary-card" aria-label="Thống kê thu hoạch và truy xuất">
        {kpis.map(({ num, unit, label, sub }) => (
          <div key={label} className="news-summary-row">
            <div className="news-summary-meta">
              <span className="news-summary-label">{label}</span>
              <span className="news-summary-sub">{sub}</span>
            </div>
            <strong className="news-summary-val">
              {num}
              {unit && <span className="news-summary-unit">{unit}</span>}
            </strong>
          </div>
        ))}
      </section>

      {/* Thanh chuyển tab quy trình chuỗi liên kết */}
      <div className="tab-bar" style={{ marginTop: 20, marginBottom: 16 }}>
        <button type="button" className={`tab-btn ${tab === "lots" ? "active" : ""}`} onClick={() => selectTab("lots")}>
          Lô thu hoạch
        </button>
        {canReadHouseholds && (
          <button
            type="button"
            className={`tab-btn ${tab === "plans" ? "active" : ""}`}
            onClick={() => selectTab("plans")}
          >
            Tính lịch thu hoạch
          </button>
        )}
        {canReadStamps && (
          <button type="button" className={`tab-btn ${tab === "stamps" ? "active" : ""}`} onClick={() => selectTab("stamps")}>
            Cấp phát tem
          </button>
        )}
        {canReadContracts && (
          <button type="button" className={`tab-btn ${tab === "contracts" ? "active" : ""}`} onClick={() => selectTab("contracts")}>
            Hợp đồng bao tiêu
          </button>
        )}
        {canReadEnterprises && (
          <button
            type="button"
            className={`tab-btn ${tab === "enterprises" ? "active" : ""}`}
            onClick={() => selectTab("enterprises")}
          >
            Doanh nghiệp và CSĐG
          </button>
        )}
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
                style={{ width: 220 }}
                placeholder="Tìm mã lô, đơn vị mua…"
                value={lotQ}
                onChange={(e) => setLotQ(e.target.value)}
              />
              <select
                className="filter-select"
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
                value={lotStatus}
                onChange={(e) => setLotStatus(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                <option value="exported">Đã xuất khẩu</option>
                <option value="delivered">Đã giao hàng</option>
                <option value="in_transit">Đang vận chuyển</option>
                <option value="sampling">Đang lấy mẫu</option>
                <option value="revoked">Đã thu hồi</option>
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
                      <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "#256b45", fontWeight: 700 }}>{h.code}</td>
                      <td>{h.harvestedOn ? h.harvestedOn.slice(0, 10) : "—"}</td>
                      <td style={{ fontWeight: 600 }}>
                        {formatVn(tons, 2)} tấn
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>{formatVn(kg, 0)} kg</div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {canReadHouseholds ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            title="Quản lý danh sách hộ đóng góp trong lô"
                            onClick={() => setContribLot(h)}
                          >
                            <span>{h.householdCount ?? 0} hộ</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{h.householdCount ?? 0} hộ</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <strong style={{ color: "#14372f" }}>{h.enterpriseName || h.buyer}</strong>
                        {h.contractCode && <div style={{ fontSize: 11, color: "#64748b" }}>HĐ: {h.contractCode}</div>}
                      </td>
                      <td
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "#166534",
                          fontFamily: "var(--font-num-stack)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {h.packhouseCode || "VN-DLPH-0089"}
                      </td>
                      <td
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: h.market === "Trung Quốc" ? "#8a6415" : "#235f92",
                        }}
                      >
                        {h.market}
                      </td>
                      <td>
                        <a
                          href={h.qrToken ? `/t/${encodeURIComponent(h.qrToken)}` : `/trace/${encodeURIComponent(h.code)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                          title="Xem trang quét mã QR truy xuất bằng token ngẫu nhiên chống giả"
                          style={{
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            fontWeight: 600,
                            color: "#166534",
                          }}
                        >
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
                            title="Xem và in tem định danh thùng carton hoặc tem lô"
                            onClick={() => setPrintingLot(h)}
                          >
                            <span>In dải tem</span>
                          </button>
                          {canReadHouseholds && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setContribLot(h)}>
                              Hộ đóng góp
                            </button>
                          )}
                          {canUpdateHarvest && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingLot(h)}>
                              Sửa
                            </button>
                          )}
                          {canDeleteHarvest && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingLot(h)}>
                              Xóa
                            </button>
                          )}
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

      {/* ─── TAB 2: TÍNH LỊCH THU HOẠCH TỪ NHẬT KÝ CHĂM SÓC & THÔNG BÁO HỘ DÂN ─── */}
      {tab === "plans" && canReadHouseholds && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">
              Tính toán ngày thu hoạch từ nhật ký chăm sóc &amp; gửi thông báo hộ dân
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220 }}
                placeholder="Tìm theo hộ, mã thửa, thôn…"
                value={planQ}
                onChange={(e) => setPlanQ(e.target.value)}
              />
              <select
                className="filter-select"
                value={planStatus}
                onChange={(e) => setPlanStatus(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                <option value="ready">Đủ căn cứ tính lịch</option>
                <option value="notified">Đã thông báo hộ dân</option>
                <option value="missing_journal">Chưa có nhật ký</option>
              </select>
            </div>
          </div>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Hộ nông dân</th>
                  <th>Thôn</th>
                  <th>Thửa / Giống</th>
                  <th>Căn cứ nhật ký chăm sóc</th>
                  <th>An toàn cách ly PHI</th>
                  <th>Ngày cắt dự kiến</th>
                  <th>SL ước tính</th>
                  <th>Trạng thái</th>
                  {canUpdateHarvest && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                <ListStatusRow
                  colSpan={canUpdateHarvest ? 9 : 8}
                  loading={harvestPlans.loading}
                  error={harvestPlans.error}
                  empty={harvestPlans.rows.length === 0}
                  onRetry={harvestPlans.refresh}
                />
                {harvestPlans.rows.map((p) => {
                  const st = PLAN_STATUS_BADGE[p.planStatus] ?? PLAN_STATUS_BADGE.missing_journal;
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong style={{ color: "#14372f" }}>{p.householdName}</strong>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.householdCode}</div>
                      </td>
                      <td>{p.villageName || "—"}</td>
                      <td>
                        <div style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 700, color: "#14372f" }}>
                          {p.plotCode}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                          {p.variety} - {formatVn(p.areaHa, 2)} ha
                        </div>
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 260 }}>
                        <div>{p.calculationBasis}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {p.journalCount} lượt ghi nhật ký chăm sóc
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.phiSafeOn ? (
                          <span style={{ color: p.inIsolation ? "#b45309" : "#166534", fontWeight: 600 }}>
                            {p.inIsolation ? `Cách ly đến ${p.phiSafeOn}` : `An toàn (sau ${p.phiSafeOn})`}
                          </span>
                        ) : (
                          <span style={{ color: "#166534" }}>Không vướng cách ly</span>
                        )}
                      </td>
                      <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: p.computedHarvestOn ? "#166534" : "var(--text-muted)" }}>
                        {p.computedHarvestOn || "Chưa đủ dữ liệu"}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        ~{formatVn(p.estimatedYieldKg, 0)} kg
                      </td>
                      <td>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                        {p.notifiedAt && (
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                            Gửi: {p.notifiedAt.slice(0, 10)}
                          </div>
                        )}
                      </td>
                      {canUpdateHarvest && (
                        <td className="table-actions-cell">
                          <div className="table-actions">
                            <button
                              type="button"
                              className={`btn ${p.planStatus === "notified" ? "btn-outline" : "btn-primary"} btn-sm`}
                              onClick={() => setNotifyingPlan(p)}
                              title="Tính toán hoặc điều chỉnh ngày thu hoạch và gửi thông báo tới tài khoản hộ dân"
                            >
                              <span>{p.planStatus === "notified" ? "Gửi lại lịch" : "Thông báo hộ dân"}</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: CẤP PHÁT TEM NÔNG HỘ ─── */}
      {tab === "stamps" && canReadStamps && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">Quản lý cấp phát dải tem QR cho nông hộ</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220 }}
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
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 700, color: "#166534" }}>
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
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                      {s.fromSerial} → {s.toSerial}
                    </td>
                    <td>
                      <span
                        className={`badge ${s.status === "active" ? "badge-green" : s.status === "revoked" ? "badge-red" : "badge-blue"
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
                        {s.status === "active" && canUpdateStamps && (
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
      {tab === "contracts" && canReadContracts && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="card-header-left">Hợp đồng thu mua bao tiêu nông sản (HTX ↔ Doanh nghiệp)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                className="filter-input"
                style={{ width: 220 }}
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
                      <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 700, color: "#1e3a8a" }}>{c.code}</td>
                      <td>
                        <strong style={{ display: "block", color: "#14372f", fontSize: 13 }}>{c.title}</strong>
                        {c.notes && <small style={{ color: "#64748b" }}>{c.notes}</small>}
                      </td>
                      <td>
                        <strong style={{ color: "#166534" }}>{c.enterpriseName}</strong>
                      </td>
                      <td
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "#166534",
                          fontFamily: "var(--font-num-stack)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {c.packhouseCode || "VN-DLPH-0089"}
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
                          {canUpdateContract && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingContract(c)}>
                              Sửa
                            </button>
                          )}
                          {canDeleteContract && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingContract(c)}>
                              Xóa
                            </button>
                          )}
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

      {/* ─── TAB 5: DOANH NGHIỆP & CƠ SỞ ĐÓNG GÓI PHC + MÃ VÙNG PUC THỜI GIAN THỰC ─── */}
      {tab === "enterprises" && canReadEnterprises && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
              <div className="card-header-left">
                Trạng thái thời gian thực Mã số vùng trồng (PUC - kiểm tra trực tiếp khi quét QR)
              </div>
            </div>
            <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>Mã số vùng trồng (PUC)</th>
                    <th>Tên vùng</th>
                    <th>Địa bàn hành chính</th>
                    <th>Hiệu lực đến</th>
                    <th>Trạng thái thời gian thực</th>
                    {canUpdateHarvest && <th>Điều chỉnh trạng thái</th>}
                  </tr>
                </thead>
                <tbody>
                  {growingZones.loading ? (
                    <tr>
                      <td colSpan={canUpdateHarvest ? 6 : 5} className="empty-state">
                        Đang tải danh sách mã vùng trồng…
                      </td>
                    </tr>
                  ) : zoneRows.length === 0 ? (
                    <tr>
                      <td colSpan={canUpdateHarvest ? 6 : 5} className="empty-state">
                        Chưa có dữ liệu mã số vùng trồng.
                      </td>
                    </tr>
                  ) : (
                    zoneRows.map((z) => (
                      <tr key={z.code}>
                        <td style={{ fontFamily: "var(--font-num-stack)", fontWeight: 700, color: "#166534" }}>{z.code}</td>
                        <td style={{ fontWeight: 600 }}>{z.name}</td>
                        <td style={{ fontSize: 12.5 }}>
                          {z.commune}, {z.district}, {z.province}
                        </td>
                        <td>{z.validUntil ? String(z.validUntil).slice(0, 10) : "2027-12-31"}</td>
                        <td>
                          <span
                            className={`badge ${z.status === "active"
                              ? "badge-green"
                              : z.status === "suspended"
                                ? "badge-gold"
                                : z.status === "revoked"
                                  ? "badge-red"
                                  : "badge-gray"
                              }`}
                          >
                            {z.status === "active"
                              ? "Còn hiệu lực"
                              : z.status === "suspended"
                                ? "Tạm dừng hiệu lực"
                                : z.status === "revoked"
                                  ? "Đã thu hồi mã"
                                  : "Đang thẩm định"}
                          </span>
                        </td>
                        {canUpdateHarvest && (
                          <td>
                            <select
                              className="filter-select"
                              style={{ minWidth: 165 }}
                              value={z.status}
                              onChange={(ev) =>
                                void handleZoneStatusChange(z.code, ev.target.value as GrowingZoneRow["status"])
                              }
                            >
                              <option value="active">Còn hiệu lực</option>
                              <option value="suspended">Tạm dừng hiệu lực</option>
                              <option value="revoked">Đã thu hồi mã vùng</option>
                              <option value="pending">Đang thẩm định</option>
                            </select>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
              <div className="card-header-left">Hồ sơ pháp lý Doanh nghiệp &amp; Cơ sở đóng gói (Packhouse)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  className="filter-input"
                  style={{ width: 220 }}
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
                  {enterprises.rows.map((e) => {
                    const eb = ENTERPRISE_STATUS_BADGE[e.status] ?? ENTERPRISE_STATUS_BADGE.inactive;
                    return (
                      <tr key={e.id}>
                        <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 700, color: "#166534" }}>{e.code}</td>
                        <td>
                          <strong style={{ color: "#14372f", fontSize: 13.5 }}>{e.name}</strong>
                        </td>
                        <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}>{e.taxCode || "—"}</td>
                        <td>{e.representative || "—"}</td>
                        <td>{e.phone || "—"}</td>
                        <td
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "#065f46",
                            fontFamily: "var(--font-num-stack)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {e.packhouseCode || "VN-DLPH-0089"}
                        </td>
                        <td style={{ fontSize: 12, color: "#475569", maxWidth: 260 }}>{e.address || "—"}</td>
                        <td>
                          <span className={`badge ${eb.cls}`}>{eb.label}</span>
                        </td>
                        <td className="table-actions-cell">
                          <div className="table-actions">
                            {canUpdateEnterprise && (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingEnterprise(e)}>
                                Sửa
                              </button>
                            )}
                            {canDeleteEnterprise && (
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingEnterprise(e)}>
                                Xóa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
      {incidentLotCode !== null && (
        <IncidentTraceModal
          initialLotCode={incidentLotCode || undefined}
          onClose={() => setIncidentLotCode(null)}
        />
      )}

      {/* Modal thông báo lịch thu hoạch tới hộ dân */}
      {notifyingPlan && canUpdateHarvest && (
        <HarvestPlanNotifyModal
          plan={notifyingPlan}
          onClose={() => setNotifyingPlan(null)}
          onDone={() => {
            setNotifyingPlan(null);
            void harvestPlans.refresh();
          }}
        />
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

      {scanningQr && <QrScannerModal onClose={() => setScanningQr(false)} />}
      {viewingTraceLogs && <TraceAccessLogsModal onClose={() => setViewingTraceLogs(false)} />}
      {viewingPlotQuotas && (
        <PlotQuotasModal canEdit={canUpdateHarvest} onClose={() => setViewingPlotQuotas(false)} />
      )}
      {viewingFieldPasses && (
        <FieldAuditPassesModal
          canEdit={canUpdateHarvest}
          canEditEndorsement={canEditEndorsement}
          onClose={() => setViewingFieldPasses(false)}
        />
      )}
    </>
  );
}
