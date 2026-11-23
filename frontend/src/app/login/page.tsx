"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { AuthBusyBorderRing, AuthError, AuthField, PasswordInput, ShowPasswordCheck } from "@/components/auth/auth-fields";
import { api, ApiError, AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import { useBackLayer } from "@/lib/back-navigation";
import { homePathFor } from "@/lib/routes";
import { lockRootScroll } from "@/lib/scroll-lock";
import type { MfaChallengeResponse } from "@/types/api";
import { resolveSafeNextPath } from "@/utils/url-safety";

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

function GoogleLogoIcon({ size = 19 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/google.svg"
      className="auth-google-icon"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

const subscribeNoop = () => () => {};
const readSafeNextFromWindow = () => resolveSafeNextPath(new URLSearchParams(window.location.search).get("next"));
const getServerNull = () => null;

export default function LoginPage() {
  const router = useRouter();
  const { status, session, login, loginWithGoogle, verifyOtp } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const nextPath = useSyncExternalStore(subscribeNoop, readSafeNextFromWindow, getServerNull);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallengeResponse | null>(null);
  const [otpCode, setOtpCode] = useState("");

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
    setOtpSubmitting(false);
    setRedirecting(false);
    setMfaChallenge(null);
    setOtpCode("");
    setChooserOpen(false);
    setCustomEmailMode(false);
    setCustomEmail("");
    setChooserError(null);
    if (formRef.current) {
      formRef.current.reset();
    }
  }, []);

  useBackLayer(Boolean(mfaChallenge), () => {
    if (!otpSubmitting) {
      setMfaChallenge(null);
      setOtpCode("");
      setError(null);
    }
  });

  useBackLayer(chooserOpen, () => {
    if (!googleSubmitting) {
      setChooserOpen(false);
      setCustomEmailMode(false);
      setChooserError(null);
    }
  });

  // Điều hướng nếu đã có phiên đăng nhập hợp lệ (ưu tiên quay lại trang hoặc phân mục trước đó nếu phù hợp vai trò)
  useEffect(() => {
    if (status === "authenticated") {
      const fromQuery =
        typeof window !== "undefined"
          ? resolveSafeNextPath(new URLSearchParams(window.location.search).get("next"))
          : null;
      const candidate = fromQuery ?? nextPath;
      const isFarmer = session?.user.role === "farmer";
      const roleCompatibleNext =
        candidate &&
        !(isFarmer && (candidate === "/admin" || candidate.startsWith("/admin/") || candidate.startsWith("/admin?"))) &&
        !(!isFarmer && (candidate === "/portal" || candidate.startsWith("/portal/") || candidate.startsWith("/portal?")))
          ? candidate
          : null;
      router.replace(roleCompatibleNext ?? homePathFor(session?.user.role));
    }
  }, [status, session, router, nextPath]);

  // Tải cấu hình Google Sign-In từ backend (không nạp tài khoản mẫu ở bản production)
  useEffect(() => {
    let active = true;
    api
      .get<GoogleAuthConfig>("/auth/google/config")
      .then((cfg) => {
        if (!active) return;
        setGoogleConfig(
          process.env.NODE_ENV === "development"
            ? cfg
            : { ...cfg, demoAccounts: [] },
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Đảm bảo dọn dẹp mật khẩu ngay khi trang login unmount hoặc rời trang (pagehide)
  useEffect(() => {
    const form = formRef.current;
    const onPageHide = () => {
      setPassword("");
      setOtpCode("");
      form?.reset();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
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

  useEffect(() => {
    if (!chooserOpen) return;
    const unlock = lockRootScroll();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !googleSubmitting) {
        setChooserOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [chooserOpen, googleSubmitting]);

  const isRedirectingAuth =
    status === "authenticated" || (redirecting && (submitting || googleSubmitting || otpSubmitting));
  const isBusy = submitting || googleSubmitting || otpSubmitting || isRedirectingAuth;
  const isFromTraceScan = Boolean(nextPath && (nextPath.startsWith("/t/") || nextPath.startsWith("/trace/")));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isBusy) return;
    const cleanUser = username.trim();
    if (!cleanUser || !password) return;

    setError(null);
    setSubmitting(true);
    try {
      const challenge = await login(cleanUser, password);
      setPassword("");
      if (challenge) {
        setMfaChallenge(challenge);
        setOtpCode("");
        setSubmitting(false);
        return;
      }
      setRedirecting(true);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Không đăng nhập được.");
      setSubmitting(false);
      setRedirecting(false);
    }
  };

  const onVerifyOtpSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isBusy || !mfaChallenge) return;
    const cleanCode = otpCode.trim();
    if (!cleanCode) return;

    setError(null);
    setOtpSubmitting(true);
    try {
      await verifyOtp(mfaChallenge.challengeToken, cleanCode);
      setRedirecting(true);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Mã xác thực OTP không hợp lệ.");
      setOtpSubmitting(false);
      setRedirecting(false);
    }
  };

  const executeGoogleLogin = async (payload: { credential?: string; email?: string }) => {
    setError(null);
    setChooserError(null);
    setGoogleSubmitting(true);
    try {
      const challenge = await loginWithGoogle(payload);
      setChooserOpen(false);
      if (challenge) {
        setMfaChallenge(challenge);
        setOtpCode("");
        setGoogleSubmitting(false);
        return;
      }
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

    const isDevMode = process.env.NODE_ENV === "development";
    const clientId = cfg?.clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null;

    if (!isDevMode && cfg?.mode !== "oauth") {
      setError("Đăng nhập bằng Google chưa được cấu hình trên hệ thống này. Vui lòng đăng nhập bằng mật khẩu.");
      return;
    }

    if (clientId && cfg?.mode === "oauth") {
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

    if (isDevMode && cfg?.mode === "demo") {
      setChooserError(null);
      setCustomEmailMode(false);
      setCustomEmail("");
      setChooserOpen(true);
      return;
    }

    setError("Đăng nhập bằng Google chưa được cấu hình trên hệ thống này. Vui lòng đăng nhập bằng mật khẩu.");
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
    <AuthShell variant="login" title={mfaChallenge ? "Xác thực 2 lớp (OTP)" : "Đăng nhập"}>
      {isFromTraceScan && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 0,
            background: "#f7f7f5",
            border: "1px solid #d4d4d2",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#14532d",
          }}
        >
          <strong>Dành cho đối tác và cơ quan quản lý:</strong> Sau khi xác thực thành công, hệ thống sẽ quay lại đúng lô vừa quét để hiển thị dữ liệu theo phạm vi được cấp quyền.
        </div>
      )}

      {mfaChallenge ? (
        <form
          className={`auth-form${isBusy ? " is-processing" : ""}`}
          onSubmit={onVerifyOtpSubmit}
          noValidate
          aria-busy={isBusy}
        >
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 0,
              background: "#f7f7f5",
              border: "1px solid #d4d4d2",
              fontSize: 13,
              lineHeight: 1.5,
              color: "#1f2937",
            }}
          >
            Tài khoản <strong>{mfaChallenge.fullName}</strong> (<code>{mfaChallenge.username}</code>) đang bật bảo vệ xác thực 2 lớp. Vui lòng nhập mã OTP 6 chữ số từ ứng dụng xác thực hoặc mã khôi phục dự phòng.
          </div>

          <AuthField id="login-otp" label="Mã OTP 6 chữ số hoặc mã dự phòng">
            <input
              id="login-otp"
              className={`auth-input${error ? " is-error" : ""}`}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              autoFocus
              maxLength={12}
              placeholder="Ví dụ: 123456 hoặc A1B2C3D4"
              value={otpCode}
              disabled={isBusy}
              style={{ letterSpacing: "0.14em", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              onChange={(event) => {
                setOtpCode(event.target.value);
                if (error) setError(null);
              }}
            />
          </AuthField>

          {error && <AuthError>{error}</AuthError>}

          <button
            id="login-verify-otp"
            type="submit"
            className={`auth-submit${otpSubmitting || isRedirectingAuth ? " is-busy" : ""}`}
            disabled={isBusy || otpCode.trim().length < 6}
          >
            {otpSubmitting || isRedirectingAuth ? (
              <>
                <AuthBusyBorderRing />
                <span>{isRedirectingAuth ? "Đang mở hồ sơ…" : "Đang kiểm tra mã OTP…"}</span>
              </>
            ) : (
              <span>Xác nhận mã OTP</span>
            )}
          </button>

          <button
            type="button"
            className="auth-google-btn"
            disabled={isBusy}
            onClick={() => {
              setMfaChallenge(null);
              setOtpCode("");
              setError(null);
            }}
          >
            <span>Đăng nhập bằng tài khoản khác</span>
          </button>
        </form>
      ) : (
      <form
        ref={formRef}
        className={`auth-form${isBusy ? " is-processing" : ""}`}
        onSubmit={onSubmit}
        autoComplete="off"
        data-form-type="other"
        noValidate
        aria-busy={isBusy}
      >
        <AuthField id="login-username" label="Tên đăng nhập hoặc Số điện thoại">
          <input
            id="login-username"
            className={`auth-input${error ? " is-error" : ""}`}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
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
            className={error ? "is-error" : ""}
            show={showPassword}
            autoComplete="off"
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
          <Link href="/forgot-password" className="auth-forgot-link">
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
                {isRedirectingAuth ? "Đang mở hệ thống…" : "Đang xác thực tài khoản…"}
              </span>
            </>
          ) : (
            <span>Đăng nhập</span>
          )}
        </button>

        <div className="auth-divider" aria-hidden="true">
          <span>hoặc</span>
        </div>

        {process.env.NODE_ENV !== "development" && googleConfig && googleConfig.mode !== "oauth" ? (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 0,
              background: "#f7f7f5",
              border: "1px solid #d4d4d2",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "#5f5f5c",
              textAlign: "center",
            }}
          >
            Đăng nhập bằng Google chưa được cấu hình. Vui lòng đăng nhập bằng tên đăng nhập và mật khẩu.
          </div>
        ) : (
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
                  {isRedirectingAuth ? "Đang mở hệ thống…" : "Đang đăng nhập bằng Google…"}
                </span>
              </>
            ) : (
              <>
                <GoogleLogoIcon />
                <span>Đăng nhập bằng Google</span>
              </>
            )}
          </button>
        )}
      </form>
      )}

      <p className="auth-switch-hint">
        <span>Chưa có tài khoản thành viên?</span>
        <Link href="/register" className="auth-switch-btn">
          Xem quy trình cấp tài khoản
        </Link>
      </p>

      {process.env.NODE_ENV === "development" && chooserOpen && (
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
              <GoogleLogoIcon size={24} />
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
                    className="auth-google-cancel-btn is-primary"
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
