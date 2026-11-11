"use client";

import { useCallback, useEffect, useState } from "react";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT, api, errorMessage } from "@/lib/api-client";
import type { ListResponse } from "@/types/api";

/*
 * Bộ nhớ đệm dùng chung cho cổng hộ dân.
 * - Mỗi khóa là một đường dẫn API đầy đủ (ví dụ `/portal/journal`).
 * - Nhiều component cùng dùng một khóa sẽ chia sẻ dữ liệu và một request đang chạy.
 * - `refreshPortal(...)` báo cho MỌI component đang hiển thị khóa đó tải lại (sửa lỗi overview cũ sau khi ghi).
 */

type Listener = () => void;

interface SharedCacheEntry {
  data: unknown;
  timestamp: number;
}

const MAX_CACHE_ENTRIES = 60;
const DYNAMIC_FRESH_MS = 25_000;
const CATALOG_FRESH_MS = 90_000;

const cache = new Map<string, SharedCacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<Listener>>();
let portalAuthEpoch = 0;

function getFreshMs(key: string): number {
  if (key.startsWith("/pesticides") || key.startsWith("/varieties") || key.startsWith("/fertilizers")) {
    return CATALOG_FRESH_MS;
  }
  return DYNAMIC_FRESH_MS;
}

function setCacheEntry(key: string, data: unknown, timestamp = Date.now()) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp });
}

function fetchShared<T>(key: string): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const requestEpoch = portalAuthEpoch;
  const request = api
    .get<T>(key)
    .then((result) => {
      if (requestEpoch === portalAuthEpoch) {
        setCacheEntry(key, result);
      }
      return result;
    })
    .finally(() => {
      if (inflight.get(key) === request) {
        inflight.delete(key);
      }
    });
  inflight.set(key, request);
  return request;
}

function subscribe(key: string, listener: Listener) {
  const set = listeners.get(key) ?? new Set<Listener>();
  listeners.set(key, set);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Yêu cầu mọi nơi đang dùng các khóa (đường dẫn API đầy đủ) tải lại. Khóa chưa ai dùng sẽ bị đánh dấu cũ để lần sau tải mới. */
export function invalidateQueries(...keys: string[]) {
  for (const key of new Set(keys)) {
    const existing = cache.get(key);
    if (existing) existing.timestamp = 0;
    const set = listeners.get(key);
    if (set && set.size > 0) {
      inflight.delete(key);
      set.forEach((listener) => listener());
    } else {
      cache.delete(key);
    }
  }
}

/** Khóa con của `/api/portal/*`. */
export type PortalKey =
  | "overview"
  | "profile"
  | "plots"
  | "journal"
  | "spray"
  | "lab-tests"
  | "schedule"
  | "violations"
  | "harvest"
  | "harvest-notices"
  | "harvest-declarations"
  | "stamps"
  | "approvals"
  | "training";

export const portalPath = (key: PortalKey) => `/portal/${key}`;
export const NOTIFICATIONS_PATH = "/notifications";

/** Làm mới các danh sách portal vừa bị thay đổi, LUÔN kèm `overview` (thống kê/nhắc việc) và thông báo. */
export function refreshPortal(...keys: PortalKey[]) {
  invalidateQueries(...[...keys, "overview" as const].map(portalPath), NOTIFICATIONS_PATH);
}

export const invalidatePortal = refreshPortal;

// Đăng xuất / hết phiên: tăng thế hệ phiên và xóa toàn bộ dữ liệu của hộ khỏi bộ nhớ để tài khoản khác không thấy.
if (typeof window !== "undefined") {
  const clearAll = () => {
    portalAuthEpoch += 1;
    cache.clear();
    inflight.clear();
  };
  window.addEventListener(AUTH_LOGOUT_EVENT, clearAll);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearAll);
}

/**
 * Tải dữ liệu theo đường dẫn API đầy đủ (dùng cache chung, tự tải lại khi bị `invalidateQueries`).
 * `key = null` để chưa tải.
 */
export function useSharedQuery<T>(key: string | null) {
  const [data, setData] = useState<T | null>(() => (key ? ((cache.get(key)?.data as T | undefined) ?? null) : null));
  const [loading, setLoading] = useState(() => (key ? !cache.has(key) : false));
  const [error, setError] = useState<string | null>(null);
  const [prevKey, setPrevKey] = useState<string | null>(key);

  if (prevKey !== key) {
    setPrevKey(key);
    const cached = key ? cache.get(key) : undefined;
    setData(cached ? (cached.data as T) : null);
    setLoading(key ? !cached : false);
    setError(null);
  }

  const load = useCallback(
    async (silent: boolean) => {
      if (!key) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const result = await fetchShared<T>(key);
        setData(result);
      } catch (err) {
        // Giữ dữ liệu cũ nếu đã có; chỉ báo lỗi khi chưa có gì để hiển thị.
        if (!cache.has(key)) setError(errorMessage(err, "Không tải được dữ liệu."));
      } finally {
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    if (!key) return;
    let active = true;
    const cached = cache.get(key);
    const isFresh = cached !== undefined && Date.now() - cached.timestamp < getFreshMs(key);
    if (!isFresh) {
      fetchShared<T>(key)
        .then((result) => {
          if (!active) return;
          setData(result);
          setError(null);
        })
        .catch((err) => {
          if (!active) return;
          if (!cache.has(key)) setError(errorMessage(err, "Không tải được dữ liệu."));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    const unsubscribe = subscribe(key, () => {
      void load(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [key, load]);

  /** Tải lại khóa này ở mọi nơi đang dùng. */
  const refresh = useCallback(async () => {
    if (!key) return;
    const existing = cache.get(key);
    if (existing) existing.timestamp = 0;
    inflight.delete(key);
    const set = listeners.get(key);
    set?.forEach((listener) => listener());
    if (!set || set.size === 0) await load(true);
  }, [key, load]);

  const setCachedData = useCallback(
    (next: T | null | ((prev: T | null) => T | null)) => {
      setData((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: T | null) => T | null)(prev) : next;
        if (key && resolved !== null) {
          setCacheEntry(key, resolved);
        }
        return resolved;
      });
    },
    [key],
  );

  return {
    data: key ? data : null,
    loading: key ? loading : false,
    error: key ? error : null,
    refresh,
    setData: setCachedData,
  };
}

/** Tải dữ liệu từ `/api/portal/<path>`; cache chung giữa các tab nên chuyển tab không nháy loading. */
export function usePortal<T>(path: PortalKey) {
  return useSharedQuery<T>(portalPath(path));
}

/** Danh mục dùng chung (`/api/pesticides`, `/api/varieties`, `/api/fertilizers`), trả mảng bản ghi. */
export function useCatalog<T>(resource: "pesticides" | "varieties" | "fertilizers") {
  const state = useSharedQuery<ListResponse<T> | T[]>(`/${resource}?pageSize=500`);
  const rows = Array.isArray(state.data) ? state.data : (state.data?.data ?? []);
  return { rows, loaded: state.data !== null, loading: state.loading, error: state.error, refresh: state.refresh };
}
