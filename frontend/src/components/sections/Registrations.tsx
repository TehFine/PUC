"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notifyCountsChanged, onCountsChanged } from "@/components/admin/shared/counts-events";
import TableState from "@/components/admin/shared/TableState";
import { ROLE_LABELS } from "@/components/settings/settings-data";
import { ConfirmDialog, FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { refreshMountedApiQueries, useApi } from "@/hooks/use-api";
import { invalidateQueries, NOTIFICATIONS_PATH } from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import { copySensitiveWithAutoClear } from "@/lib/request-security";
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
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [resetBusyId, setResetBusyId] = useState<number | null>(null);

  const [target, setTarget] = useState<Registration | null>(null);
  const [query, setQuery] = useState("");
  const [households, setHouseholds] = useState<FreeHousehold[]>([]);
  const [householdId, setHouseholdId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const {
    data: regPayload,
    loading,
    error,
    refresh: refreshRegistrations,
  } = useApi<{
    data: Registration[];
    passwordResets?: PasswordResetRequest[];
    total?: number;
  }>("/registrations");

  const rows = useMemo(() => regPayload?.data ?? [], [regPayload?.data]);
  const passwordResets = useMemo(
    () => regPayload?.passwordResets ?? [],
    [regPayload?.passwordResets],
  );

  useEffect(() => {
    if (!regPayload) return;
    const nextResets = regPayload.passwordResets ?? [];
    onCountChange?.(regPayload.total ?? regPayload.data.length + nextResets.length);
  }, [regPayload, onCountChange]);

  useEffect(() => {
    return onCountsChanged(() => {
      refreshMountedApiQueries("/registrations");
    });
  }, []);

  const load = useCallback(async () => {
    invalidateQueries(NOTIFICATIONS_PATH);
    await refreshRegistrations();
  }, [refreshRegistrations]);

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

  const [rejectingRow, setRejectingRow] = useState<Registration | null>(null);
  const [rejectingBusy, setRejectingBusy] = useState(false);
  const [confirmResetAction, setConfirmResetAction] = useState<{
    kind: "approve" | "reject";
    row: PasswordResetRequest;
  } | null>(null);
  const [issuedTempPassword, setIssuedTempPassword] = useState<{
    username: string;
    fullName: string;
    temporaryPassword: string;
  } | null>(null);
  const [copiedTempPassword, setCopiedTempPassword] = useState(false);

  const reject = async (row: Registration) => {
    setRejectingBusy(true);
    try {
      await api.post(`/registrations/${row.id}/reject`);
      toast.success(`Đã từ chối và xóa đăng ký của ${row.fullName}.`);
      setRejectingRow(null);
      notifyCountsChanged();
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setRejectingBusy(false);
    }
  };

  const approvePasswordReset = async (row: PasswordResetRequest) => {
    setResetBusyId(row.id);
    try {
      const res = await api.post<{
        id: number;
        userId: number;
        status: string;
        username: string;
        temporaryPassword: string;
      }>(`/registrations/password-resets/${row.id}/approve`);
      setConfirmResetAction(null);
      setCopiedTempPassword(false);
      setIssuedTempPassword({
        username: res.username || row.username,
        fullName: row.accountName || row.fullName,
        temporaryPassword: res.temporaryPassword,
      });
      toast.success(`Đã cấp mật khẩu tạm thời cho tài khoản ${row.username}.`);
      notifyCountsChanged();
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setResetBusyId(null);
    }
  };

  const rejectPasswordReset = async (row: PasswordResetRequest) => {
    setResetBusyId(row.id);
    try {
      await api.post(`/registrations/password-resets/${row.id}/reject`);
      toast.success(`Đã từ chối yêu cầu cấp lại mật khẩu của ${row.username}.`);
      setConfirmResetAction(null);
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
            Yêu cầu cấp lại mật khẩu chờ duyệt
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
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{row.username}</td>
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
                        ? `${row.householdCode} - ${row.householdName}${row.villageName ? ` (${row.villageName})` : ""}`
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
                          onClick={() => setConfirmResetAction({ kind: "approve", row })}
                        >
                          {isRowBusy ? "Đang xử lý…" : "Duyệt mật khẩu"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={isRowBusy}
                          onClick={() => setConfirmResetAction({ kind: "reject", row })}
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
              Hồ sơ đăng ký tài khoản chờ gắn hộ
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
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{row.phone}</td>
                    <td>{row.villageName ?? "—"}</td>
                    <td>{row.note ?? "—"}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(row.createdAt)}</td>
                    <td>{row.suggestedHouseholdId ? `${row.suggestedHouseholdCode} - ${row.suggestedHouseholdName}` : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => open(row)}>
                          Duyệt
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setRejectingRow(row)}>
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
                  {household.code} - {household.name} - {household.villageName} - {household.phone}
                </option>
              ))}
              {target.suggestedHouseholdId && !households.some((item) => item.id === target.suggestedHouseholdId) && (
                <option value={target.suggestedHouseholdId}>
                  {target.suggestedHouseholdCode} - {target.suggestedHouseholdName} (gợi ý)
                </option>
              )}
            </select>
          </div>
          <FormError message={dialogError} />
        </Modal>
      )}

      {rejectingRow && (
        <ConfirmDialog
          title="Từ chối và xóa đăng ký"
          message={
            <>
              Xác nhận từ chối đăng ký của <strong>{rejectingRow.fullName}</strong> (
              <code>{rejectingRow.phone}</code>)? Hồ sơ tài khoản chờ duyệt này sẽ bị xóa.
            </>
          }
          confirmLabel="Từ chối và xóa"
          danger
          pending={rejectingBusy}
          onConfirm={() => void reject(rejectingRow)}
          onClose={() => {
            if (!rejectingBusy) setRejectingRow(null);
          }}
        />
      )}

      {confirmResetAction && (
        <ConfirmDialog
          title={
            confirmResetAction.kind === "approve"
              ? "Duyệt cấp lại mật khẩu"
              : "Từ chối yêu cầu mật khẩu"
          }
          message={
            confirmResetAction.kind === "approve" ? (
              <>
                Xác nhận duyệt cấp lại mật khẩu cho tài khoản{" "}
                <strong>{confirmResetAction.row.username}</strong> ({confirmResetAction.row.accountName})? Mật khẩu mới sẽ có hiệu lực ngay.
              </>
            ) : (
              <>
                Xác nhận từ chối và hủy yêu cầu cấp lại mật khẩu của{" "}
                <strong>{confirmResetAction.row.fullName}</strong> (<code>{confirmResetAction.row.username}</code>)?
              </>
            )
          }
          confirmLabel={confirmResetAction.kind === "approve" ? "Duyệt mật khẩu" : "Từ chối"}
          danger={confirmResetAction.kind === "reject"}
          pending={resetBusyId === confirmResetAction.row.id}
          onConfirm={() =>
            void (confirmResetAction.kind === "approve"
              ? approvePasswordReset(confirmResetAction.row)
              : rejectPasswordReset(confirmResetAction.row))
          }
          onClose={() => {
            if (resetBusyId === null) setConfirmResetAction(null);
          }}
        />
      )}

      {issuedTempPassword && (
        <Modal
          title="Mật khẩu tạm thời một lần"
          onClose={() => setIssuedTempPassword(null)}
          width={460}
          footer={
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  void copySensitiveWithAutoClear(issuedTempPassword.temporaryPassword).then((ok) => {
                    if (ok) {
                      setCopiedTempPassword(true);
                      window.setTimeout(() => setCopiedTempPassword(false), 2400);
                    }
                  });
                }}
              >
                {copiedTempPassword ? "Đã sao chép mật khẩu" : "Sao chép mật khẩu"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIssuedTempPassword(null)}
              >
                Đã ghi lại, đóng
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Cung cấp mật khẩu tạm thời dưới đây cho <strong>{issuedTempPassword.fullName}</strong> (tài khoản{" "}
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{issuedTempPassword.username}</strong>) để đăng nhập và đổi sang mật khẩu riêng. Mật khẩu này chỉ hiển thị một lần.
          </p>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 6,
              border: "1px solid #d4d4d2",
              background: "#f7f7f5",
              textAlign: "center",
            }}
          >
            <code
              data-no-translate="true"
              translate="no"
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "#14372f",
                fontVariantNumeric: "tabular-nums",
                userSelect: "all",
              }}
            >
              {issuedTempPassword.temporaryPassword}
            </code>
          </div>
        </Modal>
      )}
    </>
  );
}
