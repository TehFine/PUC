"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { refreshMountedApiQueries, useApi, useApiList } from "@/hooks/use-api";
import {
  ADMIN_LAST_URL_KEY,
  readInitialUrlSubTab,
  usePersistedEditableSelection,
  usePersistedRecordSelection,
  usePersistedState,
  useUrlSubTab,
} from "@/lib/back-navigation";
import BlockState from "@/components/admin/shared/BlockState";
import {
  ADMIN_APPROVAL_TAB_EVENT,
  consumePendingApprovalTab,
  onCountsChanged,
} from "@/components/admin/shared/counts-events";
import DeleteDialog from "@/components/admin/shared/DeleteDialog";
import Pagination from "@/components/admin/shared/Pagination";
import TabBar, { type TabItem } from "@/components/admin/shared/TabBar";
import TableState from "@/components/admin/shared/TableState";
import {
  APPROVAL_STATUS,
  badgeOf,
  MINUTE_RESULT,
  optionsOf,
  PRIORITY,
  SCHEDULE_KIND,
} from "@/components/admin/shared/labels";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import ApprovalDetailModal, { ApprovalDecisionModal } from "@/components/admin/approvals/ApprovalDetailModal";
import ApprovalFormModal from "@/components/admin/approvals/ApprovalFormModal";
import MinuteFormModal, { MinuteDetailModal } from "@/components/admin/approvals/MinuteFormModal";
import ScheduleFormModal from "@/components/admin/approvals/ScheduleFormModal";
import Registrations from "@/components/sections/Registrations";
import { formatDate } from "@/utils/format";
import type { ApprovalRow, MinuteRow, ScheduleRow } from "@/types/approvals";
import type { DashboardSummary } from "@/types/dashboard";

type Tab = "pending" | "registrations" | "schedule" | "minutes";
const PAGE_SIZE = 25;

const APPROVAL_STATUS_OPTIONS = optionsOf(APPROVAL_STATUS);
const PRIORITY_OPTIONS = optionsOf(PRIORITY);
const SCHEDULE_KIND_OPTIONS = optionsOf(SCHEDULE_KIND);
const MINUTE_RESULT_OPTIONS = optionsOf(MINUTE_RESULT);

export default function Approval() {
  const { can } = useAuth();
  const canReadApprovals = can("approvals", "read");
  const canCreateApproval = can("approvals", "create");
  const canUpdateApproval = can("approvals", "update");
  const canDeleteApproval = can("approvals", "delete");
  const canReadRegistrations = can("registrations", "read");

  const canReadSchedule = can("schedule", "read");
  const canCreateSchedule = can("schedule", "create");
  const canUpdateSchedule = can("schedule", "update");
  const canDeleteSchedule = can("schedule", "delete");

  const canReadMinutes = can("minutes", "read");
  const canCreateMinute = can("minutes", "create");
  const canUpdateMinute = can("minutes", "update");
  const canDeleteMinute = can("minutes", "delete");

  const defaultTab: Tab = canReadApprovals
    ? "pending"
    : canReadRegistrations
      ? "registrations"
      : canReadSchedule
        ? "schedule"
        : "minutes";

  const isApprovalTab = (raw: string): raw is Tab =>
    raw === "pending" || raw === "registrations" || raw === "schedule" || raw === "minutes";

  const [tab, setTab] = useState<Tab>(
    () => consumePendingApprovalTab() ?? readInitialUrlSubTab("sub", defaultTab, isApprovalTab, ADMIN_LAST_URL_KEY),
  );
  const selectTab = useUrlSubTab<Tab>(
    "sub",
    tab,
    setTab,
    defaultTab,
    isApprovalTab,
  );
  const registrationsSummary = useApi<{
    data: unknown[];
    passwordResets?: unknown[];
    total?: number;
  }>(canReadRegistrations ? "/registrations" : null);
  const dashSummary = useApi<DashboardSummary>("/dashboard/summary");
  const pendingApprovalCount = dashSummary.data?.counts?.pendingApprovals ?? 0;
  const regCount = registrationsSummary.data
    ? (registrationsSummary.data.total ??
      registrationsSummary.data.data.length + (registrationsSummary.data.passwordResets?.length ?? 0))
    : 0;

  useEffect(() => {
    const handler = (event: Event) => {
      const storedTab = consumePendingApprovalTab();
      const nextTab = (event as CustomEvent<string>).detail ?? storedTab;
      if (nextTab === "pending" || nextTab === "registrations" || nextTab === "schedule" || nextTab === "minutes") {
        selectTab(nextTab);
      }
    };
    window.addEventListener(ADMIN_APPROVAL_TAB_EVENT, handler);
    return () => window.removeEventListener(ADMIN_APPROVAL_TAB_EVENT, handler);
  }, [selectTab]);

  useEffect(() => {
    return onCountsChanged(() => {
      refreshMountedApiQueries("/registrations");
      refreshMountedApiQueries("/approvals");
      refreshMountedApiQueries("/dashboard");
    });
  }, []);

  // Filters & pagination for Approvals
  const [appSearch, setAppSearch] = useState("");
  const debouncedAppSearch = useDebounced(appSearch);
  const [appStatus, setAppStatus] = usePersistedState("admin:approval:status", "");
  const [appPriority, setAppPriority] = usePersistedState("admin:approval:priority", "");
  const [appPage, setAppPage] = usePersistedState("admin:approval:page", 1);

  // Filters & pagination for Schedule
  const [schedSearch, setSchedSearch] = useState("");
  const debouncedSchedSearch = useDebounced(schedSearch);
  const [schedKind, setSchedKind] = usePersistedState("admin:schedule:kind", "");
  const [schedPage, setSchedPage] = usePersistedState("admin:schedule:page", 1);

  // Filters & pagination for Minutes
  const [minSearch, setMinSearch] = useState("");
  const debouncedMinSearch = useDebounced(minSearch);
  const [minResult, setMinResult] = usePersistedState("admin:minutes:result", "");
  const [minPage, setMinPage] = usePersistedState("admin:minutes:page", 1);

  const approvals = useApiList<ApprovalRow>(canReadApprovals ? "approvals" : null, {
    q: debouncedAppSearch || undefined,
    status: appStatus || undefined,
    priority: appPriority || undefined,
    page: appPage,
    pageSize: PAGE_SIZE,
  });

  const schedules = useApiList<ScheduleRow>(canReadSchedule ? "schedule" : null, {
    q: debouncedSchedSearch || undefined,
    kind: schedKind || undefined,
    page: schedPage,
    pageSize: PAGE_SIZE,
  });

  const minutes = useApiList<MinuteRow>(canReadMinutes ? "minutes" : null, {
    q: debouncedMinSearch || undefined,
    result: minResult || undefined,
    page: minPage,
    pageSize: PAGE_SIZE,
  });

  // Modals for Approvals
  const [viewingApproval, setViewingApproval] = usePersistedRecordSelection(
    "admin:approval:view",
    approvals.rows,
    (r) => r.id,
    approvals.loading,
  );
  const [editingApproval, setEditingApproval] = usePersistedEditableSelection(
    "admin:approval:edit",
    approvals.rows,
    (r) => r.id,
    approvals.loading,
  );
  const [decisionTarget, setDecisionTarget] = useState<{ row: ApprovalRow; mode: "approve" | "reject" } | null>(null);
  const [deletingApproval, setDeletingApproval] = useState<ApprovalRow | null>(null);

  // Modals for Schedule
  const [editingSchedule, setEditingSchedule] = usePersistedEditableSelection(
    "admin:schedule:edit",
    schedules.rows,
    (r) => r.id,
    schedules.loading,
  );
  const [deletingSchedule, setDeletingSchedule] = useState<ScheduleRow | null>(null);

  // Modals for Minutes
  const [viewingMinute, setViewingMinute] = usePersistedRecordSelection(
    "admin:minutes:view",
    minutes.rows,
    (r) => r.id,
    minutes.loading,
  );
  const [editingMinute, setEditingMinute] = usePersistedEditableSelection(
    "admin:minutes:edit",
    minutes.rows,
    (r) => r.id,
    minutes.loading,
  );
  const [deletingMinute, setDeletingMinute] = useState<MinuteRow | null>(null);

  const tabs: TabItem<Tab>[] = [
    ...(canReadApprovals
      ? [{ id: "pending" as const, label: "Hồ sơ chờ duyệt", badge: approvals.total, pendingBadge: pendingApprovalCount }]
      : []),
    ...(canReadRegistrations
      ? [
          {
            id: "registrations" as const,
            label: "Cấp lại mật khẩu",
            badge: regCount,
            pendingBadge: regCount,
          },
        ]
      : []),
    ...(canReadSchedule ? [{ id: "schedule" as const, label: "Lịch kiểm tra", badge: schedules.total }] : []),
    ...(canReadMinutes ? [{ id: "minutes" as const, label: "Biên bản kiểm tra", badge: minutes.total }] : []),
  ];

  const activeTab: Tab =
    (tab === "pending" && !canReadApprovals) ||
    (tab === "registrations" && !canReadRegistrations) ||
    (tab === "schedule" && !canReadSchedule) ||
    (tab === "minutes" && !canReadMinutes)
      ? defaultTab
      : tab;

  return (
    <>
      {(canCreateApproval || canCreateSchedule || canCreateMinute) && (
        <div className="page-header">
          <div className="header-actions">
            {canCreateApproval && (
              <button type="button" className="btn btn-outline" onClick={() => setEditingApproval("new")}>
                Thêm hồ sơ
              </button>
            )}
            {canCreateSchedule && (
              <button type="button" className="btn btn-outline" onClick={() => setEditingSchedule("new")}>
                Lên lịch kiểm tra
              </button>
            )}
            {canCreateMinute && (
              <button type="button" className="btn btn-primary" onClick={() => setEditingMinute("new")}>
                Tạo biên bản
              </button>
            )}
          </div>
        </div>
      )}

      <TabBar tabs={tabs} active={activeTab} onChange={selectTab} />

      {activeTab === "pending" && canReadApprovals && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo mã hồ sơ, tên hộ, loại yêu cầu…"
                value={appSearch}
                onChange={(e) => {
                  setAppSearch(e.target.value);
                  setAppPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={appStatus}
              aria-label="Lọc theo trạng thái hồ sơ"
              onChange={(e) => {
                setAppStatus(e.target.value);
                setAppPage(1);
              }}
            >
              <option value="">Mọi trạng thái</option>
              {APPROVAL_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={appPriority}
              aria-label="Lọc theo mức ưu tiên"
              onChange={(e) => {
                setAppPriority(e.target.value);
                setAppPage(1);
              }}
            >
              <option value="">Mọi mức ưu tiên</option>
              {PRIORITY_OPTIONS.map((opt) => (
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
                  <th>Mã hồ sơ</th>
                  <th>Hộ nông dân</th>
                  <th>Loại yêu cầu</th>
                  <th>Mã thửa</th>
                  <th>Ngày nộp</th>
                  <th>Tài liệu</th>
                  <th>Ưu tiên</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={9}
                  loading={approvals.loading}
                  error={approvals.error}
                  empty={approvals.rows.length === 0}
                  emptyText="Không có hồ sơ nào phù hợp"
                  onRetry={() => void approvals.refresh()}
                />
                {approvals.rows.map((p) => {
                  const pr = badgeOf(PRIORITY, p.priority);
                  const st = badgeOf(APPROVAL_STATUS, p.status);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "#256b45", fontWeight: 600 }}>{p.code}</td>
                      <td style={{ fontWeight: 500 }}>{p.applicantName}</td>
                      <td>{p.requestType}</td>
                      <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5 }}>{p.plotCode || "—"}</td>
                      <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(p.submittedOn)}</td>
                      <td style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                        {p.docsCount} file
                      </td>
                      <td>
                        <span className={`badge ${pr.badge}`}>{pr.label}</span>
                      </td>
                      <td>
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingApproval(p)}>
                            Xem
                          </button>
                          {canUpdateApproval && p.status === "pending" && (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => setDecisionTarget({ row: p, mode: "approve" })}
                              >
                                Duyệt
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => setDecisionTarget({ row: p, mode: "reject" })}
                              >
                                Từ chối
                              </button>
                            </>
                          )}
                          {canUpdateApproval && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingApproval(p)}>
                              Sửa
                            </button>
                          )}
                          {canDeleteApproval && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingApproval(p)}>
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
            <Pagination page={appPage} pageSize={PAGE_SIZE} total={approvals.total} unit="hồ sơ" onChange={setAppPage} />
          </div>
        </>
      )}

      {activeTab === "registrations" && canReadRegistrations && <Registrations />}

      {activeTab === "schedule" && canReadSchedule && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo tiêu đề lịch, cán bộ kiểm tra…"
                value={schedSearch}
                onChange={(e) => {
                  setSchedSearch(e.target.value);
                  setSchedPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={schedKind}
              aria-label="Lọc theo hình thức kiểm tra"
              onChange={(e) => {
                setSchedKind(e.target.value);
                setSchedPage(1);
              }}
            >
              <option value="">Mọi hình thức</option>
              {SCHEDULE_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {canCreateSchedule && (
              <button type="button" className="btn btn-primary" onClick={() => setEditingSchedule("new")}>
                Lên lịch kiểm tra
              </button>
            )}
          </div>

          <BlockState
            loading={schedules.loading}
            error={schedules.error}
            empty={schedules.rows.length === 0}
            emptyText="Chưa có lịch kiểm tra nào."
            onRetry={() => void schedules.refresh()}
          />

          {schedules.rows.length > 0 && (
            <>
              <div className="schedule-grid">
                {schedules.rows.map((s) => {
                  const kindBadge = badgeOf(SCHEDULE_KIND, s.kind);
                  return (
                    <div key={s.id} className="schedule-card">
                      <div className="schedule-card-body">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div className="schedule-card-date" style={{ marginBottom: 0 }}>
                            {formatDate(s.scheduledOn)}
                          </div>
                          <span className={`badge ${kindBadge.badge}`}>{kindBadge.label}</span>
                        </div>
                        <div className="schedule-card-title">{s.title}</div>
                        <div className="schedule-card-meta">
                          Cán bộ: <strong>{s.officer}</strong>
                          <br />
                          Quy mô: <strong>{s.plotCount} thửa</strong> cần kiểm tra
                        </div>
                      </div>
                      {(canUpdateSchedule || canDeleteSchedule) && (
                        <footer className="dash-bento-footer schedule-card-footer">
                          {canUpdateSchedule && (
                            <button
                              type="button"
                              className="dash-bento-footer-btn"
                              onClick={() => setEditingSchedule(s)}
                            >
                              Sửa
                            </button>
                          )}
                          {canDeleteSchedule && (
                            <button
                              type="button"
                              className="dash-bento-footer-btn is-danger"
                              onClick={() => setDeletingSchedule(s)}
                            >
                              Xóa
                            </button>
                          )}
                        </footer>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="admin-diary-pagination">
                <Pagination
                  page={schedPage}
                  pageSize={PAGE_SIZE}
                  total={schedules.total}
                  unit="lịch kiểm tra"
                  onChange={setSchedPage}
                />
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "minutes" && canReadMinutes && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo số biên bản, địa điểm, cán bộ…"
                value={minSearch}
                onChange={(e) => {
                  setMinSearch(e.target.value);
                  setMinPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={minResult}
              aria-label="Lọc theo kết quả biên bản"
              onChange={(e) => {
                setMinResult(e.target.value);
                setMinPage(1);
              }}
            >
              <option value="">Mọi kết quả</option>
              {MINUTE_RESULT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {canCreateMinute && (
              <button type="button" className="btn btn-primary" onClick={() => setEditingMinute("new")}>
                Tạo biên bản
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Số biên bản</th>
                  <th>Ngày kiểm tra</th>
                  <th>Địa điểm / Phạm vi</th>
                  <th>Cán bộ kiểm tra</th>
                  <th>Kết quả</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={6}
                  loading={minutes.loading}
                  error={minutes.error}
                  empty={minutes.rows.length === 0}
                  emptyText="Chưa có biên bản kiểm tra nào."
                  onRetry={() => void minutes.refresh()}
                />
                {minutes.rows.map((m) => {
                  const resBadge = badgeOf(MINUTE_RESULT, m.result);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "#256b45", fontWeight: 600 }}>{m.code}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(m.heldOn)}</td>
                      <td>{m.location}</td>
                      <td>{m.officer}</td>
                      <td>
                        <span className={`badge ${resBadge.badge}`}>{resBadge.label}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingMinute(m)}>
                            Xem
                          </button>
                          {canUpdateMinute && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingMinute(m)}>
                              Sửa
                            </button>
                          )}
                          {canDeleteMinute && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingMinute(m)}>
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
            <Pagination page={minPage} pageSize={PAGE_SIZE} total={minutes.total} unit="biên bản" onChange={setMinPage} />
          </div>
        </>
      )}

      {viewingApproval && (
        <ApprovalDetailModal
          approval={viewingApproval}
          canUpdate={canUpdateApproval}
          onClose={() => setViewingApproval(null)}
          onApprove={() => {
            const row = viewingApproval;
            setViewingApproval(null);
            setDecisionTarget({ row, mode: "approve" });
          }}
          onReject={() => {
            const row = viewingApproval;
            setViewingApproval(null);
            setDecisionTarget({ row, mode: "reject" });
          }}
        />
      )}

      {decisionTarget && (
        <ApprovalDecisionModal
          approval={decisionTarget.row}
          mode={decisionTarget.mode}
          onClose={() => setDecisionTarget(null)}
          onDone={() => void approvals.refresh()}
        />
      )}

      {editingApproval && (
        <ApprovalFormModal
          initial={editingApproval === "new" ? null : editingApproval}
          onClose={() => setEditingApproval(null)}
          onSaved={() => void approvals.refresh()}
        />
      )}

      {deletingApproval && (
        <DeleteDialog
          title="Xóa hồ sơ"
          message={
            <>
              Bạn có chắc chắn muốn xóa hồ sơ <strong>{deletingApproval.code}</strong> của hộ{" "}
              <strong>{deletingApproval.applicantName}</strong>?
            </>
          }
          path={`/approvals/${deletingApproval.id}`}
          successMessage={`Đã xóa hồ sơ ${deletingApproval.code}.`}
          onClose={() => setDeletingApproval(null)}
          onDeleted={() => void approvals.refresh()}
        />
      )}

      {editingSchedule && (
        <ScheduleFormModal
          initial={editingSchedule === "new" ? null : editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSaved={() => void schedules.refresh()}
        />
      )}

      {deletingSchedule && (
        <DeleteDialog
          title="Xóa lịch kiểm tra"
          message={
            <>
              Xóa lịch kiểm tra <strong>{deletingSchedule.title}</strong> ({formatDate(deletingSchedule.scheduledOn)})?
            </>
          }
          path={`/schedule/${deletingSchedule.id}`}
          successMessage="Đã xóa lịch kiểm tra."
          onClose={() => setDeletingSchedule(null)}
          onDeleted={() => void schedules.refresh()}
        />
      )}

      {viewingMinute && (
        <MinuteDetailModal
          minute={viewingMinute}
          onClose={() => setViewingMinute(null)}
          onEdit={
            canUpdateMinute
              ? () => {
                  const row = viewingMinute;
                  setViewingMinute(null);
                  setEditingMinute(row);
                }
              : undefined
          }
        />
      )}

      {editingMinute && (
        <MinuteFormModal
          initial={editingMinute === "new" ? null : editingMinute}
          onClose={() => setEditingMinute(null)}
          onSaved={() => void minutes.refresh()}
        />
      )}

      {deletingMinute && (
        <DeleteDialog
          title="Xóa biên bản kiểm tra"
          message={
            <>
              Xóa biên bản <strong>{deletingMinute.code}</strong> ({deletingMinute.location})?
            </>
          }
          path={`/minutes/${deletingMinute.id}`}
          successMessage={`Đã xóa biên bản ${deletingMinute.code}.`}
          onClose={() => setDeletingMinute(null)}
          onDeleted={() => void minutes.refresh()}
        />
      )}
    </>
  );
}
