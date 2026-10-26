"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, AUTH_EXPIRED_EVENT } from "@/lib/api-client";
import type { Action, AuthSession } from "@/types/api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  session: AuthSession | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Kiểm tra quyền theo ma trận backend trả về (backend vẫn là nơi quyết định cuối cùng). */
  can: (resource: string, action: Action) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
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

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<AuthSession>("/auth/login", { username, password });
    setSession(result);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    } finally {
      setSession(null);
      setStatus("anonymous");
    }
  }, []);

  const can = useCallback(
    (resource: string, action: Action) => session?.permissions[resource]?.includes(action) ?? false,
    [session],
  );

  const value = useMemo(() => ({ status, session, login, logout, can }), [status, session, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth phải được dùng bên trong <AuthProvider>.");
  return context;
}
