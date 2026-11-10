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

/** Sự kiện phát ra khi người dùng đăng xuất khỏi hệ thống. */
export const AUTH_LOGOUT_EVENT = "auth:logout";

let refreshing: Promise<boolean> | null = null;

// Dùng chung một lần làm mới cho nhiều request 401 đồng thời (refresh token xoay vòng, chỉ dùng được một lần).
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Các endpoint này tự xử lý 401 (sai mật khẩu, đăng nhập Google, quên mật khẩu…) nên không thử làm mới phiên.
const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/google",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/refresh",
  "/auth/logout",
];
const isAuthPath = (path: string) => NO_REFRESH_PATHS.some((prefix) => path.startsWith(prefix));

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const send = async () => {
    const startedAt = performance.now();
    const method = (init?.method ?? "GET").toUpperCase();
    const isMutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
    const headers = isMutating
      ? { "X-Requested-With": "XMLHttpRequest", ...(init?.headers as Record<string, string> | undefined) }
      : init?.headers;
    try {
      return await fetch(`/api${path}`, { cache: "no-store", credentials: "same-origin", ...init, headers });
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
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Mục đích tải tệp (khớp backend `UPLOAD_PURPOSES`). */
export type UploadPurpose = "journal" | "harvest" | "stamp" | "approval" | "violation" | "news" | "catalog";

export interface UploadedFile {
  id: number;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, jsonRequest("POST", body)),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, jsonRequest("PATCH", body)),
  delete: <T>(path: string) => apiRequest<T>(path, jsonRequest("DELETE")),
  /** Tải một tệp lên `/api/uploads` (multipart). Trả về `{ id, url }` để gửi kèm bản ghi nghiệp vụ. */
  upload: (file: Blob, purpose: UploadPurpose, filename = "upload") => {
    const form = new FormData();
    form.append("purpose", purpose);
    form.append("file", file, file instanceof File ? file.name : filename);
    return apiRequest<UploadedFile>("/uploads", { method: "POST", body: form });
  },
};

/** Thông báo lỗi tiếng Việt dễ hiểu từ một lỗi bất kỳ (kèm chi tiết từng trường nếu có). */
export function errorMessage(error: unknown, fallback = "Không xử lý được yêu cầu."): string {
  if (error instanceof ApiError) {
    if (error.details?.length) return `${error.message} ${error.details.map((d) => d.message).join(" ")}`;
    return error.message;
  }
  if (error instanceof TypeError) return "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  return error instanceof Error && error.message ? error.message : fallback;
}
