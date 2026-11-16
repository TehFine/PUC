"use client";

import { FormEvent, useMemo, useState } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { todayIso } from "@/components/admin/shared/form-utils";
import TableState from "@/components/admin/shared/TableState";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { ShareBar } from "@/components/ui/charts/KpiCharts";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import type { Option } from "@/components/ui/form/fields";
import { useApi } from "@/hooks/use-api";
import { invalidateQueries, NOTIFICATIONS_PATH } from "@/hooks/use-portal";
import { api, errorMessage } from "@/lib/api-client";
import type {
  AdminCarePlanSummary,
  AdminCareProtocolListResponse,
  CareMilestoneDeclaration,
  CareProtocolCatalogResponse,
  CareProtocolScanResponse,
  ConfigurePlotCarePlanBody,
  PlanOverallHealth,
  PlotCarePlanTimeline,
} from "@/types/care-protocol";
import { StoredMediaGallery } from "@/components/portal/shared/controls";
import { formatDate, formatDateTime } from "@/utils/format";

function healthMeta(
  health: PlanOverallHealth,
  daysOverdue = 0,
): { label: string; bg: string; border: string; color: string } {
  if (health === "completed") {
    return { label: "Hoàn tất 8 giai đoạn", bg: "#f2f8f4", border: "#bcd9c7", color: "#15803d" };
  }
  if (health === "overdue_critical") {
    return { label: `Quá hạn ${daysOverdue || 5} ngày`, bg: "#fff5f3", border: "#efc2b8", color: "#b91c1c" };
  }
  if (health === "overdue") {
    return { label: `Trễ ${daysOverdue || 1} ngày`, bg: "#fdf8ed", border: "#ead19c", color: "#9a6712" };
  }
  if (health === "due_now") {
    return { label: "Đến lịch hôm nay", bg: "#f3f7f5", border: "#c6d6cf", color: "#14372f" };
  }
  return { label: "Đúng tiến độ", bg: "#f2f8f4", border: "#bcd9c7", color: "#15803d" };
}

function AdminConfigurePlanModal({
  householdOptions,
  initialSummary,
  onSaved,
  onClose,
}: {
  householdOptions: Option[];
  initialSummary?: AdminCarePlanSummary | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const catalog = useApi<CareProtocolCatalogResponse>("/care-protocol/catalog");
  const milestones = catalog.data?.milestones ?? [];

  const [householdId, setHouseholdId] = useState<string>(
    initialSummary ? String(initialSummary.householdId) : (householdOptions[0]?.value ?? ""),
  );
  const [plotCode, setPlotCode] = useState<string>(initialSummary?.plotCode ?? "");
  const [mode, setMode] = useState<"current_milestone" | "start_cycle">("current_milestone");
  const [milestoneCode, setMilestoneCode] = useState<string>(
    initialSummary?.activeMilestone?.code ?? "cb-rua-vuon",
  );
  const [anchorDate, setAnchorDate] = useState<string>(todayIso());
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!householdId) {
      setError("Vui lòng chọn hộ nông dân.");
      return;
    }
    if (!plotCode.trim()) {
      setError("Vui lòng nhập mã thửa đất.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: ConfigurePlotCarePlanBody = {
        householdId: Number(householdId),
        plotCode: plotCode.trim(),
        mode,
        anchorDate,
        milestoneCode: mode === "current_milestone" ? milestoneCode : undefined,
        note: note.trim() || undefined,
      };
      await api.post("/care-protocol/configure", body);
      toast.success(`Đã đồng bộ lộ trình chăm sóc cho Thửa ${plotCode.trim()}`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Không thể thiết lập lộ trình chăm sóc."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Thiết lập và đồng bộ lộ trình chăm sóc 2026-2027"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="submit" form="admin-care-plan-form" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu và gửi thông báo cho hộ"}
          </button>
        </>
      }
    >
      <form id="admin-care-plan-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="cp-admin-form-grid">
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Hộ nông dân
            </label>
            <select
              className="filter-select"
              style={{ width: "100%" }}
              value={householdId}
              onChange={(e) => setHouseholdId(e.target.value)}
              required
            >
              <option value="">Chọn hộ nông dân</option>
              {householdOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Mã thửa đất
            </label>
            <input
              type="text"
              className="filter-input"
              style={{ width: "100%", fontVariantNumeric: "tabular-nums" }}
              placeholder="Ví dụ: CN-H001-T01"
              value={plotCode}
              onChange={(e) => setPlotCode(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
            Chế độ thiết lập
          </label>
          <select
            className="filter-select"
            style={{ width: "100%" }}
            value={mode}
            onChange={(e) => setMode(e.target.value as "current_milestone" | "start_cycle")}
          >
            <option value="current_milestone">Đồng bộ theo giai đoạn thực tế hiện nay của vườn</option>
            <option value="start_cycle">Bắt đầu chu kỳ đầu vụ từ Ngày 0 (Rửa vườn)</option>
          </select>
        </div>

        {mode === "current_milestone" && (
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Mốc giai đoạn hiện tại của vườn
            </label>
            <select
              className="filter-select"
              style={{ width: "100%" }}
              value={milestoneCode}
              onChange={(e) => setMilestoneCode(e.target.value)}
            >
              {milestones.map((m) => (
                <option key={m.code} value={m.code}>
                  GĐ {m.stageOrder} {m.stageName} - {m.dayLabel} ({m.treeState})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
            {mode === "current_milestone" ? "Ngày bắt đầu mốc hiện tại" : "Ngày bắt đầu chu kỳ đầu vụ"}
          </label>
          <input
            type="date"
            className="filter-input"
            style={{ width: "100%", fontVariantNumeric: "tabular-nums" }}
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
            Ghi chú kỹ thuật (tùy chọn)
          </label>
          <input
            type="text"
            className="filter-input"
            style={{ width: "100%" }}
            maxLength={400}
            placeholder="Ghi chú hướng dẫn cho hộ dân..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <FormError message={error} />
      </form>
    </Modal>
  );
}

function DeclarationPhotosPreview({ decl }: { decl: CareMilestoneDeclaration }) {
  const hasField = Boolean(decl.fieldPhotoUrls?.length || decl.fieldPhotoUrl);
  const hasInvoice = Boolean(decl.invoicePhotoUrls?.length || decl.invoicePhotoUrl);
  if (!hasField && !hasInvoice) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      {hasField && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Ảnh và video hiện trường vườn
          </div>
          <StoredMediaGallery
            urls={decl.fieldPhotoUrls}
            fallbackUrl={decl.fieldPhotoUrl}
            altPrefix={`Hiện trường thửa ${decl.plotCode}`}
            compact
          />
        </div>
      )}
      {hasInvoice && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Ảnh hóa đơn và bao bì vật tư
          </div>
          <StoredMediaGallery
            urls={decl.invoicePhotoUrls}
            fallbackUrl={decl.invoicePhotoUrl}
            altPrefix={`Hóa đơn vật tư thửa ${decl.plotCode}`}
            compact
          />
        </div>
      )}
    </div>
  );
}

function AdminCarePlanDetailModal({
  planId,
  onConfigure,
  onClose,
}: {
  planId: number;
  onConfigure: () => void;
  onClose: () => void;
}) {
  const detail = useApi<PlotCarePlanTimeline>(`/care-protocol/${planId}`);
  const plan = detail.data;

  return (
    <Modal
      title={plan ? `Lộ trình Thửa ${plan.plotCode} - ${plan.householdName}` : "Chi tiết lộ trình chăm sóc"}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onConfigure}>
            Điều chỉnh giai đoạn
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      {detail.loading && <div style={{ padding: 24, textAlign: "center" }}>Đang tải chi tiết 27 mốc quy trình...</div>}
      {detail.error && <FormError message={detail.error} />}
      {plan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="cp-admin-summary-grid">
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Hộ canh tác</div>
              <div style={{ fontWeight: 600 }}>
                {plan.householdName} ({plan.householdCode})
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Địa bàn</div>
              <div style={{ fontWeight: 600 }}>{plan.villageName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Tiến độ quy trình</div>
              <div style={{ fontWeight: 600, color: "#15803d" }}>
                {plan.completedCount}/{plan.totalApplicableCount} mốc ({plan.progressPct}%)
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Cảnh báo sai lệch</div>
              <div style={{ fontWeight: 600, color: plan.deviationCount > 0 ? "#9a6712" : "#15803d" }}>
                {plan.deviationCount > 0 ? `${plan.deviationCount} mốc cần lưu ý` : "Tuân thủ tốt"}
              </div>
            </div>
          </div>

          <div className="cp-admin-milestone-scroll">
            {plan.milestones.map((m) => {
              const decl = m.declaration;
              const bg = decl
                ? decl.complianceStatus === "violation"
                  ? "#fff5f3"
                  : "#f8fbf9"
                : m.state === "overdue" || m.state === "overdue_critical"
                  ? "#fdf8ed"
                  : "#ffffff";
              const actionSteps = (m.actionSummary || "")
                .split(/(?<![0-9])\.\s+|;\s+/)
                .map((part) => part.trim().replace(/\.+$/, "").trim())
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

              return (
                <div key={m.code} className="cp-admin-milestone-card" style={{ background: bg }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13.5 }}>
                      GĐ {m.stageOrder} {m.stageName} - {m.dayLabel}
                    </strong>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      Lịch: {formatDate(m.scheduledOn)} đến {formatDate(m.dueOn)}
                    </span>
                  </div>

                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.8, color: "var(--text-primary)" }}>
                    <div>
                      <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Cây tại vườn: </span>
                      <strong>{m.treeState}</strong>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Việc cần làm:</span>
                      {actionSteps.map((st, idx) => (
                        <div key={idx} style={{ paddingLeft: actionSteps.length > 1 ? 8 : 0 }}>
                          {actionSteps.length > 1 ? `${idx + 1}. ${st}` : st}
                        </div>
                      ))}
                    </div>
                  </div>

                    {decl ? (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                          <span>
                            <strong>Ngày làm:</strong> {formatDate(decl.performedOn)} -{" "}
                            <strong>Khai báo lúc:</strong> {formatDateTime(decl.declaredAt || decl.createdAt)}
                            {(decl.lateDeclarationDays ?? 0) > 0 && (
                              <strong style={{ color: "#9a6712", marginLeft: 6 }}>
                                (Chậm {decl.lateDeclarationDays} ngày)
                              </strong>
                            )}
                          </span>
                          <span
                            style={{
                              fontWeight: 600,
                              color:
                                decl.complianceStatus === "violation"
                                  ? "#b91c1c"
                                  : decl.complianceStatus === "warning"
                                    ? "#9a6712"
                                    : "#15803d",
                            }}
                          >
                            {decl.complianceStatus === "violation"
                              ? "Vi phạm phác đồ"
                              : decl.complianceStatus === "warning"
                                ? "Có điều chỉnh"
                                : "Đúng phác đồ"}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                          Cây thực tế: <strong>{decl.actualTreeState}</strong> - Liều: <strong>{decl.actualDosage}</strong>
                          {decl.lateReason ? ` - Lý do báo muộn: ${decl.lateReason}` : ""}
                        </div>

                      {decl.complianceIssues?.length > 0 && (
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "#9a3412" }}>
                          {decl.complianceIssues.map((iss, idx) => (
                            <li key={idx}>{iss.message}</li>
                          ))}
                        </ul>
                      )}

                      <DeclarationPhotosPreview decl={decl} />
                    </div>
                  ) : (
                    <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                      {m.state === "skipped_prior"
                        ? "Mốc trước thời điểm đồng bộ vườn"
                        : m.state === "overdue" || m.state === "overdue_critical"
                          ? `Chưa khai báo (Trễ ${m.daysOverdue} ngày)`
                          : "Chưa đến kỳ hoặc chờ hộ khai báo"}
                    </div>
                  )}
                </div>
              );
            })}

            {plan.senProDeclarations.length > 0 && (
              <div style={{ marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                <strong style={{ display: "block", fontSize: 13.5, marginBottom: 6 }}>
                  Nhật ký chặn đọt SenPro ({plan.senProDeclarations.length} lần)
                </strong>
                {plan.senProDeclarations.map((decl) => (
                  <div key={decl.id} className="cp-admin-milestone-card" style={{ marginBottom: 8, fontSize: 12.5 }}>
                    <div>
                      <strong>{formatDate(decl.performedOn)}</strong> - Đọt {decl.actualTreeState} - {decl.actualDosage}
                    </div>
                    <DeclarationPhotosPreview decl={decl} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function CareProtocolAdminTab({
  householdOptions,
  canUpdate,
  onDataChanged,
}: {
  householdOptions: Option[];
  canUpdate: boolean;
  onDataChanged?: () => void;
}) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [householdId, setHouseholdId] = useState<string>("");
  const [scanning, setScanning] = useState(false);

  const [configuringTarget, setConfiguringTarget] = useState<AdminCarePlanSummary | "new" | null>(null);
  const [viewingPlanId, setViewingPlanId] = useState<number | null>(null);

  const queryPath = useMemo(() => {
    const sp = new URLSearchParams();
    if (debouncedQ) sp.set("q", debouncedQ);
    if (stateFilter && stateFilter !== "all") sp.set("state", stateFilter);
    if (householdId) sp.set("householdId", householdId);
    const qs = sp.toString();
    return `/care-protocol${qs ? `?${qs}` : ""}`;
  }, [debouncedQ, stateFilter, householdId]);

  const list = useApi<AdminCareProtocolListResponse>(queryPath);
  const rows = list.data?.data ?? [];
  const kpi = list.data?.kpi ?? {
    totalPlans: 0,
    onTrack: 0,
    dueNow: 0,
    overdue: 0,
    deviated: 0,
    completed: 0,
  };
  const denom = Math.max(kpi.totalPlans, 1);

  const runManualScan = async () => {
    setScanning(true);
    try {
      const res = await api.post<CareProtocolScanResponse>("/care-protocol/scan", {});
      toast.success(
        `Đã rà soát ${res.scanned} thửa: gửi ${res.dueNotifications} nhắc lịch, ${res.overdueWarnings} cảnh báo trễ hạn và ${res.criticalViolations} cảnh báo quá hạn nghiêm trọng.`,
      );
      void list.refresh();
      invalidateQueries(NOTIFICATIONS_PATH);
      notifyCountsChanged();
      onDataChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể chạy rà soát lộ trình chăm sóc."));
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
      <div className="compliance-kpi" style={{ marginBottom: 16 }}>
        <div className="comp-kpi-item ok">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{kpi.onTrack + kpi.completed}</div>
            <div className="comp-kpi-label">Thửa đúng tiến độ ({kpi.totalPlans} tổng)</div>
          </div>
          <ShareBar value={kpi.onTrack + kpi.completed} total={denom} tone="lime" ariaLabel="Thửa đúng tiến độ" />
        </div>

        <div className="comp-kpi-item info">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{kpi.dueNow}</div>
            <div className="comp-kpi-label">Thửa đến lịch cần khai báo</div>
          </div>
          <ShareBar value={kpi.dueNow} total={denom} tone="lime" ariaLabel="Thửa đến lịch" />
        </div>

        <div className="comp-kpi-item warn">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{kpi.overdue}</div>
            <div className="comp-kpi-label">Thửa trễ hạn chưa khai báo</div>
          </div>
          <ShareBar value={kpi.overdue} total={denom} tone="amber" ariaLabel="Thửa trễ hạn" />
        </div>

        <div className="comp-kpi-item danger">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{kpi.deviated}</div>
            <div className="comp-kpi-label">Thửa có sai lệch phác đồ</div>
          </div>
          <ShareBar value={kpi.deviated} total={denom} tone="rose" ariaLabel="Thửa sai lệch phác đồ" />
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 210 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo hộ dân, mã thửa, thôn buôn..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={stateFilter}
          aria-label="Lọc theo trạng thái tiến độ"
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value="all">Tất cả trạng thái lộ trình</option>
          <option value="overdue">Trễ hạn chưa khai báo</option>
          <option value="deviated">Có sai lệch phác đồ</option>
          <option value="due_now">Đến lịch hôm nay</option>
          <option value="on_track">Đúng tiến độ</option>
          <option value="completed">Đã hoàn tất 8 giai đoạn</option>
        </select>

        <select
          className="filter-select"
          value={householdId}
          aria-label="Lọc theo hộ nông dân"
          onChange={(e) => setHouseholdId(e.target.value)}
        >
          <option value="">Tất cả hộ nông dân</option>
          {householdOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {canUpdate && (
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => void runManualScan()}
              disabled={scanning}
            >
              {scanning ? "Đang quét..." : "Rà soát và gửi cảnh báo"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setConfiguringTarget("new")}
            >
              Thiết lập lộ trình hộ
            </button>
          </>
        )}
      </div>

      <div className="table-wrap">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Hộ nông dân</th>
              <th>Mã thửa</th>
              <th>Tiến độ</th>
              <th>Giai đoạn đang thực hiện</th>
              <th>Hạn hoàn thành</th>
              <th>Trạng thái</th>
              <th>Khai báo gần nhất</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={8}
              loading={list.loading}
              error={list.error}
              empty={rows.length === 0}
              emptyText="Chưa có thửa vườn nào khớp bộ lọc tiến độ quy trình"
              onRetry={() => void list.refresh()}
            />

            {rows.map((row) => {
              const meta = healthMeta(row.overallHealth, row.activeMilestone?.daysOverdue ?? 0);

              return (
                <tr key={row.id}>
                  <td data-label="Hộ nông dân">
                    <div style={{ fontWeight: 600 }}>{row.householdName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.villageName}</div>
                  </td>
                  <td data-label="Mã thửa">
                    <span className="cp-admin-plot-code">{row.plotCode}</span>
                  </td>
                  <td data-label="Tiến độ" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <div style={{ fontWeight: 600 }}>
                      {row.completedCount}/{row.totalApplicableCount} mốc ({row.progressPct}%)
                    </div>
                    {row.deviationCount > 0 && (
                      <div style={{ fontSize: 11.5, color: "#9a6712", fontWeight: 600 }}>
                        {row.deviationCount} mốc có lưu ý
                      </div>
                    )}
                  </td>
                  <td data-label="Giai đoạn hiện tại" className="cp-admin-stage-cell">
                    {row.activeMilestone ? (
                      <>
                        <div style={{ fontWeight: 600 }}>
                          GĐ {row.activeMilestone.stageOrder}: {row.activeMilestone.stageName} ({row.activeMilestone.dayLabel})
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          Cây: {row.activeMilestone.treeState}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: "#15803d", fontWeight: 600 }}>Đã hoàn thành đủ 27 mốc</span>
                    )}
                  </td>
                  <td data-label="Hạn hoàn thành" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {row.activeMilestone ? formatDate(row.activeMilestone.dueOn) : "Hoàn tất"}
                  </td>
                  <td data-label="Trạng thái">
                    <span
                      className="cp-admin-status-tag"
                      style={{
                        background: meta.bg,
                        borderColor: meta.border,
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td data-label="Khai báo gần nhất" style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                    {row.latestDeclaration ? (
                      <div>
                        <div>Làm: {formatDate(row.latestDeclaration.performedOn)}</div>
                        <div
                          style={{
                            color: (row.latestDeclaration.lateDeclarationDays ?? 0) > 0 ? "#9a6712" : "var(--text-muted)",
                            fontSize: 11.5,
                            fontWeight: (row.latestDeclaration.lateDeclarationDays ?? 0) > 0 ? 600 : 400,
                          }}
                        >
                          {(row.latestDeclaration.lateDeclarationDays ?? 0) > 0
                            ? `Báo chậm ${row.latestDeclaration.lateDeclarationDays} ngày (nhắc sớm ${row.reminderLeadDays ?? 2}n)`
                            : "Khai báo đúng ngày"}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>Chưa có</span>
                    )}
                  </td>
                  <td data-label="Thao tác" className="table-actions-cell">
                    <div className="table-actions" style={{ display: "inline-flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setViewingPlanId(row.id)}
                      >
                        Xem minh chứng
                      </button>
                      {canUpdate && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setConfiguringTarget(row)}
                        >
                          Đồng bộ
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

      {configuringTarget && (
        <AdminConfigurePlanModal
          householdOptions={householdOptions}
          initialSummary={configuringTarget === "new" ? null : configuringTarget}
          onSaved={() => {
            void list.refresh();
            onDataChanged?.();
          }}
          onClose={() => setConfiguringTarget(null)}
        />
      )}

      {viewingPlanId !== null && (
        <AdminCarePlanDetailModal
          planId={viewingPlanId}
          onConfigure={() => {
            const found = rows.find((r) => r.id === viewingPlanId) ?? null;
            setViewingPlanId(null);
            setConfiguringTarget(found ?? "new");
          }}
          onClose={() => setViewingPlanId(null)}
        />
      )}
    </>
  );
}
