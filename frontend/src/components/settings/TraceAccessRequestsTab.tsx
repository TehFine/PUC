"use client";

import { useEffect, useState } from "react";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import BlockState from "@/components/admin/shared/BlockState";
import {
  ADMIN_SYSTEM_TAB_EVENT,
  consumePendingTraceRequestId,
  notifyCountsChanged,
} from "@/components/admin/shared/counts-events";
import Pagination from "@/components/admin/shared/Pagination";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { FormError, Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { SelectField, TextAreaField } from "@/components/ui/form/fields";
import { useApiList, useMutation } from "@/hooks/use-api";
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
  fruit: "Tem trái sầu riêng",
  plot: "Thửa đất",
};

const TIER_LABELS: Record<TraceAccessTier, string> = {
  enterprise: "Cấp 2 - Đối tác và Thực địa vườn",
  authority: "Cấp 3 - Thanh tra Quản lý",
};

const SCOPE_LABELS: Record<TraceAccessScopeMode, string> = {
  record: "Chỉ đúng hồ sơ vừa quét",
  zone: "Toàn bộ vùng trồng PUC này",
  coop: "Toàn bộ vùng trồng và lô của HTX",
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

function resolveStatusBadge(row: TraceAccessRequestRecord): {
  label: string;
  badgeClass: string;
} {
  if (row.status === "pending") {
    return { label: "Chờ phê duyệt", badgeClass: "badge-gold" };
  }
  if (row.status === "approved") {
    if (row.isActiveNow) {
      return { label: "Đang mở quyền", badgeClass: "badge-green" };
    }
    return { label: "Đã hết hạn", badgeClass: "badge-gray" };
  }
  if (row.status === "rejected") {
    return { label: "Đã từ chối", badgeClass: "badge-red" };
  }
  return { label: "Đã thu hồi", badgeClass: "badge-gray" };
}

export default function TraceAccessRequestsTab({
  onReviewed,
}: {
  onReviewed?: () => void;
}) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q);
  const [statusFilter, setStatusFilter] = usePersistedState("admin:tracereq:status", "");
  const [tierFilter, setTierFilter] = usePersistedState("admin:tracereq:tier", "");
  const [page, setPage] = usePersistedState("admin:tracereq:page", 1);

  const list = useApiList<TraceAccessRequestRecord>("trace-requests", {
    q: debouncedQ || undefined,
    status: statusFilter || undefined,
    requestedTier: tierFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

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

  useEffect(() => {
    const onTabSwitch = () => {
      const nextId = consumePendingTraceRequestId();
      if (nextId) {
        setReviewNote("");
        setViewingSnapshot(null);
        setPendingTargetId(nextId);
      }
    };
    window.addEventListener(ADMIN_SYSTEM_TAB_EVENT, onTabSwitch);
    return () => window.removeEventListener(ADMIN_SYSTEM_TAB_EVENT, onTabSwitch);
  }, []);

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
    setScopeMode(row.scopeMode ?? "zone");
    setDurationHours(String(row.durationHours || 24));
    setReviewNote("");
  };

  const closeDetailModal = () => {
    setViewingSnapshot(null);
    setPendingTargetId(null);
  };

  const approveMut = useMutation(async (req: TraceAccessRequestRecord) => {
    return api.post(`/trace-requests/${req.id}/approve`, {
      grantedTier,
      scopeMode,
      durationHours: Number(durationHours) || 24,
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
  const activeError = approveMut.error || rejectMut.error || revokeMut.error;

  const afterAction = (msg: string) => {
    toast.success(msg);
    closeDetailModal();
    setReviewNote("");
    notifyCountsChanged();
    invalidateQueries(NOTIFICATIONS_PATH);
    void list.refresh();
    onReviewed?.();
  };

  const handleApprove = async (req: TraceAccessRequestRecord) => {
    const res = await approveMut.run(req);
    if (res) {
      afterAction(`Đã phê duyệt và mở quyền tức thời cho đoàn "${req.organization}".`);
    }
  };

  const handleReject = async (req: TraceAccessRequestRecord) => {
    const res = await rejectMut.run(req);
    if (res) {
      afterAction(`Đã từ chối yêu cầu ${req.requestCode}.`);
    }
  };

  const handleRevoke = async (req: TraceAccessRequestRecord) => {
    const res = await revokeMut.run(req);
    if (res) {
      afterAction(`Đã thu hồi quyền xem mở rộng của mã ${req.requestCode}.`);
    }
  };

  return (
    <>
      <div
        className="card"
        style={{
          marginBottom: 14,
          padding: "14px 16px",
          borderRadius: 6,
          border: "1px solid #d4d4d2",
          background: "#fafaf8",
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#14372f", marginBottom: 4 }}>
          Phê duyệt cấp quyền xem hồ sơ đánh giá đột xuất từ hiện trường
        </div>
        <div style={{ fontSize: 12.5, color: "#5f6d66", lineHeight: 1.5 }}>
          Tiếp nhận trực tiếp yêu cầu của đoàn công tác, cơ quan thanh tra hoặc doanh nghiệp đối tác khi quét mã QR tại vườn và kho đóng gói. Ngay khi phê duyệt, màn hình điện thoại của người yêu cầu sẽ tự động mở khóa cấp quyền tương ứng theo thời gian thực.
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 14 }}>
        <input
          type="search"
          className="form-input"
          placeholder="Tìm theo mã yêu cầu, tên người đại diện, đoàn công tác, SĐT hoặc mã lô/thửa..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ minWidth: 260, flex: "1 1 280px" }}
        />

        <select
          className="form-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ phê duyệt</option>
          <option value="active">Đang mở quyền (còn hạn)</option>
          <option value="rejected">Đã từ chối</option>
          <option value="revoked">Đã thu hồi</option>
          <option value="expired">Đã hết hạn</option>
        </select>

        <select
          className="form-select"
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo mức quyền đề nghị"
        >
          <option value="">Tất cả mức quyền</option>
          <option value="enterprise">Cấp 2 - Đối tác và Thực địa vườn</option>
          <option value="authority">Cấp 3 - Thanh tra Quản lý</option>
        </select>
      </div>

      <BlockState
        loading={list.loading && list.rows.length === 0}
        error={list.error}
        empty={!list.loading && !list.error && list.rows.length === 0}
        emptyText="Chưa có yêu cầu cấp quyền truy xuất nào."
        onRetry={list.refresh}
      />

      {list.rows.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table className="table" style={{ fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr>
                  <th>Mã yêu cầu</th>
                  <th>Người đại diện và Đơn vị</th>
                  <th>Hồ sơ quét</th>
                  <th>Mức quyền</th>
                  <th>Thời gian gửi</th>
                  <th>Trạng thái</th>
                  <th style={{ width: 64 }} />
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => {
                  const statusMeta = resolveStatusBadge(row);
                  const kindLabel = TARGET_KIND_LABELS[row.targetKind] || "Hồ sơ";
                  const tierKey = row.grantedTier ?? row.requestedTier;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openDetailModal(row)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <strong style={{ color: "#14372f" }}>{row.requestCode}</strong>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "#121212" }}>
                          {row.requesterName}
                        </div>
                        <div style={{ fontSize: 12, color: "#5f6d66" }}>
                          {row.organization} - SĐT: {row.contactPhone}
                        </div>
                        {row.requesterRoleLabel && (
                          <div style={{ fontSize: 11.5, color: "#8a968f" }}>
                            Tài khoản đăng nhập: {row.requesterUsername} ({row.requesterRoleLabel})
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {kindLabel}: {row.resolvedLotCode || row.scannedCode}
                        </div>
                        {row.pucCode && (
                          <div style={{ fontSize: 12, color: "#5f6d66" }}>PUC: {row.pucCode}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                          {TIER_LABELS[tierKey]}
                        </div>
                        {row.isActiveNow && row.expiresAt && (
                          <div style={{ fontSize: 11.5, color: "#15803d" }}>
                            Hết hạn: {formatDateTimeVn(row.expiresAt)}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12.5, color: "#5f6d66" }}>
                        {formatDateTimeVn(row.createdAt)}
                      </td>
                      <td>
                        <span className={`badge ${statusMeta.badgeClass}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <DetailArrowIcon />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.total}
            onChange={setPage}
            unit="yêu cầu"
          />
        </div>
      )}

      {viewing && (
        <Modal
          title={`Yêu cầu cấp quyền ${viewing.requestCode}`}
          onClose={closeDetailModal}
          footer={
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                width: "100%",
                flexWrap: "wrap",
              }}
            >
              <ModalDismissButton onClick={closeDetailModal} disabled={anyPendingAction}>
                Đóng
              </ModalDismissButton>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {viewing.status === "pending" && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
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
                      {approveMut.pending ? "Đang cấp quyền..." : "Phê duyệt và Cấp quyền ngay"}
                    </button>
                  </>
                )}

                {viewing.isActiveNow && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={anyPendingAction}
                    onClick={() => void handleRevoke(viewing)}
                  >
                    {revokeMut.pending ? "Đang thu hồi..." : "Thu hồi quyền từ xa"}
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14, fontVariantNumeric: "tabular-nums" }}>
            <FormError message={activeError} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "10px 16px",
                padding: "12px 14px",
                border: "1px solid #e2e5e3",
                borderRadius: 6,
                background: "#f7f7f5",
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontSize: 11.5, color: "#8a968f" }}>Người đại diện</div>
                <div style={{ fontWeight: 600, color: "#121212" }}>{viewing.requesterName}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "#8a968f" }}>Đoàn công tác / Đơn vị</div>
                <div style={{ fontWeight: 600, color: "#121212" }}>{viewing.organization}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "#8a968f" }}>Số điện thoại liên hệ</div>
                <div style={{ fontWeight: 600, color: "#14372f" }}>{viewing.contactPhone}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "#8a968f" }}>Tài khoản trên hệ thống</div>
                <div style={{ fontWeight: 500, color: "#121212" }}>
                  {viewing.requesterRoleLabel
                    ? `${viewing.requesterUsername} (${viewing.requesterRoleLabel})`
                    : "Khách quét QR chưa đăng nhập"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "#8a968f" }}>Hồ sơ đang quét</div>
                <div style={{ fontWeight: 600, color: "#121212" }}>
                  {TARGET_KIND_LABELS[viewing.targetKind] || "Hồ sơ"}: {viewing.scannedCode}
                  {viewing.pucCode ? ` (PUC: ${viewing.pucCode})` : ""}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "#8a968f" }}>Thời điểm gửi yêu cầu</div>
                <div style={{ fontWeight: 500, color: "#121212" }}>
                  {formatDateTimeVn(viewing.createdAt)}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "11px 14px",
                border: "1px solid #e2e5e3",
                borderRadius: 6,
                background: "#ffffff",
              }}
            >
              <div style={{ fontSize: 11.5, color: "#8a968f", marginBottom: 4 }}>
                Lý do và nội dung làm việc đột xuất
              </div>
              <div style={{ fontSize: 13.5, color: "#121212", lineHeight: 1.5 }}>
                {viewing.purpose}
              </div>
            </div>

            {viewing.status === "pending" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: "12px 14px",
                  border: "1px solid #d4d4d2",
                  borderRadius: 6,
                  background: "#ffffff",
                }}
              >
                <SelectField
                  label="Mức quyền mở cho đoàn công tác"
                  value={grantedTier}
                  onChange={(val) => setGrantedTier(val as TraceAccessTier)}
                  options={[
                    {
                      value: "enterprise",
                      label:
                        "Cấp 2 - Đánh giá Đối tác và Thẩm định Thực địa vườn (Ẩn SĐT, CCCD hộ dân)",
                    },
                    {
                      value: "authority",
                      label:
                        "Cấp 3 - Thanh tra Quản lý Nhà nước (Mở đầy đủ hộ nguồn, nhật ký BVTV, biên bản)",
                    },
                  ]}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 12,
                  }}
                >
                  <SelectField
                    label="Phạm vi hồ sơ được xem"
                    value={scopeMode}
                    onChange={(val) => setScopeMode(val as TraceAccessScopeMode)}
                    options={[
                      { value: "zone", label: "Toàn bộ vùng trồng PUC này" },
                      { value: "record", label: "Chỉ đúng hồ sơ vừa quét" },
                      {
                        value: "coop",
                        label: "Toàn bộ lô và thửa của HTX trong phiên làm việc",
                      },
                    ]}
                  />

                  <SelectField
                    label="Thời hạn hiệu lực"
                    value={durationHours}
                    onChange={setDurationHours}
                    options={[
                      { value: "4", label: "4 giờ (Buổi làm việc ngắn)" },
                      { value: "12", label: "12 giờ (Trong ngày)" },
                      { value: "24", label: "24 giờ (1 ngày làm việc)" },
                      { value: "48", label: "48 giờ (Đoàn khảo sát 2 ngày)" },
                      { value: "72", label: "72 giờ (Đoàn thanh tra 3 ngày)" },
                    ]}
                  />
                </div>

                <TextAreaField
                  label="Ghi chú phê duyệt hoặc lý do từ chối (tùy chọn)"
                  rows={2}
                  placeholder="Ví dụ: Đồng ý mở hồ sơ phục vụ đoàn khảo sát vùng trồng đột xuất..."
                  value={reviewNote}
                  onChange={setReviewNote}
                />
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "12px 14px",
                  border: "1px solid #e2e5e3",
                  borderRadius: 6,
                  background: "#fafaf8",
                  fontSize: 13,
                }}
              >
                <div>
                  <strong>Kết quả xử lý:</strong> {resolveStatusBadge(viewing).label}
                  {viewing.grantedTier ? ` (${TIER_LABELS[viewing.grantedTier]})` : ""}
                </div>
                {viewing.scopeMode && viewing.status === "approved" && (
                  <div>
                    <strong>Phạm vi cấp:</strong> {SCOPE_LABELS[viewing.scopeMode]}
                  </div>
                )}
                {viewing.expiresAt && (
                  <div>
                    <strong>Hiệu lực đến:</strong> {formatDateTimeVn(viewing.expiresAt)} (Lượt truy cập: {viewing.accessCount})
                  </div>
                )}
                {viewing.reviewedByName && (
                  <div>
                    <strong>Người xử lý:</strong> {viewing.reviewedByName}
                    {viewing.reviewedByRoleLabel ? ` (${viewing.reviewedByRoleLabel})` : ""} lúc{" "}
                    {formatDateTimeVn(viewing.reviewedAt)}
                  </div>
                )}
                {viewing.reviewNote && (
                  <div>
                    <strong>Ghi chú:</strong> {viewing.reviewNote}
                  </div>
                )}

                {viewing.isActiveNow && (
                  <div style={{ marginTop: 6 }}>
                    <TextAreaField
                      label="Lý do thu hồi quyền sớm (tùy chọn)"
                      rows={2}
                      placeholder="Nhập ghi chú nếu kết thúc buổi làm việc sớm..."
                      value={reviewNote}
                      onChange={setReviewNote}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
