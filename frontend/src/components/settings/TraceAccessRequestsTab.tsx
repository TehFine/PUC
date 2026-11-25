"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import BlockState from "@/components/admin/shared/BlockState";
import {
  ADMIN_SYSTEM_TAB_EVENT,
  consumePendingTraceRequestId,
  notifyCountsChanged,
  onCountsChanged,
} from "@/components/admin/shared/counts-events";
import Pagination from "@/components/admin/shared/Pagination";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { FormError, Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { SelectField, TextAreaField } from "@/components/ui/form/fields";
import { refreshMountedApiQueries, useApiList, useMutation } from "@/hooks/use-api";
import { invalidateQueries, NOTIFICATIONS_PATH } from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import { usePersistedState } from "@/lib/back-navigation";
import type {
  TraceAccessRequestRecord,
  TraceAccessScopeMode,
  TraceAccessTier,
} from "@/types/trace-requests";

const PAGE_SIZE = 20;

const TARGET_KIND_LABELS: Record<string, string> = {
  lot: "Lô hàng",
  box: "Thùng đóng gói",
  fruit: "Tem trái",
  plot: "Thửa đất",
};

const TIER_LABELS: Record<TraceAccessTier, string> = {
  enterprise: "Cấp 2 - Đối tác và thực địa",
  authority: "Cấp 3 - Thanh tra quản lý",
};

const TIER_SHORT_LABELS: Record<TraceAccessTier, string> = {
  enterprise: "Cấp 2",
  authority: "Cấp 3",
};

const SCOPE_LABELS: Record<TraceAccessScopeMode, string> = {
  record: "Chỉ hồ sơ vừa quét",
  zone: "Toàn vùng trồng PUC",
  coop: "Toàn bộ lô và thửa HTX",
};

function formatDateTimeVn(isoOrRaw: string | null | undefined): string {
  if (!isoOrRaw) return "-";
  const d = new Date(isoOrRaw);
  if (Number.isNaN(d.getTime())) return isoOrRaw;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${hh}:${mm}, ${dd}/${mo}/${yyyy}`;
}

function resolveStatusMeta(row: TraceAccessRequestRecord): {
  label: string;
  color: string;
  badgeClass: string;
} {
  if (row.status === "pending") {
    return { label: "Chờ duyệt", color: "#9a6712", badgeClass: "badge-gold" };
  }
  if (row.status === "approved") {
    if (row.isActiveNow) {
      return { label: "Đang mở quyền", color: "#15803d", badgeClass: "badge-green" };
    }
    return { label: "Đã hết hạn", color: "#5f6d66", badgeClass: "badge-gray" };
  }
  if (row.status === "rejected") {
    return { label: "Đã từ chối", color: "#b91c1c", badgeClass: "badge-red" };
  }
  return { label: "Đã thu hồi", color: "#5f6d66", badgeClass: "badge-gray" };
}

export default function TraceAccessRequestsTab({
  onReviewed,
  onPendingCountSync,
}: {
  onReviewed?: () => void;
  onPendingCountSync?: (count: number) => void;
}) {
  const { session } = useAuth();
  const currentUser = session?.user;
  const canGrantCoopScope =
    (currentUser?.role === "admin" ||
      currentUser?.role === "htx_head" ||
      currentUser?.role === "htx_deputy") &&
    !currentUser?.assignedCommune?.trim();

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q);
  const [statusFilter, setStatusFilter] = usePersistedState("admin:tracereq:status", "");
  const [tierFilter, setTierFilter] = usePersistedState("admin:tracereq:tier", "");
  const [page, setPage] = usePersistedState("admin:tracereq:page", 1);

  const list = useApiList<
    TraceAccessRequestRecord,
    { pendingCount?: number; activeCount?: number }
  >("trace-requests", {
    q: debouncedQ || undefined,
    status: statusFilter || undefined,
    requestedTier: tierFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const livePendingCount = list.raw?.pendingCount;

  useEffect(() => {
    if (typeof livePendingCount === "number") {
      onPendingCountSync?.(livePendingCount);
    }
  }, [livePendingCount, onPendingCountSync]);

  useEffect(() => {
    return onCountsChanged(() => {
      refreshMountedApiQueries("/trace-requests");
    });
  }, []);

  const [viewingSnapshot, setViewingSnapshot] = useState<TraceAccessRequestRecord | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<number | null>(() => {
    const fromStorage = consumePendingTraceRequestId();
    if (fromStorage) return fromStorage;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const rawId = sp.get("id");
      if (rawId && /^\d+$/.test(rawId)) return Number(rawId);
    }
    return null;
  });

  const [grantedTier, setGrantedTier] = useState<TraceAccessTier>("enterprise");
  const [scopeMode, setScopeMode] = useState<TraceAccessScopeMode>("zone");
  const [durationHours, setDurationHours] = useState<string>("24");
  const [reviewNote, setReviewNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  useEffect(() => {
    const onTabSwitch = () => {
      const nextId = consumePendingTraceRequestId();
      if (nextId) {
        setQ("");
        setStatusFilter("");
        setTierFilter("");
        setPage(1);
        setReviewNote("");
        setConfirmingRevoke(false);
        setViewingSnapshot(null);
        setPendingTargetId(nextId);
        refreshMountedApiQueries("/trace-requests");
      }
    };
    window.addEventListener(ADMIN_SYSTEM_TAB_EVENT, onTabSwitch);
    return () => window.removeEventListener(ADMIN_SYSTEM_TAB_EVENT, onTabSwitch);
  }, [setPage, setStatusFilter, setTierFilter]);

  const viewing =
    viewingSnapshot != null
      ? (list.rows.find((r) => r.id === viewingSnapshot.id) ?? viewingSnapshot)
      : pendingTargetId != null
        ? (list.rows.find((r) => Number(r.id) === Number(pendingTargetId)) ?? null)
        : null;

  const openDetailModal = (row: TraceAccessRequestRecord) => {
    setViewingSnapshot(row);
    setPendingTargetId(null);
    setGrantedTier(row.grantedTier ?? row.requestedTier ?? "enterprise");
    const defaultScope: TraceAccessScopeMode =
      row.scopeMode === "coop" && !canGrantCoopScope
        ? row.pucCode
          ? "zone"
          : "record"
        : row.scopeMode ?? (row.pucCode ? "zone" : "record");
    setScopeMode(defaultScope);
    setDurationHours(String(row.durationHours || 24));
    setReviewNote("");
    setNoteError(null);
    setConfirmingRevoke(false);
  };

  const closeDetailModal = () => {
    setViewingSnapshot(null);
    setPendingTargetId(null);
    setNoteError(null);
    setConfirmingRevoke(false);
  };

  const validateReviewNote = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.length > 400) {
      return "Ghi chú phản hồi không vượt quá 400 ký tự.";
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/.test(trimmed)) {
      return "Ghi chú phản hồi không được chứa thẻ HTML hoặc ký tự điều khiển.";
    }
    return null;
  };

  const approveMut = useMutation(async (req: TraceAccessRequestRecord) => {
    const parsedHours = Math.round(Number(durationHours));
    const safeHours = Number.isFinite(parsedHours) && parsedHours >= 1 && parsedHours <= 336 ? parsedHours : 24;
    return api.post(`/trace-requests/${req.id}/approve`, {
      grantedTier,
      scopeMode,
      durationHours: safeHours,
      note: reviewNote.trim() || null,
    });
  });

  const rejectMut = useMutation(async (req: TraceAccessRequestRecord) => {
    return api.post(`/trace-requests/${req.id}/reject`, {
      note: reviewNote.trim() || null,
    });
  });

  const revokeMut = useMutation(async (req: TraceAccessRequestRecord) => {
    return api.post(`/trace-requests/${req.id}/revoke`, {
      note: reviewNote.trim() || null,
    });
  });

  const anyPendingAction = approveMut.pending || rejectMut.pending || revokeMut.pending;
  const activeError = noteError || approveMut.error || rejectMut.error || revokeMut.error;

  const afterAction = (msg: string) => {
    toast.success(msg);
    closeDetailModal();
    setReviewNote("");
    setNoteError(null);
    notifyCountsChanged();
    invalidateQueries(NOTIFICATIONS_PATH);
    void list.refresh();
    onReviewed?.();
  };

  const handleApprove = async (req: TraceAccessRequestRecord) => {
    const err = validateReviewNote(reviewNote);
    if (err) {
      setNoteError(err);
      return;
    }
    setNoteError(null);
    const res = await approveMut.run(req);
    if (res) {
      afterAction(`Đã mở quyền xem hồ sơ cho đoàn ${req.organization}.`);
    }
  };

  const handleReject = async (req: TraceAccessRequestRecord) => {
    const err = validateReviewNote(reviewNote);
    if (err) {
      setNoteError(err);
      return;
    }
    setNoteError(null);
    const res = await rejectMut.run(req);
    if (res) {
      afterAction(`Đã từ chối yêu cầu ${req.requestCode}.`);
    }
  };

  const handleRevoke = async (req: TraceAccessRequestRecord) => {
    const err = validateReviewNote(reviewNote);
    if (err) {
      setNoteError(err);
      return;
    }
    setNoteError(null);
    const res = await revokeMut.run(req);
    if (res) {
      afterAction(`Đã thu hồi quyền của mã ${req.requestCode}.`);
    }
  };

  return (
    <div className="trace-req-view">
      <div className="trace-req-intro">
        <div className="trace-req-intro-title">Duyệt cấp quyền xem hồ sơ QR</div>
        <p className="trace-req-intro-desc">
          Duyệt yêu cầu mở hồ sơ từ đoàn kiểm tra và đối tác quét QR ngoài thực địa.
        </p>
      </div>

      <div className="filter-bar trace-req-filter-bar">
        <div className="trace-req-search-wrap">
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm mã yêu cầu, tên đoàn, SĐT, mã lô..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo trạng thái"
        >
          <option value="">Mọi trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="active">Đang mở quyền</option>
          <option value="rejected">Đã từ chối</option>
          <option value="revoked">Đã thu hồi</option>
          <option value="expired">Đã hết hạn</option>
        </select>

        <select
          className="filter-select"
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo mức quyền"
        >
          <option value="">Mọi mức quyền</option>
          <option value="enterprise">Cấp 2 - Đối tác</option>
          <option value="authority">Cấp 3 - Thanh tra</option>
        </select>
      </div>

      {typeof livePendingCount === "number" &&
        livePendingCount > 0 &&
        ((statusFilter !== "" && statusFilter !== "pending") ||
          page > 1 ||
          Boolean(debouncedQ) ||
          Boolean(tierFilter)) &&
        !list.rows.some((r) => r.status === "pending") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              padding: "10px 14px",
              marginBottom: 12,
              background: "#ffffff",
              border: "1px solid #d4d4d2",
              borderRadius: 6,
              fontSize: 13,
              color: "#14372f",
            }}
          >
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              Có {livePendingCount} yêu cầu mới đang chờ phê duyệt ngoài bộ lọc hiện tại.
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setQ("");
                setStatusFilter("");
                setTierFilter("");
                setPage(1);
              }}
            >
              Xem ngay
            </button>
          </div>
        )}

      <BlockState
        loading={list.loading && list.rows.length === 0}
        error={list.error}
        empty={!list.loading && !list.error && list.rows.length === 0}
        emptyText="Chưa có yêu cầu cấp quyền nào."
        onRetry={list.refresh}
      />

      {list.rows.length > 0 && (
        <>
          <div className="trace-req-list-card">
            <ul className="trace-req-list" role="list" aria-label="Danh sách yêu cầu cấp quyền QR">
              {list.rows.map((row) => {
                const st = resolveStatusMeta(row);
                const kindLabel = TARGET_KIND_LABELS[row.targetKind] || "Hồ sơ";
                const tierKey = row.grantedTier ?? row.requestedTier;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="trace-req-row"
                      onClick={() => openDetailModal(row)}
                    >
                      <span className="trace-req-row-main">
                        <span className="trace-req-row-head">
                          <strong className="trace-req-row-name">{row.requesterName}</strong>
                          <span className="trace-req-row-org">{row.organization}</span>
                        </span>
                        <span className="trace-req-row-sub">
                          {kindLabel} {row.resolvedLotCode || row.scannedCode},{" "}
                          {TIER_SHORT_LABELS[tierKey]}, {formatDateTimeVn(row.createdAt)}
                        </span>
                      </span>
                      <span className="trace-req-row-right">
                        <span className="trace-req-row-status" style={{ color: st.color }}>
                          {st.label}
                        </span>
                        <DetailArrowIcon className="admin-diary-arrow" size={18} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="admin-hh-pagination">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={list.total}
              onChange={setPage}
              unit="yêu cầu"
            />
          </div>
        </>
      )}

      {viewing && (
        <Modal
          title={`Yêu cầu ${viewing.requestCode}`}
          onClose={anyPendingAction ? () => undefined : closeDetailModal}
          width={560}
          footer={
            <>
              {viewing.status === "pending" && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={anyPendingAction}
                    onClick={() => void handleReject(viewing)}
                  >
                    {rejectMut.pending ? "Đang xử lý..." : "Từ chối"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={anyPendingAction}
                    onClick={() => void handleApprove(viewing)}
                  >
                    {approveMut.pending ? "Đang duyệt..." : "Phê duyệt"}
                  </button>
                </>
              )}

              {viewing.isActiveNow && !confirmingRevoke && (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={anyPendingAction}
                  onClick={() => setConfirmingRevoke(true)}
                >
                  Thu hồi quyền
                </button>
              )}

              {viewing.isActiveNow && confirmingRevoke && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={anyPendingAction}
                    onClick={() => setConfirmingRevoke(false)}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={anyPendingAction}
                    onClick={() => void handleRevoke(viewing)}
                  >
                    {revokeMut.pending ? "Đang thu hồi..." : "Xác nhận thu hồi"}
                  </button>
                </>
              )}

              {!confirmingRevoke && (
                <ModalDismissButton
                  className={viewing.status === "pending" ? "btn btn-outline" : "btn btn-primary"}
                  disabled={anyPendingAction}
                  onFallbackClose={closeDetailModal}
                >
                  Đóng
                </ModalDismissButton>
              )}
            </>
          }
        >
          <div className="trace-req-modal-stack">
            <FormError message={activeError} />

            <div className="admin-detail-list-card trace-req-detail-card">
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Người đề nghị</span>
                <div className="admin-detail-list-value">
                  <strong>{viewing.requesterName}</strong> ({viewing.organization})
                </div>
              </div>
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Số điện thoại</span>
                <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {viewing.contactPhone}
                </div>
              </div>
              {viewing.requesterRoleLabel && (
                <div className="admin-detail-list-row">
                  <span className="admin-detail-list-label">Tài khoản đăng nhập</span>
                  <div className="admin-detail-list-value">
                    {viewing.requesterUsername} ({viewing.requesterRoleLabel})
                  </div>
                </div>
              )}
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Hồ sơ quét</span>
                <div className="admin-detail-list-value">
                  {TARGET_KIND_LABELS[viewing.targetKind] || "Hồ sơ"}:{" "}
                  {viewing.resolvedLotCode || viewing.scannedCode}
                  {viewing.pucCode ? ` (${viewing.pucCode})` : ""}
                </div>
              </div>
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Mục đích tra cứu</span>
                <div className="admin-detail-list-value">{viewing.purpose}</div>
              </div>
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Thời gian gửi</span>
                <div className="admin-detail-list-value">{formatDateTimeVn(viewing.createdAt)}</div>
              </div>
            </div>

            {viewing.status === "pending" ? (
              <div className="trace-req-form-card">
                <SelectField
                  label="Mức quyền cấp"
                  value={grantedTier}
                  onChange={(val) => setGrantedTier(val as TraceAccessTier)}
                  options={[
                    { value: "enterprise", label: "Cấp 2 - Đối tác và thẩm định vườn" },
                    { value: "authority", label: "Cấp 3 - Thanh tra quản lý" },
                  ]}
                />

                <div className="trace-req-form-grid">
                  <SelectField
                    label="Phạm vi mở"
                    value={scopeMode}
                    onChange={(val) => setScopeMode(val as TraceAccessScopeMode)}
                    options={[
                      ...(viewing.pucCode || !currentUser?.assignedCommune?.trim()
                        ? [{ value: "zone", label: "Toàn vùng trồng PUC" }]
                        : []),
                      { value: "record", label: "Chỉ hồ sơ vừa quét" },
                      ...(canGrantCoopScope
                        ? [{ value: "coop", label: "Toàn bộ lô và thửa HTX" }]
                        : []),
                    ]}
                  />

                  <SelectField
                    label="Thời hạn"
                    value={durationHours}
                    onChange={setDurationHours}
                    options={[
                      { value: "4", label: "4 giờ" },
                      { value: "12", label: "12 giờ" },
                      { value: "24", label: "24 giờ" },
                      { value: "48", label: "48 giờ" },
                      { value: "72", label: "72 giờ" },
                    ]}
                  />
                </div>

                <TextAreaField
                  label="Ghi chú phản hồi (tùy chọn)"
                  rows={2}
                  maxLength={400}
                  placeholder="Nhập ghi chú phê duyệt hoặc lý do từ chối..."
                  value={reviewNote}
                  onChange={(val) => {
                    setReviewNote(val);
                    if (noteError) setNoteError(null);
                  }}
                />
              </div>
            ) : (
              <div className="admin-detail-list-card trace-req-detail-card">
                <div className="admin-detail-list-row">
                  <span className="admin-detail-list-label">Kết quả xử lý</span>
                  <div className="admin-detail-list-value">
                    <span className={`badge ${resolveStatusMeta(viewing).badgeClass}`}>
                      {resolveStatusMeta(viewing).label}
                    </span>
                    {viewing.grantedTier ? <span>{TIER_LABELS[viewing.grantedTier]}</span> : null}
                  </div>
                </div>
                {viewing.scopeMode && viewing.status === "approved" && (
                  <div className="admin-detail-list-row">
                    <span className="admin-detail-list-label">Phạm vi cấp</span>
                    <div className="admin-detail-list-value">{SCOPE_LABELS[viewing.scopeMode]}</div>
                  </div>
                )}
                {viewing.expiresAt && (
                  <div className="admin-detail-list-row">
                    <span className="admin-detail-list-label">Hiệu lực đến</span>
                    <div className="admin-detail-list-value">
                      {formatDateTimeVn(viewing.expiresAt)} ({viewing.accessCount} lượt xem)
                    </div>
                  </div>
                )}
                {viewing.reviewedByName && (
                  <div className="admin-detail-list-row">
                    <span className="admin-detail-list-label">Người xử lý</span>
                    <div className="admin-detail-list-value">
                      <strong>{viewing.reviewedByName}</strong>
                      {viewing.reviewedByRoleLabel ? ` (${viewing.reviewedByRoleLabel})` : ""},{" "}
                      {formatDateTimeVn(viewing.reviewedAt)}
                    </div>
                  </div>
                )}
                {viewing.reviewNote && (
                  <div className="admin-detail-list-row">
                    <span className="admin-detail-list-label">Ghi chú</span>
                    <div className="admin-detail-list-value">{viewing.reviewNote}</div>
                  </div>
                )}
              </div>
            )}

            {viewing.isActiveNow && (
              <div className="trace-req-form-card">
                <TextAreaField
                  label="Lý do thu hồi sớm (tùy chọn)"
                  rows={2}
                  maxLength={400}
                  placeholder="Nhập ghi chú nếu kết thúc buổi làm việc sớm..."
                  value={reviewNote}
                  onChange={(val) => {
                    setReviewNote(val);
                    if (noteError) setNoteError(null);
                  }}
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
