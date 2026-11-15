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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<AuthSession | null>(null);

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
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      active = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, []);

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
    }
    router.replace("/login");
    try {
      await api.post("/auth/logout");
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
