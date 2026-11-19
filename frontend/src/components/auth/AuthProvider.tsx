"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  clearApiClientCaches,
  setAuthScopeUser,
} from "@/lib/api-client";
import {
  ADMIN_LAST_URL_KEY,
  PORTAL_LAST_URL_KEY,
  readWorkspaceUrl,
  resetOverlayHistoryOnRouteLeave,
} from "@/lib/back-navigation";
import {
  attachOfflineSyncEngine,
  clearAllOfflineReadSnapshots,
  clearOfflineAuthSession,
  isDeviceOfflineNow,
  isTransientNetworkError,
  loadOfflineAuthSession,
  purgeUserWorkingDraftsOnLogout,
  saveOfflineAuthSession,
  triggerOfflineSyncNow,
} from "@/lib/offline-sync";
import type { Action, AuthSession, MfaChallengeResponse } from "@/types/api";

type Status = "loading" | "authenticated" | "anonymous";

export interface GoogleLoginPayload {
  credential?: string;
  email?: string;
}

type LoginApiResponse = AuthSession | MfaChallengeResponse;
type AuthSyncMessage = "logout" | { type: "logout" } | { type: "login"; userId: number };

function isMfaChallenge(res: LoginApiResponse): res is MfaChallengeResponse {
  return Boolean(res && typeof res === "object" && "mfaRequired" in res && res.mfaRequired === true);
}

function isValidAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthSession>;
  return Boolean(
    candidate.user &&
      typeof candidate.user === "object" &&
      typeof candidate.user.id === "number" &&
      Number.isInteger(candidate.user.id) &&
      candidate.user.id > 0 &&
      typeof candidate.user.role === "string" &&
      candidate.user.role.length > 0,
  );
}

interface AuthContextValue {
  status: Status;
  session: AuthSession | null;
  login: (username: string, password: string) => Promise<MfaChallengeResponse | null>;
  loginWithGoogle: (payload?: GoogleLoginPayload) => Promise<MfaChallengeResponse | null>;
  verifyOtp: (challengeToken: string, code: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  updateProfile: (payload: {
    fullName?: string;
    email?: string | null;
    currentPassword?: string;
    googleCredential?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** Kiểm tra quyền theo ma trận backend trả về (backend vẫn là nơi quyết định cuối cùng). */
  can: (resource: string, action: Action) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_SYNC_CHANNEL = "puc-auth-sync";
const PENDING_LOGOUT_STORAGE_KEY = "puc:pending-server-logout:v1";

function markPendingServerLogout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_LOGOUT_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function clearPendingServerLogout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_LOGOUT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasPendingServerLogout(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(PENDING_LOGOUT_STORAGE_KEY));
  } catch {
    return false;
  }
}

async function flushPendingServerLogout(): Promise<boolean> {
  try {
    await api.post("/auth/logout", undefined, { keepalive: true });
    clearPendingServerLogout();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status > 0 && error.status < 500) {
      clearPendingServerLogout();
      return true;
    }
    return false;
  }
}

function isProtectedPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/portal" || pathname.startsWith("/portal/");
}

function broadcastAuthMessage(message: AuthSyncMessage): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // Bỏ qua nếu trình duyệt chặn BroadcastChannel.
  }
}

function purgeServiceWorkerAuthShell(): void {
  if (typeof window === "undefined") return;
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_AUTH_CACHE" });
      void navigator.serviceWorker
        .getRegistration("/")
        .then((reg) => {
          reg?.active?.postMessage({ type: "CLEAR_AUTH_CACHE" });
          reg?.waiting?.postMessage({ type: "CLEAR_AUTH_CACHE" });
        })
        .catch(() => undefined);
    }
  } catch {
    // ignore
  }
  if (typeof caches !== "undefined") {
    void caches.delete("puc-portal-shell-v1").catch(() => undefined);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<AuthSession | null>(null);
  const currentUserIdRef = useRef<number | null>(null);

  const applyAuthenticatedSession = useCallback(
    (result: AuthSession, options?: { broadcastLogin?: boolean }) => {
      const prevUserId = currentUserIdRef.current;
      const nextUserId = result.user.id;
      const userChanged = prevUserId !== nextUserId;

      currentUserIdRef.current = nextUserId;
      setAuthScopeUser(nextUserId);
      if (userChanged) {
        clearApiClientCaches();
        if (prevUserId !== null) {
          purgeServiceWorkerAuthShell();
          void clearAllOfflineReadSnapshots();
          if (typeof window !== "undefined") {
            try {
              sessionStorage.clear();
            } catch {}
          }
        }
        if (options?.broadcastLogin !== false) {
          broadcastAuthMessage({ type: "login", userId: nextUserId });
        }
      }

      saveOfflineAuthSession(result);
      setSession(result);
      setStatus("authenticated");
      attachOfflineSyncEngine(nextUserId);
      router.prefetch("/login");
    },
    [router],
  );

  const clearClientAuthState = useCallback(
    (options?: { redirectProtected?: boolean; broadcastLogout?: boolean }) => {
      if (
        typeof window !== "undefined" &&
        (options?.redirectProtected || options?.broadcastLogout || isProtectedPath(window.location.pathname))
      ) {
        resetOverlayHistoryOnRouteLeave();
      }
      const prevUserId = currentUserIdRef.current;
      let preservedReturnUrl: string | null = null;
      if (typeof window !== "undefined" && !hasPendingServerLogout() && isProtectedPath(window.location.pathname)) {
        const directUrl = `${window.location.pathname}${window.location.search}`;
        if (window.location.search) {
          preservedReturnUrl = directUrl;
        } else if (window.location.pathname.startsWith("/admin")) {
          preservedReturnUrl = readWorkspaceUrl(ADMIN_LAST_URL_KEY, prevUserId);
        } else if (window.location.pathname.startsWith("/portal")) {
          preservedReturnUrl = readWorkspaceUrl(PORTAL_LAST_URL_KEY, prevUserId);
        }
      }
      currentUserIdRef.current = null;
      setAuthScopeUser(null);
      clearApiClientCaches();
      clearOfflineAuthSession();
      purgeServiceWorkerAuthShell();
      void clearAllOfflineReadSnapshots();
      void purgeUserWorkingDraftsOnLogout(prevUserId);
      setSession(null);
      setStatus("anonymous");
      if (typeof window !== "undefined") {
        try {
          sessionStorage.clear();
        } catch {}
        window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
        if (options?.broadcastLogout) {
          broadcastAuthMessage({ type: "logout" });
        }
        if (!hasPendingServerLogout() && isProtectedPath(window.location.pathname)) {
          const targetLogin =
            preservedReturnUrl && preservedReturnUrl !== "/admin" && preservedReturnUrl !== "/portal"
              ? `/login?next=${encodeURIComponent(preservedReturnUrl)}`
              : "/login";
          router.replace(targetLogin);
        } else if (options?.redirectProtected && isProtectedPath(window.location.pathname)) {
          router.replace("/login");
        }
      }
    },
    [router],
  );

  const refresh = useCallback(
    async (broadcastLogin = true) => {
      if (hasPendingServerLogout()) {
        clearClientAuthState({ redirectProtected: true, broadcastLogout: false });
        void flushPendingServerLogout();
        return;
      }
      try {
        const result = await api.get<AuthSession>("/auth/me");
        if (!isValidAuthSession(result)) {
          throw new Error("Invalid session payload");
        }
        if (hasPendingServerLogout()) {
          void flushPendingServerLogout();
          return;
        }
        applyAuthenticatedSession(result, { broadcastLogin });
      } catch (err) {
        // Nếu đang ở vùng vườn mất sóng / mạng chập chờn (không phải lỗi 401/403 từ máy chủ),
        // giữ nguyên phiên ngoại tuyến đã xác thực trước đó để nông hộ tiếp tục chụp ảnh và ghi nhật ký.
        if (isTransientNetworkError(err) && !hasPendingServerLogout()) {
          const fallbackSession = loadOfflineAuthSession();
          if (fallbackSession) {
            currentUserIdRef.current = fallbackSession.user.id;
            setAuthScopeUser(fallbackSession.user.id);
            setSession((prev) => prev ?? fallbackSession);
            setStatus("authenticated");
            attachOfflineSyncEngine(fallbackSession.user.id);
            return;
          }
        }

        clearClientAuthState({ redirectProtected: true, broadcastLogout: false });
      }
    },
    [applyAuthenticatedSession, clearClientAuthState],
  );

  useEffect(() => {
    let active = true;
    let fastFallbackTimer: ReturnType<typeof setTimeout> | undefined;

    // Đăng ký Service Worker đệm tài nguyên tĩnh và khung /portal ngoại tuyến, kèm lắng nghe tín hiệu Background Sync.
    const onSwMessage = (event: MessageEvent) => {
      if (event.origin && event.origin !== window.location.origin) return;
      const isTrustedWorker =
        !navigator.serviceWorker.controller ||
        event.source === navigator.serviceWorker.controller ||
        (typeof ServiceWorker !== "undefined" && event.source instanceof ServiceWorker);
      if (!isTrustedWorker) return;
      if (event.data && typeof event.data === "object" && event.data.type === "PUC_SW_SYNC_TRIGGER") {
        void triggerOfflineSyncNow(true);
      }
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
      if (process.env.NODE_ENV === "production") {
        void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      }
    }

    const applyLocalFallbackIfValid = (): boolean => {
      if (hasPendingServerLogout()) return false;
      const fallbackSession = loadOfflineAuthSession();
      if (!fallbackSession) return false;
      currentUserIdRef.current = fallbackSession.user.id;
      setAuthScopeUser(fallbackSession.user.id);
      setSession((prev) => prev ?? fallbackSession);
      setStatus("authenticated");
      attachOfflineSyncEngine(fallbackSession.user.id);
      return true;
    };

    if (hasPendingServerLogout()) {
      void (isDeviceOfflineNow() ? Promise.resolve(false) : flushPendingServerLogout()).finally(() => {
        if (active) {
          clearClientAuthState({ redirectProtected: true, broadcastLogout: false });
        }
      });
    } else if (isDeviceOfflineNow() && applyLocalFallbackIfValid()) {
      // Thiết bị đang mất mạng hoàn toàn ngoài rẫy: vào thẳng Cổng hộ dân trong 0ms không bắt chờ mạng.
    } else {
      // Nếu có phiên ngoại tuyến hợp lệ nhưng sóng 1 vạch ngoài rẫy làm /auth/me treo lâu hơn 2,4 giây:
      // mở giao diện tạm từ phiên cục bộ để bà con chụp ảnh ngay, trong khi /auth/me vẫn chạy nền đối chiếu
      // (nếu máy chủ trả 401/403 do thu hồi phiên từ xa thì nhánh catch bên dưới sẽ đăng xuất ngay lập tức).
      if (loadOfflineAuthSession()) {
        fastFallbackTimer = setTimeout(() => {
          if (active && currentUserIdRef.current === null && !hasPendingServerLogout()) {
            applyLocalFallbackIfValid();
          }
        }, 2400);
      }

      api
        .get<AuthSession>("/auth/me")
        .then((result) => {
          if (fastFallbackTimer) clearTimeout(fastFallbackTimer);
          if (!active) return;
          if (hasPendingServerLogout()) {
            void flushPendingServerLogout();
            return;
          }
          if (!isValidAuthSession(result)) {
            clearClientAuthState({ redirectProtected: false, broadcastLogout: false });
            return;
          }
          applyAuthenticatedSession(result, { broadcastLogin: true });
        })
        .catch((err) => {
          if (fastFallbackTimer) clearTimeout(fastFallbackTimer);
          if (!active) return;
          if (isTransientNetworkError(err) && applyLocalFallbackIfValid()) {
            return;
          }
          clearClientAuthState({ redirectProtected: false, broadcastLogout: false });
        });
    }

    const onOnline = () => {
      if (hasPendingServerLogout()) {
        void flushPendingServerLogout();
        return;
      }
      void api
        .get<AuthSession>("/auth/me")
        .then((result) => {
          if (!active || hasPendingServerLogout() || !isValidAuthSession(result)) return;
          applyAuthenticatedSession(result, { broadcastLogin: true });
        })
        .catch(() => {
          // Nếu phiên thật sự hết hạn, api-client sẽ tự phát AUTH_EXPIRED_EVENT.
        });
    };

    const onExpired = () => {
      clearClientAuthState({ redirectProtected: true, broadcastLogout: true });
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        void refresh(true);
      }
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
        channel.onmessage = (event: MessageEvent<AuthSyncMessage>) => {
          const msg = event.data;
          if (msg === "logout" || (msg && typeof msg === "object" && msg.type === "logout")) {
            clearClientAuthState({ redirectProtected: true, broadcastLogout: false });
            return;
          }
          if (
            msg &&
            typeof msg === "object" &&
            msg.type === "login" &&
            typeof msg.userId === "number" &&
            Number.isInteger(msg.userId) &&
            msg.userId > 0
          ) {
            if (msg.userId !== currentUserIdRef.current) {
              // Tab khác vừa đăng nhập tài khoản mới: xóa ngay dữ liệu tài khoản cũ trước khi tải lại /auth/me.
              currentUserIdRef.current = null;
              setAuthScopeUser(null);
              clearApiClientCaches();
              setSession(null);
              void refresh(false);
            }
          }
        };
      } catch {
        channel = null;
      }
    }

    window.addEventListener("online", onOnline);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      if (fastFallbackTimer) clearTimeout(fastFallbackTimer);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
      window.removeEventListener("online", onOnline);
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener("pageshow", onPageShow);
      try {
        channel?.close();
      } catch {}
    };
  }, [applyAuthenticatedSession, clearClientAuthState, refresh]);

  const login = useCallback(
    async (username: string, password: string): Promise<MfaChallengeResponse | null> => {
      const result = await api.post<LoginApiResponse>("/auth/login", { username, password });
      if (isMfaChallenge(result)) {
        return result;
      }
      clearPendingServerLogout();
      applyAuthenticatedSession(result, { broadcastLogin: true });
      return null;
    },
    [applyAuthenticatedSession],
  );

  const loginWithGoogle = useCallback(
    async (payload?: GoogleLoginPayload): Promise<MfaChallengeResponse | null> => {
      const result = await api.post<LoginApiResponse>("/auth/google", payload ?? {});
      if (isMfaChallenge(result)) {
        return result;
      }
      clearPendingServerLogout();
      applyAuthenticatedSession(result, { broadcastLogin: true });
      return null;
    },
    [applyAuthenticatedSession],
  );

  const verifyOtp = useCallback(
    async (challengeToken: string, code: string) => {
      const result = await api.post<AuthSession>("/auth/verify-otp", { challengeToken, code });
      clearPendingServerLogout();
      applyAuthenticatedSession(result, { broadcastLogin: true });
    },
    [applyAuthenticatedSession],
  );

  const refreshSession = useCallback(async () => {
    const result = await api.get<AuthSession>("/auth/me");
    if (!isValidAuthSession(result)) {
      throw new Error("Invalid session payload");
    }
    applyAuthenticatedSession(result, { broadcastLogin: true });
  }, [applyAuthenticatedSession]);

  const updateProfile = useCallback(
    async (payload: {
      fullName?: string;
      email?: string | null;
      currentPassword?: string;
      googleCredential?: string;
    }) => {
      const result = await api.patch<AuthSession>("/auth/profile", payload);
      applyAuthenticatedSession(result, { broadcastLogin: true });
    },
    [applyAuthenticatedSession],
  );

  const logout = useCallback(async () => {
    resetOverlayHistoryOnRouteLeave();
    markPendingServerLogout();
    const serverLogoutPromise = flushPendingServerLogout();
    clearClientAuthState({ redirectProtected: false, broadcastLogout: true });
    router.replace("/login");
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      }, 320);
    }
    await serverLogoutPromise;
  }, [clearClientAuthState, router]);

  const can = useCallback(
    (resource: string, action: Action) => session?.permissions?.[resource]?.includes(action) ?? false,
    [session],
  );

  const value = useMemo(
    () => ({ status, session, login, loginWithGoogle, verifyOtp, refreshSession, updateProfile, logout, can }),
    [status, session, login, loginWithGoogle, verifyOtp, refreshSession, updateProfile, logout, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth phải được dùng bên trong <AuthProvider>.");
  return context;
}
