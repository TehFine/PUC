"use client";

import { useSyncExternalStore } from "react";
import {
  compressImage,
  computeBlobSha256Hex,
  encodedImageName,
  isSupportedImageFile,
  purposeAllowsVideo,
  validatePickedFile,
} from "@/components/portal/shared/media";
import { getNetworkQualitySnapshot } from "@/lib/network";
import { toast } from "@/components/ui/Toast";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
  ApiError,
  api,
  apiRequest,
  errorMessage,
  getAuthScopeUserId,
  getAuthScopeUserRole,
  getServerCalibratedDate,
  notifyDataMutated,
  type UploadPurpose,
} from "@/lib/api-client";
import type { AuthSession } from "@/types/api";

const DB_NAME = "puc-offline-sync-v1";
const DB_VERSION = 2;
const STORE_OUTBOX = "outbox";
const STORE_SNAPSHOTS = "read_snapshots";
const STORE_DRAFTS = "field_drafts";
const AUTH_SNAPSHOT_STORAGE_KEY = "puc:offline-auth-session:v1";
const TIME_ANCHOR_STORAGE_KEY = "puc:time-anchor:v1";
/** Phiên ngoại tuyến dành riêng cho nông hộ đi rẫy dài ngày giữ tối đa 14 ngày trên thiết bị. */
const AUTH_SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60_000;
const MAX_READ_SNAPSHOTS = 120;
/** Giới hạn tuổi thọ (14 ngày) và số lượng tối đa (24 bản) của Kho giữ hình ngoài rẫy để chống đầy bộ nhớ máy cũ. */
const MAX_DRAFT_AGE_MS = 14 * 24 * 60 * 60_000;
const MAX_TOTAL_DRAFTS = 24;
/**
 * Danh sách trắng (allowlist) duy nhất các đường dẫn dữ liệu canh tác tại vườn được phép lưu bản chụp đọc ngoại tuyến
 * trên thiết bị của nông hộ; mọi phân hệ quản trị, thanh tra, đối tác, CCCD/SĐT, tài khoản đều bị loại trừ tuyệt đối.
 */
const FARMER_SAFE_SNAPSHOT_PREFIXES = [
  "/portal/overview",
  "/portal/home",
  "/portal/plots",
  "/portal/journal",
  "/portal/spray",
  "/portal/violations",
  "/portal/care-protocol",
  "/portal/harvest",
  "/portal/stamps",
  "/portal/requests",
  "/portal/training",
  "/care-protocol",
  "/pesticides",
  "/fertilizers",
  "/varieties",
  "/public/catalog",
  "/public/news",
  "/public/villages",
];
/** Chỉ cho phép giả lập mạng qua `?net=` khi chạy môi trường phát triển. */
const ALLOW_NET_SIMULATION = process.env.NODE_ENV === "development";

const PHOTO_UPLOAD_TIMEOUT_MS = 15_000;
const VIDEO_UPLOAD_TIMEOUT_MS = 40_000;
const RECORD_SUBMIT_TIMEOUT_MS = 16_000;
const PROBE_TIMEOUT_MS = 4_000;
const HEARTBEAT_MS = 20_000;

export type OfflineRecordKind =
  | "portal-journal"
  | "portal-spray"
  | "portal-care-milestone"
  | "portal-violation-response"
  | "admin-journal"
  | "admin-spray"
  | "admin-violation"
  | "admin-minute";

export interface OfflineMediaSlot {
  slotKey: string;
  purpose: UploadPurpose;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isVideo: boolean;
  durationSec?: number | null;
  posterDataUrl?: string | null;
  sha256?: string;
  captureSource?: "in_app_camera" | "camera" | "upload";
  capturedAtIso?: string;
  blob?: Blob;
  uploadedId?: number;
  uploadedUrl?: string;
}

export interface OfflineFieldDraft {
  id: string;
  userId: number;
  isAutoWorkingDraft?: boolean;
  plotCode: string;
  entryOn: string;
  activity: string;
  activities?: string[];
  detail: string;
  lateReason: string;
  pesticideId: string;
  fertilizerId?: string;
  fertDose?: string;
  dose: string;
  areaHa: string;
  source: string;
  coords: { latitude: number; longitude: number } | null;
  gpsAccuracyM?: number | null;
  captureSource?: "in_app_camera" | "camera" | "upload";
  signboardQrToken?: string | null;
  timeAnchorToken?: string | null;
  monotonicElapsedMs?: number | null;
  capturedAtIso: string;
  capturedDateVn: string;
  updatedAt: number;
  mediaSlots: OfflineMediaSlot[];
}

export interface OfflineMediaBinding {
  arrayField?: string;
  primaryField?: string;
}

export interface OfflineOutboxItem {
  id: string;
  userId: number;
  kind: OfflineRecordKind;
  label: string;
  plotCode?: string;
  endpoint: string;
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
  mediaBindings: Record<string, OfflineMediaBinding>;
  mediaSlots: OfflineMediaSlot[];
  capturedAtIso: string;
  capturedDateVn: string;
  createdAt: number;
  status: "queued" | "syncing" | "failed";
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
  portalKeysToInvalidate?: string[];
}

interface ReadSnapshotRecord {
  key: string;
  userId: number;
  path: string;
  data: unknown;
  savedAt: number;
}

export interface OfflineSyncSnapshot {
  items: OfflineOutboxItem[];
  drafts: OfflineFieldDraft[];
  workingDraft: OfflineFieldDraft | null;
  queuedCount: number;
  failedCount: number;
  pendingMediaCount: number;
  isSyncing: boolean;
  isPreUploadingDrafts: boolean;
  activeItemLabel: string | null;
  activeMediaProgress: { done: number; total: number } | null;
  recentSyncedCount: number;
  lastSyncedAt: number | null;
}

const EMPTY_SYNC_SNAPSHOT: OfflineSyncSnapshot = Object.freeze({
  items: [],
  drafts: [],
  workingDraft: null,
  queuedCount: 0,
  failedCount: 0,
  pendingMediaCount: 0,
  isSyncing: false,
  isPreUploadingDrafts: false,
  activeItemLabel: null,
  activeMediaProgress: null,
  recentSyncedCount: 0,
  lastSyncedAt: null,
});

/* ──────────────────────────── Bảo toàn phiên đăng nhập khi mất sóng tại vườn ──────────────────────────── */

export function saveOfflineAuthSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  try {
    // Chỉ lưu bản chụp phiên ngoại tuyến cho tài khoản Nông dân đi rẫy mất sóng;
    // tuyệt đối không lưu thông tin phiên của Quản trị viên / Thanh tra / Doanh nghiệp vào localStorage.
    if (session?.user?.role !== "farmer") {
      window.localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      AUTH_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({ session, savedAt: Date.now() }),
    );
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage.
  }
}

export function loadOfflineAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { session?: AuthSession; savedAt?: number };
    const savedAt = parsed?.savedAt;
    if (
      !parsed?.session?.user?.id ||
      parsed.session.user.role !== "farmer" ||
      typeof savedAt !== "number" ||
      savedAt > Date.now() + 5 * 60_000 ||
      Date.now() - savedAt > AUTH_SNAPSHOT_MAX_AGE_MS
    ) {
      // Phiên ngoại tuyến hết hạn hoặc hỏng: xóa luôn bản chụp dữ liệu đọc để không mở lại được sau này.
      window.localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY);
      void clearAllOfflineReadSnapshots();
      return null;
    }
    return parsed.session;
  } catch {
    return null;
  }
}

export function clearOfflineAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/* ──────────────────────────── Vé neo thời gian máy chủ (Server Time-Bounding + Monotonic Clock) ──────────────────────────── */

interface StoredTimeAnchor {
  userId: number;
  token: string;
  serverTimeMs: number;
  savedWallMs: number;
}

let inMemoryTimeAnchor: (StoredTimeAnchor & { savedPerfNow: number }) | null = null;

export function saveServerTimeAnchor(anchor: { token?: string; serverTimeMs?: number } | null | undefined): void {
  if (typeof window === "undefined" || !anchor?.token || typeof anchor.serverTimeMs !== "number") return;
  if (getAuthScopeUserRole() !== "farmer") return;
  const userId = getAuthScopeUserId();
  if (!userId || userId <= 0) return;

  const savedWallMs = Date.now();
  const savedPerfNow = typeof performance !== "undefined" ? performance.now() : 0;
  const record: StoredTimeAnchor = {
    userId,
    token: anchor.token,
    serverTimeMs: anchor.serverTimeMs,
    savedWallMs,
  };
  inMemoryTimeAnchor = { ...record, savedPerfNow };
  try {
    window.localStorage.setItem(TIME_ANCHOR_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Bỏ qua nếu bộ nhớ cục bộ bị khóa.
  }
}

export function clearServerTimeAnchor(): void {
  inMemoryTimeAnchor = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TIME_ANCHOR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function buildClientEvidenceClockMeta(options?: {
  capturedPerfNow?: number | null;
  capturedAtIso?: string | null;
}): {
  clientCapturedAt: string;
  timeAnchorToken?: string;
  monotonicElapsedMs?: number;
} {
  const userId = getAuthScopeUserId();
  const fallbackIso = options?.capturedAtIso || getServerCalibratedDate().toISOString();

  if (
    inMemoryTimeAnchor &&
    userId &&
    inMemoryTimeAnchor.userId === userId &&
    typeof performance !== "undefined"
  ) {
    const refPerf =
      typeof options?.capturedPerfNow === "number" && Number.isFinite(options.capturedPerfNow)
        ? options.capturedPerfNow
        : performance.now();
    const elapsedMs = Math.max(0, Math.round(refPerf - inMemoryTimeAnchor.savedPerfNow));
    const calibratedIso = new Date(inMemoryTimeAnchor.serverTimeMs + elapsedMs).toISOString();
    return {
      clientCapturedAt: options?.capturedAtIso || calibratedIso,
      timeAnchorToken: inMemoryTimeAnchor.token,
      monotonicElapsedMs: elapsedMs,
    };
  }

  if (typeof window !== "undefined" && userId && getAuthScopeUserRole() === "farmer") {
    try {
      const raw = window.localStorage.getItem(TIME_ANCHOR_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredTimeAnchor>;
        if (
          parsed.userId === userId &&
          typeof parsed.token === "string" &&
          typeof parsed.serverTimeMs === "number" &&
          typeof parsed.savedWallMs === "number" &&
          Date.now() - parsed.savedWallMs <= AUTH_SNAPSHOT_MAX_AGE_MS
        ) {
          return {
            clientCapturedAt: fallbackIso,
            timeAnchorToken: parsed.token,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    clientCapturedAt: fallbackIso,
  };
}

/* ──────────────────────────── Mở kết nối IndexedDB an toàn ──────────────────────────── */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
          outbox.createIndex("by_user", "userId", { unique: false });
          outbox.createIndex("by_created", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          const snaps = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "key" });
          snaps.createIndex("by_user", "userId", { unique: false });
          snaps.createIndex("by_saved", "savedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          const drafts = db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
          drafts.createIndex("by_user", "userId", { unique: false });
          drafts.createIndex("by_updated", "updatedAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
  });
}

function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/* ──────────────────────────── Lưu đệm đọc ngoại tuyến (cho danh sách thửa / thuốc / lộ trình) ──────────────────────────── */

/** Chỉ các đường dẫn thuộc danh sách trắng dành riêng cho nông hộ đi vườn mới được phép lưu/đọc bản chụp ngoại tuyến. */
export function isOfflineSnapshotAllowed(path: string): boolean {
  const normalized = (path.split(/[?#]/, 1)[0] ?? "").trim().replace(/\/+/g, "/").toLowerCase();
  if (!normalized.startsWith("/")) return false;
  return FARMER_SAFE_SNAPSHOT_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/**
 * Bản chụp đọc chỉ gắn với tài khoản NÔNG HỘ đang hoạt động trong TAB hiện tại (không lưu IndexedDB cho quản trị/cán bộ/đối tác).
 */
function snapshotScopeUserId(): number | null {
  if (getAuthScopeUserRole() !== "farmer") return null;
  return getAuthScopeUserId();
}

let legacySensitiveSnapshotsPurged = false;

export async function saveOfflineReadSnapshot(path: string, data: unknown): Promise<void> {
  const userId = snapshotScopeUserId();
  if (!userId || data === null || data === undefined || !isOfflineSnapshotAllowed(path)) return;
  const db = await openOfflineDb();
  if (!db) return;
  // Phiên đã đổi trong lúc mở IndexedDB: bỏ qua để không ghi dữ liệu sai chủ.
  if (snapshotScopeUserId() !== userId) return;

  try {
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    const store = tx.objectStore(STORE_SNAPSHOTS);
    const record: ReadSnapshotRecord = {
      key: `${userId}:${path}`,
      userId,
      path,
      data,
      savedAt: Date.now(),
    };
    store.put(record);
    // Dọn một lần mỗi phiên tải trang các bản chụp nhạy cảm còn sót từ phiên bản cũ.
    if (!legacySensitiveSnapshotsPurged) {
      legacySensitiveSnapshotsPurged = true;
      const legacyRecords = (await idbReq(store.getAll())) as ReadSnapshotRecord[];
      for (const legacy of legacyRecords) {
        if (legacy && (typeof legacy.path !== "string" || !isOfflineSnapshotAllowed(legacy.path))) {
          store.delete(legacy.key);
        }
      }
    }
    const allKeys = await idbReq(store.getAllKeys());
    if (allKeys.length > MAX_READ_SNAPSHOTS) {
      const allRecords = (await idbReq(store.getAll())) as ReadSnapshotRecord[];
      allRecords.sort((a, b) => a.savedAt - b.savedAt);
      const excess = allRecords.length - MAX_READ_SNAPSHOTS;
      for (let i = 0; i < excess; i += 1) {
        if (allRecords[i]) store.delete(allRecords[i]!.key);
      }
    }
    await idbTxDone(tx);
  } catch {
    // Bỏ qua nếu bộ nhớ thiết bị đầy.
  }
}

export async function loadOfflineReadSnapshot<T>(path: string): Promise<T | null> {
  const userId = snapshotScopeUserId();
  if (!userId || !isOfflineSnapshotAllowed(path)) return null;
  const db = await openOfflineDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
    const rec = (await idbReq(tx.objectStore(STORE_SNAPSHOTS).get(`${userId}:${path}`))) as
      | ReadSnapshotRecord
      | undefined;
    if (!rec || rec.userId !== userId || snapshotScopeUserId() !== userId) return null;
    if (typeof rec.savedAt !== "number" || Date.now() - rec.savedAt > AUTH_SNAPSHOT_MAX_AGE_MS) {
      return null;
    }
    return rec.data as T;
  } catch {
    return null;
  }
}

export async function clearAllOfflineReadSnapshots(): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    tx.objectStore(STORE_SNAPSHOTS).clear();
    await idbTxDone(tx);
  } catch {
    // ignore
  }
}

/* ──────────────────────────── Nhận diện lỗi mạng chập chờn / mất sóng ──────────────────────────── */

export function isDeviceOfflineNow(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (navigator.onLine === false) return true;
  if (!ALLOW_NET_SIMULATION) return false;
  try {
    const forced = new URLSearchParams(window.location.search).get("net");
    if (forced === "offline") return true;
  } catch {
    // ignore
  }
  return document.documentElement?.dataset?.net === "offline";
}

/**
 * Lỗi mạng tạm thời (mất sóng, hết thời gian chờ, máy chủ ngủ đông 502/503/504) cho phép dùng dữ liệu ngoại tuyến.
 * Mọi phản hồi HTTP khác từ máy chủ (đặc biệt 401/403 khi phiên bị thu hồi) tuyệt đối không bao giờ bị coi là mất mạng,
 * kể cả khi trình duyệt đang báo ngoại tuyến.
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504;
  }
  if (err instanceof OfflineAuthChangedError) {
    return false;
  }
  if (isDeviceOfflineNow()) return true;
  if (err instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "AbortError" || err.name === "TimeoutError" || err.name === "NetworkError") {
      return true;
    }
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("load failed") ||
      msg.includes("the internet connection appears to be offline") ||
      msg.includes("timeout")
    ) {
      return true;
    }
  }
  return false;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `puc_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `puc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function formatVnDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return fmt.format(d);
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function todayVnIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(getServerCalibratedDate());
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/* ──────────────────────────── Trạng thái Reactive của Hàng đợi Ngoại tuyến ──────────────────────────── */

let currentSnapshot: OfflineSyncSnapshot = EMPTY_SYNC_SNAPSHOT;
const syncListeners = new Set<() => void>();
let activeSyncUserId: number | null = null;
let syncRunning = false;
let clearRecentTimer: ReturnType<typeof setTimeout> | undefined;
let portalInvalidateHandler: ((keys: string[]) => void) | null = null;

/*
 * Bộ đếm thế hệ phiên đồng bộ: tăng mỗi khi đăng xuất, hết phiên hoặc đổi tài khoản trên cùng thiết bị.
 * Mọi tiến trình tải ảnh/gửi bản ghi đang chạy đều chụp lại thế hệ lúc bắt đầu và dừng ngay khi thế hệ thay đổi,
 * đồng thời AbortController hủy tức thì request đang bay để không gửi nhật ký của tài khoản cũ bằng cookie tài khoản mới.
 */
let syncAuthEpoch = 0;
let authAbortController: AbortController | null = null;

function currentAuthSignal(): AbortSignal {
  if (!authAbortController) authAbortController = new AbortController();
  return authAbortController.signal;
}

function invalidateSyncAuth(): void {
  syncAuthEpoch += 1;
  const controller = authAbortController;
  authAbortController = null;
  if (controller && !controller.signal.aborted) {
    try {
      controller.abort(new DOMException("Phiên đăng nhập trên thiết bị đã thay đổi.", "AbortError"));
    } catch {
      controller.abort();
    }
  }
}

/** Gộp tín hiệu hủy theo phiên đăng nhập với giới hạn thời gian của từng request. */
function authScopedSignal(authSignal: AbortSignal, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const anyFn = (AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") {
    return anyFn.call(AbortSignal, [authSignal, timeoutSignal]);
  }
  const controller = new AbortController();
  const forward = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  for (const source of [authSignal, timeoutSignal]) {
    if (source.aborted) {
      forward(source);
      break;
    }
    source.addEventListener("abort", () => forward(source), { once: true });
  }
  return controller.signal;
}

/** Tạo bộ kiểm tra "vẫn đúng tài khoản" cho một tiến trình đồng bộ/gửi bản ghi. */
function captureSyncOwner(userId: number | null): { signal: AbortSignal; isOwner: () => boolean } {
  const epoch = syncAuthEpoch;
  const signal = currentAuthSignal();
  return {
    signal,
    isOwner: () =>
      userId !== null && epoch === syncAuthEpoch && activeSyncUserId === userId && !signal.aborted,
  };
}

class OfflineAuthChangedError extends Error {
  constructor() {
    super("Phiên đăng nhập trên thiết bị đã thay đổi.");
    this.name = "OfflineAuthChangedError";
  }
}

export function registerOfflinePortalInvalidator(fn: (keys: string[]) => void): void {
  portalInvalidateHandler = fn;
}

function emitSyncChange(): void {
  for (const listener of syncListeners) {
    listener();
  }
}

let persistentStorageRequested = false;

function ensurePersistentStorageOnce(): void {
  if (persistentStorageRequested || typeof navigator === "undefined") return;
  persistentStorageRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // ignore
  }
}

function requestSwBackgroundSync(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    void navigator.serviceWorker.ready
      .then((reg) => {
        const syncReg = reg as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        };
        return syncReg.sync?.register("puc-outbox-sync");
      })
      .catch(() => undefined);
  } catch {
    // ignore
  }
}

function recomputeSnapshot(
  items: OfflineOutboxItem[],
  patch?: Partial<
    Pick<
      OfflineSyncSnapshot,
      | "drafts"
      | "workingDraft"
      | "isSyncing"
      | "isPreUploadingDrafts"
      | "activeItemLabel"
      | "activeMediaProgress"
      | "recentSyncedCount"
      | "lastSyncedAt"
    >
  >,
): void {
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const queuedCount = sorted.filter((it) => it.status === "queued" || it.status === "syncing").length;
  const failedCount = sorted.filter((it) => it.status === "failed").length;
  const pendingMediaCount = sorted.reduce(
    (sum, it) => sum + it.mediaSlots.filter((m) => !m.uploadedId).length,
    0,
  );

  currentSnapshot = {
    items: sorted,
    drafts: patch?.drafts !== undefined ? patch.drafts : currentSnapshot.drafts,
    workingDraft: patch?.workingDraft !== undefined ? patch.workingDraft : currentSnapshot.workingDraft,
    queuedCount,
    failedCount,
    pendingMediaCount,
    isSyncing: patch?.isSyncing ?? currentSnapshot.isSyncing,
    isPreUploadingDrafts: patch?.isPreUploadingDrafts ?? currentSnapshot.isPreUploadingDrafts,
    activeItemLabel: patch?.activeItemLabel !== undefined ? patch.activeItemLabel : currentSnapshot.activeItemLabel,
    activeMediaProgress:
      patch?.activeMediaProgress !== undefined ? patch.activeMediaProgress : currentSnapshot.activeMediaProgress,
    recentSyncedCount:
      patch?.recentSyncedCount !== undefined ? patch.recentSyncedCount : currentSnapshot.recentSyncedCount,
    lastSyncedAt: patch?.lastSyncedAt !== undefined ? patch.lastSyncedAt : currentSnapshot.lastSyncedAt,
  };
  emitSyncChange();
}

async function listUserOutboxItems(userId: number | null): Promise<OfflineOutboxItem[]> {
  if (!userId) return [];
  const db = await openOfflineDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE_OUTBOX, "readonly");
    const index = tx.objectStore(STORE_OUTBOX).index("by_user");
    const rows = (await idbReq(index.getAll(userId))) as OfflineOutboxItem[];
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

async function listUserDraftsAll(userId: number | null): Promise<OfflineFieldDraft[]> {
  if (!userId) return [];
  const db = await openOfflineDb();
  if (!db || !db.objectStoreNames.contains(STORE_DRAFTS)) return [];
  try {
    const tx = db.transaction(STORE_DRAFTS, "readonly");
    const index = tx.objectStore(STORE_DRAFTS).index("by_user");
    const rows = (await idbReq(index.getAll(userId))) as OfflineFieldDraft[];
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function splitDrafts(allDrafts: OfflineFieldDraft[]): {
  drafts: OfflineFieldDraft[];
  workingDraft: OfflineFieldDraft | null;
} {
  const workingDraft = allDrafts.find((d) => d.isAutoWorkingDraft) ?? null;
  const drafts = allDrafts.filter((d) => !d.isAutoWorkingDraft);
  return { drafts, workingDraft };
}

async function pruneExpiredAndExcessDrafts(keepDraftId?: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db || !db.objectStoreNames.contains(STORE_DRAFTS)) return;
  try {
    const tx = db.transaction(STORE_DRAFTS, "readwrite");
    const store = tx.objectStore(STORE_DRAFTS);
    const all = ((await idbReq(store.getAll())) as OfflineFieldDraft[]) ?? [];
    const now = Date.now();
    const survivors: OfflineFieldDraft[] = [];
    for (const d of all) {
      if (!d || typeof d.id !== "string") continue;
      if (d.id !== keepDraftId && (typeof d.updatedAt !== "number" || now - d.updatedAt > MAX_DRAFT_AGE_MS)) {
        store.delete(d.id);
      } else {
        survivors.push(d);
      }
    }
    if (survivors.length > MAX_TOTAL_DRAFTS) {
      survivors.sort((a, b) => a.updatedAt - b.updatedAt);
      let excess = survivors.length - MAX_TOTAL_DRAFTS;
      for (const candidate of survivors) {
        if (excess <= 0) break;
        if (candidate.id === keepDraftId) continue;
        store.delete(candidate.id);
        excess -= 1;
      }
    }
    await idbTxDone(tx);
  } catch {
    // ignore cleanup errors
  }
}

async function putFieldDraftRecord(draft: OfflineFieldDraft): Promise<void> {
  const db = await openOfflineDb();
  if (!db || !db.objectStoreNames.contains(STORE_DRAFTS)) {
    throw new Error("Thiết bị không hỗ trợ lưu trữ ảnh tạm ngoại tuyến IndexedDB.");
  }
  const writeOnce = async () => {
    const tx = db.transaction(STORE_DRAFTS, "readwrite");
    tx.objectStore(STORE_DRAFTS).put(draft);
    await idbTxDone(tx);
  };
  try {
    await writeOnce();
  } catch (err) {
    const errName = err instanceof DOMException ? err.name : (err as { name?: string } | null)?.name;
    if (errName === "QuotaExceededError") {
      await pruneExpiredAndExcessDrafts(draft.id);
      await clearAllOfflineReadSnapshots();
      await writeOnce();
    } else {
      throw err;
    }
  }
  void pruneExpiredAndExcessDrafts(draft.id);
}

/** Xóa toàn bộ bản nháp ngoài rẫy và hàng đợi dữ liệu của người dùng khi đăng xuất trên thiết bị dùng chung. */
export async function purgeUserWorkingDraftsOnLogout(userId: number | null): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  try {
    if (db.objectStoreNames.contains(STORE_DRAFTS)) {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      const store = tx.objectStore(STORE_DRAFTS);
      if (!userId || userId <= 0) {
        store.clear();
      } else {
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const rec = cursor.value as OfflineFieldDraft | undefined;
          if (!rec || rec.userId === userId || cursor.key === `working:${userId}`) {
            cursor.delete();
          }
          cursor.continue();
        };
      }
      await idbTxDone(tx).catch(() => undefined);
    }
    if (db.objectStoreNames.contains(STORE_OUTBOX)) {
      const tx = db.transaction(STORE_OUTBOX, "readwrite");
      const store = tx.objectStore(STORE_OUTBOX);
      if (!userId || userId <= 0) {
        store.clear();
      } else {
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const rec = cursor.value as OfflineOutboxItem | undefined;
          if (!rec || rec.userId === userId) {
            cursor.delete();
          }
          cursor.continue();
        };
      }
      await idbTxDone(tx).catch(() => undefined);
    }
  } catch {
    // Bỏ qua nếu trình duyệt đóng kết nối IndexedDB đột ngột
  }
}

async function deleteFieldDraftRecordById(id: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db || !db.objectStoreNames.contains(STORE_DRAFTS)) return;
  const tx = db.transaction(STORE_DRAFTS, "readwrite");
  tx.objectStore(STORE_DRAFTS).delete(id);
  await idbTxDone(tx);
}

async function putOutboxItem(item: OfflineOutboxItem): Promise<void> {
  const db = await openOfflineDb();
  if (!db) throw new Error("Thiết bị không hỗ trợ lưu trữ ngoại tuyến IndexedDB.");
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  tx.objectStore(STORE_OUTBOX).put(item);
  await idbTxDone(tx);
}

async function deleteOutboxItemById(id: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  tx.objectStore(STORE_OUTBOX).delete(id);
  await idbTxDone(tx);
}

export async function refreshOfflineQueueState(userId?: number | null): Promise<void> {
  const uid = userId !== undefined ? userId : activeSyncUserId;
  // Không bao giờ để một tiến trình cũ ghi đè tài khoản đang hoạt động (chống hiện hàng đợi của hộ khác).
  if (uid !== activeSyncUserId) return;
  const epoch = syncAuthEpoch;
  const [items, allDrafts] = await Promise.all([listUserOutboxItems(uid), listUserDraftsAll(uid)]);
  if (epoch !== syncAuthEpoch || uid !== activeSyncUserId) return;
  const { drafts, workingDraft } = splitDrafts(allDrafts);
  recomputeSnapshot(items, { drafts, workingDraft });
}

async function readOwnOutboxItem(id: string): Promise<OfflineOutboxItem | null> {
  const db = await openOfflineDb();
  if (!db || activeSyncUserId === null) return null;
  try {
    const tx = db.transaction(STORE_OUTBOX, "readonly");
    const existing = (await idbReq(tx.objectStore(STORE_OUTBOX).get(id))) as OfflineOutboxItem | undefined;
    return existing && existing.userId === activeSyncUserId ? existing : null;
  } catch {
    return null;
  }
}

export async function removeOfflineOutboxItem(id: string): Promise<void> {
  // Chỉ cho xóa bản ghi thuộc đúng tài khoản đang đăng nhập.
  const own = await readOwnOutboxItem(id);
  if (!own) return;
  await deleteOutboxItemById(own.id);
  await refreshOfflineQueueState();
}

export async function retryOfflineOutboxItem(id: string): Promise<void> {
  const own = await readOwnOutboxItem(id);
  if (!own) return;
  const db = await openOfflineDb();
  if (!db) return;
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  const store = tx.objectStore(STORE_OUTBOX);
  const existing = (await idbReq(store.get(id))) as OfflineOutboxItem | undefined;
  if (existing && existing.userId === own.userId) {
    existing.status = "queued";
    existing.nextRetryAt = 0;
    existing.lastError = null;
    store.put(existing);
  }
  await idbTxDone(tx);
  await refreshOfflineQueueState();
  void triggerOfflineSyncNow();
}

/* ──────────────────────────── Kho giữ hình chụp ngoài rẫy để điền chi tiết sau ──────────────────────────── */

export interface SaveFieldDraftInput {
  id?: string;
  isAutoWorkingDraft?: boolean;
  plotCode: string;
  entryOn: string;
  activity: string;
  activities?: string[];
  detail?: string;
  lateReason?: string;
  pesticideId?: string;
  fertilizerId?: string;
  fertDose?: string;
  dose?: string;
  areaHa?: string;
  source?: string;
  coords?: { latitude: number; longitude: number } | null;
  gpsAccuracyM?: number | null;
  captureSource?: "in_app_camera" | "camera" | "upload";
  signboardQrToken?: string | null;
  timeAnchorToken?: string | null;
  monotonicElapsedMs?: number | null;
  capturedAtIso?: string;
  capturedDateVn?: string;
  items: Array<{
    name: string;
    isVideo: boolean;
    durationSec?: number | null;
    posterDataUrl?: string | null;
    file?: File;
    blob?: Blob;
    precompressed?: boolean;
    sha256?: string;
    captureSource?: "in_app_camera" | "camera" | "upload";
    capturedAtIso?: string;
    uploadedId?: number;
    uploadedUrl?: string;
  }>;
}

export async function saveOfflineFieldDraft(input: SaveFieldDraftInput): Promise<OfflineFieldDraft | null> {
  const uid = activeSyncUserId ?? getAuthScopeUserId();
  if (!uid) return null;
  ensurePersistentStorageOnce();

  const draftId = input.isAutoWorkingDraft
    ? `working:${uid}`
    : (input.id ?? `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`);

  // Nếu bản nháp tự động không còn tệp nào thì xóa ngay bản nháp làm việc
  if (input.isAutoWorkingDraft && input.items.length === 0) {
    await deleteFieldDraftRecordById(draftId);
    await refreshOfflineQueueState(uid);
    return null;
  }

  const { slots } = await prepareCompressedMediaSlots(
    [
      {
        slotKey: "photos",
        purpose: "journal",
        items: input.items,
        binding: { arrayField: "photoIds", primaryField: "photoId" },
      },
    ],
    { keepBlobEvenWhenUploaded: true },
  );

  const nowIso = input.capturedAtIso ?? new Date().toISOString();
  const dateVn = input.capturedDateVn ?? todayVnIso();

  const record: OfflineFieldDraft = {
    id: draftId,
    userId: uid,
    isAutoWorkingDraft: Boolean(input.isAutoWorkingDraft),
    plotCode: input.plotCode,
    entryOn: input.entryOn || dateVn,
    activity: input.activity,
    activities: input.activities,
    detail: input.detail ?? "",
    lateReason: input.lateReason ?? "",
    pesticideId: input.pesticideId ?? "",
    fertilizerId: input.fertilizerId ?? "",
    fertDose: input.fertDose ?? "",
    dose: input.dose ?? "",
    areaHa: input.areaHa ?? "",
    source: input.source ?? "",
    coords: input.coords ?? null,
    gpsAccuracyM: input.gpsAccuracyM ?? null,
    captureSource: input.captureSource,
    signboardQrToken: input.signboardQrToken ?? null,
    timeAnchorToken: input.timeAnchorToken ?? null,
    monotonicElapsedMs: input.monotonicElapsedMs ?? null,
    capturedAtIso: nowIso,
    capturedDateVn: dateVn,
    updatedAt: Date.now(),
    mediaSlots: slots,
  };

  await putFieldDraftRecord(record);
  await refreshOfflineQueueState(uid);
  requestSwBackgroundSync();
  if (!isDeviceOfflineNow()) {
    void triggerOfflineSyncNow(false);
  }
  return record;
}

export async function clearWorkingFieldDraft(): Promise<void> {
  const uid = activeSyncUserId ?? getAuthScopeUserId();
  if (!uid) return;
  await deleteFieldDraftRecordById(`working:${uid}`);
  await refreshOfflineQueueState(uid);
}

export async function removeOfflineFieldDraft(id: string): Promise<void> {
  const uid = activeSyncUserId ?? getAuthScopeUserId();
  if (!uid) return;
  const db = await openOfflineDb();
  if (!db || !db.objectStoreNames.contains(STORE_DRAFTS)) return;
  const tx = db.transaction(STORE_DRAFTS, "readonly");
  const existing = (await idbReq(tx.objectStore(STORE_DRAFTS).get(id))) as OfflineFieldDraft | undefined;
  if (!existing || existing.userId !== uid) return;
  await deleteFieldDraftRecordById(id);
  await refreshOfflineQueueState(uid);
}

/* ──────────────────────────── Đóng gói ảnh/video nén WebP sẵn sàng lưu ngoại tuyến ──────────────────────────── */

export interface OfflineMediaInputGroup {
  slotKey: string;
  purpose: UploadPurpose;
  items: Array<{
    name: string;
    isVideo: boolean;
    durationSec?: number | null;
    posterDataUrl?: string | null;
    file?: File;
    blob?: Blob;
    precompressed?: boolean;
    sha256?: string;
    captureSource?: "in_app_camera" | "camera" | "upload";
    capturedAtIso?: string;
    uploadedId?: number;
    uploadedUrl?: string;
  }>;
  binding: OfflineMediaBinding;
}

async function prepareCompressedMediaSlots(
  groups: OfflineMediaInputGroup[],
  options?: { keepBlobEvenWhenUploaded?: boolean },
): Promise<{
  slots: OfflineMediaSlot[];
  bindings: Record<string, OfflineMediaBinding>;
}> {
  const slots: OfflineMediaSlot[] = [];
  const bindings: Record<string, OfflineMediaBinding> = {};

  for (const group of groups) {
    bindings[group.slotKey] = group.binding;
    for (const item of group.items) {
      const hasUploaded = Boolean(item.uploadedId && Number.isInteger(item.uploadedId) && item.uploadedId > 0);
      if (hasUploaded && !options?.keepBlobEvenWhenUploaded) {
        slots.push({
          slotKey: group.slotKey,
          purpose: group.purpose,
          fileName: item.name,
          mimeType: item.isVideo ? "video/mp4" : "image/webp",
          sizeBytes: item.file?.size ?? item.blob?.size ?? 0,
          isVideo: item.isVideo,
          durationSec: item.durationSec,
          posterDataUrl: item.posterDataUrl,
          sha256: item.sha256,
          captureSource: item.captureSource,
          capturedAtIso: item.capturedAtIso,
          uploadedId: item.uploadedId,
          uploadedUrl: item.uploadedUrl,
        });
        continue;
      }

      const rawBlob = item.file ?? item.blob;
      if (!rawBlob) {
        if (hasUploaded) {
          slots.push({
            slotKey: group.slotKey,
            purpose: group.purpose,
            fileName: item.name,
            mimeType: item.isVideo ? "video/mp4" : "image/webp",
            sizeBytes: 0,
            isVideo: item.isVideo,
            durationSec: item.durationSec,
            posterDataUrl: item.posterDataUrl,
            sha256: item.sha256,
            captureSource: item.captureSource,
            capturedAtIso: item.capturedAtIso,
            uploadedId: item.uploadedId,
            uploadedUrl: item.uploadedUrl,
          });
        }
        continue;
      }

      let compressedBlob: Blob = rawBlob;
      let finalName = item.name;

      if (item.file && !item.precompressed) {
        const allowPdf = group.purpose === "approval" || group.purpose === "lab";
        const allowVideo = purposeAllowsVideo(group.purpose);
        const problem = validatePickedFile(item.file, { allowPdf, allowVideo });
        if (problem) {
          throw new Error(problem);
        }
        const isImage = isSupportedImageFile(item.file);
        compressedBlob = isImage ? await compressImage(item.file) : item.file;
        finalName =
          isImage && compressedBlob !== item.file
            ? encodedImageName(item.file.name, compressedBlob.type || "image/webp")
            : item.file.name;
      }

      const sha256 = item.sha256 ?? (await computeBlobSha256Hex(compressedBlob));

      slots.push({
        slotKey: group.slotKey,
        purpose: group.purpose,
        fileName: finalName,
        mimeType: compressedBlob.type || item.file?.type || (item.isVideo ? "video/mp4" : "image/webp"),
        sizeBytes: compressedBlob.size,
        isVideo: item.isVideo,
        durationSec: item.durationSec,
        posterDataUrl: item.posterDataUrl,
        sha256,
        captureSource: item.captureSource,
        capturedAtIso: item.capturedAtIso,
        blob: compressedBlob,
        uploadedId: hasUploaded ? item.uploadedId : undefined,
        uploadedUrl: hasUploaded ? item.uploadedUrl : undefined,
      });
    }
  }

  return { slots, bindings };
}

function applyMediaIdsToPayload(
  basePayload: Record<string, unknown>,
  slots: OfflineMediaSlot[],
  bindings: Record<string, OfflineMediaBinding>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...basePayload };
  for (const [slotKey, binding] of Object.entries(bindings)) {
    const ids = slots
      .filter((s) => s.slotKey === slotKey && typeof s.uploadedId === "number" && s.uploadedId > 0)
      .map((s) => s.uploadedId!);
    if (binding.arrayField) {
      payload[binding.arrayField] = ids.length > 0 ? ids : undefined;
    }
    if (binding.primaryField) {
      payload[binding.primaryField] = ids[0] ?? undefined;
    }
  }
  return payload;
}

async function uploadSingleSlot(
  slot: OfflineMediaSlot,
  authSignal: AbortSignal,
  checkHashFirst = false,
): Promise<{ id: number; url: string }> {
  if (slot.uploadedId && slot.uploadedId > 0) {
    return { id: slot.uploadedId, url: slot.uploadedUrl ?? `/api/uploads/${slot.uploadedId}` };
  }
  if (!slot.blob) {
    throw new Error(`Không đọc được dữ liệu tệp "${slot.fileName}" đã lưu trên thiết bị.`);
  }
  const sha256 = slot.sha256 ?? (await computeBlobSha256Hex(slot.blob));
  if (sha256) slot.sha256 = sha256;

  // Khi thử lại từ vùng sóng yếu hoặc tải nền bản nháp: hỏi trước bằng 80 byte GET xem máy chủ đã nhận tệp chưa
  if (checkHashFirst && sha256 && slot.sizeBytes > 0) {
    try {
      const existing = await api.checkUploadByHash(slot.purpose, sha256, slot.sizeBytes, {
        signal: authScopedSignal(authSignal, 4_000),
      });
      if (existing.found) {
        return { id: existing.id, url: existing.url };
      }
    } catch {
      // Nếu đường truyền gián đoạn hoặc phiên chưa sẵn sàng, chuyển thẳng sang tải tệp bên dưới.
    }
  }

  const timeoutMs = slot.isVideo ? VIDEO_UPLOAD_TIMEOUT_MS : PHOTO_UPLOAD_TIMEOUT_MS;
  const uploaded = await api.upload(slot.blob, slot.purpose, slot.fileName, {
    signal: authScopedSignal(authSignal, timeoutMs),
    sha256,
  });
  return { id: uploaded.id, url: uploaded.url };
}

export interface SubmitFieldRecordOptions<TResponse> {
  kind: OfflineRecordKind;
  label: string;
  plotCode?: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  payload: Record<string, unknown>;
  mediaGroups?: OfflineMediaInputGroup[];
  portalKeysToInvalidate?: string[];
  onProgress?: (progress: { done: number; total: number } | null) => void;
  /** Cho phép giữ nguyên mốc giờ chụp ảnh thực tế ngoài rẫy khi hoàn tất từ bản nháp. */
  capturedAtIso?: string;
  capturedDateVn?: string;
  /** Cho phép truyền sẵn userId từ AuthContext (ưu tiên hơn đọc localStorage). */
  userId?: number | null;
  /** Kiểu phản hồi mong đợi khi gửi trực tuyến thành công. */
  _phantom?: TResponse;
}

export type SubmitFieldRecordResult<TResponse> =
  | { mode: "synced"; data: TResponse }
  | { mode: "queued"; item: OfflineOutboxItem };

const INLINE_FAST_SYNC_BUDGET_MS = 5_500;

/**
 * Luồng gửi bản ghi kèm ảnh/video ưu tiên người dùng ngoài rẫy sóng yếu hoặc mất sóng (Local-First Outbox):
 * 1. Tái sử dụng trực tiếp ảnh đã nén WebP + mã băm SHA-256 (không bao giờ giải mã/nén lại lần 2).
 * 2. Luôn ghi an toàn bản ghi vào IndexedDB TRƯỚC TIÊN (< 80ms) rồi mới chạm tới mạng: dù bà con khóa màn hình ngay
 *    sau khi bấm Lưu, dữ liệu và hình ảnh vẫn nằm nguyên trên máy, tuyệt đối không bao giờ mất.
 * 3. Nếu đang mất sóng, sóng 2G/3G yếu (`netQuality !== "good"`), hoặc có video/nhiều ảnh chưa tải trước:
 *    trả kết quả ngay lập tức không bắt đứng chờ ngoài nắng, rồi tự động đồng bộ nền từng ảnh kèm checkpoint.
 * 4. Nếu mạng khỏe và ảnh đã được tải nền sẵn khi đang nhập biểu mẫu: gửi hoàn tất trong < 300ms (hoặc tự chuyển sang
 *    đồng bộ nền nếu mạng khựng quá 5,5 giây).
 */
export async function submitFieldRecordWithOfflineQueue<TResponse = unknown>(
  options: SubmitFieldRecordOptions<TResponse>,
): Promise<SubmitFieldRecordResult<TResponse>> {
  const method = options.method ?? "POST";
  const userId = options.userId ?? activeSyncUserId ?? getAuthScopeUserId();
  if (!userId) {
    throw new Error("Không xác định được phiên tài khoản để lưu nhật ký. Vui lòng đăng nhập lại.");
  }
  ensurePersistentStorageOnce();
  const owner = captureSyncOwner(userId);
  const idempotencyKey = generateIdempotencyKey();
  const capturedAtIso = options.capturedAtIso ?? getServerCalibratedDate().toISOString();
  const capturedDateVn = options.capturedDateVn ?? todayVnIso();
  const nowDateVn = todayVnIso();

  if (BACKDATE_AWARE_ENDPOINTS.has(options.endpoint)) {
    const rawExecDate =
      (typeof options.payload.entryOn === "string" && options.payload.entryOn) ||
      (typeof options.payload.sprayedOn === "string" && options.payload.sprayedOn) ||
      (typeof options.payload.performedOn === "string" && options.payload.performedOn) ||
      "";
    if (rawExecDate && /^\d{4}-\d{2}-\d{2}$/.test(rawExecDate)) {
      if (rawExecDate > nowDateVn) {
        throw new Error("Ngày thực hiện không được ở tương lai. Chỉ được ghi nhận sau khi đã thực hiện công việc.");
      }
      if (options.capturedDateVn && /^\d{4}-\d{2}-\d{2}$/.test(options.capturedDateVn) && rawExecDate > options.capturedDateVn) {
        throw new Error("Ngày thực hiện không được vượt quá ngày chụp hình hiện trường tại vườn.");
      }
    }
  }

  const { slots, bindings } = await prepareCompressedMediaSlots(options.mediaGroups ?? []);

  const item: OfflineOutboxItem = {
    id: idempotencyKey,
    userId,
    kind: options.kind,
    label: options.label,
    plotCode: options.plotCode,
    endpoint: options.endpoint,
    method,
    payload: options.payload,
    mediaBindings: bindings,
    mediaSlots: slots,
    capturedAtIso,
    capturedDateVn,
    createdAt: Date.now(),
    status: "queued",
    attempts: 0,
    nextRetryAt: 0,
    lastError: null,
    portalKeysToInvalidate: options.portalKeysToInvalidate,
  };

  // Bước 1: Ghi cứng xuống IndexedDB ngay lập tức trước mọi thao tác mạng.
  await putOutboxItem(item);
  requestSwBackgroundSync();

  const pendingSlots = slots.filter((s) => !s.uploadedId);
  const netQuality = getNetworkQualitySnapshot();
  const shouldQueueImmediately =
    isDeviceOfflineNow() ||
    netQuality !== "good" ||
    pendingSlots.some((s) => s.isVideo) ||
    pendingSlots.length > 2;

  if (shouldQueueImmediately) {
    if (owner.isOwner()) {
      await refreshOfflineQueueState(userId);
      if (!isDeviceOfflineNow()) {
        void triggerOfflineSyncNow(true);
      }
    }
    options.onProgress?.(null);
    return { mode: "queued", item };
  }

  // Bước 2: Mạng đang khỏe và còn ít (hoặc 0) ảnh nhỏ chưa tải -> thử hoàn tất trực tuyến trong ngân sách 5,5 giây.
  const fastInlineSignal = authScopedSignal(owner.signal, INLINE_FAST_SYNC_BUDGET_MS);

  try {
    if (pendingSlots.length > 0) {
      options.onProgress?.({ done: 0, total: pendingSlots.length });
      let done = 0;
      for (const slot of pendingSlots) {
        if (!owner.isOwner()) throw new OfflineAuthChangedError();
        const uploaded = await uploadSingleSlot(slot, fastInlineSignal, false);
        slot.uploadedId = uploaded.id;
        slot.uploadedUrl = uploaded.url;
        slot.blob = undefined;
        await putOutboxItem(item);
        done += 1;
        options.onProgress?.({ done, total: pendingSlots.length });
      }
    }

    const withMedia = applyMediaIdsToPayload(options.payload, slots, bindings);
    const finalPayload = enrichPortalFieldEvidence(item, enrichOfflineLateReason(item, withMedia), false);
    if (!owner.isOwner()) throw new OfflineAuthChangedError();

    const data = await apiRequest<TResponse>(options.endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(finalPayload),
      signal: fastInlineSignal,
    });

    await deleteOutboxItemById(item.id);
    if (owner.isOwner()) {
      await refreshOfflineQueueState(userId);
    }
    options.onProgress?.(null);
    return { mode: "synced", data };
  } catch (err) {
    options.onProgress?.(null);
    if (err instanceof OfflineAuthChangedError || !owner.isOwner() || isTransientNetworkError(err)) {
      item.nextRetryAt = Date.now() + 3_000;
      await putOutboxItem(item);
      if (owner.isOwner()) {
        await refreshOfflineQueueState(userId);
        void triggerOfflineSyncNow(false);
      }
      return { mode: "queued", item };
    }
    // Lỗi dữ liệu nghiệp vụ do máy chủ trả về ngay lúc biểu mẫu còn mở (400/403/404/409):
    // xóa bản tạm trong hàng đợi để người dùng sửa trực tiếp trên biểu mẫu mà không bị đọng bản lỗi.
    await deleteOutboxItemById(item.id);
    if (owner.isOwner()) {
      await refreshOfflineQueueState(userId);
    }
    throw err;
  }
}

/* ──────────────────────────── Bộ máy Tự động Đồng bộ Nền khi có sóng ổn định ──────────────────────────── */

async function probeUsableConnection(): Promise<boolean> {
  if (isDeviceOfflineNow()) return false;
  try {
    const res = await fetch("/api/health", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const BACKDATE_AWARE_ENDPOINTS = new Set([
  "/portal/journal",
  "/portal/spray",
  "/portal/care-protocol/declare",
  "/journal",
  "/spray",
]);

const PORTAL_EVIDENCE_ENDPOINTS = new Set(["/portal/journal", "/portal/spray"]);

function enrichOfflineLateReason(item: OfflineOutboxItem, payload: Record<string, unknown>): Record<string, unknown> {
  if (!BACKDATE_AWARE_ENDPOINTS.has(item.endpoint)) return payload;
  const existingReason = typeof payload.lateReason === "string" ? payload.lateReason.trim() : "";
  if (existingReason) return payload;

  const currentVn = todayVnIso();
  if (currentVn <= item.capturedDateVn) return payload;

  return {
    ...payload,
    lateReason: `Đã chụp ảnh và lưu ngoại tuyến tại vườn lúc ${formatVnDateTime(item.capturedAtIso)}, tự động đồng bộ khi có mạng`,
  };
}

/**
 * Chỉ gắn cờ `offlineQueued` và `clientCapturedAt` cho đúng 2 endpoint cổng nông hộ đã khai báo DTO whitelist
 * (`/portal/journal`, `/portal/spray`) để tuyệt đối không ảnh hưởng các endpoint quản trị dùng `forbidNonWhitelisted`.
 */
function enrichPortalFieldEvidence(
  item: OfflineOutboxItem,
  payload: Record<string, unknown>,
  wasDeferredOutboxSync: boolean,
): Record<string, unknown> {
  if (!PORTAL_EVIDENCE_ENDPOINTS.has(item.endpoint)) return payload;
  const capturedAt =
    typeof payload.clientCapturedAt === "string" && payload.clientCapturedAt.trim()
      ? payload.clientCapturedAt
      : item.capturedAtIso;
  return {
    ...payload,
    clientCapturedAt: capturedAt,
    offlineQueued: wasDeferredOutboxSync ? true : Boolean(payload.offlineQueued),
  };
}

async function runSyncLoopInternal(forceIgnoreBackoff: boolean): Promise<void> {
  if (syncRunning) return;
  // Chỉ đồng bộ cho tài khoản đang hoạt động trong tab (không đọc localStorage dùng chung giữa các tab).
  const uid = activeSyncUserId;
  if (!uid) return;
  const owner = captureSyncOwner(uid);

  /** Chỉ cập nhật thanh trạng thái khi tài khoản chạy tiến trình vẫn là tài khoản đang đăng nhập. */
  const publishIfOwner = (
    items: OfflineOutboxItem[],
    patch: Parameters<typeof recomputeSnapshot>[1],
  ): void => {
    if (owner.isOwner()) recomputeSnapshot(items, patch);
  };

  const [initialItems, initialAllDrafts] = await Promise.all([
    listUserOutboxItems(uid),
    listUserDraftsAll(uid),
  ]);
  if (!owner.isOwner()) return;
  const now = Date.now();
  const candidates = initialItems.filter(
    (it) =>
      (it.status === "queued" || it.status === "syncing") &&
      (forceIgnoreBackoff || it.nextRetryAt <= now),
  );
  const draftsNeedingPreUpload = initialAllDrafts.filter((d) =>
    d.mediaSlots.some((s) => !s.uploadedId && Boolean(s.blob)),
  );
  if (candidates.length === 0 && draftsNeedingPreUpload.length === 0) {
    const { drafts, workingDraft } = splitDrafts(initialAllDrafts);
    publishIfOwner(initialItems, {
      drafts,
      workingDraft,
      isSyncing: false,
      isPreUploadingDrafts: false,
      activeItemLabel: null,
      activeMediaProgress: null,
    });
    return;
  }

  const reachable = await probeUsableConnection();
  if (!reachable || !owner.isOwner()) {
    const { drafts, workingDraft } = splitDrafts(initialAllDrafts);
    publishIfOwner(initialItems, {
      drafts,
      workingDraft,
      isSyncing: false,
      isPreUploadingDrafts: false,
      activeItemLabel: null,
      activeMediaProgress: null,
    });
    return;
  }

  syncRunning = true;
  let syncedInBatch = 0;
  const portalKeysToRefresh = new Set<string>();

  try {
    for (const item of candidates) {
      if (isDeviceOfflineNow()) break;
      if (!owner.isOwner()) break;

      item.status = "syncing";
      await putOutboxItem(item);

      const totalFiles = item.mediaSlots.length;
      let uploadedFiles = item.mediaSlots.filter((s) => Boolean(s.uploadedId)).length;
      let madeSlotProgress = false;
      publishIfOwner(await listUserOutboxItems(uid), {
        isSyncing: true,
        activeItemLabel: item.label,
        activeMediaProgress: totalFiles > 0 ? { done: uploadedFiles, total: totalFiles } : null,
      });

      try {
        // 1. Tải tuần tự từng ảnh/video chưa tải lên và lưu checkpoint ngay sau mỗi tệp
        for (const slot of item.mediaSlots) {
          if (slot.uploadedId && slot.uploadedId > 0) continue;
          // Kiểm tra lại tài khoản trước TỪNG tệp (mỗi tệp có thể mất 15 đến 40 giây trên sóng yếu).
          if (!owner.isOwner()) throw new OfflineAuthChangedError();
          const uploaded = await uploadSingleSlot(slot, owner.signal, item.attempts > 0);
          slot.uploadedId = uploaded.id;
          slot.uploadedUrl = uploaded.url;
          slot.blob = undefined;
          uploadedFiles += 1;
          madeSlotProgress = true;
          await putOutboxItem(item);
          publishIfOwner(await listUserOutboxItems(uid), {
            isSyncing: true,
            activeItemLabel: item.label,
            activeMediaProgress: totalFiles > 0 ? { done: uploadedFiles, total: totalFiles } : null,
          });
        }

        // 2. Ghép ID tệp đã tải & gửi bản ghi kèm X-Idempotency-Key chống ghi trùng
        const withMedia = applyMediaIdsToPayload(item.payload, item.mediaSlots, item.mediaBindings);
        const finalPayload = enrichPortalFieldEvidence(item, enrichOfflineLateReason(item, withMedia), true);

        // Kiểm tra lần cuối ngay trước khi gửi: không bao giờ gửi bản ghi của hộ A bằng cookie phiên của hộ B.
        if (!owner.isOwner()) throw new OfflineAuthChangedError();
        await apiRequest(item.endpoint, {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": item.id,
          },
          body: JSON.stringify(finalPayload),
          signal: authScopedSignal(owner.signal, RECORD_SUBMIT_TIMEOUT_MS),
        });

        await deleteOutboxItemById(item.id);
        syncedInBatch += 1;
        for (const k of item.portalKeysToInvalidate ?? []) {
          portalKeysToRefresh.add(k);
        }
      } catch (err) {
        // Đăng xuất hoặc đổi tài khoản giữa chừng: trả bản ghi về hàng đợi của đúng chủ sở hữu và dừng ngay.
        if (err instanceof OfflineAuthChangedError || !owner.isOwner()) {
          item.status = "queued";
          await putOutboxItem(item);
          break;
        }
        if (err instanceof ApiError && err.status === 401) {
          item.status = "queued";
          await putOutboxItem(item);
          break;
        }
        if (err instanceof ApiError && err.status === 429) {
          const waitMs = Math.max(10_000, (err.retryAfterSeconds ?? 15) * 1000);
          item.status = "queued";
          item.attempts += 1;
          item.nextRetryAt = Date.now() + waitMs;
          item.lastError = null;
          await putOutboxItem(item);
          break;
        }
        if (isTransientNetworkError(err)) {
          // Nếu lượt này đã tải thêm được ít nhất 1 ảnh mới thì đặt lại bộ đếm backoff để các ảnh kế tiếp lên đều đặn.
          const nextAttempts = madeSlotProgress ? 0 : item.attempts + 1;
          const backoffMs = madeSlotProgress
            ? 4_000
            : Math.min(90_000, 8_000 * Math.pow(2, Math.min(item.attempts, 3)));
          item.status = "queued";
          item.attempts = nextAttempts;
          item.nextRetryAt = Date.now() + backoffMs;
          item.lastError = null;
          await putOutboxItem(item);
          break;
        }

        // Lỗi nghiệp vụ cần người dùng kiểm tra (400 / 403 / 404 / 409) -> không lặp vô hạn
        item.status = "failed";
        item.attempts += 1;
        item.lastError = errorMessage(err, "Máy chủ từ chối bản ghi ngoại tuyến.");
        await putOutboxItem(item);
      }
    }

    // 3. Ưu tiên thứ 2: Tải trước êm ái ở nền các ảnh trong "Kho giữ hình ngoài rẫy" (field_drafts)
    // để khi bà con về nhà mở bản nháp lên bấm Lưu nhật ký thì hoàn tất ngay lập tức (0 KB tải lại).
    if (!isDeviceOfflineNow() && owner.isOwner()) {
      const freshDrafts = await listUserDraftsAll(uid);
      const pendingDrafts = freshDrafts.filter((d) =>
        d.mediaSlots.some((s) => !s.uploadedId && Boolean(s.blob)),
      );
      if (pendingDrafts.length > 0) {
        const split = splitDrafts(freshDrafts);
        publishIfOwner(await listUserOutboxItems(uid), {
          drafts: split.drafts,
          workingDraft: split.workingDraft,
          isPreUploadingDrafts: true,
        });
        for (const draft of pendingDrafts) {
          if (isDeviceOfflineNow() || !owner.isOwner()) break;
          let draftChanged = false;
          for (const slot of draft.mediaSlots) {
            if (slot.uploadedId && slot.uploadedId > 0) continue;
            if (!slot.blob) continue;
            if (isDeviceOfflineNow() || !owner.isOwner()) break;
            try {
              const uploaded = await uploadSingleSlot(slot, owner.signal, true);
              slot.uploadedId = uploaded.id;
              slot.uploadedUrl = uploaded.url;
              draftChanged = true;
              // Kiểm tra bản nháp vẫn còn tồn tại (người dùng chưa xóa/lưu xong trong lúc ảnh đang tải nền)
              const latestList = await listUserDraftsAll(uid);
              const latestSame = latestList.find((d) => d.id === draft.id);
              if (latestSame && owner.isOwner()) {
                const targetSlot = latestSame.mediaSlots.find(
                  (ms) =>
                    (slot.sha256 && ms.sha256 === slot.sha256) ||
                    (ms.fileName === slot.fileName && ms.sizeBytes === slot.sizeBytes),
                );
                if (targetSlot) {
                  targetSlot.uploadedId = uploaded.id;
                  targetSlot.uploadedUrl = uploaded.url;
                  await putFieldDraftRecord(latestSame);
                }
              }
            } catch {
              // Giữ nguyên ảnh trong máy cho lần có sóng tiếp theo, tuyệt đối không làm phiền người dùng.
              break;
            }
          }
          if (draftChanged && owner.isOwner()) {
            const updatedAll = await listUserDraftsAll(uid);
            const updatedSplit = splitDrafts(updatedAll);
            publishIfOwner(await listUserOutboxItems(uid), {
              drafts: updatedSplit.drafts,
              workingDraft: updatedSplit.workingDraft,
            });
          }
        }
      }
    }
  } finally {
    syncRunning = false;
    if (owner.isOwner()) {
      const [remaining, remainingDrafts] = await Promise.all([
        listUserOutboxItems(uid),
        listUserDraftsAll(uid),
      ]);
      if (owner.isOwner()) {
        if (syncedInBatch > 0) {
          if (portalKeysToRefresh.size > 0 && portalInvalidateHandler) {
            portalInvalidateHandler(Array.from(portalKeysToRefresh));
          }
          notifyDataMutated();
          toast.success(
            syncedInBatch === 1
              ? "Đã đồng bộ 1 bản ghi lên hệ thống"
              : `Đã đồng bộ ${syncedInBatch} bản ghi lên hệ thống`,
          );
          if (clearRecentTimer) clearTimeout(clearRecentTimer);
          clearRecentTimer = setTimeout(() => {
            currentSnapshot = { ...currentSnapshot, recentSyncedCount: 0 };
            emitSyncChange();
          }, 6_000);
        }

        const split = splitDrafts(remainingDrafts);
        recomputeSnapshot(remaining, {
          drafts: split.drafts,
          workingDraft: split.workingDraft,
          isSyncing: false,
          isPreUploadingDrafts: false,
          activeItemLabel: null,
          activeMediaProgress: null,
          recentSyncedCount:
            syncedInBatch > 0 ? currentSnapshot.recentSyncedCount + syncedInBatch : currentSnapshot.recentSyncedCount,
          lastSyncedAt: syncedInBatch > 0 ? Date.now() : currentSnapshot.lastSyncedAt,
        });
      }
    } else if (activeSyncUserId !== null) {
      // Tài khoản mới đã đăng nhập trong lúc tiến trình cũ đang dừng: nhường lượt đồng bộ cho tài khoản mới.
      setTimeout(() => {
        void triggerOfflineSyncNow(false);
      }, 300);
    }
  }
}

export async function triggerOfflineSyncNow(forceIgnoreBackoff = true): Promise<void> {
  if (typeof window === "undefined") return;
  const navWithLocks = navigator as Navigator & {
    locks?: {
      request: (
        name: string,
        options: { ifAvailable: boolean },
        callback: (lock: unknown) => Promise<void>,
      ) => Promise<void>;
    };
  };

  if (navWithLocks.locks?.request) {
    await navWithLocks.locks.request(
      "puc-offline-sync-worker",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return;
        await runSyncLoopInternal(forceIgnoreBackoff);
      },
    );
    return;
  }
  await runSyncLoopInternal(forceIgnoreBackoff);
}

let engineAttached = false;

function resetSyncStateForAuthChange(): void {
  invalidateSyncAuth();
  activeSyncUserId = null;
  recomputeSnapshot([], {
    drafts: [],
    workingDraft: null,
    isSyncing: false,
    isPreUploadingDrafts: false,
    activeItemLabel: null,
    activeMediaProgress: null,
    recentSyncedCount: 0,
  });
}

// Đăng ký ngay khi nạp mô-đun (không chờ gắn bộ máy đồng bộ) để mọi tiến trình gửi bản ghi đang chạy
// đều bị hủy tức thì khi đăng xuất, hết phiên hoặc đổi tài khoản trên cùng thiết bị.
if (typeof window !== "undefined") {
  const onAuthCleared = () => {
    const prevUid = activeSyncUserId ?? getAuthScopeUserId();
    resetSyncStateForAuthChange();
    clearOfflineAuthSession();
    clearServerTimeAnchor();
    void clearAllOfflineReadSnapshots();
    void purgeUserWorkingDraftsOnLogout(prevUid);
  };
  const onScopeChanged = (ev: Event) => {
    const detail = (ev as CustomEvent<{ previous?: number | null; next?: number | null }>).detail;
    if (detail?.previous && detail.previous !== detail.next) {
      clearServerTimeAnchor();
      void clearAllOfflineReadSnapshots();
      void purgeUserWorkingDraftsOnLogout(detail.previous);
    }
    if (activeSyncUserId !== getAuthScopeUserId()) {
      resetSyncStateForAuthChange();
    }
  };
  window.addEventListener(AUTH_LOGOUT_EVENT, onAuthCleared);
  window.addEventListener(AUTH_EXPIRED_EVENT, onAuthCleared);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, onScopeChanged);
}

export function attachOfflineSyncEngine(userId: number | null): void {
  if (userId !== activeSyncUserId) {
    // Đổi tài khoản: hủy mọi tiến trình tải ảnh/gửi bản ghi của tài khoản trước.
    invalidateSyncAuth();
    activeSyncUserId = userId;
  }
  void refreshOfflineQueueState(userId).then(() => {
    if (userId && activeSyncUserId === userId) {
      void triggerOfflineSyncNow(false);
    }
  });

  if (typeof window === "undefined" || engineAttached) return;
  engineAttached = true;

  const onSignal = () => {
    void triggerOfflineSyncNow(true);
  };

  window.addEventListener("online", onSignal);
  window.addEventListener("focus", onSignal);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void triggerOfflineSyncNow(false);
    }
  });

  const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
  conn?.addEventListener?.("change", onSignal);

  const heartbeat = window.setInterval(() => {
    const hasPendingDraftUpload =
      currentSnapshot.drafts.some((d) => d.mediaSlots.some((s) => !s.uploadedId && Boolean(s.blob))) ||
      Boolean(currentSnapshot.workingDraft?.mediaSlots.some((s) => !s.uploadedId && Boolean(s.blob)));
    if (
      activeSyncUserId !== null &&
      (currentSnapshot.queuedCount > 0 || hasPendingDraftUpload) &&
      !isDeviceOfflineNow()
    ) {
      void triggerOfflineSyncNow(false);
    }
  }, HEARTBEAT_MS);
  void heartbeat;
}

function subscribeOfflineSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function useOfflineSyncState(): OfflineSyncSnapshot {
  return useSyncExternalStore(
    subscribeOfflineSync,
    () => currentSnapshot,
    () => EMPTY_SYNC_SNAPSHOT,
  );
}

