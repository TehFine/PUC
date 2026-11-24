"use client";

import { useEffect, useState } from "react";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import BlockState from "@/components/admin/shared/BlockState";
import {
  ADMIN_SYSTEM_TAB_EVENT,
  consumePendingDeletionRequestId,
  notifyCountsChanged,
  onCountsChanged,
} from "@/components/admin/shared/counts-events";
import Pagination from "@/components/admin/shared/Pagination";
import { useAuth } from "@/components/auth/AuthProvider";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { FormError, Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { TextAreaField } from "@/components/ui/form/fields";
import { refreshMountedApiQueries, useApiList, useMutation } from "@/hooks/use-api";
import { invalidateQueries, NOTIFICATIONS_PATH } from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import { usePersistedState } from "@/lib/back-navigation";
import type { DeletionRequestRecord, DeletionRequestStatus } from "@/types/accounts";
import { ROLE_LABELS } from "./settings-data";

const PAGE_SIZE = 20;

const STATUS_META: Record<
  DeletionRequestStatus,
  { label: string; color: string; badge: string }
> = {
  pending: { label: "Chờ Phó HTX duyệt", color: "#9a6712", badge: "badge-gold" },
  approved: { label: "Đã phê duyệt xóa", color: "#15803d", badge: "badge-green" },
  rejected: { label: "Đã từ chối", color: "#b91c1c", badge: "badge-red" },
  cancelled: { label: "Đã thu hồi", color: "#5f6d66", badge: "badge-gray" },
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

export default function DeletionRequestsTab({
  onReviewed,
}: {
  onReviewed?: () => void;
}) {
  const { session } = useAuth();
  const user = session?.user;
  const isDeputyReviewer = user?.role === "htx_deputy";

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q);
  const [statusFilter, setStatusFilter] = usePersistedState("admin:delreq:status", "");
  const [targetTypeFilter, setTargetTypeFilter] = usePersistedState("admin:delreq:type", "");
  const [page, setPage] = usePersistedState("admin:delreq:page", 1);

  const list = useApiList<DeletionRequestRecord>("deletion-requests", {
    q: debouncedQ || undefined,
    status: statusFilter || undefined,
    targetType: targetTypeFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const [viewingSnapshot, setViewingSnapshot] = useState<DeletionRequestRecord | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<number | null>(() => {
    const fromStorage = consumePendingDeletionRequestId();
    if (fromStorage) return fromStorage;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const rawId = sp.get("id");
      if (rawId && /^\d+$/.test(rawId)) return Number(rawId);
    }
    return null;
  });
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    return onCountsChanged(() => {
      refreshMountedApiQueries("/deletion-requests");
    });
  }, []);

  useEffect(() => {
    const onTabSwitch = () => {
      const nextId = consumePendingDeletionRequestId();
      if (nextId) {
        setQ("");
        setStatusFilter("");
        setTargetTypeFilter("");
        setPage(1);
        setReviewNote("");
        setViewingSnapshot(null);
        setPendingTargetId(nextId);
        refreshMountedApiQueries("/deletion-requests");
      }
    };
    window.addEventListener(ADMIN_SYSTEM_TAB_EVENT, onTabSwitch);
    return () => window.removeEventListener(ADMIN_SYSTEM_TAB_EVENT, onTabSwitch);
  }, [setPage, setStatusFilter, setTargetTypeFilter]);

  const viewing =
    viewingSnapshot != null
      ? (list.rows.find((r) => r.id === viewingSnapshot.id) ?? viewingSnapshot)
      : pendingTargetId != null
        ? (list.rows.find((r) => Number(r.id) === Number(pendingTargetId)) ?? null)
        : null;

  const closeDetailModal = () => {
    setViewingSnapshot(null);
    setPendingTargetId(null);
  };

  const approveMut = useMutation(async (req: DeletionRequestRecord) => {
    return api.post(`/deletion-requests/${req.id}/approve`, {
      note: reviewNote.trim() || null,
    });
  });

  const rejectMut = useMutation(async (req: DeletionRequestRecord) => {
    return api.post(`/deletion-requests/${req.id}/reject`, {
      note: reviewNote.trim() || null,
    });
  });

  const cancelMut = useMutation(async (req: DeletionRequestRecord) => {
    return api.post(`/deletion-requests/${req.id}/cancel`, {});
  });

  const anyPendingAction = approveMut.pending || rejectMut.pending || cancelMut.pending;
  const activeError = approveMut.error || rejectMut.error || cancelMut.error;

  const afterAction = (msg: string) => {
    toast.success(msg);
    closeDetailModal();
    setReviewNote("");
    notifyCountsChanged();
    invalidateQueries(NOTIFICATIONS_PATH);
    void list.refresh();
    onReviewed?.();
  };

  const handleApprove = async (req: DeletionRequestRecord) => {
    const res = await approveMut.run(req);
    if (res) {
      afterAction(`Đã phê duyệt và hoàn tất xóa ${req.targetName}.`);
    }
  };

  const handleReject = async (req: DeletionRequestRecord) => {
    const res = await rejectMut.run(req);
    if (res) {
      afterAction(`Đã từ chối yêu cầu xóa ${req.targetName}.`);
    }
  };

  const handleCancel = async (req: DeletionRequestRecord) => {
    const res = await cancelMut.run(req);
    if (res) {
      afterAction(`Đã thu hồi yêu cầu xóa ${req.targetName}.`);
    }
  };

  return (
    <>
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo họ tên, mã định danh, người yêu cầu..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="filter-select"
          value={targetTypeFilter}
          aria-label="Lọc theo loại đối tượng"
          onChange={(e) => {
            setTargetTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi đối tượng</option>
          <option value="account">Tài khoản hệ thống</option>
          <option value="household">Hộ thành viên HTX</option>
        </select>
        <select
          className="filter-select"
          value={statusFilter}
          aria-label="Lọc theo trạng thái duyệt"
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi trạng thái</option>
          <option value="pending">Chờ Phó HTX duyệt</option>
          <option value="approved">Đã phê duyệt xóa</option>
          <option value="rejected">Đã từ chối</option>
          <option value="cancelled">Đã thu hồi</option>
        </select>
      </div>

      <BlockState
        loading={list.loading}
        error={list.error}
        empty={list.rows.length === 0}
        emptyText="Chưa có yêu cầu xóa thành viên hoặc tài khoản nào."
        onRetry={() => void list.refresh()}
      />

      {list.rows.length > 0 && (
        <>
          <ul className="admin-hh-list" role="list" aria-label="Danh sách yêu cầu xóa thành viên">
            {list.rows.map((r) => {
              const st = STATUS_META[r.status] ?? STATUS_META.pending;
              const kindText = r.targetType === "account" ? "Tài khoản" : "Hộ thành viên";
              const requesterRoleText = ROLE_LABELS[r.requestedByRole] ?? r.requestedByRole;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="admin-diary-row admin-hh-row"
                    onClick={() => {
                      setReviewNote("");
                      setPendingTargetId(null);
                      setViewingSnapshot(r);
                    }}
                  >
                    <span className="admin-audit-row-main">
                      <strong className="admin-diary-hh">{r.targetName}</strong>
                      <span className="admin-audit-row-sub">
                        {r.targetCode}, bởi {r.requestedByName} ({requesterRoleText})
                      </span>
                    </span>
                    <span className="admin-diary-right admin-hh-right">
                      <span className="admin-diary-meta-stack">
                        <span className="admin-hh-area" style={{ color: st.color }}>
                          {st.label}
                        </span>
                        <span className="admin-diary-verify-sub">{kindText}</span>
                      </span>
                      <DetailArrowIcon className="admin-diary-arrow" size={20} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="admin-hh-pagination">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={list.total}
              unit="yêu cầu"
              onChange={setPage}
            />
          </div>
        </>
      )}

      {viewing && (
        <Modal
          title="Chi tiết yêu cầu xóa thành viên"
          onClose={anyPendingAction ? () => undefined : closeDetailModal}
          width={560}
          footer={
            <>
              {viewing.status === "pending" &&
                isDeputyReviewer &&
                Number(viewing.requestedBy) !== Number(user?.id) && (
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
                      className="btn btn-danger"
                      disabled={anyPendingAction}
                      onClick={() => void handleApprove(viewing)}
                    >
                      {approveMut.pending ? "Đang xóa..." : "Phê duyệt xóa"}
                    </button>
                  </>
                )}
              {viewing.status === "pending" &&
                !isDeputyReviewer &&
                (Number(viewing.requestedBy) === Number(user?.id) || user?.role === "admin") && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={anyPendingAction}
                    onClick={() => void handleCancel(viewing)}
                  >
                    {cancelMut.pending ? "Đang thu hồi..." : "Thu hồi yêu cầu"}
                  </button>
                )}
              <ModalDismissButton
                className="btn btn-primary"
                disabled={anyPendingAction}
                onFallbackClose={closeDetailModal}
              >
                Đóng
              </ModalDismissButton>
            </>
          }
        >
          <div className="admin-detail-list-card">
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Loại hồ sơ</span>
              <div className="admin-detail-list-value" style={{ fontWeight: 600 }}>
                {viewing.targetType === "account" ? "Tài khoản hệ thống" : "Hộ thành viên HTX"}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Đối tượng đề nghị xóa</span>
              <div className="admin-detail-list-value" style={{ fontWeight: 600 }}>
                {viewing.targetName}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Mã định danh</span>
              <div
                className="admin-detail-list-value"
                style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
              >
                {viewing.targetCode}
              </div>
            </div>
            {viewing.targetRole && (
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Vai trò</span>
                <div className="admin-detail-list-value">
                  {ROLE_LABELS[viewing.targetRole] ?? viewing.targetRole}
                </div>
              </div>
            )}
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Người đề nghị</span>
              <div className="admin-detail-list-value">
                <strong>{viewing.requestedByName}</strong> (
                {ROLE_LABELS[viewing.requestedByRole] ?? viewing.requestedByRole})
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Thời gian gửi</span>
              <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatDateTimeVn(viewing.createdAt)}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Lý do đề nghị xóa</span>
              <div className="admin-detail-list-value">
                {viewing.reason || "Không ghi kèm lý do chi tiết"}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Trạng thái</span>
              <div className="admin-detail-list-value">
                <span className={`badge ${(STATUS_META[viewing.status] ?? STATUS_META.pending).badge}`}>
                  {(STATUS_META[viewing.status] ?? STATUS_META.pending).label}
                </span>
              </div>
            </div>
            {viewing.reviewedByName && (
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Phó HTX xét duyệt</span>
                <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <strong>{viewing.reviewedByName}</strong> ({formatDateTimeVn(viewing.reviewedAt)})
                </div>
              </div>
            )}
            {viewing.reviewNote && (
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Ý kiến phản hồi</span>
                <div className="admin-detail-list-value">{viewing.reviewNote}</div>
              </div>
            )}
          </div>

          {viewing.status === "pending" &&
            isDeputyReviewer &&
            Number(viewing.requestedBy) !== Number(user?.id) && (
              <div style={{ marginTop: 14 }}>
                <TextAreaField
                  label="Ghi chú xét duyệt của Phó HTX"
                  rows={2}
                  maxLength={500}
                  value={reviewNote}
                  onChange={setReviewNote}
                  placeholder="Ghi chú căn cứ đồng ý xóa hoặc lý do từ chối (tùy chọn)..."
                />
              </div>
            )}

          {viewing.status === "pending" && !isDeputyReviewer && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #d4d4d2",
                background: "#f7f7f5",
                fontSize: 12.5,
                color: "#5f6d66",
                lineHeight: 1.45,
              }}
            >
              Chỉ Phó HTX mới có quyền phê duyệt hoặc từ chối yêu cầu này để đảm bảo kiểm soát chéo minh bạch.
            </div>
          )}

          <FormError message={activeError} />
        </Modal>
      )}
    </>
  );
}

