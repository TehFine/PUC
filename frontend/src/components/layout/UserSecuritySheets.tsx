"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BusyButton, InlineError } from "@/components/portal/shared/controls";
import { Field, Sheet } from "@/components/portal/ui";
import { ConfirmDialog, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api-client";
import { copySensitiveWithAutoClear } from "@/lib/request-security";
import type { TwoFactorSetupResponse, UserSessionItem } from "@/types/api";

function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Trình duyệt không xác định";
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const os = /iPhone|iPad/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
      ? "Android"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Thiết bị";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "Trình duyệt";
  return `${browser} trên ${os}${isMobile ? " (Di động)" : ""}`;
}

export function TwoFactorSecuritySheet({
  enabled,
  onClose,
  onChanged,
}: {
  enabled: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [otpInput, setOtpInput] = useState("");
  const [enablePassword, setEnablePassword] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableOtp, setDisableOtp] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const wipeSensitiveState = useCallback(() => {
    setSetupData(null);
    setQrDataUrl("");
    setOtpInput("");
    setEnablePassword("");
    setDisablePassword("");
    setDisableOtp("");
    setBackupCodes(null);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", wipeSensitiveState);
    return () => {
      window.removeEventListener("pagehide", wipeSensitiveState);
      wipeSensitiveState();
    };
  }, [wipeSensitiveState]);

  const startSetup = async () => {
    setBusy(true);
    setErr(null);
    try {
      const [res, qrMod] = await Promise.all([
        api.post<TwoFactorSetupResponse>("/auth/2fa/setup"),
        import("qrcode"),
      ]);
      setSetupData(res);
      const QRCode = qrMod.default ?? qrMod;
      const url = await QRCode.toDataURL(res.otpauthUrl, {
        width: 220,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      setQrDataUrl(url);
    } catch (e) {
      setErr(errorMessage(e, "Không thể khởi tạo khóa xác thực 2 lớp."));
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async (e: FormEvent) => {
    e.preventDefault();
    const clean = otpInput.replace(/\s+/g, "");
    if (!/^[0-9]{6}$/.test(clean)) {
      setErr("Vui lòng nhập đúng 6 chữ số từ ứng dụng xác thực.");
      return;
    }
    if (!enablePassword) {
      setErr("Vui lòng nhập mật khẩu hiện tại để bật xác thực 2 lớp.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ enabled: boolean; backupCodes: string[] }>("/auth/2fa/enable", {
        code: clean,
        currentPassword: enablePassword,
      });
      setBackupCodes(res.backupCodes ?? []);
      setSetupData(null);
      setOtpInput("");
      setEnablePassword("");
      await onChanged();
      toast.success("Đã bật xác thực 2 lớp (OTP)");
    } catch (ex) {
      setErr(errorMessage(ex, "Không bật được xác thực 2 lớp. Vui lòng kiểm tra lại mật khẩu và mã OTP."));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e: FormEvent) => {
    e.preventDefault();
    const cleanDisableOtp = disableOtp.replace(/[\s-]/g, "").toUpperCase();
    if (!disablePassword.trim()) {
      setErr("Vui lòng nhập mật khẩu hiện tại để xác nhận tắt xác thực 2 lớp.");
      return;
    }
    if (!/^(?:[0-9]{6}|[0-9A-Z]{8})$/.test(cleanDisableOtp)) {
      setErr("Vui lòng nhập kèm mã OTP 6 chữ số hoặc mã dự phòng 8 ký tự.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post("/auth/2fa/disable", {
        currentPassword: disablePassword,
        code: cleanDisableOtp,
      });
      wipeSensitiveState();
      await onChanged();
      toast.success("Đã tắt xác thực 2 lớp.");
      onClose();
    } catch (ex) {
      setErr(errorMessage(ex, "Không thể tắt xác thực 2 lớp."));
    } finally {
      setBusy(false);
    }
  };

  const copyBackupCodes = async () => {
    if (!backupCodes?.length) return;
    if (await copySensitiveWithAutoClear(backupCodes.join("\n"))) {
      setCopiedCodes(true);
      toast.success("Đã sao chép mã dự phòng (tự xóa sau 45s)");
      setTimeout(() => setCopiedCodes(false), 2500);
    }
  };

  return (
    <Sheet
      variant="drawer"
      title="Bảo mật xác thực 2 lớp (OTP)"
      onClose={onClose}
      className="pt-password-sheet"
    >
      <div className="pt-form">
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            background: enabled ? "#f0fdf4" : "#f8fafc",
            border: "1px solid #d4d4d2",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: enabled ? "#15803d" : "#121212" }}>
            Trạng thái hiện tại: {enabled ? "Đang bật bảo vệ OTP" : "Chưa kích hoạt"}
          </div>
          <div style={{ color: "#475569", fontSize: 12.5 }}>
            Tài khoản xem dữ liệu chi tiết vùng trồng, cơ sở đóng gói và hồ sơ thanh tra nên bật xác thực 2 lớp (TOTP) bằng ứng dụng Google Authenticator, Microsoft Authenticator hoặc Authy.
          </div>
        </div>

        {backupCodes && backupCodes.length > 0 && (
          <div
            style={{
              padding: "14px",
              borderRadius: 8,
              background: "#fffbeb",
              border: "1px solid #d4d4d2",
            }}
          >
            <strong style={{ display: "block", fontSize: 13.5, color: "#78350f", marginBottom: 6 }}>
              Lưu ngay 8 mã khôi phục dự phòng (chỉ hiển thị một lần)
            </strong>
            <p style={{ fontSize: 12.5, color: "#92400e", margin: "0 0 10px", lineHeight: 1.45 }}>
              Mỗi mã dự phòng chỉ dùng được 1 lần để đăng nhập khi bạn mất điện thoại cài ứng dụng OTP.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 6,
                marginBottom: 10,
              }}
            >
              {backupCodes.map((c) => (
                <code
                  key={c}
                  data-no-translate="true"
                  translate="no"
                  style={{
                    padding: "6px 8px",
                    background: "#ffffff",
                    border: "1px solid #d4d4d2",
                    borderRadius: 5,
                    textAlign: "center",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    fontSize: 13,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {c}
                </code>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <button type="button" className="pt-btn pt-btn-ghost" onClick={() => void copyBackupCodes()}>
                <span>{copiedCodes ? "Đã sao chép danh sách mã" : "Sao chép mã dự phòng"}</span>
              </button>
              <ModalDismissButton className="pt-btn pt-btn-primary" onFallbackClose={onClose}>
                Đã lưu mã, hoàn tất
              </ModalDismissButton>
            </div>
          </div>
        )}

        {!enabled && !setupData && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <InlineError message={err} />
            <BusyButton
              type="button"
              className="pt-btn pt-btn-danger pt-2fa-setup-btn"
              busy={busy}
              busyLabel="Đang tạo mã bảo mật…"
              onClick={() => void startSetup()}
            >
              Thiết lập xác thực 2 lớp (OTP)
            </BusyButton>
          </div>
        )}

        {!enabled && setupData && (
          <form autoComplete="off" data-form-type="other" onSubmit={(e) => void handleEnable(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ textAlign: "center", padding: "12px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="Mã QR thiết lập ứng dụng xác thực OTP"
                  width={200}
                  height={200}
                  style={{ margin: "0 auto 8px", display: "block" }}
                />
              )}
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                Quét mã QR bằng ứng dụng Authenticator hoặc nhập khóa thủ công:
              </div>
              <code
                data-no-translate="true"
                translate="no"
                style={{
                  display: "inline-block",
                  padding: "4px 8px",
                  background: "#f1f5f9",
                  borderRadius: 4,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  wordBreak: "break-all",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {setupData.secret}
              </code>
            </div>

            <Field label="Mã OTP 6 chữ số trên ứng dụng" htmlFor="um-2fa-code">
              <input
                id="um-2fa-code"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={6}
                placeholder="123456"
                value={otpInput}
                onChange={(e) => {
                  setOtpInput(e.target.value);
                  if (err) setErr(null);
                }}
                style={{ fontVariantNumeric: "tabular-nums" }}
                required
              />
            </Field>

            <Field label="Mật khẩu hiện tại" htmlFor="um-2fa-enable-pw">
              <input
                id="um-2fa-enable-pw"
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-lpignore="true"
                data-1p-ignore="true"
                placeholder="Nhập mật khẩu hiện tại để xác nhận"
                value={enablePassword}
                onChange={(e) => {
                  setEnablePassword(e.target.value);
                  if (err) setErr(null);
                }}
                required
              />
            </Field>

            <InlineError message={err} />

            <div className="pt-form-actions">
              <button
                type="button"
                className="pt-btn pt-btn-ghost"
                disabled={busy}
                onClick={() => {
                  setSetupData(null);
                  setOtpInput("");
                  setEnablePassword("");
                  setErr(null);
                }}
              >
                Hủy
              </button>
              <BusyButton
                type="submit"
                className="pt-btn pt-btn-primary"
                busy={busy}
                busyLabel="Đang kích hoạt…"
              >
                Kích hoạt OTP
              </BusyButton>
            </div>
          </form>
        )}

        {enabled && !backupCodes && (
          <form autoComplete="off" data-form-type="other" onSubmit={(e) => void handleDisable(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Mật khẩu hiện tại" htmlFor="um-2fa-disable-pw">
              <input
                id="um-2fa-disable-pw"
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-lpignore="true"
                data-1p-ignore="true"
                placeholder="Nhập mật khẩu hiện tại"
                value={disablePassword}
                onChange={(e) => {
                  setDisablePassword(e.target.value);
                  if (err) setErr(null);
                }}
                required
              />
            </Field>
            <Field label="Mã OTP 6 chữ số hoặc mã dự phòng 8 ký tự" htmlFor="um-2fa-disable-code">
              <input
                id="um-2fa-disable-code"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={12}
                placeholder="123456 hoặc ABCD-2345"
                value={disableOtp}
                onChange={(e) => {
                  setDisableOtp(e.target.value);
                  if (err) setErr(null);
                }}
                style={{ fontVariantNumeric: "tabular-nums" }}
                required
              />
            </Field>

            <InlineError message={err} />

            <div className="pt-form-actions">
              <ModalDismissButton
                className="pt-btn pt-btn-ghost"
                onFallbackClose={onClose}
                disabled={busy}
              >
                Đóng
              </ModalDismissButton>
              <BusyButton
                type="submit"
                className="pt-btn pt-btn-primary"
                busy={busy}
                busyLabel="Đang tắt…"
              >
                Tắt xác thực 2 lớp
              </BusyButton>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  );
}

export function ActiveSessionsSheet({
  onClose,
  onRevokedCurrent,
}: {
  onClose: () => void;
  onRevokedCurrent: () => Promise<void>;
}) {
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | "others" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<UserSessionItem | "others" | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: UserSessionItem[] }>("/auth/sessions");
      setSessions(res.data ?? []);
    } catch (e) {
      setErr(errorMessage(e, "Không tải được danh sách phiên đăng nhập."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .get<{ data: UserSessionItem[] }>("/auth/sessions")
      .then((res) => {
        if (active) setSessions(res.data ?? []);
      })
      .catch((e) => {
        if (active) setErr(errorMessage(e, "Không tải được danh sách phiên đăng nhập."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRevokeOne = async (session: UserSessionItem) => {
    setBusyId(session.id);
    setErr(null);
    try {
      const res = await api.delete<{ revokedCurrent?: boolean }>(`/auth/sessions/${session.id}`);
      setConfirmRevoke(null);
      if (res?.revokedCurrent || session.isCurrent) {
        await onRevokedCurrent();
        return;
      }
      toast.success("Đã xóa phiên đăng nhập từ xa.");
      await loadSessions();
    } catch (e) {
      setErr(errorMessage(e, "Không thể thu hồi phiên đăng nhập này."));
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeOthers = async () => {
    setBusyId("others");
    setErr(null);
    try {
      const res = await api.post<{ revokedCount: number }>("/auth/sessions/revoke-others");
      setConfirmRevoke(null);
      toast.success(`Đã xóa phiên đăng nhập trên ${res.revokedCount ?? 0} thiết bị khác.`);
      await loadSessions();
    } catch (e) {
      setErr(errorMessage(e, "Không thể đăng xuất các thiết bị khác."));
    } finally {
      setBusyId(null);
    }
  };

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <Sheet
      variant="drawer"
      title="Phiên đăng nhập"
      onClose={onClose}
      className="pt-password-sheet"
    >
      <div className="pt-form" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="pt-hint" style={{ margin: 0 }}>
          Danh sách thiết bị đang đăng nhập tài khoản của bạn. Hãy xóa phiên nếu thấy thiết bị lạ hoặc quên đăng xuất.
        </p>

        {otherCount > 0 && (
          <BusyButton
            type="button"
            className="pt-btn pt-btn-danger session-revoke-all-btn"
            busy={busyId === "others"}
            busyLabel="Đang thu hồi…"
            onClick={() => setConfirmRevoke("others")}
          >
            Xóa phiên tất cả thiết bị khác ({otherCount})
          </BusyButton>
        )}

        <InlineError message={err} />

        {loading ? (
          <div style={{ padding: "18px 0", textAlign: "center", fontSize: 13, color: "#64748b" }}>
            Đang tải danh sách thiết bị đang đăng nhập…
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: "18px 0", textAlign: "center", fontSize: 13, color: "#64748b" }}>
            Không có phiên hoạt động nào được ghi nhận.
          </div>
        ) : (
          <div className="session-device-list">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`session-device-card ${s.isCurrent ? "is-current" : ""}`.trim()}
              >
                <div className="session-device-body">
                  <div className="session-device-head">
                    <strong className="session-device-name">{summarizeUserAgent(s.userAgent)}</strong>
                    {s.isCurrent && (
                      <span className="session-device-badge">Thiết bị này</span>
                    )}
                  </div>
                  <div className="session-device-meta">
                    IP: {s.ip || "Không rõ"}, Hoạt động: {new Date(s.lastUsedAt || s.createdAt).toLocaleString("vi-VN")}
                  </div>
                  <div className="session-device-exp">
                    Hết hạn: {new Date(s.expiresAt).toLocaleString("vi-VN")}
                  </div>
                </div>

                {!s.isCurrent && (
                  <div className="session-device-foot">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm session-revoke-btn"
                      disabled={busyId !== null}
                      onClick={() => setConfirmRevoke(s)}
                    >
                      {busyId === s.id ? "Đang xóa…" : "Xóa phiên"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmRevoke && (
        <ConfirmDialog
          title={confirmRevoke === "others" ? "Xóa phiên tất cả thiết bị khác" : "Xóa phiên đăng nhập"}
          message={
            confirmRevoke === "others" ? (
              <>
                Xác nhận xóa phiên đăng nhập trên <strong>{otherCount} thiết bị khác</strong>? Thiết bị hiện tại của bạn vẫn giữ nguyên.
              </>
            ) : (
              <>
                Xác nhận xóa phiên đăng nhập trên <strong>{summarizeUserAgent(confirmRevoke.userAgent)}</strong> (IP:{" "}
                <code>{confirmRevoke.ip || "Không rõ"}</code>)?
              </>
            )
          }
          confirmLabel={confirmRevoke === "others" ? "Xóa tất cả" : "Xóa phiên"}
          danger
          pending={busyId !== null}
          onConfirm={() =>
            void (confirmRevoke === "others" ? handleRevokeOthers() : handleRevokeOne(confirmRevoke))
          }
          onClose={() => {
            if (busyId === null) setConfirmRevoke(null);
          }}
        />
      )}
    </Sheet>
  );
}

