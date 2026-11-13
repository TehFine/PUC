"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ShareBar } from "@/components/ui/charts/KpiCharts";
import { useApi, useApiList } from "@/hooks/use-api";
import BlockState from "@/components/admin/shared/BlockState";
import DeleteDialog from "@/components/admin/shared/DeleteDialog";
import Pagination from "@/components/admin/shared/Pagination";
import TabBar, { type TabItem } from "@/components/admin/shared/TabBar";
import TableState from "@/components/admin/shared/TableState";
import { formatVn } from "@/components/admin/shared/form-utils";
import { badgeOf, MRL_STATUS, optionsOf, SEVERITY, VIOLATION_STATUS } from "@/components/admin/shared/labels";
import { useHouseholdOptions, usePesticideOptions } from "@/components/admin/shared/options";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { getZoneColor } from "@/components/zones/zone-data";
import { JournalDetailModal, JournalFormModal } from "@/components/admin/journal/JournalModals";
import SprayFormModal from "@/components/admin/journal/SprayFormModal";
import {
  ViolationDetailModal,
  ViolationFormModal,
  ViolationResolveModal,
} from "@/components/admin/journal/ViolationModals";
import { formatDate } from "@/utils/format";
import type { DashboardSummary } from "@/types/dashboard";
import type { JournalRow, SprayRow, ViolationRow } from "@/types/journal";

type Tab = "journal" | "violations" | "spray";
const PAGE_SIZE = 25;

const SEVERITY_OPTIONS = optionsOf(SEVERITY);
const VIOLATION_STATUS_OPTIONS = optionsOf(VIOLATION_STATUS);
const MRL_OPTIONS = optionsOf(MRL_STATUS);

export default function Journal() {
  const { can } = useAuth();
  const canReadViolations = can("violations", "read");

  const canCreateJournal = can("journal", "create");
  const canUpdateJournal = can("journal", "update");
  const canDeleteJournal = can("journal", "delete");

  const canCreateViolation = can("violations", "create");
  const canUpdateViolation = can("violations", "update");
  const canDeleteViolation = can("violations", "delete");

  const canCreateSpray = can("spray", "create");
  const canUpdateSpray = can("spray", "update");
  const canDeleteSpray = can("spray", "delete");

  const [tab, setTab] = useState<Tab>("journal");

  // Modals for Spray (khai báo sớm để chỉ tải danh mục thuốc BVTV khi cần mở biểu mẫu)
  const [editingSpray, setEditingSpray] = useState<SprayRow | "new" | null>(null);
  const [deletingSpray, setDeletingSpray] = useState<SprayRow | null>(null);

  // Options for selectors
  const { households, options: householdOptions } = useHouseholdOptions();
  const { pesticides, options: pesticideOptions } = usePesticideOptions(Boolean(editingSpray));

  // Dashboard summary for real KPIs
  const { data: summary, refresh: refreshSummary } = useApi<DashboardSummary>("/dashboard/summary");

  // Filters & pagination for Journal
  const [jSearch, setJSearch] = useState("");
  const debouncedJSearch = useDebounced(jSearch);
  const [jHouseholdId, setJHouseholdId] = useState("");
  const [jPage, setJPage] = useState(1);

  // Filters & pagination for Violations
  const [vSearch, setVSearch] = useState("");
  const debouncedVSearch = useDebounced(vSearch);
  const [vSeverity, setVSeverity] = useState("");
  const [vStatus, setVStatus] = useState("");
  const [vPage, setVPage] = useState(1);

  // Filters & pagination for Spray
  const [sSearch, setSSearch] = useState("");
  const debouncedSSearch = useDebounced(sSearch);
  const [sMrl, setSMrl] = useState("");
  const [sPage, setSPage] = useState(1);

  const journalList = useApiList<JournalRow>("journal", {
    q: debouncedJSearch || undefined,
    householdId: jHouseholdId || undefined,
    page: jPage,
    pageSize: PAGE_SIZE,
  });

  const violationsList = useApiList<ViolationRow>(canReadViolations ? "violations" : null, {
    q: debouncedVSearch || undefined,
    severity: vSeverity || undefined,
    status: vStatus || undefined,
    page: vPage,
    pageSize: PAGE_SIZE,
  });

  const sprayList = useApiList<SprayRow>("spray", {
    q: debouncedSSearch || undefined,
    mrlStatus: sMrl || undefined,
    page: sPage,
    pageSize: PAGE_SIZE,
  });

  // Compute real KPIs from summary & loaded lists (no hardcoded numbers)
  const totalHouseholds = summary?.counts?.households ?? households.length;
  const qualifiedHouseholds =
    summary?.counts?.qualifiedHouseholds ?? households.filter((h) => h.status === "qualified").length;
  const improveHouseholds = households.filter((h) => h.status === "improve" || h.status === "pending").length;
  const openViolations =
    summary?.counts?.openViolations ??
    (canReadViolations ? violationsList.rows.filter((v) => v.status === "open").length : 0);
  const journalRecent = summary?.counts?.journalLast30Days ?? journalList.total;
  const kpiDenom = Math.max(totalHouseholds, 1);

  // Modals for Journal
  const [viewingJournal, setViewingJournal] = useState<JournalRow | null>(null);
  const [editingJournal, setEditingJournal] = useState<JournalRow | "new" | null>(null);
  const [deletingJournal, setDeletingJournal] = useState<JournalRow | null>(null);

  // Modals for Violations
  const [viewingViolation, setViewingViolation] = useState<ViolationRow | null>(null);
  const [resolvingViolation, setResolvingViolation] = useState<ViolationRow | null>(null);
  const [editingViolation, setEditingViolation] = useState<ViolationRow | "new" | null>(null);
  const [deletingViolation, setDeletingViolation] = useState<ViolationRow | null>(null);

  const tabs: TabItem<Tab>[] = [
    { id: "journal", label: "Nhật ký canh tác", badge: journalList.total },
    ...(canReadViolations
      ? [{ id: "violations" as const, label: "Vi phạm", badge: openViolations || violationsList.total }]
      : []),
    { id: "spray", label: "Nhật ký phun thuốc", badge: sprayList.total },
  ];

  const activeTab: Tab = !canReadViolations && tab === "violations" ? "journal" : tab;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Nhật Ký Canh Tác &amp; Tuân Thủ</h1>
        </div>
        <div className="header-actions">
          {canCreateJournal && (
            <button type="button" className="btn btn-primary" onClick={() => setEditingJournal("new")}>
              Ghi nhật ký
            </button>
          )}
          {canReadViolations && canCreateViolation && (
            <button type="button" className="btn btn-outline" onClick={() => setEditingViolation("new")}>
              Ghi nhận vi phạm
            </button>
          )}
          {canCreateSpray && (
            <button type="button" className="btn btn-outline" onClick={() => setEditingSpray("new")}>
              Ghi phun thuốc
            </button>
          )}
        </div>
      </div>

      <div className="compliance-kpi">
        <div className="comp-kpi-item ok">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{qualifiedHouseholds}</div>
            <div className="comp-kpi-label">Hộ đủ chuẩn xuất khẩu</div>
          </div>
          <ShareBar value={qualifiedHouseholds} total={kpiDenom} tone="lime" ariaLabel="Hộ đủ chuẩn xuất khẩu" />
        </div>
        <div className="comp-kpi-item warn">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{improveHouseholds}</div>
            <div className="comp-kpi-label">Hộ cần cải thiện / chờ duyệt</div>
          </div>
          <ShareBar value={improveHouseholds} total={kpiDenom} tone="amber" ariaLabel="Hộ cần cải thiện" />
        </div>
        <div className="comp-kpi-item danger">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{openViolations}</div>
            <div className="comp-kpi-label">Vi phạm đang mở</div>
          </div>
          <ShareBar value={openViolations} total={kpiDenom} tone="rose" ariaLabel="Vi phạm đang mở" />
        </div>
        <div className="comp-kpi-item info">
          <div className="comp-kpi-head">
            <div className="comp-kpi-num">{journalRecent}</div>
            <div className="comp-kpi-label">Bản ghi nhật ký</div>
          </div>
          <ShareBar
            value={Math.min(journalRecent, Math.max(journalList.total, 1))}
            total={Math.max(journalList.total, 1)}
            tone="sky"
            ariaLabel="Bản ghi nhật ký"
          />
        </div>
      </div>

      <TabBar tabs={tabs} active={activeTab} onChange={setTab} />

      {activeTab === "journal" && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo hộ, mã thửa, hoạt động, người ghi…"
                value={jSearch}
                onChange={(e) => {
                  setJSearch(e.target.value);
                  setJPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={jHouseholdId}
              aria-label="Lọc theo hộ nông dân"
              onChange={(e) => {
                setJHouseholdId(e.target.value);
                setJPage(1);
              }}
            >
              <option value="">Tất cả hộ nông dân</option>
              {householdOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Hộ</th>
                  <th>Mã thửa</th>
                  <th>Hoạt động</th>
                  <th>Chi tiết</th>
                  <th>Người ghi</th>
                  <th>Ảnh</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={8}
                  loading={journalList.loading}
                  error={journalList.error}
                  empty={journalList.rows.length === 0}
                  emptyText="Chưa có nhật ký canh tác nào phù hợp"
                  onRetry={() => void journalList.refresh()}
                />
                {journalList.rows.map((j) => {
                  const zc = getZoneColor(j.plotCode);
                  return (
                  <tr key={j.id}>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(j.entryOn)}</td>
                    <td style={{ fontWeight: 500 }}>{j.householdName}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          fontFamily: "var(--font-num-stack)",
                          fontVariantNumeric: "tabular-nums",
                          letterSpacing: "0.015em",
                          fontSize: 12.5,
                          color: zc.text,
                          background: zc.bg,
                          border: "none",
                          padding: "4px 10px",
                          borderRadius: 8,
                          fontWeight: 700,
                        }}
                      >
                        {j.plotCode}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: "2px 8px",
                          background: "#f2f8f4",
                          color: "#256b45",
                          border: "1px solid #d5eadd",
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 500,
                        }}
                      >
                        {j.activity}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 220 }}>{j.detail || "—"}</td>
                    <td style={{ fontSize: 12 }}>{j.recorder}</td>
                    <td style={{ textAlign: "center" }}>
                      {j.hasPhoto || j.photoUrl ? (
                        <button
                          type="button"
                          className="badge badge-blue"
                          style={{ cursor: "pointer" }}
                          onClick={() => setViewingJournal(j)}
                        >
                          Có ảnh
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingJournal(j)}>
                          Xem
                        </button>
                        {canUpdateJournal && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingJournal(j)}>
                            Sửa
                          </button>
                        )}
                        {canDeleteJournal && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingJournal(j)}>
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
            <Pagination page={jPage} pageSize={PAGE_SIZE} total={journalList.total} unit="bản ghi" onChange={setJPage} />
          </div>
        </>
      )}

      {activeTab === "violations" && canReadViolations && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo tiêu đề vi phạm, hộ, mã thửa…"
                value={vSearch}
                onChange={(e) => {
                  setVSearch(e.target.value);
                  setVPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={vSeverity}
              aria-label="Lọc theo mức độ vi phạm"
              onChange={(e) => {
                setVSeverity(e.target.value);
                setVPage(1);
              }}
            >
              <option value="">Mọi mức độ</option>
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={vStatus}
              aria-label="Lọc theo trạng thái vi phạm"
              onChange={(e) => {
                setVStatus(e.target.value);
                setVPage(1);
              }}
            >
              <option value="">Mọi trạng thái</option>
              {VIOLATION_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {canCreateViolation && (
              <button type="button" className="btn btn-primary" onClick={() => setEditingViolation("new")}>
                Ghi nhận vi phạm
              </button>
            )}
          </div>

          <BlockState
            loading={violationsList.loading}
            error={violationsList.error}
            empty={violationsList.rows.length === 0}
            emptyText="Không có vi phạm nào phù hợp."
            onRetry={() => void violationsList.refresh()}
          />

          <div>
            {violationsList.rows.map((v) => {
              const sev = badgeOf(SEVERITY, v.severity);
              const st = badgeOf(VIOLATION_STATUS, v.status);
              return (
                <div key={v.id} className={`violation-item ${v.severity}`}>
                  <div className="violation-body">
                    <div className="violation-head">
                      <div className="violation-badges">
                        <span className={`badge ${sev.badge}`}>{sev.label}</span>
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                      </div>
                      <div className="violation-title">{v.title}</div>
                    </div>
                    {v.description && <div className="violation-desc">{v.description}</div>}
                    {v.farmerResponse && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          fontSize: 12.5,
                        }}
                      >
                        <strong>Giải trình của hộ:</strong> {v.farmerResponse}
                        {v.farmerResponsePhotoUrl && (
                          <span style={{ marginLeft: 8 }} className="badge badge-blue">
                            Kèm ảnh giải trình
                          </span>
                        )}
                      </div>
                    )}
                    {v.resolutionNotes && (
                      <div style={{ marginTop: 6, fontSize: 12.5, color: "#277a48" }}>
                        <strong>Kết quả xử lý ({formatDate(v.resolvedOn)}):</strong> {v.resolutionNotes}
                      </div>
                    )}
                    <div className="violation-meta">
                      <span>Hộ: {v.householdLabel}</span>
                      <span>Ngày: {formatDate(v.detectedOn)}</span>
                      <span>Thửa: {v.plotCode || "—"}</span>
                    </div>
                  </div>
                  <div className="violation-actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingViolation(v)}>
                      Chi tiết
                    </button>
                    {canUpdateViolation && v.status === "open" && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setResolvingViolation(v)}>
                        Xử lý
                      </button>
                    )}
                    {canUpdateViolation && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingViolation(v)}>
                        Sửa
                      </button>
                    )}
                    {canDeleteViolation && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingViolation(v)}>
                        Xóa
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeTab === "spray" && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo hộ, tên thuốc BVTV, nguồn gốc…"
                value={sSearch}
                onChange={(e) => {
                  setSSearch(e.target.value);
                  setSPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={sMrl}
              aria-label="Lọc theo trạng thái MRL"
              onChange={(e) => {
                setSMrl(e.target.value);
                setSPage(1);
              }}
            >
              <option value="">Mọi trạng thái MRL</option>
              {MRL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {canCreateSpray && (
              <button type="button" className="btn btn-primary" onClick={() => setEditingSpray("new")}>
                Ghi phun thuốc
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ngày phun</th>
                  <th>Hộ</th>
                  <th>Mã thửa</th>
                  <th>Loại thuốc</th>
                  <th>Nguồn gốc</th>
                  <th>Liều lượng</th>
                  <th>Diện tích</th>
                  <th>Ngày cách ly</th>
                  <th>MRL</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={10}
                  loading={sprayList.loading}
                  error={sprayList.error}
                  empty={sprayList.rows.length === 0}
                  emptyText="Chưa có nhật ký phun thuốc nào"
                  onRetry={() => void sprayList.refresh()}
                />
                {sprayList.rows.map((s) => {
                  const mrl = badgeOf(MRL_STATUS, s.mrlStatus);
                  return (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(s.sprayedOn)}</td>
                      <td style={{ fontWeight: 500 }}>{s.householdName}</td>
                      <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "#256b45", fontWeight: 600 }}>
                        {s.plotCode || "—"}
                      </td>
                      <td>{s.pesticideName}</td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.source || "—"}</td>
                      <td>{s.dose}</td>
                      <td>{formatVn(s.areaHa, 2)} ha</td>
                      <td style={{ color: "#8a6415", fontWeight: 500 }}>
                        {s.isolationDays != null ? `${s.isolationDays} ngày` : "—"}
                      </td>
                      <td>
                        <span className={`badge ${mrl.badge}`}>{mrl.label}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {canUpdateSpray && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingSpray(s)}>
                              Sửa
                            </button>
                          )}
                          {canDeleteSpray && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingSpray(s)}>
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
            <Pagination page={sPage} pageSize={PAGE_SIZE} total={sprayList.total} unit="lần phun" onChange={setSPage} />
          </div>
        </>
      )}

      {viewingJournal && (
        <JournalDetailModal
          entry={viewingJournal}
          onClose={() => setViewingJournal(null)}
          onEdit={
            canUpdateJournal
              ? () => {
                  const row = viewingJournal;
                  setViewingJournal(null);
                  setEditingJournal(row);
                }
              : undefined
          }
        />
      )}

      {editingJournal && (
        <JournalFormModal
          initial={editingJournal === "new" ? null : editingJournal}
          householdOptions={householdOptions}
          onClose={() => setEditingJournal(null)}
          onSaved={() => {
            void journalList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {deletingJournal && (
        <DeleteDialog
          title="Xóa nhật ký canh tác"
          message={
            <>
              Xóa nhật ký canh tác ngày <strong>{formatDate(deletingJournal.entryOn)}</strong> của hộ{" "}
              <strong>{deletingJournal.householdName}</strong>?
            </>
          }
          path={`/journal/${deletingJournal.id}`}
          successMessage="Đã xóa nhật ký canh tác."
          onClose={() => setDeletingJournal(null)}
          onDeleted={() => {
            void journalList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {viewingViolation && (
        <ViolationDetailModal
          violation={viewingViolation}
          canUpdate={canUpdateViolation}
          onClose={() => setViewingViolation(null)}
          onResolve={() => {
            const row = viewingViolation;
            setViewingViolation(null);
            setResolvingViolation(row);
          }}
          onEdit={() => {
            const row = viewingViolation;
            setViewingViolation(null);
            setEditingViolation(row);
          }}
        />
      )}

      {resolvingViolation && (
        <ViolationResolveModal
          violation={resolvingViolation}
          onClose={() => setResolvingViolation(null)}
          onResolved={() => {
            void violationsList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {editingViolation && (
        <ViolationFormModal
          initial={editingViolation === "new" ? null : editingViolation}
          households={households}
          householdOptions={householdOptions}
          onClose={() => setEditingViolation(null)}
          onSaved={() => {
            void violationsList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {deletingViolation && (
        <DeleteDialog
          title="Xóa cảnh báo vi phạm"
          message={
            <>
              Xóa cảnh báo vi phạm <strong>{deletingViolation.title}</strong> ({deletingViolation.householdLabel})?
            </>
          }
          path={`/violations/${deletingViolation.id}`}
          successMessage="Đã xóa cảnh báo vi phạm."
          onClose={() => setDeletingViolation(null)}
          onDeleted={() => {
            void violationsList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {editingSpray && (
        <SprayFormModal
          initial={editingSpray === "new" ? null : editingSpray}
          householdOptions={householdOptions}
          pesticides={pesticides}
          pesticideOptions={pesticideOptions}
          onClose={() => setEditingSpray(null)}
          onSaved={() => void sprayList.refresh()}
        />
      )}

      {deletingSpray && (
        <DeleteDialog
          title="Xóa nhật ký phun thuốc"
          message={
            <>
              Xóa bản ghi phun thuốc <strong>{deletingSpray.pesticideName}</strong> của hộ{" "}
              <strong>{deletingSpray.householdName}</strong> ({formatDate(deletingSpray.sprayedOn)})?
            </>
          }
          path={`/spray/${deletingSpray.id}`}
          successMessage="Đã xóa nhật ký phun thuốc."
          onClose={() => setDeletingSpray(null)}
          onDeleted={() => void sprayList.refresh()}
        />
      )}
    </>
  );
}
