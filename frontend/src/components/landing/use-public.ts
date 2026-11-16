"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DATA_MUTATED_EVENT, DATA_SYNC_CHANNEL } from "@/lib/api-client";
import { reportRequestTime } from "@/lib/network";

export interface PublicOverview {
  households: number;
  qualifiedHouseholds: number;
  villages: number;
  plots: number;
  areaHa: number;
}

export interface PublicPesticide {
  name: string;
  activeIngredient: string;
  concentration: string | null;
  manufacturer?: string | null;
  mrlMgKg: number | null;
  isolationDays: number | null;
  status: "allowed" | "restricted" | "banned";
}

export interface PublicVariety {
  name: string;
  origin: string | null;
  weightRange: string | null;
  harvestYears: string | null;
  description: string | null;
  category?: string | null;
  fleshColor?: string | null;
  brix?: string | null;
  yieldPerHa?: string | null;
  imageUrl?: string | null;
  farmingTechniques?: string | null;
}

export interface PublicFertilizer {
  name: string;
  category: "organic" | "npk" | "foliar" | "microbial" | "restricted";
  formula: string | null;
  manufacturer: string | null;
  dosage: string | null;
  applicationMethod: string | null;
  timing: string | null;
  status: "encouraged" | "allowed" | "warning";
  imageUrl: string | null;
  description: string | null;
}

export interface PublicCourse {
  title: string;
  heldOn: string;
  location: string | null;
  trainer: string | null;
  capacity: number;
  enrolled: number;
}

export interface PublicCatalog {
  pesticides: PublicPesticide[];
  varieties: PublicVariety[];
  fertilizers?: PublicFertilizer[];
  training: PublicCourse[];
}

type State<T> = { data: T | null; error: boolean; loading: boolean };

interface StoreEntry {
  state: State<unknown>;
  updatedAt: number;
  etag: string | null;
  inflight: Promise<unknown> | null;
}

const OVERVIEW_STORAGE_KEY = "puc:public-overview:v1";
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1500;
const MOUNT_FRESH_MS = 15_000;
const FOCUS_REVALIDATE_MS = 20_000;

const SERVER_SNAPSHOT: State<never> = Object.freeze({
  data: null,
  error: false,
  loading: true,
});

const entries = new Map<string, StoreEntry>();
const listeners = new Set<() => void>();
let globalListenersAttached = false;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function isValidOverview(val: unknown): val is PublicOverview {
  if (!val || typeof val !== "object") return false;
  const o = val as Record<string, unknown>;
  return (
    typeof o.households === "number" &&
    Number.isFinite(o.households) &&
    typeof o.qualifiedHouseholds === "number" &&
    Number.isFinite(o.qualifiedHouseholds) &&
    typeof o.villages === "number" &&
    Number.isFinite(o.villages) &&
    typeof o.plots === "number" &&
    Number.isFinite(o.plots) &&
    typeof o.areaHa === "number" &&
    Number.isFinite(o.areaHa)
  );
}

function readPersistedData(path: string): unknown | null {
  if (path !== "overview" || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OVERVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidOverview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistData(path: string, data: unknown) {
  if (path !== "overview" || typeof window === "undefined" || !isValidOverview(data)) return;
  try {
    window.localStorage.setItem(OVERVIEW_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage.
  }
}

function ensureEntry(path: string): StoreEntry {
  let entry = entries.get(path);
  if (!entry) {
    const persisted = readPersistedData(path);
    entry = {
      state: persisted !== null ? { data: persisted, error: false, loading: false } : SERVER_SNAPSHOT,
      updatedAt: 0,
      etag: null,
      inflight: null,
    };
    entries.set(path, entry);
  }
  return entry;
}

/** Đối chiếu qua If-None-Match (304 Not Modified) để tránh tải lại JSON lớn trên trang giới thiệu khi dữ liệu chưa đổi. */
async function fetchJson<T>(path: string, entry: StoreEntry): Promise<{ status: 304 } | { status: 200; data: T; etag: string | null }> {
  const startedAt = performance.now();
  try {
    const headers: Record<string, string> | undefined =
      entry.etag && entry.state.data !== null ? { "If-None-Match": entry.etag } : undefined;
    const response = await fetch(`/api/public/${path}`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 304 && entry.state.data !== null) {
      return { status: 304 };
    }
    if (!response.ok) throw new Error(String(response.status));
    const etag = response.headers.get("ETag");
    return { status: 200, data: (await response.json()) as T, etag };
  } finally {
    reportRequestTime(performance.now() - startedAt);
  }
}

function revalidate(path: string, force = false): Promise<unknown> {
  const entry = ensureEntry(path);
  if (!force && entry.inflight) return entry.inflight;
  if (!force && entry.updatedAt > 0 && Date.now() - entry.updatedAt < MOUNT_FRESH_MS) {
    return Promise.resolve(entry.state.data);
  }

  const request = fetchJson<unknown>(path, entry)
    .catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return fetchJson<unknown>(path, entry);
    })
    .then((result) => {
      entry.updatedAt = Date.now();
      if (result.status === 304) {
        if (entry.state.loading || entry.state.error) {
          entry.state = { data: entry.state.data, error: false, loading: false };
          emitChange();
        }
        return entry.state.data;
      }
      const { data, etag } = result;
      if (etag) entry.etag = etag;
      persistData(path, data);
      const prevJson = entry.state.data !== null ? JSON.stringify(entry.state.data) : null;
      const nextJson = JSON.stringify(data);
      if (prevJson !== nextJson || entry.state.loading || entry.state.error) {
        entry.state = { data, error: false, loading: false };
        emitChange();
      }
      return data;
    })
    .catch((error) => {
      if (entry.state.data === null && (!entry.state.error || entry.state.loading)) {
        entry.state = { data: null, error: true, loading: false };
        emitChange();
      }
      throw error;
    })
    .finally(() => {
      if (entry.inflight === request) {
        entry.inflight = null;
      }
    });

  entry.inflight = request;
  return request;
}

/** Xóa hiệu lực bộ nhớ đệm công khai và tải lại ngay nếu trang giới thiệu đang hiển thị. */
export function invalidatePublicCache() {
  for (const [path, entry] of entries.entries()) {
    entry.updatedAt = 0;
    if (listeners.size > 0) {
      void revalidate(path, true).catch(() => undefined);
    }
  }
}

function attachGlobalListeners() {
  if (globalListenersAttached || typeof window === "undefined") return;
  globalListenersAttached = true;

  window.addEventListener(DATA_MUTATED_EVENT, invalidatePublicCache);

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(DATA_SYNC_CHANNEL);
      bc.addEventListener("message", invalidatePublicCache);
    } catch {
      // ignore
    }
  }

  const revalidateOnFocus = () => {
    if (listeners.size === 0) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const now = Date.now();
    for (const [path, entry] of entries.entries()) {
      if (now - entry.updatedAt >= FOCUS_REVALIDATE_MS) {
        void revalidate(path, true).catch(() => undefined);
      }
    }
  };

  window.addEventListener("focus", revalidateOnFocus);
  document.addEventListener("visibilitychange", revalidateOnFocus);
}

export function usePublic<T>(path: string): State<T> {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      attachGlobalListeners();
      listeners.add(onStoreChange);
      const entry = ensureEntry(path);
      if (Date.now() - entry.updatedAt >= MOUNT_FRESH_MS) {
        void revalidate(path).catch(() => undefined);
      }
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    [path],
  );

  const getSnapshot = useCallback(() => ensureEntry(path).state as State<T>, [path]);
  const getServerSnapshot = useCallback(() => SERVER_SNAPSHOT as State<T>, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
