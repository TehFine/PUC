"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
  api,
  errorMessage,
  getAuthScopeUserId,
} from "@/lib/api-client";
import {
  isDeviceOfflineNow,
  isTransientNetworkError,
  loadOfflineReadSnapshot,
  registerOfflinePortalInvalidator,
  saveOfflineReadSnapshot,
  saveServerTimeAnchor,
} from "@/lib/offline-sync";
import type { ListResponse } from "@/types/api";
import type { NotificationItem, NotificationList } from "@/types/notifications";

/*
 * Bộ nhớ đệm dùng chung cho cổng hộ dân.
 * - Mỗi khóa lưu đệm gắn với tài khoản đang hoạt động (`<userId>:<path>`).
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
const CATALOG_FRESH_MS = 600_000;
const EMPTY_ARRAY: never[] = [];

const cache = new Map<string, SharedCacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const keyEpoch = new Map<string, number>();
const listeners = new Map<string, Set<Listener>>();
const cacheSyncListeners = new Map<string, Set<Listener>>();
const authResetListeners = new Set<(mode: "logout" | "scope") => void>();
let portalAuthEpoch = 0;

function getKeyEpoch(cacheKey: string): number {
  return keyEpoch.get(cacheKey) ?? 0;
}

function bumpKeyEpoch(cacheKey: string): number {
  const next = getKeyEpoch(cacheKey) + 1;
  if (keyEpoch.size >= MAX_CACHE_ENTRIES * 4 && !keyEpoch.has(cacheKey)) {
    const oldest = keyEpoch.keys().next().value;
    if (oldest !== undefined) keyEpoch.delete(oldest);
  }
  keyEpoch.set(cacheKey, next);
  return next;
}

function scopedPortalKey(key: string): string {
  return `${getAuthScopeUserId() ?? "anon"}:${key}`;
}

function getFreshMs(key: string): number {
  if (key.startsWith("/pesticides") || key.startsWith("/varieties") || key.startsWith("/fertilizers")) {
    return CATALOG_FRESH_MS;
  }
  return DYNAMIC_FRESH_MS;
}

function setCacheEntry(cacheKey: string, data: unknown, timestamp = Date.now()) {
  if (cache.has(cacheKey)) {
    cache.delete(cacheKey);
  } else if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, { data, timestamp });
}

function fetchShared<T>(key: string): Promise<T> {
  const cacheKey = scopedPortalKey(key);
  const running = inflight.get(cacheKey);
  if (running) return running as Promise<T>;
  const requestEpoch = portalAuthEpoch;
  const startGen = getKeyEpoch(cacheKey);
  const request = api
    .get<T>(key)
    .then((result) => {
      if (
        requestEpoch === portalAuthEpoch &&
        scopedPortalKey(key) === cacheKey &&
        getKeyEpoch(cacheKey) === startGen
      ) {
        setCacheEntry(cacheKey, result);
        void saveOfflineReadSnapshot(key, result);
        if (key === "/portal/overview" && result && typeof result === "object") {
          const maybeAnchor = (result as { timeAnchor?: { token?: string; serverTimeMs?: number } }).timeAnchor;
          if (maybeAnchor?.token) {
            saveServerTimeAnchor(maybeAnchor);
          }
        }
      }
      return result;
    })
    .catch(async (err) => {
      if (isTransientNetworkError(err)) {
        const snapshot = await loadOfflineReadSnapshot<T>(key);
        if (
          snapshot !== null &&
          requestEpoch === portalAuthEpoch &&
          scopedPortalKey(key) === cacheKey &&
          getKeyEpoch(cacheKey) === startGen
        ) {
          setCacheEntry(cacheKey, snapshot, 0);
          return snapshot;
        }
      }
      throw err;
    })
    .finally(() => {
      if (inflight.get(cacheKey) === request) {
        inflight.delete(cacheKey);
      }
    });
  inflight.set(cacheKey, request);
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

function subscribeCacheSync(key: string, listener: Listener) {
  const set = cacheSyncListeners.get(key) ?? new Set<Listener>();
  cacheSyncListeners.set(key, set);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) cacheSyncListeners.delete(key);
  };
}

function emitCacheSync(key: string) {
  cacheSyncListeners.get(key)?.forEach((listener) => listener());
}

/** Yêu cầu mọi nơi đang dùng các khóa (đường dẫn API đầy đủ) tải lại tức thì, hủy hiệu lực request cũ đang bay để dữ liệu trước thay đổi không ghi đè dữ liệu mới. */
export function invalidateQueries(...keys: string[]) {
  for (const key of new Set(keys)) {
    const cacheKey = scopedPortalKey(key);
    bumpKeyEpoch(cacheKey);
    inflight.delete(cacheKey);
    const existing = cache.get(cacheKey);
    if (existing) existing.timestamp = 0;
    const set = listeners.get(key);
    if (set && set.size > 0) {
      set.forEach((listener) => listener());
    } else {
      cache.delete(cacheKey);
    }
  }
}

/** Khóa con của `/api/portal/*`. */
export type PortalKey =
  | "overview"
  | "profile"
  | "plots"
  | "care-protocol"
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

/** Chèn tức thì (0ms) thông báo vừa nhận qua SSE vào đầu bộ nhớ đệm để thẻ thông báo đang mở hiển thị ngay lập tức không cần đợi vòng HTTP. */
export function prependRealtimeNotification(item: NotificationItem): void {
  if (getAuthScopeUserId() === null) return;
  const cacheKey = scopedPortalKey(NOTIFICATIONS_PATH);
  bumpKeyEpoch(cacheKey);
  inflight.delete(cacheKey);
  const current = cache.get(cacheKey)?.data as NotificationList | undefined;
  const existingItems = Array.isArray(current?.data) ? current.data : [];
  if (existingItems.some((n) => Number(n.id) === Number(item.id))) {
    return;
  }
  const merged = [item, ...existingItems].slice(0, 100);
  const unreadCount = current
    ? Math.max(merged.filter((n) => !n.readAt).length, (current.unread ?? 0) + (item.readAt ? 0 : 1))
    : item.readAt
      ? 0
      : 1;
  setCacheEntry(cacheKey, { data: merged, unread: unreadCount } satisfies NotificationList, 0);
  emitCacheSync(NOTIFICATIONS_PATH);
}

/** Đọc danh sách thông báo đang lưu trong bộ nhớ đệm hiện tại của phiên làm việc. */
export function getCachedNotificationItems(): NotificationItem[] {
  if (getAuthScopeUserId() === null) return EMPTY_ARRAY;
  const current = cache.get(scopedPortalKey(NOTIFICATIONS_PATH))?.data as NotificationList | undefined;
  return Array.isArray(current?.data) ? current.data : EMPTY_ARRAY;
}

/** Đánh dấu đã đọc tức thì (một, nhiều hoặc toàn bộ) trên bộ nhớ đệm thông báo trước khi đối chiếu nền với máy chủ. */
export function optimisticMarkNotificationRead(ids?: number | number[]): void {
  if (getAuthScopeUserId() === null) return;
  const cacheKey = scopedPortalKey(NOTIFICATIONS_PATH);
  const current = cache.get(cacheKey)?.data as NotificationList | undefined;
  if (!current || !Array.isArray(current.data)) return;
  const idSet =
    ids === undefined
      ? null
      : new Set(
          (Array.isArray(ids) ? ids : [ids])
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v)),
        );
  if (idSet !== null && idSet.size === 0) return;

  bumpKeyEpoch(cacheKey);
  inflight.delete(cacheKey);
  const nowIso = new Date().toISOString();
  let newlyMarkedCount = 0;
  const nextData = current.data.map((n) => {
    if (idSet === null || idSet.has(Number(n.id))) {
      if (!n.readAt) {
        newlyMarkedCount += 1;
        return { ...n, readAt: nowIso };
      }
      return n;
    }
    return n;
  });
  if (idSet !== null && newlyMarkedCount === 0) return;
  const prevUnread =
    typeof current.unread === "number" ? current.unread : current.data.filter((n) => !n.readAt).length;
  const nextUnread =
    idSet === null
      ? 0
      : Math.max(nextData.filter((n) => !n.readAt).length, Math.max(0, prevUnread - newlyMarkedCount));
  setCacheEntry(cacheKey, { data: nextData, unread: nextUnread } satisfies NotificationList, 0);
  emitCacheSync(NOTIFICATIONS_PATH);
}

/** Làm mới các danh sách portal vừa bị thay đổi, LUÔN kèm `overview` (thống kê/nhắc việc) và thông báo. */
export function refreshPortal(...keys: PortalKey[]) {
  invalidateQueries(...[...keys, "overview" as const].map(portalPath), NOTIFICATIONS_PATH);
}

export const invalidatePortal = refreshPortal;

registerOfflinePortalInvalidator((keys) => {
  refreshPortal(...(keys as PortalKey[]));
});

/** Xóa toàn bộ bộ nhớ đệm cổng hộ dân khi đăng xuất, hết phiên hoặc đổi tài khoản. */
export function clearPortalQueryCache(mode: "logout" | "scope" = "scope"): void {
  portalAuthEpoch += 1;
  cache.clear();
  inflight.clear();
  keyEpoch.clear();
  for (const listener of authResetListeners) {
    listener(mode);
  }
}

// Đăng xuất / hết phiên / đổi tài khoản: tăng thế hệ phiên và xóa toàn bộ dữ liệu của hộ khỏi bộ nhớ để tài khoản khác không thấy.
if (typeof window !== "undefined") {
  const onLogoutOrExpired = () => clearPortalQueryCache("logout");
  const onScopeChanged = () => clearPortalQueryCache("scope");
  window.addEventListener(AUTH_LOGOUT_EVENT, onLogoutOrExpired);
  window.addEventListener(AUTH_EXPIRED_EVENT, onLogoutOrExpired);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, onScopeChanged);
}

/**
 * Tải dữ liệu theo đường dẫn API đầy đủ (dùng cache chung, tự tải lại khi bị `invalidateQueries`).
 * `key = null` để chưa tải.
 */
export function useSharedQuery<T>(key: string | null) {
  const cacheKey = key ? scopedPortalKey(key) : null;
  const [data, setData] = useState<T | null>(() =>
    cacheKey ? ((cache.get(cacheKey)?.data as T | undefined) ?? null) : null,
  );
  const [loading, setLoading] = useState(() => (cacheKey ? !cache.has(cacheKey) : false));
  const [error, setError] = useState<string | null>(null);
  const [prevKey, setPrevKey] = useState<string | null>(cacheKey);

  if (prevKey !== cacheKey) {
    setPrevKey(cacheKey);
    const cached = cacheKey ? cache.get(cacheKey) : undefined;
    setData(cached ? (cached.data as T) : null);
    setLoading(cacheKey ? !cached : false);
    setError(null);
  }

  const load = useCallback(
    async (silent: boolean) => {
      if (!key) return;
      const expectedCacheKey = scopedPortalKey(key);
      const callGen = getKeyEpoch(expectedCacheKey);
      if (!silent) setLoading(true);
      setError(null);
      try {
        const result = await fetchShared<T>(key);
        if (scopedPortalKey(key) !== expectedCacheKey || getKeyEpoch(expectedCacheKey) !== callGen) {
          return;
        }
        setData((prev) =>
          key === NOTIFICATIONS_PATH && prev !== null && JSON.stringify(prev) === JSON.stringify(result)
            ? prev
            : result,
        );
      } catch (err) {
        // Giữ dữ liệu cũ nếu đã có; chỉ báo lỗi khi chưa có gì để hiển thị.
        if (!cache.has(expectedCacheKey)) setError(errorMessage(err, "Không tải được dữ liệu."));
      } finally {
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    if (!key || !cacheKey) return;
    let active = true;
    const cached = cache.get(cacheKey);
    const isFresh = cached !== undefined && Date.now() - cached.timestamp < getFreshMs(key);
    if (!cached) {
      // Dựng tức thì dữ liệu từ IndexedDB (< 10ms) khi mở ứng dụng ở vùng rẫy sóng yếu/mất sóng,
      // trong khi mạng vẫn đối chiếu lại ở nền nếu có kết nối.
      void loadOfflineReadSnapshot<T>(key).then((snapshot) => {
        if (!active || snapshot === null || scopedPortalKey(key) !== cacheKey) return;
        if (!cache.has(cacheKey)) {
          setCacheEntry(cacheKey, snapshot, 0);
          setData((prev) => prev ?? snapshot);
          setLoading(false);
          setError(null);
        }
      });
    }
    if (!isFresh) {
      const mountGen = getKeyEpoch(cacheKey);
      fetchShared<T>(key)
        .then((result) => {
          if (!active || scopedPortalKey(key) !== cacheKey || getKeyEpoch(cacheKey) !== mountGen) return;
          setData((prev) =>
            key === NOTIFICATIONS_PATH && prev !== null && JSON.stringify(prev) === JSON.stringify(result)
              ? prev
              : result,
          );
          setError(null);
        })
        .catch((err) => {
          if (!active) return;
          if (!cache.has(cacheKey)) setError(errorMessage(err, "Không tải được dữ liệu."));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    const unsubscribe = subscribe(key, () => {
      void load(true);
    });
    const unsubscribeSync = subscribeCacheSync(key, () => {
      const synced = cache.get(scopedPortalKey(key));
      if (synced !== undefined) {
        setData(synced.data as T);
        setLoading(false);
        setError(null);
      }
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribeSync();
    };
  }, [key, cacheKey, load]);

  useEffect(() => {
    const onAuthReset = (mode: "logout" | "scope") => {
      setData(null);
      setError(null);
      if (mode === "scope" && key !== null && getAuthScopeUserId() !== null) {
        void load(false);
      } else {
        setLoading(false);
      }
    };
    authResetListeners.add(onAuthReset);
    return () => {
      authResetListeners.delete(onAuthReset);
    };
  }, [key, load]);

  /** Tải lại khóa này ở mọi nơi đang dùng. */
  const refresh = useCallback(async () => {
    if (!key) return;
    const currentCacheKey = scopedPortalKey(key);
    bumpKeyEpoch(currentCacheKey);
    const existing = cache.get(currentCacheKey);
    if (existing) existing.timestamp = 0;
    inflight.delete(currentCacheKey);
    const set = listeners.get(key);
    set?.forEach((listener) => listener());
    if (!set || set.size === 0) await load(true);
  }, [key, load]);

  const setCachedData = useCallback(
    (next: T | null | ((prev: T | null) => T | null)) => {
      setData((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: T | null) => T | null)(prev) : next;
        if (key && resolved !== null) {
          setCacheEntry(scopedPortalKey(key), resolved);
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
export function useCatalog<T>(resource: "pesticides" | "varieties" | "fertilizers", enabled = true) {
  const state = useSharedQuery<ListResponse<T> | T[]>(enabled ? `/${resource}?pageSize=500` : null);
  const rows = Array.isArray(state.data) ? state.data : (state.data?.data ?? (EMPTY_ARRAY as T[]));
  return { rows, loaded: state.data !== null, loading: state.loading, error: state.error, refresh: state.refresh };
}

const ESSENTIAL_ORCHARD_PATHS = [
  "/portal/overview",
  "/portal/plots",
  "/pesticides?pageSize=500",
  "/fertilizers?pageSize=500",
  "/portal/journal",
  "/portal/spray",
] as const;

let lastWarmUserId: number | null = null;
let lastWarmAt = 0;

/**
 * Làm ấm êm ái dữ liệu thiết yếu cho nông hộ đi rẫy (vé neo thời gian máy chủ, danh sách thửa đất kèm mã QR biển vườn,
 * danh mục thuốc BVTV kèm ngày cách ly PHI, phân bón và nhật ký) xuống IndexedDB để khi vào vùng rẫy mất sóng dài ngày vẫn ghi chép đầy đủ.
 */
export async function warmPortalEssentialOfflineCache(): Promise<void> {
  const uid = getAuthScopeUserId();
  if (!uid || isDeviceOfflineNow()) return;
  if (lastWarmUserId === uid && Date.now() - lastWarmAt < 10 * 60_000) return;
  lastWarmUserId = uid;
  lastWarmAt = Date.now();

  try {
    const anchor = await api.get<{ token?: string; serverTimeMs?: number }>("/portal/time-anchor");
    if (anchor?.token) {
      saveServerTimeAnchor(anchor);
    }
  } catch {
    // Bỏ qua nếu mạng chập chờn hoặc tài khoản không thuộc cổng nông hộ.
  }

  for (const path of ESSENTIAL_ORCHARD_PATHS) {
    if (getAuthScopeUserId() !== uid || isDeviceOfflineNow()) return;
    const cacheKey = scopedPortalKey(path);
    if (cache.has(cacheKey)) continue;
    const existingSnap = await loadOfflineReadSnapshot(path);
    if (existingSnap !== null) continue;
    try {
      await fetchShared(path);
    } catch {
      // Bỏ qua êm nếu đường truyền chập chờn.
    }
    await new Promise((r) => setTimeout(r, 450));
  }
}
