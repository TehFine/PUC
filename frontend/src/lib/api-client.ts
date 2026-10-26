import { reportRequestTime } from "@/lib/network";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Sự kiện phát ra khi phiên đăng nhập hết hạn và không làm mới được. */
export const AUTH_EXPIRED_EVENT = "auth:expired";

let refreshing: Promise<boolean> | null = null;

// Dùng chung một lần làm mới cho nhiều request 401 đồng thời (refresh token xoay vòng, chỉ dùng được một lần).
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Các endpoint này tự xử lý 401 (sai mật khẩu, refresh hết hạn…) nên không thử làm mới phiên.
const NO_REFRESH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];
const isAuthPath = (path: string) => NO_REFRESH_PATHS.some((prefix) => path.startsWith(prefix));

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const send = async () => {
    const startedAt = performance.now();
    try {
      return await fetch(`/api${path}`, { cache: "no-store", credentials: "same-origin", ...init });
    } finally {
      reportRequestTime(performance.now() - startedAt);
    }
  };

  let response = await send();
  if (response.status === 401 && !isAuthPath(path)) {
    if (await refreshSession()) {
      response = await send();
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
      details?: { path: string; message: string }[];
    } | null;
    throw new ApiError(body?.error ?? "Không xử lý được yêu cầu.", response.status, body?.code, body?.details);
  }
  return (await response.json()) as T;
}

const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, jsonRequest("POST", body)),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, jsonRequest("PATCH", body)),
  delete: <T>(path: string) => apiRequest<T>(path, jsonRequest("DELETE")),
};
