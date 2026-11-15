"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Laptop, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { BusyButton, InlineError } from "@/components/portal/shared/controls";
import { Field, Sheet } from "@/components/portal/ui";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api-client";
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
  const [disablePassword, setDisablePassword] = useState("");
  const [disableOtp, setDisableOtp] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startSetup = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<TwoFactorSetupResponse>("/auth/2fa/setup");
      setSetupData(res);
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
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ enabled: boolean; backupCodes: string[] }>("/auth/2fa/enable", {
        code: clean,
      });
      setBackupCodes(res.backupCodes ?? []);
      setSetupData(null);
      setOtpInput("");
      await onChanged();
      toast.success("Đã bật xác thực 2 lớp (OTP) cho tài khoản.");
    } catch (ex) {
      setErr(errorMessage(ex, "Mã OTP không khớp. Vui lòng kiểm tra lại giờ thiết bị."));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e: FormEvent) => {
    e.preventDefault();
    if (!disablePassword.trim() && !disableOtp.trim()) {
      setErr("Vui lòng nhập mật khẩu hiện tại hoặc mã OTP 6 chữ số để tắt xác thực 2 lớp.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post("/auth/2fa/disable", {
        ...(disablePassword.trim() ? { currentPassword: disablePassword } : {}),
        ...(disableOtp.trim() ? { code: disableOtp.trim() } : {}),
      });
      setDisablePassword("");
      setDisableOtp("");
      setBackupCodes(null);
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
    if (!backupCodes?.length || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2500);
    } catch {
      // Bỏ qua nếu không có quyền clipboard
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
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, marginBottom: 4 }}>
            <ShieldCheck size={17} style={{ color: enabled ? "#15803d" : "#64748b" }} />
            <span>
              Trạng thái hiện tại: {enabled ? "Đang bật bảo vệ OTP" : "Chưa kích hoạt"}
            </span>
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
                  style={{
                    padding: "6px 8px",
                    background: "#ffffff",
                    border: "1px solid #d4d4d2",
                    borderRadius: 5,
                    textAlign: "center",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    fontSize: 13,
                  }}
                >
                  {c}
                </code>
              ))}
            </div>
            <button type="button" className="pt-btn pt-btn-ghost" onClick={() => void copyBackupCodes()}>
              {copiedCodes ? <Check size={15} /> : <Copy size={15} />}
              <span style={{ marginLeft: 6 }}>
                {copiedCodes ? "Đã sao chép danh sách mã" : "Sao chép tất cả mã dự phòng"}
              </span>
            </button>
          </div>
        )}

        {!enabled && !setupData && (
          <div style={{ marginTop: 8 }}>
            <InlineError message={err} />
            <BusyButton
              type="button"
              className="pt-btn pt-btn-primary"
              busy={busy}
              busyLabel="Đang tạo mã bảo mật…"
              onClick={() => void startSetup()}
            >
              Thiết lập xác thực 2 lớp (OTP)
            </BusyButton>
          </div>
        )}

        {!enabled && setupData && (
          <form onSubmit={(e) => void handleEnable(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                style={{
                  display: "inline-block",
                  padding: "4px 8px",
                  background: "#f1f5f9",
                  borderRadius: 4,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  wordBreak: "break-all",
                }}
              >
                {setupData.secret}
              </code>
            </div>

            <Field label="Nhập mã OTP 6 chữ số hiển thị trên ứng dụng" htmlFor="um-2fa-code">
              <input
                id="um-2fa-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
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
          <form onSubmit={(e) => void handleDisable(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Mật khẩu hiện tại (để xác nhận tắt 2FA)" htmlFor="um-2fa-disable-pw">
              <input
                id="um-2fa-disable-pw"
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu hiện tại"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </Field>
            <Field label="Hoặc mã OTP 6 chữ số hiện tại" htmlFor="um-2fa-disable-code">
              <input
                id="um-2fa-disable-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={disableOtp}
                onChange={(e) => setDisableOtp(e.target.value)}
              />
            </Field>

            <InlineError message={err} />

            <div className="pt-form-actions">
              <button type="button" className="pt-btn pt-btn-ghost" onClick={onClose} disabled={busy}>
                Đóng
              </button>
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
    void loadSessions();
  }, [loadSessions]);

  const handleRevokeOne = async (session: UserSessionItem) => {
    setBusyId(session.id);
    setErr(null);
    try {
      const res = await api.delete<{ revokedCurrent?: boolean }>(`/auth/sessions/${session.id}`);
      if (res?.revokedCurrent || session.isCurrent) {
        await onRevokedCurrent();
        return;
      }
      toast.success("Đã đăng xuất thiết bị từ xa.");
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
      toast.success(`Đã đăng xuất từ xa ${res.revokedCount ?? 0} thiết bị khác.`);
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
      title="Phiên đăng nhập & Đăng xuất từ xa"
      onClose={onClose}
      className="pt-password-sheet"
    >
      <div className="pt-form" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="pt-hint" style={{ margin: 0 }}>
          Mọi phiên đăng nhập đều lưu bằng cookie <code>httpOnly</code> có thời hạn tự động hết hiệu lực. Bạn có thể thu hồi ngay lập tức bất kỳ thiết bị nào nghi ngờ quên đăng xuất.
        </p>

        {otherCount > 0 && (
          <BusyButton
            type="button"
            className="pt-btn pt-btn-primary"
            busy={busyId === "others"}
            busyLabel="Đang thu hồi…"
            onClick={() => void handleRevokeOthers()}
          >
            Đăng xuất từ xa tất cả thiết bị khác ({otherCount})
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sessions.map((s) => {
              const isMobile = /Mobile|Android|iPhone|iPad/i.test(s.userAgent || "");
              return (
                <div
                  key={s.id}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid #d4d4d2",
                    background: s.isCurrent ? "#f0fdf4" : "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                    <span style={{ color: s.isCurrent ? "#15803d" : "#475569", marginTop: 2 }}>
                      {isMobile ? <Smartphone size={18} /> : <Laptop size={18} />}
                    </span>
                    <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>
                        {summarizeUserAgent(s.userAgent)}{" "}
                        {s.isCurrent && (
                          <span
                            style={{
                              marginLeft: 6,
                              padding: "1px 7px",
                              borderRadius: 99,
                              background: "#166534",
                              color: "#ffffff",
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            Thiết bị này
                          </span>
                        )}
                      </div>
                      <div style={{ color: "#64748b", fontSize: 11.5 }}>
                        IP: {s.ip || "Không rõ"} | Hoạt động: {new Date(s.lastUsedAt || s.createdAt).toLocaleString("vi-VN")}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: 11 }}>
                        Hết hạn: {new Date(s.expiresAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                  </div>

                  {!s.isCurrent && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busyId !== null}
                      onClick={() => void handleRevokeOne(s)}
                    >
                      <LogOut size={13} />
                      <span>{busyId === s.id ? "Đang gỡ…" : "Đăng xuất từ xa"}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

