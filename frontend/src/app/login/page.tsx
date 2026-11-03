"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { AuthError, AuthField, PasswordInput, ShowPasswordCheck } from "@/components/auth/auth-fields";
import { AppleSpinner } from "@/components/ui/Skeleton";
import { ApiError, AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";

function GoogleLogoIcon() {
  return (
    <svg className="auth-google-icon" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { status, session, login, loginWithGoogle } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const resetForm = useCallback(() => {
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setError(null);
    setSubmitting(false);
    setGoogleSubmitting(false);
    setRedirecting(false);
    if (formRef.current) {
      formRef.current.reset();
    }
  }, []);

  // Điều hướng nếu đã có phiên đăng nhập hợp lệ
  useEffect(() => {
    if (status === "authenticated") {
      setRedirecting(true);
      router.replace(homePathFor(session?.user.role));
    }
  }, [status, session, router]);

  // Đảm bảo dọn dẹp khi trang login unmount
  useEffect(() => {
    return () => {
      formRef.current?.reset();
    };
  }, []);

  // Lắng nghe sự kiện đăng xuất, hết hạn phiên và phục hồi từ bfcache của mobile browser
  useEffect(() => {
    const handleAuthReset = () => {
      resetForm();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        resetForm();
      }
    };

    window.addEventListener(AUTH_LOGOUT_EVENT, handleAuthReset);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthReset);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, handleAuthReset);
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthReset);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [resetForm]);

  const isBusy = submitting || googleSubmitting || redirecting || status === "authenticated";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isBusy) return;
    const cleanUser = username.trim();
    if (!cleanUser || !password) return;

    setError(null);
    setSubmitting(true);
    try {
      await login(cleanUser, password);
      setRedirecting(true);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Không đăng nhập được.");
      setSubmitting(false);
      setRedirecting(false);
    }
  };

  const onGoogleSignIn = async () => {
    if (isBusy) return;
    setError(null);
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
      setRedirecting(true);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Không đăng nhập bằng Google được.");
      setGoogleSubmitting(false);
      setRedirecting(false);
    }
  };

  return (
    <AuthShell variant="login" title="Đăng nhập" subtitle="Nhập tên đăng nhập hoặc số điện thoại và mật khẩu của bạn để vào hệ thống.">
      <form ref={formRef} className={`auth-form${isBusy ? " is-processing" : ""}`} onSubmit={onSubmit} noValidate aria-busy={isBusy}>
        <AuthField id="login-username" label="Tên đăng nhập hoặc Số điện thoại">
          <input
            id="login-username"
            name="username"
            className={`auth-input${error ? " is-error" : ""}`}
            autoComplete="username"
            placeholder="Ví dụ: admin hoặc 0912345678"
            value={username}
            disabled={isBusy}
            onChange={(event) => {
              setUsername(event.target.value);
              if (error) setError(null);
            }}
          />
        </AuthField>

        <AuthField id="login-password" label="Mật khẩu">
          <PasswordInput
            id="login-password"
            name="password"
            className={error ? "is-error" : ""}
            show={showPassword}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            value={password}
            disabled={isBusy}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(null);
            }}
          />
        </AuthField>

        <ShowPasswordCheck id="login-show-password" checked={showPassword} onChange={setShowPassword} />

        {error && <AuthError>{error}</AuthError>}

        <button
          id="login-submit"
          type="submit"
          className={`auth-submit${submitting || (redirecting && !googleSubmitting) ? " is-busy" : ""}`}
          disabled={isBusy || !username.trim() || !password}
        >
          {submitting || (redirecting && !googleSubmitting) ? (
            <>
              <AppleSpinner size={19} className="auth-submit-spinner" />
              <span>
                {redirecting || status === "authenticated"
                  ? "Đang mở hệ thống…"
                  : "Đang xác thực tài khoản…"}
              </span>
            </>
          ) : (
            <>
              Đăng nhập
              <span className="auth-arrow" aria-hidden="true">
                →
              </span>
            </>
          )}
        </button>

        <div className="auth-divider" aria-hidden="true">
          <span>hoặc</span>
        </div>

        <button
          id="login-google"
          type="button"
          className={`auth-google-btn${googleSubmitting ? " is-busy" : ""}`}
          disabled={isBusy}
          onClick={onGoogleSignIn}
        >
          {googleSubmitting ? (
            <>
              <AppleSpinner size={19} className="auth-google-spinner" />
              <span>
                {redirecting || status === "authenticated"
                  ? "Đang mở hệ thống…"
                  : "Đang đăng nhập bằng Google…"}
              </span>
            </>
          ) : (
            <>
              <GoogleLogoIcon />
              <span>Đăng nhập bằng Google</span>
            </>
          )}
        </button>

        {isBusy && (
          <div className="auth-processing-status" role="status" aria-live="polite">
            <div className="auth-processing-bar" aria-hidden="true">
              <span className="auth-processing-bar-fill" />
            </div>
            <p className="auth-processing-text">
              {redirecting || status === "authenticated"
                ? "Xác thực thành công! Đang tải dữ liệu và chuyển vào hệ thống…"
                : googleSubmitting
                  ? "Đang kết nối tài khoản Google với hệ thống HTX, vui lòng đợi…"
                  : "Hệ thống đang kiểm tra thông tin đăng nhập, vui lòng đợi trong giây lát…"}
            </p>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
