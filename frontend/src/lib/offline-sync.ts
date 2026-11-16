"use client";

import { useSyncExternalStore } from "react";
import {
  compressImage,
  encodedImageName,
  isSupportedImageFile,
  purposeAllowsVideo,
  validatePickedFile,
} from "@/components/portal/shared/media";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  ApiError,
  api,
  apiRequest,
  errorMessage,
  notifyDataMutated,
  type UploadPurpose,
} from "@/lib/api-client";
import type { AuthSession } from "@/types/api";

const DB_NAME = "puc-offline-sync-v1";
const DB_VERSION = 1;
const STORE_OUTBOX = "outbox";
const STORE_SNAPSHOTS = "read_snapshots";
const AUTH_SNAPSHOT_STORAGE_KEY = "puc:offline-auth-session:v1";
const AUTH_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_READ_SNAPSHOTS = 90;

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
  blob?: Blob;
  uploadedId?: number;
  uploadedUrl?: string;
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
  queuedCount: number;
  failedCount: number;
  pendingMediaCount: number;
  isSyncing: boolean;
  activeItemLabel: string | null;
  activeMediaProgress: { done: number; total: number } | null;
  recentSyncedCount: number;
  lastSyncedAt: number | null;
}

const EMPTY_SYNC_SNAPSHOT: OfflineSyncSnapshot = Object.freeze({
  items: [],
  queuedCount: 0,
  failedCount: 0,
  pendingMediaCount: 0,
  isSyncing: false,
  activeItemLabel: null,
  activeMediaProgress: null,
  recentSyncedCount: 0,
  lastSyncedAt: null,
});

/* ──────────────────────────── Bảo toàn phiên đăng nhập khi mất sóng tại vườn ──────────────────────────── */

export function saveOfflineAuthSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  try {
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
    if (
      !parsed?.session?.user?.id ||
      typeof parsed.session.user.role !== "string" ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > AUTH_SNAPSHOT_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY);
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

function currentSessionUserId(): number | null {
  return loadOfflineAuthSession()?.user?.id ?? null;
}

export async function saveOfflineReadSnapshot(path: string, data: unknown): Promise<void> {
  const userId = currentSessionUserId();
  if (!userId || data === null || data === undefined) return;
  const db = await openOfflineDb();
  if (!db) return;

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
  const userId = currentSessionUserId();
  if (!userId) return null;
  const db = await openOfflineDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
    const rec = (await idbReq(tx.objectStore(STORE_SNAPSHOTS).get(`${userId}:${path}`))) as
      | ReadSnapshotRecord
      | undefined;
    return rec ? (rec.data as T) : null;
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
  try {
    const forced = new URLSearchParams(window.location.search).get("net");
    if (forced === "offline") return true;
  } catch {
    // ignore
  }
  return document.documentElement?.dataset?.net === "offline";
}

export function isTransientNetworkError(err: unknown): boolean {
  if (isDeviceOfflineNow()) return true;
  if (err instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "AbortError" || err.name === "TimeoutError" || err.name === "NetworkError") {
      return true;
    }
  }
  if (err instanceof ApiError) {
    return err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504;
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
  }).formatToParts(new Date());
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

export function registerOfflinePortalInvalidator(fn: (keys: string[]) => void): void {
  portalInvalidateHandler = fn;
}

function emitSyncChange(): void {
  for (const listener of syncListeners) {
    listener();
  }
}

function recomputeSnapshot(
  items: OfflineOutboxItem[],
  patch?: Partial<
    Pick<
      OfflineSyncSnapshot,
      "isSyncing" | "activeItemLabel" | "activeMediaProgress" | "recentSyncedCount" | "lastSyncedAt"
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
    queuedCount,
    failedCount,
    pendingMediaCount,
    isSyncing: patch?.isSyncing ?? currentSnapshot.isSyncing,
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
  const uid = userId !== undefined ? userId : (activeSyncUserId ?? currentSessionUserId());
  activeSyncUserId = uid;
  const items = await listUserOutboxItems(uid);
  recomputeSnapshot(items);
}

export async function removeOfflineOutboxItem(id: string): Promise<void> {
  await deleteOutboxItemById(id);
  await refreshOfflineQueueState();
}

export async function retryOfflineOutboxItem(id: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  const store = tx.objectStore(STORE_OUTBOX);
  const existing = (await idbReq(store.get(id))) as OfflineOutboxItem | undefined;
  if (existing) {
    existing.status = "queued";
    existing.nextRetryAt = 0;
    existing.lastError = null;
    store.put(existing);
  }
  await idbTxDone(tx);
  await refreshOfflineQueueState();
  void triggerOfflineSyncNow();
}

/* ──────────────────────────── Đóng gói ảnh/video nén WebP sẵn sàng lưu ngoại tuyến ──────────────────────────── */

export interface OfflineMediaInputGroup {
  slotKey: string;
  purpose: UploadPurpose;
  items: Array<{
    name: string;
    isVideo: boolean;
    file?: File;
    uploadedId?: number;
    uploadedUrl?: string;
  }>;
  binding: OfflineMediaBinding;
}

async function prepareCompressedMediaSlots(groups: OfflineMediaInputGroup[]): Promise<{
  slots: OfflineMediaSlot[];
  bindings: Record<string, OfflineMediaBinding>;
}> {
  const slots: OfflineMediaSlot[] = [];
  const bindings: Record<string, OfflineMediaBinding> = {};

  for (const group of groups) {
    bindings[group.slotKey] = group.binding;
    for (const item of group.items) {
      if (item.uploadedId && Number.isInteger(item.uploadedId) && item.uploadedId > 0) {
        slots.push({
          slotKey: group.slotKey,
          purpose: group.purpose,
          fileName: item.name,
          mimeType: item.isVideo ? "video/mp4" : "image/webp",
          sizeBytes: 0,
          isVideo: item.isVideo,
          uploadedId: item.uploadedId,
          uploadedUrl: item.uploadedUrl,
        });
        continue;
      }

      if (!item.file) continue;
      const allowPdf = group.purpose === "approval" || group.purpose === "lab";
      const allowVideo = purposeAllowsVideo(group.purpose);
      const problem = validatePickedFile(item.file, { allowPdf, allowVideo });
      if (problem) {
        throw new Error(problem);
      }

      const isImage = isSupportedImageFile(item.file);
      const compressedBlob = isImage ? await compressImage(item.file) : item.file;
      const finalName =
        isImage && compressedBlob !== item.file
          ? encodedImageName(item.file.name, compressedBlob.type || "image/webp")
          : item.file.name;

      slots.push({
        slotKey: group.slotKey,
        purpose: group.purpose,
        fileName: finalName,
        mimeType: compressedBlob.type || item.file.type || "image/jpeg",
        sizeBytes: compressedBlob.size,
        isVideo: item.isVideo,
        blob: compressedBlob,
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

async function uploadSingleSlot(slot: OfflineMediaSlot): Promise<{ id: number; url: string }> {
  if (slot.uploadedId && slot.uploadedId > 0) {
    return { id: slot.uploadedId, url: slot.uploadedUrl ?? `/api/uploads/${slot.uploadedId}` };
  }
  if (!slot.blob) {
    throw new Error(`Không đọc được dữ liệu tệp "${slot.fileName}" đã lưu trên thiết bị.`);
  }
  const timeoutMs = slot.isVideo ? VIDEO_UPLOAD_TIMEOUT_MS : PHOTO_UPLOAD_TIMEOUT_MS;
  const uploaded = await api.upload(slot.blob, slot.purpose, slot.fileName, {
    signal: AbortSignal.timeout(timeoutMs),
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
  /** Cho phép truyền sẵn userId từ AuthContext (ưu tiên hơn đọc localStorage). */
  userId?: number | null;
  /** Kiểu phản hồi mong đợi khi gửi trực tuyến thành công. */
  _phantom?: TResponse;
}

export type SubmitFieldRecordResult<TResponse> =
  | { mode: "synced"; data: TResponse }
  | { mode: "queued"; item: OfflineOutboxItem };

/**
 * Luồng gửi bản ghi kèm ảnh/video thông minh cho vùng sóng yếu & mất sóng:
 * 1. Nén ảnh sang WebP siêu nhẹ ngay trên điện thoại.
 * 2. Nếu thiết bị đang mất mạng (`offline`), lưu thẳng vào IndexedDB trong < 200ms mà không bắt nông hộ chờ timeout.
 * 3. Nếu đang có sóng nhưng yếu/chập chờn: tải từng tệp có giới hạn thời gian; nếu đứt mạng giữa chừng (sau khi đã tải được một vài ảnh
 *    hoặc khi đang gửi bản ghi), tự động lưu toàn bộ trạng thái dở dang + `X-Idempotency-Key` vào IndexedDB để đồng bộ tiếp khi ra vùng sóng khỏe.
 */
export async function submitFieldRecordWithOfflineQueue<TResponse = unknown>(
  options: SubmitFieldRecordOptions<TResponse>,
): Promise<SubmitFieldRecordResult<TResponse>> {
  const method = options.method ?? "POST";
  const userId = options.userId ?? activeSyncUserId ?? currentSessionUserId();
  const idempotencyKey = generateIdempotencyKey();
  const capturedAtIso = new Date().toISOString();
  const capturedDateVn = todayVnIso();

  const { slots, bindings } = await prepareCompressedMediaSlots(options.mediaGroups ?? []);

  const enqueueNow = async (): Promise<SubmitFieldRecordResult<TResponse>> => {
    if (!userId) {
      throw new Error("Không xác định được phiên tài khoản để lưu ngoại tuyến. Vui lòng đăng nhập lại.");
    }
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
      nextRetryAt: Date.now() + 5_000,
      lastError: null,
      portalKeysToInvalidate: options.portalKeysToInvalidate,
    };
    await putOutboxItem(item);
    await refreshOfflineQueueState(userId);
    options.onProgress?.(null);
    return { mode: "queued", item };
  };

  if (isDeviceOfflineNow()) {
    return enqueueNow();
  }

  try {
    const pendingSlots = slots.filter((s) => !s.uploadedId);
    if (pendingSlots.length > 0) {
      options.onProgress?.({ done: 0, total: pendingSlots.length });
      let done = 0;
      for (const slot of pendingSlots) {
        const uploaded = await uploadSingleSlot(slot);
        slot.uploadedId = uploaded.id;
        slot.uploadedUrl = uploaded.url;
        // Giải phóng Blob đã tải thành công để giảm dung lượng nếu bước sau phải lưu hàng đợi
        slot.blob = undefined;
        done += 1;
        options.onProgress?.({ done, total: pendingSlots.length });
      }
    }

    const finalPayload = applyMediaIdsToPayload(options.payload, slots, bindings);
    const data = await apiRequest<TResponse>(options.endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(finalPayload),
      signal: AbortSignal.timeout(RECORD_SUBMIT_TIMEOUT_MS),
    });
    options.onProgress?.(null);
    return { mode: "synced", data };
  } catch (err) {
    options.onProgress?.(null);
    if (isTransientNetworkError(err) && userId) {
      return enqueueNow();
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

async function runSyncLoopInternal(forceIgnoreBackoff: boolean): Promise<void> {
  if (syncRunning) return;
  const uid = activeSyncUserId ?? currentSessionUserId();
  if (!uid) return;

  const initialItems = await listUserOutboxItems(uid);
  const now = Date.now();
  const candidates = initialItems.filter(
    (it) =>
      (it.status === "queued" || it.status === "syncing") &&
      (forceIgnoreBackoff || it.nextRetryAt <= now),
  );
  if (candidates.length === 0) {
    recomputeSnapshot(initialItems, {
      isSyncing: false,
      activeItemLabel: null,
      activeMediaProgress: null,
    });
    return;
  }

  const reachable = await probeUsableConnection();
  if (!reachable) {
    recomputeSnapshot(initialItems, {
      isSyncing: false,
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
      if ((activeSyncUserId ?? currentSessionUserId()) !== uid) break;

      item.status = "syncing";
      await putOutboxItem(item);

      const totalFiles = item.mediaSlots.length;
      let uploadedFiles = item.mediaSlots.filter((s) => Boolean(s.uploadedId)).length;
      recomputeSnapshot(await listUserOutboxItems(uid), {
        isSyncing: true,
        activeItemLabel: item.label,
        activeMediaProgress: totalFiles > 0 ? { done: uploadedFiles, total: totalFiles } : null,
      });

      try {
        // 1. Tải tuần tự từng ảnh/video chưa tải lên và lưu checkpoint ngay sau mỗi tệp
        for (const slot of item.mediaSlots) {
          if (slot.uploadedId && slot.uploadedId > 0) continue;
          const uploaded = await uploadSingleSlot(slot);
          slot.uploadedId = uploaded.id;
          slot.uploadedUrl = uploaded.url;
          slot.blob = undefined;
          uploadedFiles += 1;
          await putOutboxItem(item);
          recomputeSnapshot(await listUserOutboxItems(uid), {
            isSyncing: true,
            activeItemLabel: item.label,
            activeMediaProgress: totalFiles > 0 ? { done: uploadedFiles, total: totalFiles } : null,
          });
        }

        // 2. Ghép ID tệp đã tải & gửi bản ghi kèm X-Idempotency-Key chống ghi trùng
        const withMedia = applyMediaIdsToPayload(item.payload, item.mediaSlots, item.mediaBindings);
        const finalPayload = enrichOfflineLateReason(item, withMedia);

        await apiRequest(item.endpoint, {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": item.id,
          },
          body: JSON.stringify(finalPayload),
          signal: AbortSignal.timeout(RECORD_SUBMIT_TIMEOUT_MS),
        });

        await deleteOutboxItemById(item.id);
        syncedInBatch += 1;
        for (const k of item.portalKeysToInvalidate ?? []) {
          portalKeysToRefresh.add(k);
        }
      } catch (err) {
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
          const backoffMs = Math.min(120_000, 10_000 * Math.pow(2, Math.min(item.attempts, 3)));
          item.status = "queued";
          item.attempts += 1;
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
  } finally {
    syncRunning = false;
    const remaining = await listUserOutboxItems(uid);
    if (syncedInBatch > 0) {
      if (portalKeysToRefresh.size > 0 && portalInvalidateHandler) {
        portalInvalidateHandler(Array.from(portalKeysToRefresh));
      }
      notifyDataMutated();
      if (clearRecentTimer) clearTimeout(clearRecentTimer);
      clearRecentTimer = setTimeout(() => {
        currentSnapshot = { ...currentSnapshot, recentSyncedCount: 0 };
        emitSyncChange();
      }, 6_000);
    }

    recomputeSnapshot(remaining, {
      isSyncing: false,
      activeItemLabel: null,
      activeMediaProgress: null,
      recentSyncedCount:
        syncedInBatch > 0 ? currentSnapshot.recentSyncedCount + syncedInBatch : currentSnapshot.recentSyncedCount,
      lastSyncedAt: syncedInBatch > 0 ? Date.now() : currentSnapshot.lastSyncedAt,
    });
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

export function attachOfflineSyncEngine(userId: number | null): void {
  activeSyncUserId = userId;
  void refreshOfflineQueueState(userId).then(() => {
    if (userId) {
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
    if (currentSnapshot.queuedCount > 0 && !isDeviceOfflineNow()) {
      void triggerOfflineSyncNow(false);
    }
  }, HEARTBEAT_MS);
  void heartbeat;

  const onAuthCleared = () => {
    activeSyncUserId = null;
    clearOfflineAuthSession();
    void clearAllOfflineReadSnapshots();
    recomputeSnapshot([], {
      isSyncing: false,
      activeItemLabel: null,
      activeMediaProgress: null,
      recentSyncedCount: 0,
    });
  };
  window.addEventListener(AUTH_LOGOUT_EVENT, onAuthCleared);
  window.addEventListener(AUTH_EXPIRED_EVENT, onAuthCleared);
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

