"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { AuthError, AuthField, PasswordInput, ShowPasswordCheck } from "@/components/auth/auth-fields";
import { ApiError, AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";

export default function LoginPage() {
  const router = useRouter();
  const { status, session, login } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setError(null);
    setSubmitting(false);
    if (formRef.current) {
      formRef.current.reset();
    }
  }, []);

  // Điều hướng nếu đã có phiên đăng nhập hợp lệ
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(homePathFor(session?.user.role));
    }
  }, [status, session, router]);

  // Xóa sạch thông tin form và trạng thái khi phiên chuyển về anonymous (đăng xuất)
  useEffect(() => {
    if (status === "anonymous") {
      resetForm();
    }
  }, [status, resetForm]);

  // Đảm bảo dọn dẹp khi trang login xuất hiện lần đầu hoặc unmount
  useEffect(() => {
    resetForm();
    return () => {
      resetForm();
    };
  }, [resetForm]);

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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const cleanUser = username.trim();
    if (!cleanUser || !password) return;

    setError(null);
    setSubmitting(true);
    try {
      await login(cleanUser, password);
      // Xóa form và reset trạng thái sau khi login thành công để tránh lưu cache trạng thái
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Không đăng nhập được.");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell variant="login" title="Đăng nhập" subtitle="Nhập tên đăng nhập hoặc số điện thoại và mật khẩu của bạn để vào hệ thống.">
      <form ref={formRef} className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField id="login-username" label="Tên đăng nhập hoặc Số điện thoại">
          <input
            id="login-username"
            name="username"
            className={`auth-input${error ? " is-error" : ""}`}
            autoComplete="username"
            placeholder="Ví dụ: admin hoặc 0912345678"
            value={username}
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
          className="auth-submit"
          disabled={submitting || !username.trim() || !password}
        >
          {submitting ? (
            "Đang đăng nhập…"
          ) : (
            <>
              Đăng nhập
              <span className="auth-arrow" aria-hidden="true">
                →
              </span>
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
