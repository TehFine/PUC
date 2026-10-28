"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { AuthError, AuthField, PasswordInput, ShowPasswordCheck } from "@/components/auth/auth-fields";
import { ApiError } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";

export default function LoginPage() {
  const router = useRouter();
  const { status, session, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(homePathFor(session?.user.role));
  }, [status, session, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Không đăng nhập được.");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell variant="login" title="Đăng nhập" subtitle="Nhập tên đăng nhập hoặc số điện thoại và mật khẩu của bạn để vào hệ thống.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField id="login-username" label="Tên đăng nhập hoặc Số điện thoại">
          <input
            id="login-username"
            className={`auth-input${error ? " is-error" : ""}`}
            autoComplete="username"
            autoFocus
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

        <button id="login-submit" type="submit" className="auth-submit" disabled={submitting || !username || !password}>
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
