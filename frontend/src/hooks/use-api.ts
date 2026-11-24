"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
  DATA_MUTATED_EVENT,
  DATA_SYNC_CHANNEL,
  api,
  errorMessage,
  getAuthScopeUserId,
} from "@/lib/api-client";
import {
  isTransientNetworkError,
  loadOfflineReadSnapshot,
  saveOfflineReadSnapshot,
} from "@/lib/offline-sync";
import type { ListResponse } from "@/types/api";

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const CACHE_FRESH_MS = 25_000;
const MAX_CACHE_ENTRIES = 120;
const apiCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();
const scopeResetListeners = new Set<(mode: "logout" | "scope") => void>();
const liveRefreshListeners = new Set<(prefix?: string) => void>();
let authEpoch = 0;

function scopedApiKey(path: string): string {
  return `${getAuthScopeUserId() ?? "anon"}:${path}`;
}

function setApiCacheEntry(cacheKey: string, data: unknown) {
  if (apiCache.has(cacheKey)) {
    apiCache.delete(cacheKey);
  } else if (apiCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = apiCache.keys().next().value;
    if (oldest !== undefined) apiCache.delete(oldest);
  }
  apiCache.set(cacheKey, { data, timestamp: Date.now() });
}

function markAllApiCacheStale() {
  for (const entry of apiCache.values()) {
    entry.timestamp = 0;
  }
}

/** Xóa sạch toàn bộ bộ nhớ đệm và request đang bay khi đăng xuất, hết phiên hoặc đổi tài khoản. */
export function clearApiQueryCache(mode: "logout" | "scope" = "scope"): void {
  authEpoch += 1;
  apiCache.clear();
  inflightRequests.clear();
  for (const listener of scopeResetListeners) {
    listener(mode);
  }
}

let mutationRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastMutationAt = 0;
const VISIBILITY_STALE_MS = 8_000;

function scheduleLiveMutationRefresh() {
  lastMutationAt = Date.now();
  markAllApiCacheStale();
  if (typeof window === "undefined") return;
  if (mutationRefreshTimer) clearTimeout(mutationRefreshTimer);
  mutationRefreshTimer = setTimeout(() => {
    mutationRefreshTimer = null;
    for (const listener of liveRefreshListeners) {
      listener();
    }
  }, 90);
}

if (typeof window !== "undefined") {
  const onLogoutOrExpired = () => clearApiQueryCache("logout");
  const onScopeChanged = () => clearApiQueryCache("scope");
  window.addEventListener(AUTH_LOGOUT_EVENT, onLogoutOrExpired);
  window.addEventListener(AUTH_EXPIRED_EVENT, onLogoutOrExpired);
  // Đổi tài khoản trong cùng tab (đồng bộ đăng nhập đa tab): dữ liệu của tài khoản cũ không được dùng lại.
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, onScopeChanged);
  // Khi dữ liệu thay đổi ở cùng tab hoặc tab khác: đánh dấu stale và làm mới êm mọi truy vấn đang hiển thị.
  window.addEventListener(DATA_MUTATED_EVENT, scheduleLiveMutationRefresh);
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(DATA_SYNC_CHANNEL);
      bc.addEventListener("message", scheduleLiveMutationRefresh);
    } catch {
      // ignore
    }
  }
  const onForegroundOrOnline = () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const now = Date.now();
    let hasStale = false;
    for (const entry of apiCache.values()) {
      if (now - entry.timestamp >= VISIBILITY_STALE_MS) {
        hasStale = true;
        break;
      }
    }
    if (hasStale || apiCache.size === 0) {
      for (const listener of liveRefreshListeners) {
        listener();
      }
    }
  };
  document.addEventListener("visibilitychange", onForegroundOrOnline);
  window.addEventListener("online", onForegroundOrOnline);
}

/** Xóa bộ nhớ đệm API (gọi tự động sau khi mutation thành công hoặc khi làm mới thủ công). */
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    const sep = key.indexOf(":");
    const rawPath = sep >= 0 ? key.slice(sep + 1) : key;
    if (rawPath.startsWith(prefix)) {
      apiCache.delete(key);
    }
  }
}

function isLiveProbePath(path: string): boolean {
  return path === "/health" || path.startsWith("/health?");
}

function fetchDeduped<T>(path: string, forceRefresh = false): Promise<T> {
  const cacheKey = scopedApiKey(path);
  const skipOfflineSnapshot = isLiveProbePath(path);
  if (forceRefresh) {
    apiCache.delete(cacheKey);
  }
  const existing = inflightRequests.get(cacheKey) as Promise<T> | undefined;
  if (existing) return existing;

  const requestEpoch = authEpoch;
  const request = api
    .get<T>(path)
    .then((result) => {
      if (requestEpoch === authEpoch && scopedApiKey(path) === cacheKey) {
        setApiCacheEntry(cacheKey, result);
        if (!skipOfflineSnapshot) {
          void saveOfflineReadSnapshot(path, result);
        }
      }
      return result;
    })
    .catch(async (err) => {
      if (!skipOfflineSnapshot && isTransientNetworkError(err)) {
        const snapshot = await loadOfflineReadSnapshot<T>(path);
        if (snapshot !== null && requestEpoch === authEpoch && scopedApiKey(path) === cacheKey) {
          setApiCacheEntry(cacheKey, snapshot);
          const entry = apiCache.get(cacheKey);
          if (entry) entry.timestamp = 0;
          return snapshot;
        }
      }
      throw err;
    })
    .finally(() => {
      if (inflightRequests.get(cacheKey) === request) {
        inflightRequests.delete(cacheKey);
      }
    });

  inflightRequests.set(cacheKey, request);
  return request;
}

/** Làm mới êm (không nháy skeleton) các màn hình quản trị đang mở khớp tiền tố đường dẫn khi có sự kiện thời gian thực. */
export function refreshMountedApiQueries(prefix?: string): void {
  invalidateApiCache(prefix);
  for (const listener of liveRefreshListeners) {
    listener(prefix);
  }
}

/** Nạp sẵn dữ liệu API vào bộ nhớ đệm lúc nhàn rỗi để mở phân mục (như Bản đồ Vùng trồng) trong 0ms. */
export function prefetchApi(path: string): void {
  const cacheKey = scopedApiKey(path);
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_FRESH_MS) return;
  void fetchDeduped(path, false).catch(() => undefined);
}

/**
 * Tải dữ liệu thô (DTO) từ một đường dẫn API, kèm trạng thái tải/lỗi và `refresh()`.
 * Dùng cho các màn hình cần thao tác ghi (thêm/sửa/xóa) nên giữ nguyên `id` và kiểu số của backend.
 * Có bộ nhớ đệm stale-while-revalidate & gộp request trùng để chuyển tab mượt tức thì trên máy yếu.
 * `path = null` để tạm chưa tải (ví dụ chờ người dùng chọn bản ghi).
 */
export function useApi<T>(path: string | null) {
  const cacheKey = path === null ? null : scopedApiKey(path);
  const [trackedKey, setTrackedKey] = useState<string | null>(cacheKey);
  const [data, setData] = useState<T | null>(() => {
    if (cacheKey === null) return null;
    const cached = apiCache.get(cacheKey);
    return cached ? (cached.data as T) : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (cacheKey === null) return false;
    return !apiCache.has(cacheKey);
  });
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(path);

  if (trackedKey !== cacheKey) {
    setTrackedKey(cacheKey);
    const cached = cacheKey !== null ? apiCache.get(cacheKey) : undefined;
    setData(cached ? (cached.data as T) : null);
    setLoading(cacheKey !== null && !cached);
    setError(null);
  }

  useEffect(() => {
    latest.current = path;
  }, [path]);

  const refresh = useCallback(async (forceRefresh = true) => {
    const current = latest.current;
    if (current === null) {
      setData(null);
      setLoading(false);
      return;
    }
    const currentKey = scopedApiKey(current);
    const cached = !forceRefresh ? apiCache.get(currentKey) : undefined;
    if (cached) {
      setData(cached.data as T);
      setLoading(false);
      if (Date.now() - cached.timestamp < CACHE_FRESH_MS) {
        return;
      }
    } else {
      setLoading(true);
      void loadOfflineReadSnapshot<T>(current).then((snapshot) => {
        if (snapshot === null || latest.current !== current || scopedApiKey(current) !== currentKey) return;
        if (!apiCache.has(currentKey)) {
          setApiCacheEntry(currentKey, snapshot);
          const entry = apiCache.get(currentKey);
          if (entry) entry.timestamp = 0;
          setData((prev) => prev ?? snapshot);
          setLoading(false);
          setError(null);
        }
      });
    }
    setError(null);
    try {
      const result = await fetchDeduped<T>(current, forceRefresh);
      if (latest.current === current && scopedApiKey(current) === currentKey) {
        setData(result);
      }
    } catch (err) {
      if (latest.current === current && !cached) {
        setData(null);
        setError(errorMessage(err, "Không tải được dữ liệu."));
      }
    } finally {
      if (latest.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    latest.current = path;
    void refresh(false);
  }, [path, cacheKey, refresh]);

  useEffect(() => {
    const onScopeReset = (mode: "logout" | "scope") => {
      setData(null);
      setError(null);
      if (mode === "scope" && latest.current !== null && getAuthScopeUserId() !== null) {
        void refresh(true);
      } else {
        setLoading(false);
      }
    };
    scopeResetListeners.add(onScopeReset);
    return () => {
      scopeResetListeners.delete(onScopeReset);
    };
  }, [refresh]);

  useEffect(() => {
    const onLiveRefresh = (prefix?: string) => {
      const current = latest.current;
      if (!current || getAuthScopeUserId() === null) return;
      if (prefix && !current.startsWith(prefix)) return;
      const cacheKey = scopedApiKey(current);
      const existingInflight = inflightRequests.get(cacheKey);
      if (existingInflight) {
        void existingInflight.finally(() => {
          if (latest.current !== current || getAuthScopeUserId() === null) return;
          void fetchDeduped<T>(current, true)
            .then((result) => {
              if (latest.current === current) {
                setData(result);
                setError(null);
              }
            })
            .catch(() => undefined);
        });
        return;
      }
      const cached = apiCache.get(cacheKey);
      if (!prefix && cached && lastMutationAt > 0 && cached.timestamp >= lastMutationAt) {
        return;
      }
      void fetchDeduped<T>(current, true)
        .then((result) => {
          if (latest.current === current) {
            setData(result);
            setError(null);
          }
        })
        .catch(() => undefined);
    };
    liveRefreshListeners.add(onLiveRefresh);
    return () => {
      liveRefreshListeners.delete(onLiveRefresh);
    };
  }, []);

  const setCachedData = (next: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) => {
      const resolved = typeof next === "function" ? (next as (prev: T | null) => T | null)(prev) : next;
      if (latest.current && resolved !== null) {
        setApiCacheEntry(scopedApiKey(latest.current), resolved);
      }
      return resolved;
    });
  };

  return {
    data: path === null ? null : data,
    loading: path === null ? false : loading,
    error,
    refresh: () => refresh(true),
    setData: setCachedData,
  };
}

const EMPTY_ROWS: never[] = [];

/** Danh sách phân trang chuẩn `{ data, total, page, pageSize }` của backend. */
export function useApiList<T, TExtra extends object = Record<string, unknown>>(
  resource: string | null,
  params: Record<string, string | number | undefined | null> = {},
) {
  const query = new URLSearchParams();
  query.set("pageSize", String(params.pageSize ?? 500));
  for (const [key, value] of Object.entries(params)) {
    if (key === "pageSize" || value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const path = resource === null ? null : `/${resource}?${query.toString()}`;
  const state = useApi<ListResponse<T> & TExtra>(path);
  return {
    rows: state.data?.data ?? (EMPTY_ROWS as T[]),
    total: state.data?.total ?? 0,
    raw: state.data,
    loading: state.loading,
    error: state.error,
    refresh: state.refresh,
  };
}

/**
 * Bọc một thao tác ghi: trạng thái `pending`, thông báo lỗi tiếng Việt, chặn bấm hai lần.
 * `run` trả về kết quả (hoặc `undefined` nếu lỗi) để nơi gọi đóng hộp thoại/làm mới danh sách.
 */
export function useMutation<TArgs extends unknown[], TResult>(action: (...args: TArgs) => Promise<TResult>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const actionRef = useRef(action);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      invalidateApiCache();
      return result;
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending, error, setError };
}
