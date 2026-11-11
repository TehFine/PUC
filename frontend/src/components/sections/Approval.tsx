"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useApiList } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import BlockState from "@/components/admin/shared/BlockState";
import { ADMIN_APPROVAL_TAB_EVENT, consumePendingApprovalTab } from "@/components/admin/shared/counts-events";
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

type Tab = "pending" | "registrations" | "schedule" | "minutes";
const PAGE_SIZE = 25;

const APPROVAL_STATUS_OPTIONS = optionsOf(APPROVAL_STATUS);
const PRIORITY_OPTIONS = optionsOf(PRIORITY);
const SCHEDULE_KIND_OPTIONS = optionsOf(SCHEDULE_KIND);
const MINUTE_RESULT_OPTIONS = optionsOf(MINUTE_RESULT);

export default function Approval() {
  const { can } = useAuth();
  const canCreateApproval = can("approvals", "create");
  const canUpdateApproval = can("approvals", "update");
  const canDeleteApproval = can("approvals", "delete");
  const canReadRegistrations = can("registrations", "read");

  const canCreateSchedule = can("schedule", "create");
  const canUpdateSchedule = can("schedule", "update");
  const canDeleteSchedule = can("schedule", "delete");

  const canCreateMinute = can("minutes", "create");
  const canUpdateMinute = can("minutes", "update");
  const canDeleteMinute = can("minutes", "delete");

  const [tab, setTab] = useState<Tab>(() => consumePendingApprovalTab() ?? "pending");
  const [regCount, setRegCount] = useState<number>(0);

  useEffect(() => {
    const handler = (event: Event) => {
      const nextTab = (event as CustomEvent<string>).detail ?? consumePendingApprovalTab();
      if (nextTab === "pending" || nextTab === "registrations" || nextTab === "schedule" || nextTab === "minutes") {
        setTab(nextTab);
      }
    };
    window.addEventListener(ADMIN_APPROVAL_TAB_EVENT, handler);
    return () => window.removeEventListener(ADMIN_APPROVAL_TAB_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!canReadRegistrations) return;
    let active = true;
    api
      .get<{ data: unknown[]; total?: number }>("/registrations")
      .then((res) => {
        if (active) setRegCount(res.total ?? res.data.length);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, [canReadRegistrations]);

  // Filters & pagination for Approvals
  const [appSearch, setAppSearch] = useState("");
  const debouncedAppSearch = useDebounced(appSearch);
  const [appStatus, setAppStatus] = useState("");
  const [appPriority, setAppPriority] = useState("");
  const [appPage, setAppPage] = useState(1);

  // Filters & pagination for Schedule
  const [schedSearch, setSchedSearch] = useState("");
  const debouncedSchedSearch = useDebounced(schedSearch);
  const [schedKind, setSchedKind] = useState("");
  const [schedPage, setSchedPage] = useState(1);

  // Filters & pagination for Minutes
  const [minSearch, setMinSearch] = useState("");
  const debouncedMinSearch = useDebounced(minSearch);
  const [minResult, setMinResult] = useState("");
  const [minPage, setMinPage] = useState(1);

  const approvals = useApiList<ApprovalRow>("approvals", {
    q: debouncedAppSearch || undefined,
    status: appStatus || undefined,
    priority: appPriority || undefined,
    page: appPage,
    pageSize: PAGE_SIZE,
  });

  const schedules = useApiList<ScheduleRow>("schedule", {
    q: debouncedSchedSearch || undefined,
    kind: schedKind || undefined,
    page: schedPage,
    pageSize: PAGE_SIZE,
  });

  const minutes = useApiList<MinuteRow>("minutes", {
    q: debouncedMinSearch || undefined,
    result: minResult || undefined,
    page: minPage,
    pageSize: PAGE_SIZE,
  });

  // Modals for Approvals
  const [viewingApproval, setViewingApproval] = useState<ApprovalRow | null>(null);
  const [editingApproval, setEditingApproval] = useState<ApprovalRow | "new" | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<{ row: ApprovalRow; mode: "approve" | "reject" } | null>(null);
  const [deletingApproval, setDeletingApproval] = useState<ApprovalRow | null>(null);

  // Modals for Schedule
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | "new" | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState<ScheduleRow | null>(null);

  // Modals for Minutes
  const [viewingMinute, setViewingMinute] = useState<MinuteRow | null>(null);
  const [editingMinute, setEditingMinute] = useState<MinuteRow | "new" | null>(null);
  const [deletingMinute, setDeletingMinute] = useState<MinuteRow | null>(null);

  const tabs: TabItem<Tab>[] = [
    { id: "pending", label: "Hồ sơ chờ duyệt", badge: approvals.total },
    ...(canReadRegistrations
      ? [
          {
            id: "registrations" as const,
            label: regCount > 0 ? `Cấp lại mật khẩu (${regCount})` : "Cấp lại mật khẩu",
            badge: regCount,
          },
        ]
      : []),
    { id: "schedule", label: "Lịch kiểm tra", badge: schedules.total },
    { id: "minutes", label: "Biên bản kiểm tra", badge: minutes.total },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Duyệt &amp; Kiểm Chứng Hồ Sơ</h1>
        </div>
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

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === "pending" && (
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
                      <td style={{ textAlign: "center" }}>
                        <span style={{ background: "#f4f5f3", padding: "2px 8px", borderRadius: 6, fontSize: 11.5 }}>
                          {p.docsCount} file
                        </span>
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

      {tab === "registrations" && canReadRegistrations && <Registrations embedded onCountChange={setRegCount} />}

      {tab === "schedule" && (
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
            <div className="schedule-grid">
              {schedules.rows.map((s) => {
                const kindBadge = badgeOf(SCHEDULE_KIND, s.kind);
                return (
                  <div key={s.id} className="schedule-card">
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
                    {(canUpdateSchedule || canDeleteSchedule) && (
                      <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
                        {canUpdateSchedule && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingSchedule(s)}>
                            Sửa
                          </button>
                        )}
                        {canDeleteSchedule && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingSchedule(s)}>
                            Xóa
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "minutes" && (
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
