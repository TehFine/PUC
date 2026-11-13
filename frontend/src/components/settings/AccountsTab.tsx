"use client";

import { useState } from "react";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import Pager from "@/components/admin/catalog/Pager";
import { useDebounced } from "@/components/admin/catalog/use-debounced";
import { toast } from "@/components/ui/Toast";
import { useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { AccountRecord } from "@/types/accounts";
import AccountFormModal from "./AccountFormModal";
import { ROLE_LABELS } from "./settings-data";

const PAGE_SIZE = 20;

export default function AccountsTab({
  createTrigger = 0,
}: {
  createTrigger?: number;
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);

  const list = useApiList<AccountRecord>("accounts", {
    q: debouncedQ,
    role,
    status,
    page,
    pageSize: PAGE_SIZE,
  });

  const [editing, setEditing] = useState<AccountRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<AccountRecord | null>(null);
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
      toast.success(nextStatus === "locked" ? `Đã khóa tài khoản ${account.username}.` : `Đã mở khóa tài khoản ${account.username}.`);
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
            placeholder="Tìm theo họ tên, tên đăng nhập…"
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
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="locked">Khóa</option>
        </select>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Thêm tài khoản
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Họ &amp; Tên</th>
              <th>SĐT / Username</th>
              <th>Vai trò</th>
              <th>Thôn / Địa bàn</th>
              <th>Trạng thái</th>
              <th>Đăng nhập cuối</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <ListStatusRow
              colSpan={7}
              loading={list.loading}
              error={list.error}
              empty={list.rows.length === 0}
              onRetry={list.refresh}
            />
            {list.rows.map((a) => {
              const initialChar = ((a.fullName ?? "").trim().split(" ").slice(-1)[0]?.[0] ?? "U").toUpperCase();
              const isActive = a.status === "active";
              return (
                <tr key={a.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div
                        style={{
                          width: 29,
                          height: 29,
                          background: "#e6f2eb",
                          border: "1px solid #cfe4d8",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--green-700)",
                          flexShrink: 0,
                        }}
                      >
                        {initialChar}
                      </div>
                      <span style={{ fontWeight: 500 }}>{a.fullName}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{a.username}</span>
                      {a.email && (
                        <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{a.email}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 500,
                        background: "#f2f8f4",
                        color: "#256b45",
                        border: "1px solid #d5eadd",
                      }}
                    >
                      {ROLE_LABELS[a.role] ?? a.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{a.villageName || "—"}</td>
                  <td>
                    <span className={`badge ${isActive ? "badge-green" : "badge-red"}`}>
                      {isActive ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                    {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString("vi-VN") : "Chưa đăng nhập"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(a)}>
                        Sửa
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${isActive ? "btn-gold" : "btn-outline"}`}
                        disabled={toggleStatus.pending}
                        onClick={() => void handleToggleLock(a)}
                      >
                        {isActive ? "Khóa" : "Mở"}
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(a)}>
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="table-footer">
          <span>
            Hiển thị <strong>{list.rows.length}</strong> / <strong>{list.total}</strong> tài khoản
          </span>
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onChange={setPage} />
        </div>
      </div>

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
    </>
  );
}
