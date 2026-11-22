"use client";

import { useState } from "react";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import { useDebounced } from "@/components/admin/catalog/use-debounced";
import BlockState from "@/components/admin/shared/BlockState";
import Pagination from "@/components/admin/shared/Pagination";
import { useAuth } from "@/components/auth/AuthProvider";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { isCoopStaffRole } from "@/constants/roles";
import { useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { usePersistedEditableSelection, usePersistedState } from "@/lib/back-navigation";
import type { AccountRecord } from "@/types/accounts";
import AccountFormModal from "./AccountFormModal";
import { ROLE_LABELS } from "./settings-data";

const PAGE_SIZE = 20;

function cleanScopeText(raw: string): string {
  return raw.replace(/\s*[—–]\s*/g, ", ");
}

function formatAccountScope(a: AccountRecord): string {
  if (a.role === "enterprise") {
    if (a.enterpriseName) {
      return cleanScopeText(
        `${a.enterpriseName}${a.enterprisePackhouseCode ? ` (${a.enterprisePackhouseCode})` : ""}`,
      );
    }
    return "Chưa gắn doanh nghiệp";
  }
  if (a.role === "village_officer") {
    if (a.villageName && a.assignedCommune) {
      return cleanScopeText(`${a.villageName}, ${a.assignedCommune}`);
    }
    return cleanScopeText(a.villageName || a.assignedCommune || "Xã Cư Né");
  }
  if (a.role === "inspector") {
    return cleanScopeText(a.assignedRegion || "Tỉnh Đắk Lắk");
  }
  if (isCoopStaffRole(a.role)) {
    return a.coopCode || "HTX-CUNE";
  }
  return a.villageName ? cleanScopeText(a.villageName) : "-";
}

function formatLastLogin(isoOrRaw: string | null | undefined): string {
  if (!isoOrRaw) return "Chưa đăng nhập";
  const d = new Date(isoOrRaw);
  if (Number.isNaN(d.getTime())) return isoOrRaw;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${hh}:${mm}:${ss}, ${dd}/${mo}/${yyyy}`;
}

export default function AccountsTab({
  createTrigger = 0,
}: {
  createTrigger?: number;
}) {
  const { can } = useAuth();
  const canCreateAccount = can("accounts", "create");
  const canUpdateAccount = can("accounts", "update");
  const canDeleteAccount = can("accounts", "delete");
  const [q, setQ] = useState("");
  const [role, setRole] = usePersistedState("admin:accounts:role", "");
  const [status, setStatus] = usePersistedState("admin:accounts:status", "");
  const [page, setPage] = usePersistedState("admin:accounts:page", 1);
  const debouncedQ = useDebounced(q);

  const list = useApiList<AccountRecord>("accounts", {
    q: debouncedQ,
    role,
    status,
    page,
    pageSize: PAGE_SIZE,
  });

  const [viewingSnapshot, setViewingSnapshot] = useState<AccountRecord | null>(null);
  const viewing =
    viewingSnapshot != null
      ? (list.rows.find((r) => r.id === viewingSnapshot.id) ?? viewingSnapshot)
      : null;

  const [editing, setEditing] = usePersistedEditableSelection(
    "admin:accounts:edit",
    list.rows,
    (r) => r.id,
    list.loading,
  );
  const [deleting, setDeleting] = useState<AccountRecord | null>(null);
  const [revokingAccount, setRevokingAccount] = useState<AccountRecord | null>(null);
  const [resetting2faAccount, setResetting2faAccount] = useState<AccountRecord | null>(null);
  const [lastTrigger, setLastTrigger] = useState(createTrigger);

  if (createTrigger !== lastTrigger) {
    setLastTrigger(createTrigger);
    setEditing("new");
  }

  const toggleStatus = useMutation(async (account: AccountRecord) => {
    const nextStatus = account.status === "active" ? "locked" : "active";
    await api.patch(`/accounts/${account.id}`, { status: nextStatus });
    return nextStatus;
  });

  const handleToggleLock = async (account: AccountRecord) => {
    const nextStatus = await toggleStatus.run(account);
    if (nextStatus) {
      setViewingSnapshot((prev) =>
        prev && prev.id === account.id ? { ...prev, status: nextStatus } : prev,
      );
      toast.success(
        nextStatus === "locked"
          ? `Đã khóa tài khoản ${account.username}.`
          : `Đã mở khóa tài khoản ${account.username}.`,
      );
      void list.refresh();
    } else if (toggleStatus.error) {
      toast.error(toggleStatus.error);
    }
  };

  return (
    <>
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo họ tên, tên đăng nhập..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="filter-select"
          value={role}
          aria-label="Lọc theo vai trò"
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi vai trò</option>
          {Object.entries(ROLE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={status}
          aria-label="Lọc theo trạng thái"
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="locked">Đã khóa</option>
        </select>
        {canCreateAccount && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            Thêm tài khoản
          </button>
        )}
      </div>

      <BlockState
        loading={list.loading}
        error={list.error}
        empty={list.rows.length === 0}
        emptyText="Không tìm thấy tài khoản phù hợp."
        onRetry={() => void list.refresh()}
      />

      {list.rows.length > 0 && (
        <>
          <ul className="admin-hh-list" role="list" aria-label="Danh sách tài khoản">
            {list.rows.map((a) => {
              const isLocked = a.status !== "active";
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="admin-diary-row admin-hh-row"
                    onClick={() => setViewingSnapshot(a)}
                  >
                    <span className="admin-audit-row-main">
                      <strong className="admin-diary-hh">{a.fullName}</strong>
                      <span className="admin-audit-row-sub">
                        {a.username}
                        {isLocked ? " (Đã khóa)" : ""}
                      </span>
                    </span>
                    <span className="admin-diary-right admin-hh-right">
                      <span
                        className="admin-hh-area"
                        style={{ color: isLocked ? "#b91c1c" : "#256b45" }}
                      >
                        {ROLE_LABELS[a.role] ?? a.role}
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
              unit="tài khoản"
              onChange={setPage}
            />
          </div>
        </>
      )}

      {viewing && (
        <Modal
          title={viewing.fullName}
          onClose={() => setViewingSnapshot(null)}
          width={560}
          footer={
            <>
              {canDeleteAccount && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    const target = viewing;
                    setViewingSnapshot(null);
                    setDeleting(target);
                  }}
                >
                  Xóa
                </button>
              )}
              {canUpdateAccount && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    const target = viewing;
                    setViewingSnapshot(null);
                    setEditing(target);
                  }}
                >
                  Sửa
                </button>
              )}
              <ModalDismissButton
                className="btn btn-primary"
                onFallbackClose={() => setViewingSnapshot(null)}
              >
                Đóng
              </ModalDismissButton>
            </>
          }
        >
          <div className="admin-detail-list-card">
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Họ và tên</span>
              <div className="admin-detail-list-value" style={{ fontWeight: 600 }}>
                {viewing.fullName}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Tên đăng nhập</span>
              <div
                className="admin-detail-list-value"
                style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
              >
                {viewing.username}
              </div>
            </div>
            {viewing.email && (
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Email</span>
                <div className="admin-detail-list-value">{viewing.email}</div>
              </div>
            )}
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Vai trò</span>
              <div className="admin-detail-list-value" style={{ fontWeight: 600, color: "#256b45" }}>
                {ROLE_LABELS[viewing.role] ?? viewing.role}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Phạm vi truy xuất</span>
              <div className="admin-detail-list-value">{formatAccountScope(viewing)}</div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Xác thực 2 lớp</span>
              <div
                className="admin-detail-list-value"
                style={{ fontWeight: 600, color: viewing.twoFactorEnabled ? "#15803d" : "#5f6d66" }}
              >
                {viewing.twoFactorEnabled ? "Đã bật OTP" : "Chưa bật"}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Phiên đang mở</span>
              <div
                className="admin-detail-list-value"
                style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}
              >
                {viewing.activeSessionCount ?? 0} phiên
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Đăng nhập cuối</span>
              <div
                className="admin-detail-list-value"
                style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}
              >
                {formatLastLogin(viewing.lastLoginAt)}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Trạng thái</span>
              <div className="admin-detail-list-value">
                <span className={`badge ${viewing.status === "active" ? "badge-green" : "badge-red"}`}>
                  {viewing.status === "active" ? "Hoạt động" : "Đã khóa"}
                </span>
              </div>
            </div>
          </div>

          {canUpdateAccount && (
            <div className="account-detail-sec-actions">
              <button
                type="button"
                className={`btn ${viewing.status === "active" ? "btn-gold" : "btn-outline"} account-detail-sec-btn`}
                disabled={toggleStatus.pending}
                onClick={() => void handleToggleLock(viewing)}
              >
                {viewing.status === "active" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
              </button>
              {(viewing.activeSessionCount ?? 0) > 0 && (
                <button
                  type="button"
                  className="btn btn-outline account-detail-sec-btn"
                  onClick={() => setRevokingAccount(viewing)}
                >
                  Xóa các phiên đang mở
                </button>
              )}
              {viewing.twoFactorEnabled && (
                <button
                  type="button"
                  className="btn btn-outline account-detail-sec-btn"
                  onClick={() => setResetting2faAccount(viewing)}
                >
                  Đặt lại xác thực 2 lớp
                </button>
              )}
            </div>
          )}
        </Modal>
      )}

      {editing && (
        <AccountFormModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.refresh();
          }}
        />
      )}

      {deleting && (
        <ConfirmAction
          title="Xóa tài khoản"
          message={
            <>
              Bạn có chắc chắn muốn xóa tài khoản <strong>{deleting.fullName}</strong> (<code>{deleting.username}</code>)?
            </>
          }
          path={`/accounts/${deleting.id}`}
          successMessage="Đã xóa tài khoản."
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            void list.refresh();
          }}
        />
      )}

      {revokingAccount && (
        <ConfirmAction
          title="Đăng xuất từ xa các phiên"
          message={
            <>
              Xác nhận thu hồi toàn bộ phiên đăng nhập của tài khoản <strong>{revokingAccount.fullName}</strong> (
              <code>{revokingAccount.username}</code>)?
            </>
          }
          path={`/accounts/${revokingAccount.id}/revoke-sessions`}
          method="post"
          confirmLabel="Thu hồi phiên"
          danger
          successMessage={`Đã đăng xuất từ xa các phiên của tài khoản ${revokingAccount.username}.`}
          onClose={() => setRevokingAccount(null)}
          onDone={() => {
            setViewingSnapshot((prev) =>
              prev && prev.id === revokingAccount.id ? { ...prev, activeSessionCount: 0 } : prev,
            );
            setRevokingAccount(null);
            void list.refresh();
          }}
        />
      )}

      {resetting2faAccount && (
        <ConfirmAction
          title="Đặt lại xác thực 2 lớp"
          message={
            <>
              Xác nhận xóa cấu hình xác thực 2 lớp hiện tại của tài khoản <strong>{resetting2faAccount.fullName}</strong> (
              <code>{resetting2faAccount.username}</code>)?
            </>
          }
          path={`/accounts/${resetting2faAccount.id}/reset-2fa`}
          method="post"
          confirmLabel="Xóa 2FA"
          danger
          successMessage={`Đã đặt lại xác thực 2 lớp cho tài khoản ${resetting2faAccount.username}.`}
          onClose={() => setResetting2faAccount(null)}
          onDone={() => {
            setViewingSnapshot((prev) =>
              prev && prev.id === resetting2faAccount.id ? { ...prev, twoFactorEnabled: false } : prev,
            );
            setResetting2faAccount(null);
            void list.refresh();
          }}
        />
      )}
    </>
  );
}
