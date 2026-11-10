"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT, api, errorMessage } from "@/lib/api-client";
import type { ListResponse } from "@/types/api";

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const CACHE_FRESH_MS = 25_000;
const MAX_CACHE_ENTRIES = 80;
const apiCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();
let authEpoch = 0;

function setApiCacheEntry(path: string, data: unknown) {
  if (apiCache.has(path)) {
    apiCache.delete(path);
  } else if (apiCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = apiCache.keys().next().value;
    if (oldest !== undefined) apiCache.delete(oldest);
  }
  apiCache.set(path, { data, timestamp: Date.now() });
}

if (typeof window !== "undefined") {
  const clearAll = () => {
    authEpoch += 1;
    apiCache.clear();
    inflightRequests.clear();
  };
  window.addEventListener(AUTH_LOGOUT_EVENT, clearAll);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearAll);
}

/** Xóa bộ nhớ đệm API (gọi tự động sau khi mutation thành công hoặc khi làm mới thủ công). */
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.startsWith(prefix)) {
      apiCache.delete(key);
    }
  }
}

function fetchDeduped<T>(path: string, forceRefresh = false): Promise<T> {
  if (forceRefresh) {
    apiCache.delete(path);
  }
  const existing = inflightRequests.get(path) as Promise<T> | undefined;
  if (existing) return existing;

  const requestEpoch = authEpoch;
  const request = api
    .get<T>(path)
    .then((result) => {
      if (requestEpoch === authEpoch) {
        setApiCacheEntry(path, result);
      }
      return result;
    })
    .finally(() => {
      if (inflightRequests.get(path) === request) {
        inflightRequests.delete(path);
      }
    });

  inflightRequests.set(path, request);
  return request;
}

/**
 * Tải dữ liệu thô (DTO) từ một đường dẫn API, kèm trạng thái tải/lỗi và `refresh()`.
 * Dùng cho các màn hình cần thao tác ghi (thêm/sửa/xóa) nên giữ nguyên `id` và kiểu số của backend.
 * Có bộ nhớ đệm stale-while-revalidate & gộp request trùng để chuyển tab mượt tức thì trên máy yếu.
 * `path = null` để tạm chưa tải (ví dụ chờ người dùng chọn bản ghi).
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(() => {
    if (path === null) return null;
    const cached = apiCache.get(path);
    return cached ? (cached.data as T) : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (path === null) return false;
    return !apiCache.has(path);
  });
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(path);

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
    const cached = !forceRefresh ? apiCache.get(current) : undefined;
    if (cached) {
      setData(cached.data as T);
      setLoading(false);
      if (Date.now() - cached.timestamp < CACHE_FRESH_MS) {
        return;
      }
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await fetchDeduped<T>(current, forceRefresh);
      if (latest.current === current) setData(result);
    } catch (err) {
      if (latest.current === current && !cached) {
        setError(errorMessage(err, "Không tải được dữ liệu."));
      }
    } finally {
      if (latest.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    latest.current = path;
    void refresh(false);
  }, [path, refresh]);

  const setCachedData = (next: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) => {
      const resolved = typeof next === "function" ? (next as (prev: T | null) => T | null)(prev) : next;
      if (latest.current && resolved !== null) {
        setApiCacheEntry(latest.current, resolved);
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

/** Danh sách phân trang chuẩn `{ data, total, page, pageSize }` của backend. */
export function useApiList<T>(resource: string | null, params: Record<string, string | number | undefined | null> = {}) {
  const query = new URLSearchParams();
  query.set("pageSize", String(params.pageSize ?? 500));
  for (const [key, value] of Object.entries(params)) {
    if (key === "pageSize" || value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const path = resource === null ? null : `/${resource}?${query.toString()}`;
  const state = useApi<ListResponse<T>>(path);
  return {
    rows: state.data?.data ?? [],
    total: state.data?.total ?? 0,
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
