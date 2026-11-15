"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import type { Action, AuthSession, MfaChallengeResponse } from "@/types/api";

type Status = "loading" | "authenticated" | "anonymous";

export interface GoogleLoginPayload {
  credential?: string;
  email?: string;
}

type LoginApiResponse = AuthSession | MfaChallengeResponse;

function isMfaChallenge(res: LoginApiResponse): res is MfaChallengeResponse {
  return Boolean(res && typeof res === "object" && "mfaRequired" in res && res.mfaRequired === true);
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

function isProtectedPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/portal" || pathname.startsWith("/portal/");
}

function broadcastAuthLogout(): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage("logout");
    channel.close();
  } catch {
    // Bỏ qua nếu trình duyệt chặn BroadcastChannel.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<AuthSession | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<AuthSession>("/auth/me");
      setSession(result);
      setStatus("authenticated");
    } catch {
      setSession(null);
      setStatus("anonymous");
      if (typeof window !== "undefined") {
        try {
          sessionStorage.clear();
        } catch {}
        window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
        if (isProtectedPath(window.location.pathname)) {
          router.replace("/login");
        }
      }
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    api
      .get<AuthSession>("/auth/me")
      .then((result) => {
        if (!active) return;
        setSession(result);
        setStatus("authenticated");
      })
      .catch(() => active && setStatus("anonymous"));

    const onExpired = () => {
      setSession(null);
      setStatus("anonymous");
      try {
        sessionStorage.clear();
      } catch {}
      broadcastAuthLogout();
      if (isProtectedPath(window.location.pathname)) {
        router.replace("/login");
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        void refresh();
      }
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
        channel.onmessage = (event: MessageEvent) => {
          if (event.data === "logout" || (event.data && typeof event.data === "object" && event.data.type === "logout")) {
            setSession(null);
            setStatus("anonymous");
            try {
              sessionStorage.clear();
            } catch {}
            window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
            if (isProtectedPath(window.location.pathname)) {
              router.replace("/login");
            }
          }
        };
      } catch {
        channel = null;
      }
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener("pageshow", onPageShow);
      try {
        channel?.close();
      } catch {}
    };
  }, [refresh, router]);

  const login = useCallback(async (username: string, password: string): Promise<MfaChallengeResponse | null> => {
    const result = await api.post<LoginApiResponse>("/auth/login", { username, password });
    if (isMfaChallenge(result)) {
      return result;
    }
    setSession(result);
    setStatus("authenticated");
    return null;
  }, []);

  const loginWithGoogle = useCallback(async (payload?: GoogleLoginPayload): Promise<MfaChallengeResponse | null> => {
    const result = await api.post<LoginApiResponse>("/auth/google", payload ?? {});
    if (isMfaChallenge(result)) {
      return result;
    }
    setSession(result);
    setStatus("authenticated");
    return null;
  }, []);

  const verifyOtp = useCallback(async (challengeToken: string, code: string) => {
    const result = await api.post<AuthSession>("/auth/verify-otp", { challengeToken, code });
    setSession(result);
    setStatus("authenticated");
  }, []);

  const refreshSession = useCallback(async () => {
    const result = await api.get<AuthSession>("/auth/me");
    setSession(result);
    setStatus("authenticated");
  }, []);

  const updateProfile = useCallback(
    async (payload: {
      fullName?: string;
      email?: string | null;
      currentPassword?: string;
      googleCredential?: string;
    }) => {
      const result = await api.patch<AuthSession>("/auth/profile", payload);
      setSession(result);
    },
    [],
  );

  const logout = useCallback(async () => {
    setSession(null);
    setStatus("anonymous");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
      try {
        sessionStorage.clear();
      } catch {}
      broadcastAuthLogout();
    }
    router.replace("/login");
    try {
      await api.post("/auth/logout", undefined, { keepalive: true });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    } finally {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
      }
    }
  }, [router]);

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
