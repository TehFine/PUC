"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import {
  AuthBusyBorderRing,
  AuthError,
  AuthField,
  PasswordInput,
  ShowPasswordCheck,
} from "@/components/auth/auth-fields";
import { api, ApiError } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";

type RecoveryMode = "cccd" | "request";

const CCCD_RE = /^[0-9]{12}$/;

function ForgotPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, session } = useAuth();

  const [mode, setMode] = useState<RecoveryMode>("cccd");
  const [form, setForm] = useState(() => ({
    username: searchParams.get("username")?.trim() ?? "",
    cccd: "",
    fullName: "",
    note: "",
    newPassword: "",
    confirm: "",
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneMode, setDoneMode] = useState<RecoveryMode | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(homePathFor(session?.user.role));
    }
  }, [status, session, router]);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    if (error) setError(null);
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const switchMode = (nextMode: RecoveryMode) => {
    if (submitting) return;
    setError(null);
    setMode(nextMode);
  };

  const isFieldInvalid = (field: "username" | "cccd" | "name" | "password") => {
    if (!error) return false;
    const lower = error.toLowerCase();
    if (field === "username") return lower.includes("điện thoại") || lower.includes("đăng nhập") || lower.includes("tài khoản");
    if (field === "cccd") return lower.includes("cccd") || lower.includes("căn cước");
    if (field === "name") return lower.includes("họ tên");
    if (field === "password") return lower.includes("mật khẩu");
    return false;
  };

  const validate = (): string | null => {
    if (!form.username.trim()) {
      return "Vui lòng nhập số điện thoại hoặc tên đăng nhập.";
    }
    if (mode === "cccd") {
      const cleanCccd = form.cccd.replace(/[\s.-]/g, "");
      if (!CCCD_RE.test(cleanCccd)) {
        return "Số Căn cước công dân (CCCD) cần đúng 12 chữ số.";
      }
    } else {
      if (!form.fullName.trim()) {
        return "Vui lòng nhập họ và tên để cán bộ HTX đối chiếu.";
      }
    }
    if (form.newPassword.length < 8 || !/[A-Za-z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) {
      return "Mật khẩu mới cần tối thiểu 8 ký tự, gồm cả chữ cái và chữ số.";
    }
    if (form.newPassword !== form.confirm) {
      return "Mật khẩu mới nhập lại chưa khớp.";
    }
    return null;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (mode === "cccd") {
        await api.post("/auth/forgot-password/verify-cccd", {
          username: form.username.trim(),
          cccd: form.cccd.replace(/[\s.-]/g, ""),
          newPassword: form.newPassword,
        });
        setDoneMode("cccd");
      } else {
        await api.post("/auth/forgot-password/request", {
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          newPassword: form.newPassword,
          note: form.note.trim() || undefined,
        });
        setDoneMode("request");
      }
    } catch (err) {
      const detail = err instanceof ApiError ? err.details?.map((item) => item.message).join(" ") : "";
      setError(detail || (err instanceof Error ? err.message : "Không xử lý được yêu cầu khôi phục mật khẩu."));
    } finally {
      setSubmitting(false);
    }
  };

  if (doneMode === "cccd") {
    return (
      <AuthShell
        variant="forgot"
        title="Đã đặt lại mật khẩu"
        subtitle="Mật khẩu mới đã có hiệu lực cho tài khoản của bạn."
        hideSwitch
      >
        <div aria-live="polite">
          <span className="auth-done-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <ol className="auth-steps">
            <li>
              <b>01</b>
              <span>
                Tài khoản <strong>{form.username.trim()}</strong> đã được cập nhật mật khẩu mới thành công qua xác minh số CCCD.
              </span>
            </li>
            <li>
              <b>02</b>
              <span>Mọi phiên đăng nhập cũ trên thiết bị khác đã được thu hồi để đảm bảo an toàn.</span>
            </li>
          </ol>
          <Link href="/login" className="auth-submit is-link">
            <span>Đăng nhập ngay</span>
            <span className="auth-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (doneMode === "request") {
    return (
      <AuthShell
        variant="forgot"
        title="Đã gửi yêu cầu"
        subtitle="Đang chờ cán bộ HTX đối chiếu và phê duyệt."
        hideSwitch
      >
        <div aria-live="polite">
          <span className="auth-done-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <ol className="auth-steps">
            <li>
              <b>01</b>
              <span>
                Cán bộ HTX sẽ kiểm tra yêu cầu của tài khoản <strong>{form.username.trim()}</strong> ({form.fullName.trim()}) và xác nhận trên hệ thống.
              </span>
            </li>
            <li>
              <b>02</b>
              <span>Ngay sau khi cán bộ bấm duyệt, bạn đăng nhập bằng mật khẩu mới vừa thiết lập.</span>
            </li>
          </ol>
          <Link href="/login" className="auth-submit is-link">
            <span>Về trang đăng nhập</span>
            <span className="auth-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell variant="forgot" title="Quên mật khẩu" wide>
      <div className="auth-mode-tabs" role="tablist" aria-label="Phương thức khôi phục mật khẩu">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cccd"}
          className={`auth-mode-tab${mode === "cccd" ? " is-active" : ""}`}
          disabled={submitting}
          onClick={() => switchMode("cccd")}
        >
          <strong>Xác minh CCCD</strong>
          <span>Đổi ngay lập tức</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "request"}
          className={`auth-mode-tab${mode === "request" ? " is-active" : ""}`}
          disabled={submitting}
          onClick={() => switchMode("request")}
        >
          <strong>Nhờ cán bộ HTX</strong>
          <span>Đối chiếu &amp; phê duyệt</span>
        </button>
      </div>

      <form
        className={`auth-form${submitting ? " is-processing" : ""}`}
        onSubmit={onSubmit}
        noValidate
        aria-busy={submitting}
      >
        <div className={mode === "cccd" ? "auth-row" : undefined}>
          <AuthField
            id="forgot-username"
            label="Số điện thoại / Tên đăng nhập"
          >
            <input
              id="forgot-username"
              className={`auth-input${isFieldInvalid("username") ? " is-error" : ""}`}
              autoComplete="username"
              placeholder="Ví dụ: 0905123456"
              value={form.username}
              disabled={submitting}
              onChange={set("username")}
            />
          </AuthField>

          {mode === "cccd" && (
            <AuthField
              id="forgot-cccd"
              label="Số CCCD chủ hộ (12 số)"
            >
              <input
                id="forgot-cccd"
                className={`auth-input${isFieldInvalid("cccd") ? " is-error" : ""}`}
                inputMode="numeric"
                maxLength={15}
                placeholder="Nhập 12 chữ số CCCD"
                value={form.cccd}
                disabled={submitting}
                onChange={set("cccd")}
              />
            </AuthField>
          )}
        </div>

        {mode === "request" && (
          <>
            <AuthField id="forgot-fullname" label="Họ và tên chủ hộ">
              <input
                id="forgot-fullname"
                className={`auth-input${isFieldInvalid("name") ? " is-error" : ""}`}
                autoComplete="name"
                placeholder="Ví dụ: Nguyễn Văn An"
                value={form.fullName}
                disabled={submitting}
                onChange={set("fullName")}
              />
            </AuthField>

            <AuthField
              id="forgot-note"
              label="Ghi chú đối chiếu"
              optional
            >
              <input
                id="forgot-note"
                className="auth-input"
                maxLength={300}
                placeholder="Ví dụ: Thôn 2 – hộ HO-012"
                value={form.note}
                disabled={submitting}
                onChange={set("note")}
              />
            </AuthField>
          </>
        )}

        <div className="auth-row">
          <AuthField
            id="forgot-password"
            label="Mật khẩu mới"
          >
            <PasswordInput
              id="forgot-password"
              className={isFieldInvalid("password") ? "is-error" : ""}
              show={showPassword}
              autoComplete="new-password"
              placeholder="Tối thiểu 8 ký tự chữ và số"
              value={form.newPassword}
              disabled={submitting}
              onChange={set("newPassword")}
            />
          </AuthField>

          <AuthField id="forgot-confirm" label="Nhập lại mật khẩu">
            <PasswordInput
              id="forgot-confirm"
              className={isFieldInvalid("password") ? "is-error" : ""}
              show={showPassword}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              value={form.confirm}
              disabled={submitting}
              onChange={set("confirm")}
            />
          </AuthField>
        </div>

        <ShowPasswordCheck id="forgot-show-password" checked={showPassword} onChange={setShowPassword} />

        {error && <AuthError>{error}</AuthError>}

        <button
          id="forgot-submit"
          type="submit"
          className={`auth-submit${submitting ? " is-busy" : ""}`}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <AuthBusyBorderRing />
              <span>
                {mode === "cccd" ? "Đang xác minh…" : "Đang gửi yêu cầu…"}
              </span>
            </>
          ) : (
            <>
              <span>{mode === "cccd" ? "Đặt lại mật khẩu" : "Gửi yêu cầu"}</span>
              <span className="auth-arrow" aria-hidden="true">
                →
              </span>
            </>
          )}
        </button>
      </form>

      <p className="auth-switch-hint">
        {mode === "cccd" ? (
          <>
            <span>Chưa cập nhật số CCCD trên hệ thống?</span>
            <button type="button" className="auth-switch-btn" onClick={() => switchMode("request")}>
              Nhờ cán bộ HTX duyệt
            </button>
          </>
        ) : (
          <>
            <span>Đã đăng ký số CCCD với HTX?</span>
            <button type="button" className="auth-switch-btn" onClick={() => switchMode("cccd")}>
              Đặt lại ngay bằng CCCD
            </button>
          </>
        )}
      </p>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
