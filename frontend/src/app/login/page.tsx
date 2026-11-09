"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { AuthBusyBorderRing, AuthError, AuthField, PasswordInput, ShowPasswordCheck } from "@/components/auth/auth-fields";
import { api, ApiError, AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";

interface DemoGoogleAccount {
  id: number;
  fullName: string;
  username: string;
  email: string;
  villageName: string | null;
  householdCode: string | null;
}

interface GoogleAuthConfig {
  mode: "oauth" | "demo" | "disabled";
  clientId: string | null;
  demoAccounts: DemoGoogleAccount[];
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: "popup" | "redirect";
  }) => void;
  prompt: (momentListener?: (notification: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean }) => void) => void;
  renderButton?: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

let gisScriptPromise: Promise<void> | null = null;
function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Không tải được thư viện Google Sign-In.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error("Không kết nối được tới dịch vụ đăng nhập Google."));
    };
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

function GoogleLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg className="auth-google-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
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

  const [googleConfig, setGoogleConfig] = useState<GoogleAuthConfig | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [customEmailMode, setCustomEmailMode] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [chooserError, setChooserError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setError(null);
    setSubmitting(false);
    setGoogleSubmitting(false);
    setRedirecting(false);
    setChooserOpen(false);
    setCustomEmailMode(false);
    setCustomEmail("");
    setChooserError(null);
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

  // Tải cấu hình Google Sign-In từ backend
  useEffect(() => {
    let active = true;
    api
      .get<GoogleAuthConfig>("/auth/google/config")
      .then((cfg) => {
        if (active) setGoogleConfig(cfg);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Đảm bảo dọn dẹp khi trang login unmount
  useEffect(() => {
    const form = formRef.current;
    return () => {
      form?.reset();
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

  const isRedirectingAuth = status === "authenticated" || (redirecting && (submitting || googleSubmitting));
  const isBusy = submitting || googleSubmitting || isRedirectingAuth;

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

  const executeGoogleLogin = async (payload: { credential?: string; email?: string }) => {
    setError(null);
    setChooserError(null);
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle(payload);
      setChooserOpen(false);
      setRedirecting(true);
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : "Không đăng nhập bằng Google được.";
      if (chooserOpen) {
        setChooserError(msg);
      } else {
        setError(msg);
      }
      setGoogleSubmitting(false);
      setRedirecting(false);
    }
  };

  const onGoogleSignIn = async () => {
    if (isBusy) return;
    setError(null);

    let cfg = googleConfig;
    if (!cfg) {
      try {
        cfg = await api.get<GoogleAuthConfig>("/auth/google/config");
        setGoogleConfig(cfg);
      } catch {
        cfg = null;
      }
    }

    const clientId = cfg?.clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null;

    if (clientId) {
      setGoogleSubmitting(true);
      try {
        await loadGoogleIdentityScript();
        const gId = window.google?.accounts?.id;
        if (!gId) {
          throw new Error("Trình duyệt không khởi tạo được dịch vụ Google Sign-In.");
        }
        gId.initialize({
          client_id: clientId,
          ux_mode: "popup",
          callback: (response) => {
            if (!response.credential) {
              setError("Không nhận được thông tin xác thực từ Google.");
              setGoogleSubmitting(false);
              return;
            }
            void executeGoogleLogin({ credential: response.credential });
          },
        });
        gId.prompt((notification) => {
          if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
            setGoogleSubmitting(false);
            setError(
              "Trình duyệt đã chặn cửa sổ chọn tài khoản Google (One Tap). Vui lòng cho phép cửa sổ bật lên từ accounts.google.com hoặc đăng nhập bằng mật khẩu.",
            );
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không khởi tạo được đăng nhập Google.");
        setGoogleSubmitting(false);
      }
      return;
    }

    if (cfg?.mode === "demo") {
      setChooserError(null);
      setCustomEmailMode(false);
      setCustomEmail("");
      setChooserOpen(true);
      return;
    }

    await executeGoogleLogin({});
  };

  const onCustomEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (googleSubmitting) return;
    const clean = customEmail.trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      setChooserError("Vui lòng nhập địa chỉ email Google hợp lệ.");
      return;
    }
    await executeGoogleLogin({ email: clean });
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

        <div className="auth-meta-row">
          <ShowPasswordCheck id="login-show-password" checked={showPassword} onChange={setShowPassword} />
          <Link
            href={username.trim() ? `/forgot-password?username=${encodeURIComponent(username.trim())}` : "/forgot-password"}
            className="auth-forgot-link"
          >
            Quên mật khẩu?
          </Link>
        </div>

        {error && <AuthError>{error}</AuthError>}

        <button
          id="login-submit"
          type="submit"
          className={`auth-submit${submitting || (isRedirectingAuth && !googleSubmitting) ? " is-busy" : ""}`}
          disabled={isBusy || !username.trim() || !password}
        >
          {submitting || (isRedirectingAuth && !googleSubmitting) ? (
            <>
              <AuthBusyBorderRing />
              <span>
                {isRedirectingAuth
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
          onClick={() => void onGoogleSignIn()}
        >
          {googleSubmitting ? (
            <>
              <AuthBusyBorderRing />
              <span>
                {isRedirectingAuth
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
      </form>

      {chooserOpen && (
        <div
          className="auth-google-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-chooser-title"
          onClick={() => {
            if (!googleSubmitting) setChooserOpen(false);
          }}
        >
          <div className="auth-google-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="auth-google-dialog-head">
              <GoogleLogoIcon size={28} />
              <h2 id="google-chooser-title">Chọn một tài khoản</h2>
              <p>
                để tiếp tục tới <strong>HTX Nông nghiệp Cư Né</strong>
              </p>
            </div>

            {!customEmailMode ? (
              <>
                <ul className="auth-google-list">
                  {(googleConfig?.demoAccounts ?? []).map((acc) => {
                    const initial = (acc.fullName.trim().split(" ").slice(-1)[0]?.[0] ?? "G").toUpperCase();
                    return (
                      <li key={acc.id}>
                        <button
                          type="button"
                          className="auth-google-item"
                          disabled={googleSubmitting}
                          onClick={() => void executeGoogleLogin({ email: acc.email })}
                        >
                          <span className="auth-google-avatar" aria-hidden="true">
                            {initial}
                          </span>
                          <span className="auth-google-item-meta">
                            <span className="auth-google-item-name">{acc.fullName}</span>
                            <span className="auth-google-item-email">{acc.email}</span>
                          </span>
                          {acc.householdCode && (
                            <span className="auth-google-item-tag">{acc.householdCode}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      className="auth-google-item"
                      disabled={googleSubmitting}
                      onClick={() => {
                        setChooserError(null);
                        setCustomEmailMode(true);
                      }}
                    >
                      <span className="auth-google-avatar is-other" aria-hidden="true">
                        @
                      </span>
                      <span className="auth-google-item-meta">
                        <span className="auth-google-item-name">Sử dụng một tài khoản khác</span>
                        <span className="auth-google-item-email">Nhập địa chỉ email Google đã liên kết</span>
                      </span>
                    </button>
                  </li>
                </ul>

                {chooserError && <AuthError>{chooserError}</AuthError>}

                <div className="auth-google-dialog-actions">
                  <button
                    type="button"
                    className="auth-google-cancel-btn"
                    disabled={googleSubmitting}
                    onClick={() => setChooserOpen(false)}
                  >
                    Đóng
                  </button>
                </div>
              </>
            ) : (
              <form className="auth-google-custom-form" onSubmit={(e) => void onCustomEmailSubmit(e)} noValidate>
                <AuthField
                  id="google-custom-email"
                  label="Email tài khoản Google đã liên kết"
                  hint="Nhập email Google đã gắn với hồ sơ hộ dân tại HTX."
                >
                  <input
                    id="google-custom-email"
                    type="email"
                    className={`auth-input${chooserError ? " is-error" : ""}`}
                    autoFocus
                    placeholder="Ví dụ: nongho.0974564405@gmail.com"
                    value={customEmail}
                    disabled={googleSubmitting}
                    onChange={(e) => {
                      setCustomEmail(e.target.value);
                      if (chooserError) setChooserError(null);
                    }}
                  />
                </AuthField>

                {chooserError && <AuthError>{chooserError}</AuthError>}

                <div className="auth-google-dialog-actions">
                  <button
                    type="button"
                    className="auth-google-cancel-btn"
                    disabled={googleSubmitting}
                    onClick={() => {
                      setChooserError(null);
                      setCustomEmailMode(false);
                    }}
                  >
                    Quay lại danh sách
                  </button>
                  <button
                    type="submit"
                    className="auth-google-cancel-btn"
                    style={{
                      background: "var(--au-ink)",
                      color: "#fff",
                      borderColor: "var(--au-ink)",
                    }}
                    disabled={googleSubmitting || !customEmail.trim()}
                  >
                    {googleSubmitting ? "Đang xác thực…" : "Tiếp tục"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AuthShell>
  );
}
