"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import TableState from "@/components/admin/shared/TableState";
import { ROLE_LABELS } from "@/components/settings/settings-data";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import type { Role } from "@/types/api";

interface Registration {
  id: number;
  fullName: string;
  phone: string;
  note: string | null;
  createdAt: string;
  villageName: string | null;
  suggestedHouseholdId: number | null;
  suggestedHouseholdCode: string | null;
  suggestedHouseholdName: string | null;
}

interface PasswordResetRequest {
  id: number;
  userId: number;
  username: string;
  fullName: string;
  note: string | null;
  createdAt: string;
  accountName: string;
  role: Role;
  accountStatus: string;
  villageName: string | null;
  householdCode: string | null;
  householdName: string | null;
}

interface FreeHousehold {
  id: number;
  code: string;
  name: string;
  phone: string;
  villageName: string;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Không xử lý được yêu cầu.");

/** Duyệt tài khoản hộ dân tự đăng ký & duyệt yêu cầu cấp lại mật khẩu. */
export default function Registrations({
  embedded = false,
  onCountChange,
}: {
  embedded?: boolean;
  onCountChange?: (count: number) => void;
}) {
  const [rows, setRows] = useState<Registration[]>([]);
  const [passwordResets, setPasswordResets] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [resetBusyId, setResetBusyId] = useState<number | null>(null);

  const [target, setTarget] = useState<Registration | null>(null);
  const [query, setQuery] = useState("");
  const [households, setHouseholds] = useState<FreeHousehold[]>([]);
  const [householdId, setHouseholdId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<{
        data: Registration[];
        passwordResets?: PasswordResetRequest[];
        total?: number;
      }>("/registrations");
      const nextResets = result.passwordResets ?? [];
      setRows(result.data);
      setPasswordResets(nextResets);
      onCountChange?.(result.total ?? result.data.length + nextResets.length);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    let active = true;
    api
      .get<{
        data: Registration[];
        passwordResets?: PasswordResetRequest[];
        total?: number;
      }>("/registrations")
      .then((result) => {
        if (!active) return;
        const nextResets = result.passwordResets ?? [];
        setRows(result.data);
        setPasswordResets(nextResets);
        onCountChange?.(result.total ?? result.data.length + nextResets.length);
      })
      .catch((err) => active && setError(messageOf(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [onCountChange]);

  useEffect(() => {
    if (!target) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .get<{ data: FreeHousehold[] }>(`/registrations/households?q=${encodeURIComponent(query)}`)
        .then((result) => active && setHouseholds(result.data))
        .catch((err) => active && setDialogError(messageOf(err)));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [target, query]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(term) ||
        r.phone.toLowerCase().includes(term) ||
        (r.villageName ?? "").toLowerCase().includes(term) ||
        (r.suggestedHouseholdCode ?? "").toLowerCase().includes(term) ||
        (r.suggestedHouseholdName ?? "").toLowerCase().includes(term) ||
        (r.note ?? "").toLowerCase().includes(term),
    );
  }, [rows, search]);

  const filteredResets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return passwordResets;
    return passwordResets.filter(
      (r) =>
        r.fullName.toLowerCase().includes(term) ||
        r.accountName.toLowerCase().includes(term) ||
        r.username.toLowerCase().includes(term) ||
        (r.villageName ?? "").toLowerCase().includes(term) ||
        (r.householdCode ?? "").toLowerCase().includes(term) ||
        (r.householdName ?? "").toLowerCase().includes(term) ||
        (r.note ?? "").toLowerCase().includes(term),
    );
  }, [passwordResets, search]);

  const open = (row: Registration) => {
    setTarget(row);
    setQuery("");
    setHouseholds([]);
    setHouseholdId(row.suggestedHouseholdId);
    setDialogError(null);
  };
  const close = () => {
    if (!busy) setTarget(null);
  };

  const approve = async () => {
    if (!target || !householdId) return;
    setBusy(true);
    setDialogError(null);
    try {
      await api.post(`/registrations/${target.id}/approve`, { householdId });
      toast.success(`Đã duyệt tài khoản ${target.fullName} (${target.phone}).`);
      notifyCountsChanged();
      setTarget(null);
      await load();
    } catch (err) {
      setDialogError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (row: Registration) => {
    if (!window.confirm(`Từ chối đăng ký của ${row.fullName} (${row.phone})? Tài khoản chờ duyệt sẽ bị xóa.`)) return;
    try {
      await api.post(`/registrations/${row.id}/reject`);
      toast.success(`Đã từ chối đăng ký của ${row.fullName}.`);
      notifyCountsChanged();
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  const approvePasswordReset = async (row: PasswordResetRequest) => {
    if (
      !window.confirm(
        `Xác nhận duyệt cấp lại mật khẩu cho tài khoản ${row.username} (${row.accountName})? Mật khẩu mới người dùng đã đặt sẽ có hiệu lực ngay.`,
      )
    ) {
      return;
    }
    setResetBusyId(row.id);
    try {
      await api.post(`/registrations/password-resets/${row.id}/approve`);
      toast.success(`Đã duyệt cấp lại mật khẩu cho tài khoản ${row.username}.`);
      notifyCountsChanged();
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setResetBusyId(null);
    }
  };

  const rejectPasswordReset = async (row: PasswordResetRequest) => {
    if (!window.confirm(`Từ chối yêu cầu cấp lại mật khẩu của ${row.fullName} (${row.username})?`)) return;
    setResetBusyId(row.id);
    try {
      await api.post(`/registrations/password-resets/${row.id}/reject`);
      toast.success(`Đã từ chối yêu cầu cấp lại mật khẩu của ${row.username}.`);
      notifyCountsChanged();
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setResetBusyId(null);
    }
  };

  return (
    <>
      {!embedded && (
        <div className="page-header">
          <div>
            <h1>Duyệt tài khoản &amp; Cấp lại mật khẩu</h1>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo họ tên, số điện thoại/tên đăng nhập, thôn, mã hộ…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--green-900)" }}>
            Yêu cầu cấp lại mật khẩu chờ duyệt ({filteredResets.length})
          </h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Người yêu cầu</th>
                <th>Tài khoản / SĐT</th>
                <th>Hồ sơ hệ thống</th>
                <th>Thôn / Hộ</th>
                <th>Ghi chú đối chiếu</th>
                <th>Thời gian gửi</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                loading={loading}
                error={error}
                empty={filteredResets.length === 0}
                emptyText="Không có yêu cầu cấp lại mật khẩu nào đang chờ duyệt."
                onRetry={() => void load()}
              />
              {filteredResets.map((row) => {
                const isRowBusy = resetBusyId === row.id;
                return (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 500 }}>{row.fullName}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.username}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 500 }}>{row.accountName}</span>
                        <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                          {ROLE_LABELS[row.role] ?? row.role}
                        </span>
                      </div>
                    </td>
                    <td>
                      {row.householdCode
                        ? `${row.householdCode} · ${row.householdName}${row.villageName ? ` (${row.villageName})` : ""}`
                        : (row.villageName ?? "—")}
                    </td>
                    <td>{row.note ?? "—"}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(row.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={isRowBusy}
                          onClick={() => void approvePasswordReset(row)}
                        >
                          {isRowBusy ? "Đang xử lý…" : "Duyệt mật khẩu"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={isRowBusy}
                          onClick={() => void rejectPasswordReset(row)}
                        >
                          Từ chối
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--green-900)" }}>
              Hồ sơ đăng ký tài khoản chờ gắn hộ ({filteredRows.length})
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Thôn</th>
                  <th>Ghi chú</th>
                  <th>Ngày đăng ký</th>
                  <th>Hộ gợi ý</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={7}
                  loading={loading}
                  error={error}
                  empty={filteredRows.length === 0}
                  emptyText="Không có yêu cầu đăng ký tài khoản nào đang chờ duyệt."
                  onRetry={() => void load()}
                />
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 500 }}>{row.fullName}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.phone}</td>
                    <td>{row.villageName ?? "—"}</td>
                    <td>{row.note ?? "—"}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(row.createdAt)}</td>
                    <td>{row.suggestedHouseholdId ? `${row.suggestedHouseholdCode} · ${row.suggestedHouseholdName}` : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => open(row)}>
                          Duyệt
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => void reject(row)}>
                          Từ chối
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {target && (
        <Modal
          title={`Duyệt đăng ký: ${target.fullName}`}
          onClose={busy ? () => undefined : close}
          width={520}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={close} disabled={busy}>
                Hủy
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void approve()} disabled={busy || !householdId}>
                {busy ? "Đang duyệt…" : "Duyệt tài khoản"}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
            Chọn hộ mà tài khoản <strong>{target.phone}</strong> sẽ được xem dữ liệu. Chỉ hiện các hộ chưa có tài khoản.
          </p>
          <div className="form-group">
            <label htmlFor="registration-search">Tìm hộ theo tên, mã hộ hoặc số điện thoại</label>
            <input id="registration-search" className="form-input" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="registration-household">Hộ</label>
            <select
              id="registration-household"
              className="form-input"
              value={householdId ?? ""}
              onChange={(event) => setHouseholdId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Chọn hộ</option>
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.code} · {household.name} · {household.villageName} · {household.phone}
                </option>
              ))}
              {target.suggestedHouseholdId && !households.some((item) => item.id === target.suggestedHouseholdId) && (
                <option value={target.suggestedHouseholdId}>
                  {target.suggestedHouseholdCode} · {target.suggestedHouseholdName} (gợi ý)
                </option>
              )}
            </select>
          </div>
          <FormError message={dialogError} />
        </Modal>
      )}
    </>
  );
}
