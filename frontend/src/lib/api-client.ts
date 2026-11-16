import { reportRequestTime } from "@/lib/network";
import { reportServerFailure, reportServerHealthy } from "@/lib/system-alert";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: { path: string; message: string }[],
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** Sự kiện phát ra khi phiên đăng nhập hết hạn và không làm mới được. */
export const AUTH_EXPIRED_EVENT = "auth:expired";

/** Sự kiện phát ra khi người dùng đăng xuất khỏi hệ thống. */
export const AUTH_LOGOUT_EVENT = "auth:logout";

/** Sự kiện & kênh đồng bộ phát ra khi dữ liệu nghiệp vụ trên hệ thống vừa thay đổi (POST/PATCH/PUT/DELETE). */
export const DATA_MUTATED_EVENT = "puc:data-mutated";
export const DATA_SYNC_CHANNEL = "puc-data-sync";

let syncChannel: BroadcastChannel | null = null;

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!syncChannel) {
    try {
      syncChannel = new BroadcastChannel(DATA_SYNC_CHANNEL);
    } catch {
      syncChannel = null;
    }
  }
  return syncChannel;
}

export function notifyDataMutated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DATA_MUTATED_EVENT));
  try {
    getSyncChannel()?.postMessage({ type: DATA_MUTATED_EVENT, at: Date.now() });
  } catch {
    // Bỏ qua nếu trình duyệt chặn BroadcastChannel.
  }
}

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

interface EtagMemoryEntry {
  etag: string;
  data: unknown;
}

const MAX_ETAG_ENTRIES = 120;
const MAX_ETAG_PAYLOAD_CHARS = 1_500_000;
const memoryEtagCache = new Map<string, EtagMemoryEntry>();
let etagSessionEpoch = 0;

export function clearMemoryEtagCache(): void {
  etagSessionEpoch += 1;
  memoryEtagCache.clear();
}

function setMemoryEtagEntry(path: string, etag: string, data: unknown): void {
  if (memoryEtagCache.has(path)) {
    memoryEtagCache.delete(path);
  } else if (memoryEtagCache.size >= MAX_ETAG_ENTRIES) {
    const oldest = memoryEtagCache.keys().next().value;
    if (oldest !== undefined) memoryEtagCache.delete(oldest);
  }
  memoryEtagCache.set(path, { etag, data });
}

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_LOGOUT_EVENT, clearMemoryEtagCache);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearMemoryEtagCache);
}

export interface RequestOptions {
  keepalive?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  const canUseEtag = method === "GET" && !path.startsWith("/auth");
  const requestEpoch = etagSessionEpoch;
  const cachedEtag = canUseEtag ? memoryEtagCache.get(path) : undefined;

  const send = async () => {
    const startedAt = performance.now();
    const rawHeaders = init?.headers as Record<string, string> | undefined;
    let headers: Record<string, string> | undefined = rawHeaders;
    if (isMutating) {
      headers = { "X-Requested-With": "XMLHttpRequest", ...rawHeaders };
    } else if (cachedEtag && !rawHeaders?.["If-None-Match"]) {
      headers = { "If-None-Match": cachedEtag.etag, ...rawHeaders };
    }
    try {
      return await fetch(`/api${path}`, {
        cache: "no-store",
        credentials: "same-origin",
        ...init,
        keepalive: init?.keepalive,
        headers,
      });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (!isAbort) {
        reportServerFailure("unreachable");
      }
      throw err;
    } finally {
      reportRequestTime(performance.now() - startedAt);
    }
  };

  let response = await send();
  // Trên gói miễn phí Render + Vercel, lần truy cập đầu sau khi máy chủ ngủ đông (cold start)
  // có thể trả 502 / 503 / 504 tạm thời trong vài giây đầu: tự động thử lại êm cho truy vấn GET.
  if (
    !isMutating &&
    (response.status === 502 || response.status === 503 || response.status === 504) &&
    !init?.signal?.aborted
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2200));
    if (!init?.signal?.aborted) {
      response = await send();
    }
  }
  if (response.status === 401 && !isAuthPath(path)) {
    if (await refreshSession()) {
      response = await send();
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
  }

  if (canUseEtag && response.status === 304 && cachedEtag !== undefined) {
    reportServerHealthy();
    return cachedEtag.data as T;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
      details?: { path: string; message: string }[];
      retryAfterSeconds?: number;
    } | null;
    if (response.status >= 500) {
      reportServerFailure("server_error", response.status, body?.error);
    } else {
      reportServerHealthy();
    }
    const headerRetry = Number(response.headers.get("Retry-After") ?? "");
    const retryAfterSeconds =
      typeof body?.retryAfterSeconds === "number" && body.retryAfterSeconds > 0
        ? body.retryAfterSeconds
        : Number.isFinite(headerRetry) && headerRetry > 0
        ? Math.ceil(headerRetry)
        : undefined;
    const fallbackError =
      response.status === 429
        ? retryAfterSeconds
          ? `Thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterSeconds} giây.`
          : "Thao tác quá nhanh. Vui lòng thử lại sau."
        : "Không xử lý được yêu cầu.";
    throw new ApiError(body?.error ?? fallbackError, response.status, body?.code, body?.details, retryAfterSeconds);
  }
  reportServerHealthy();
  if (isMutating && !isAuthPath(path)) {
    notifyDataMutated();
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    const parsed = JSON.parse(text) as T;
    if (canUseEtag && requestEpoch === etagSessionEpoch && text.length <= MAX_ETAG_PAYLOAD_CHARS) {
      const responseEtag = response.headers.get("ETag");
      if (responseEtag) {
        setMemoryEtagEntry(path, responseEtag, parsed);
      }
    }
    return parsed;
  } catch {
    throw new ApiError("Phản hồi từ máy chủ không đúng định dạng dữ liệu.", response.status, "INVALID_JSON");
  }
}

const jsonRequest = (method: string, body?: unknown, options?: RequestOptions): RequestInit => {
  const headers: Record<string, string> = {
    ...(body === undefined ? undefined : { "Content-Type": "application/json" }),
    ...options?.headers,
  };
  return {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: options?.keepalive,
    signal: options?.signal,
  };
};

/** Mục đích tải tệp (khớp backend `UPLOAD_PURPOSES`). */
export type UploadPurpose =
  | "journal"
  | "harvest"
  | "stamp"
  | "approval"
  | "violation"
  | "news"
  | "catalog"
  | "avatar"
  | "lab"
  | "inspection";

export interface UploadedFile {
  id: number;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, {
      keepalive: options?.keepalive,
      signal: options?.signal,
      headers: options?.headers,
    }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, jsonRequest("POST", body, options)),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, jsonRequest("PUT", body, options)),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, jsonRequest("PATCH", body, options)),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, jsonRequest("DELETE", undefined, options)),
  /** Tải một tệp lên `/api/uploads` (multipart). Trả về `{ id, url }` để gửi kèm bản ghi nghiệp vụ. */
  upload: (file: Blob, purpose: UploadPurpose, filename = "upload", options?: RequestOptions) => {
    const form = new FormData();
    form.append("purpose", purpose);
    form.append("file", file, file instanceof File ? file.name : filename);
    return apiRequest<UploadedFile>("/uploads", {
      method: "POST",
      body: form,
      keepalive: options?.keepalive,
      signal: options?.signal,
      headers: options?.headers,
    });
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
