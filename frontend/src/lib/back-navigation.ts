"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
  getAuthScopeUser,
} from "@/lib/api-client";

export const PUC_URL_SYNC_EVENT = "puc:url-sync";
export const ADMIN_LAST_URL_KEY = "puc:admin-active-url";
export const PORTAL_LAST_URL_KEY = "puc:portal-active-url";

interface StoredWorkspaceRoute {
  url: string;
  userId: number | null;
}

function resolveStorageKeyForPathname(pathname: string): string | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return ADMIN_LAST_URL_KEY;
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return PORTAL_LAST_URL_KEY;
  return null;
}

export function saveWorkspaceUrl(storageKey: string, url: string, userId?: number | null): void {
  if (typeof window === "undefined") return;
  try {
    const activeScopeUser = getAuthScopeUser();
    let resolvedUserId: number | null =
      typeof userId === "number" && Number.isInteger(userId) && userId > 0
        ? userId
        : activeScopeUser;
    if (resolvedUserId === null) {
      const existingRaw = window.sessionStorage.getItem(storageKey);
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw) as Partial<StoredWorkspaceRoute>;
        if (typeof parsed?.userId === "number" && Number.isInteger(parsed.userId) && parsed.userId > 0) {
          resolvedUserId = parsed.userId;
        }
      }
    }
    const payload: StoredWorkspaceRoute = { url, userId: resolvedUserId };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Bỏ qua nếu môi trường chặn sessionStorage
  }
}

export function readWorkspaceUrl(storageKey: string, expectedUserId?: number | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWorkspaceRoute>;
    if (!parsed || typeof parsed.url !== "string" || !parsed.url.startsWith("/") || parsed.url.startsWith("//")) {
      return null;
    }
    const targetUserId =
      typeof expectedUserId === "number" && Number.isInteger(expectedUserId) && expectedUserId > 0
        ? expectedUserId
        : getAuthScopeUser();
    if (targetUserId !== null) {
      if (
        typeof parsed.userId !== "number" ||
        !Number.isInteger(parsed.userId) ||
        parsed.userId <= 0 ||
        parsed.userId !== targetUserId
      ) {
        return null;
      }
    }
    return parsed.url;
  } catch {
    return null;
  }
}

function syncWorkspaceUrlFromHref(href: string): void {
  if (typeof window === "undefined") return;
  try {
    const parsed = new URL(href, window.location.origin);
    const key = resolveStorageKeyForPathname(parsed.pathname);
    if (!key) return;
    saveWorkspaceUrl(key, `${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    // ignore
  }
}

const SESSION_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `puc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface OverlayEntry {
  id: number;
  pathname: string;
  close: () => void;
}

let nextOverlayId = 1;
const overlayStack: OverlayEntry[] = [];
let pushedOverlayCount = 0;
let pendingGoBacks = 0;
let pendingGoBackWatchdog: ReturnType<typeof setTimeout> | null = null;
let pendingReplaceUrl: string | null = null;
let pendingPushUrl: string | null = null;
let syncQueued = false;
let listenerInstalled = false;
let routeLeaveFromPath: string | null = null;
let routeLeaveLockUntil = 0;

function clearPendingGoBackWatchdog(): void {
  if (pendingGoBackWatchdog !== null) {
    clearTimeout(pendingGoBackWatchdog);
    pendingGoBackWatchdog = null;
  }
}

function flushDeferredHistoryUrl(): void {
  if (typeof window === "undefined") return;
  if (pendingReplaceUrl !== null) {
    const targetUrl = pendingReplaceUrl;
    pendingReplaceUrl = null;
    syncWorkspaceUrlFromHref(targetUrl);
    try {
      window.history.replaceState(buildCleanPageState(targetUrl.includes("?")), "", targetUrl);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
  } else if (pendingPushUrl !== null) {
    const targetUrl = pendingPushUrl;
    pendingPushUrl = null;
    syncWorkspaceUrlFromHref(targetUrl);
    try {
      window.history.pushState(buildCleanPageState(targetUrl.includes("?")), "", targetUrl);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
  }
}

/**
 * Bộ bảo vệ tự phục hồi: nếu trình duyệt di động hủy ngầm lệnh `history.go(-delta)`
 * (do bấm liên tiếp cực nhanh hoặc điều hướng đồng thời khiến `popstate` không phát ra),
 * tự động giải phóng `pendingGoBacks` sau 320ms để không bao giờ bị kẹt ở các lần bấm tiếp theo.
 */
function armPendingGoBackWatchdog(): void {
  if (typeof window === "undefined") return;
  clearPendingGoBackWatchdog();
  if (pendingGoBacks <= 0) return;
  pendingGoBackWatchdog = setTimeout(() => {
    pendingGoBackWatchdog = null;
    if (pendingGoBacks <= 0 || typeof window === "undefined") return;
    pendingGoBacks = 0;
    pushedOverlayCount = readCurrentOverlayDepth(window.history.state);
    flushDeferredHistoryUrl();
  }, 320);
}

function buildCleanPageState(markRootSeeded = false): Record<string, unknown> {
  const raw =
    typeof window !== "undefined" &&
      typeof window.history.state === "object" &&
      window.history.state !== null
      ? (window.history.state as Record<string, unknown>)
      : {};
  const clone: Record<string, unknown> = { ...raw };
  delete clone.__pucOverlaySession;
  delete clone.__pucOverlayDepth;
  if (markRootSeeded) {
    clone.__pucRootSeeded = true;
  }
  return clone;
}

export function replaceUrlPreservingState(nextUrl: string): void {
  if (typeof window === "undefined") return;
  syncWorkspaceUrlFromHref(nextUrl);
  try {
    const raw =
      typeof window.history.state === "object" && window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};
    window.history.replaceState({ ...raw }, "", nextUrl);
  } catch {
    // Bỏ qua nếu môi trường WebView hạn chế History API
  }
}

function readCurrentOverlayDepth(state: unknown): number {
  if (!state || typeof state !== "object") return 0;
  const rec = state as Record<string, unknown>;
  if (rec.__pucOverlaySession !== SESSION_ID) return 0;
  return typeof rec.__pucOverlayDepth === "number" ? rec.__pucOverlayDepth : 0;
}

function handleWindowPopState(event: PopStateEvent): void {
  if (typeof window === "undefined") return;

  if (pendingGoBacks > 0) {
    pendingGoBacks -= 1;
    if (pendingGoBacks === 0) {
      clearPendingGoBackWatchdog();
      flushDeferredHistoryUrl();
    } else {
      armPendingGoBackWatchdog();
    }
    event.stopImmediatePropagation();
    return;
  }

  const nextDepth = readCurrentOverlayDepth(event.state);

  if (overlayStack.length > 0 && pushedOverlayCount > 0 && nextDepth < pushedOverlayCount) {
    const targetDepth = Math.max(0, nextDepth);
    const popped: OverlayEntry[] = [];
    while (overlayStack.length > targetDepth) {
      const top = overlayStack.pop();
      if (top) popped.push(top);
    }
    pushedOverlayCount = targetDepth;
    event.stopImmediatePropagation();
    for (const entry of popped) {
      entry.close();
    }
    return;
  }

  // Không có popup nào chặn lại -> cho phép trang hoặc tab hiện tại lùi về bước trước đó
  pushedOverlayCount = Math.min(pushedOverlayCount, nextDepth);
  syncWorkspaceUrlFromHref(window.location.pathname + window.location.search + window.location.hash);
  window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
}

function handleDocumentLinkClickCapture(event: MouseEvent): void {
  if (typeof window === "undefined") return;
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  if (anchor.hasAttribute("download")) return;
  const linkTarget = (anchor.getAttribute("target") || "").trim().toLowerCase();
  if (linkTarget && linkTarget !== "_self") return;
  const rawHref = (anchor.getAttribute("href") || "").trim();
  if (
    !rawHref ||
    rawHref.startsWith("#") ||
    rawHref.startsWith("javascript:") ||
    rawHref.startsWith("mailto:") ||
    rawHref.startsWith("tel:")
  ) {
    return;
  }
  try {
    const nextUrl = new URL(anchor.href, window.location.origin);
    if (nextUrl.origin !== window.location.origin) return;
    if (nextUrl.pathname !== window.location.pathname) {
      resetOverlayHistoryOnRouteLeave();
    }
  } catch {
    // Bỏ qua nếu href không hợp lệ
  }
}

function ensurePopStateListener(): void {
  if (listenerInstalled || typeof window === "undefined") return;
  listenerInstalled = true;
  window.addEventListener("popstate", handleWindowPopState, true);
  document.addEventListener("click", handleDocumentLinkClickCapture, true);
}

function scheduleOverlaySync(): void {
  if (syncQueued || typeof window === "undefined") return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    if (typeof window === "undefined") return;

    const currentPath = window.location.pathname;
    if (routeLeaveFromPath !== null) {
      if (currentPath !== routeLeaveFromPath || Date.now() >= routeLeaveLockUntil) {
        routeLeaveFromPath = null;
        routeLeaveLockUntil = 0;
      } else {
        // Đang trong quá trình chuyển route bất đồng bộ của Next.js (<Link> / router.push):
        // tuyệt đối không gọi history.go(-delta) để tránh trình duyệt hủy ngang điều hướng.
        overlayStack.length = 0;
        pushedOverlayCount = 0;
        return;
      }
    }

    for (let i = overlayStack.length - 1; i >= 0; i -= 1) {
      if (overlayStack[i].pathname !== currentPath) {
        overlayStack.splice(i, 1);
      }
    }

    // Nếu vừa chuyển sang một route khác (Link / router.push / router.replace),
    // state hiện tại của trình duyệt đã là trang mới nên không gọi history.go lùi lại.
    if (pendingGoBacks === 0 && pushedOverlayCount > 0) {
      const actualDepth = readCurrentOverlayDepth(window.history.state);
      if (actualDepth === 0) {
        pushedOverlayCount = 0;
      }
    }

    const desired = overlayStack.length;
    if (desired > pushedOverlayCount) {
      try {
        for (let d = pushedOverlayCount + 1; d <= desired; d += 1) {
          window.history.pushState(
            {
              ...buildCleanPageState(),
              __pucOverlaySession: SESSION_ID,
              __pucOverlayDepth: d,
            },
            "",
            window.location.href,
          );
        }
        pushedOverlayCount = desired;
      } catch {
        pushedOverlayCount = desired;
      }
    } else if (desired < pushedOverlayCount) {
      const delta = pushedOverlayCount - desired;
      pushedOverlayCount = desired;
      pendingGoBacks += delta;
      armPendingGoBackWatchdog();
      try {
        window.history.go(-delta);
      } catch {
        pendingGoBacks = Math.max(0, pendingGoBacks - delta);
        if (pendingGoBacks === 0) clearPendingGoBackWatchdog();
      }
    }
  });
}

/**
 * Đăng ký một lớp giao diện nổi (Modal, Drawer, Bottom Sheet, Lightbox, chế độ vẽ bản đồ...)
 * vào ngăn xếp Back tuần tự của trình duyệt.
 * - Khi người dùng bấm/vuốt Back trên thiết bị: chỉ đóng lớp nổi trên cùng, giữ nguyên trang hiện tại.
 * - Khi người dùng bấm nút Đóng (×) trên giao diện: tự thu hồi mục lịch sử ảo để không phải bấm Back 2 lần.
 */
export function useBackLayer(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    ensurePopStateListener();

    const id = nextOverlayId++;
    const entry: OverlayEntry = {
      id,
      pathname: window.location.pathname,
      close: () => {
        onCloseRef.current();
      },
    };
    overlayStack.push(entry);
    scheduleOverlaySync();

    return () => {
      const idx = overlayStack.findIndex((item) => item.id === id);
      if (idx !== -1) {
        overlayStack.splice(idx, 1);
        scheduleOverlaySync();
      }
    };
  }, [open]);
}

/**
 * Xóa tức thì toàn bộ ngăn xếp lịch sử ảo của các Sheet/Modal đang mở trước khi rời trang
 * (ví dụ khi bấm Đăng xuất từ trong ngăn Hồ sơ cá nhân), ngăn `scheduleOverlaySync` gọi
 * `window.history.go(-1)` làm hủy ngang lệnh `router.replace("/login")` của Next.js.
 */
export function resetOverlayHistoryOnRouteLeave(): void {
  overlayStack.length = 0;
  pushedOverlayCount = 0;
  pendingGoBacks = 0;
  pendingReplaceUrl = null;
  pendingPushUrl = null;
  clearPendingGoBackWatchdog();
  if (typeof window === "undefined") return;
  routeLeaveFromPath = window.location.pathname;
  routeLeaveLockUntil = Date.now() + 900;
  try {
    if (readCurrentOverlayDepth(window.history.state) > 0) {
      window.history.replaceState(
        buildCleanPageState(),
        "",
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    }
  } catch {
    // ignore
  }
}

/**
 * Thu hồi êm mục lịch sử ảo của ngăn kéo / menu đang mở bằng `history.replaceState` tại chỗ
 * thay vì gọi `history.go(-1)` (tránh trình duyệt di động kích hoạt History Scroll Restoration
 * hủy ngang thao tác cuộn mượt `scrollTo` tới `#section` hoặc làm kẹt chuyển trang `<Link>`).
 */
export function consumeBackLayerForInPageTarget(nextUrl?: string): void {
  if (typeof window === "undefined") return;
  ensurePopStateListener();

  const currentPath = window.location.pathname;
  for (let i = overlayStack.length - 1; i >= 0; i -= 1) {
    if (overlayStack[i].pathname === currentPath) {
      overlayStack.splice(i, 1);
    }
  }

  const resolvedUrl =
    nextUrl ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  syncWorkspaceUrlFromHref(resolvedUrl);
  const markRootSeeded = resolvedUrl.includes("?");

  if (pushedOverlayCount === 1 && pendingGoBacks === 0) {
    pushedOverlayCount = 0;
    try {
      window.history.replaceState(buildCleanPageState(markRootSeeded), "", resolvedUrl);
    } catch {
      // ignore
    }
    return;
  }

  if (pushedOverlayCount > 1) {
    const extra = pushedOverlayCount - 1;
    pushedOverlayCount = 0;
    pendingReplaceUrl = resolvedUrl;
    pendingGoBacks += extra;
    armPendingGoBackWatchdog();
    try {
      window.history.go(-extra);
    } catch {
      pendingGoBacks = Math.max(0, pendingGoBacks - extra);
      if (pendingGoBacks === 0) clearPendingGoBackWatchdog();
      pendingReplaceUrl = null;
    }
    return;
  }

  if (pendingGoBacks > 0) {
    pendingReplaceUrl = resolvedUrl;
    return;
  }

  if (nextUrl !== undefined) {
    try {
      window.history.replaceState(buildCleanPageState(markRootSeeded), "", resolvedUrl);
    } catch {
      // ignore
    }
  }
}

/**
 * Đẩy một bước điều hướng trang / phân mục / tab con vào lịch sử trình duyệt một cách tuần tự.
 * Nếu thao tác điều hướng xuất phát từ bên trong một ngăn kéo menu / ô tìm kiếm đang mở,
 * tự động thay thế mục lịch sử của ngăn kéo đó để khi bấm Back sẽ lùi thẳng về trang trước đó.
 */
export function pushUrlNavigation(nextUrl: string): void {
  if (typeof window === "undefined") return;
  ensurePopStateListener();

  const currentUrl = window.location.pathname + window.location.search + window.location.hash;
  syncWorkspaceUrlFromHref(nextUrl);
  if (nextUrl === currentUrl && pushedOverlayCount === 0) return;

  const markRootSeeded = nextUrl.includes("?");

  if (pushedOverlayCount > 0) {
    overlayStack.length = 0;
    if (pushedOverlayCount === 1 && pendingGoBacks === 0) {
      pushedOverlayCount = 0;
      try {
        window.history.replaceState(buildCleanPageState(markRootSeeded), "", nextUrl);
      } catch {
        // ignore
      }
      window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
      return;
    }

    const extra = pushedOverlayCount - 1;
    pushedOverlayCount = 0;
    if (extra > 0) {
      pendingReplaceUrl = nextUrl;
      pendingGoBacks += extra;
      armPendingGoBackWatchdog();
      try {
        window.history.go(-extra);
      } catch {
        pendingGoBacks = Math.max(0, pendingGoBacks - extra);
        if (pendingGoBacks === 0) clearPendingGoBackWatchdog();
        pendingReplaceUrl = null;
      }
      return;
    }
  }

  if (pendingGoBacks > 0) {
    pendingPushUrl = nextUrl;
    return;
  }

  try {
    window.history.pushState(buildCleanPageState(markRootSeeded), "", nextUrl);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
}

/**
 * Khởi tạo điểm neo trang gốc khi người dùng mở trực tiếp liên kết sâu (ví dụ `/admin?section=harvest`
 * hoặc `/portal?tab=diary`) để khi bấm Back vẫn lùi về trang chính (`dashboard` / `home`) trước khi thoát.
 */
export function ensureRootEntryBeforeSubPage(rootUrl: string, currentSubUrl: string): void {
  if (typeof window === "undefined") return;
  ensurePopStateListener();
  syncWorkspaceUrlFromHref(currentSubUrl);
  try {
    const raw =
      typeof window.history.state === "object" && window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};
    if (raw.__pucRootSeeded) return;
    window.history.replaceState({ ...buildCleanPageState(true), __pucRootSeeded: true }, "", rootUrl);
    window.history.pushState({ ...buildCleanPageState(true), __pucRootSeeded: true }, "", currentSubUrl);
    if (overlayStack.length > 0) {
      pushedOverlayCount = 0;
      scheduleOverlaySync();
    }
  } catch {
    // ignore
  }
}

function buildEffectiveWorkspaceSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const sp = new URLSearchParams(window.location.search);
  const key = resolveStorageKeyForPathname(window.location.pathname);
  if (!key) return sp;

  if (key === ADMIN_LAST_URL_KEY && !sp.has("section")) {
    const saved = readWorkspaceUrl(ADMIN_LAST_URL_KEY);
    if (saved) {
      const qIdx = saved.indexOf("?");
      if (qIdx >= 0) {
        const savedSp = new URLSearchParams(saved.slice(qIdx));
        const savedSection = savedSp.get("section");
        if (savedSection) sp.set("section", savedSection);
      }
    }
  } else if (key === PORTAL_LAST_URL_KEY && !sp.has("tab")) {
    const saved = readWorkspaceUrl(PORTAL_LAST_URL_KEY);
    if (saved) {
      const qIdx = saved.indexOf("?");
      if (qIdx >= 0) {
        const savedSp = new URLSearchParams(saved.slice(qIdx));
        const savedTab = savedSp.get("tab");
        if (savedTab) sp.set("tab", savedTab);
      }
    }
  }
  return sp;
}

/**
 * Đọc đồng bộ tab con ban đầu từ tham số URL hiện tại (hoặc từ đường dẫn phiên làm việc đã lưu khi trình duyệt tải lại)
 * để tránh nhấp nháy về tab mặc định trước khi `useEffect` chạy.
 */
export function readInitialUrlSubTab<T extends string>(
  paramName: string,
  defaultValue: T,
  isValid: (raw: string) => raw is T,
  fallbackStorageKey?: string,
): T {
  if (typeof window === "undefined") return defaultValue;
  const sp = new URLSearchParams(window.location.search);
  const direct = sp.get(paramName) ?? (paramName === "sub" ? sp.get("tab") ?? sp.get("view") : null);
  if (direct && isValid(direct)) return direct;

  if (fallbackStorageKey && !sp.has("section") && !sp.has("tab") && !sp.has(paramName)) {
    const saved = readWorkspaceUrl(fallbackStorageKey);
    if (saved) {
      const qIdx = saved.indexOf("?");
      if (qIdx >= 0) {
        const savedSp = new URLSearchParams(saved.slice(qIdx));
        const fromSaved = savedSp.get(paramName);
        if (fromSaved && isValid(fromSaved)) return fromSaved;
      }
    }
  }
  return defaultValue;
}

/**
 * Đồng bộ trạng thái tab phụ (`?sub=...`) với lịch sử Back tuần tự của trình duyệt.
 */
export function useUrlSubTab<T extends string>(
  paramName: string,
  value: T,
  setValue: (next: T) => void,
  defaultValue: T,
  isValid: (raw: string) => raw is T,
): (next: T) => void {
  const valueRef = useRef(value);
  const isValidRef = useRef(isValid);
  const setValueRef = useRef(setValue);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    isValidRef.current = isValid;
    setValueRef.current = setValue;
  }, [isValid, setValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    ensurePopStateListener();

    const sp = buildEffectiveWorkspaceSearchParams();
    const raw = sp.get(paramName);
    if (raw && isValidRef.current(raw) && raw !== valueRef.current) {
      setValueRef.current(raw);
    } else if (!raw && valueRef.current !== defaultValue) {
      // Tab con được mở sẵn bởi intent / sự kiện nội bộ hoặc khôi phục từ phiên -> ghi nhẹ lên URL hiện tại
      sp.set(paramName, valueRef.current);
      const qs = sp.toString();
      replaceUrlPreservingState(`${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }

    const onSync = () => {
      const params = new URLSearchParams(window.location.search);
      const candidate = params.get(paramName);
      const resolved = candidate && isValidRef.current(candidate) ? candidate : defaultValue;
      if (resolved !== valueRef.current) {
        setValueRef.current(resolved);
      }
    };

    window.addEventListener(PUC_URL_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PUC_URL_SYNC_EVENT, onSync);
  }, [paramName, defaultValue]);

  return useCallback(
    (next: T) => {
      if (next === valueRef.current) return;
      setValueRef.current(next);
      if (typeof window === "undefined") return;
      const sp = buildEffectiveWorkspaceSearchParams();
      if (next === defaultValue) {
        sp.delete(paramName);
      } else {
        sp.set(paramName, next);
      }
      const qs = sp.toString();
      pushUrlNavigation(`${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    },
    [paramName, defaultValue],
  );
}

const UI_STATE_PREFIX = "puc:ui:";

interface StoredUiState<T> {
  u: number | null;
  v: T;
}

function readPersistedUiValue<T>(
  storageKey: string,
  defaultValue: T,
  isValid?: (raw: unknown) => raw is T,
): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.sessionStorage.getItem(`${UI_STATE_PREFIX}${storageKey}`);
    if (!raw) return defaultValue;
    const parsed = JSON.parse(raw) as Partial<StoredUiState<T>>;
    if (!parsed || typeof parsed !== "object" || !("v" in parsed)) return defaultValue;
    const activeUser = getAuthScopeUser();
    if (activeUser !== null) {
      if (
        typeof parsed.u !== "number" ||
        !Number.isInteger(parsed.u) ||
        parsed.u <= 0 ||
        parsed.u !== activeUser
      ) {
        return defaultValue;
      }
    }
    const candidate = parsed.v as unknown;
    if (isValid) {
      return isValid(candidate) ? candidate : defaultValue;
    }
    if (defaultValue !== null && typeof defaultValue !== "undefined" && typeof candidate !== typeof defaultValue) {
      return defaultValue;
    }
    return candidate as T;
  } catch {
    return defaultValue;
  }
}

function writePersistedUiValue<T>(storageKey: string, value: T, defaultValue: T): void {
  if (typeof window === "undefined") return;
  const fullKey = `${UI_STATE_PREFIX}${storageKey}`;
  try {
    if (Object.is(value, defaultValue)) {
      window.sessionStorage.removeItem(fullKey);
      return;
    }
    const payload: StoredUiState<T> = { u: getAuthScopeUser(), v: value };
    window.sessionStorage.setItem(fullKey, JSON.stringify(payload));
  } catch {
    // Bỏ qua nếu trình duyệt hạn chế sessionStorage
  }
}

const UI_STATE_CLEARED_EVENT = "puc:ui-state-cleared";

function removePersistedUiValue(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${UI_STATE_PREFIX}${storageKey}`);
  } catch {
    // ignore
  }
}

export function clearPersistedUiValue(storageKey: string): void {
  removePersistedUiValue(storageKey);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<string>(UI_STATE_CLEARED_EVENT, { detail: storageKey }));
  }
}

/**
 * Lưu trữ bền vững trạng thái màn hình / ngăn kéo / hộp thoại / bộ lọc qua thao tác tải lại trang (F5 / Reload),
 * cô lập theo tab trình duyệt và tự động xóa sạch khi đăng xuất hoặc đổi tài khoản.
 */
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
  isValid?: (raw: unknown) => raw is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => readPersistedUiValue(storageKey, defaultValue, isValid));
  const defaultRef = useRef(defaultValue);

  useEffect(() => {
    defaultRef.current = defaultValue;
  }, [defaultValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reset = () => {
      removePersistedUiValue(storageKey);
      setState(defaultRef.current);
    };
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ previous?: number | null; next?: number | null }>).detail;
      if (!detail || detail.previous !== detail.next) {
        reset();
      }
    };
    const onCleared = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) {
        setState(defaultRef.current);
      }
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, reset);
    window.addEventListener(AUTH_EXPIRED_EVENT, reset);
    window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, onScopeChange);
    window.addEventListener(UI_STATE_CLEARED_EVENT, onCleared);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, reset);
      window.removeEventListener(AUTH_EXPIRED_EVENT, reset);
      window.removeEventListener(AUTH_SCOPE_CHANGED_EVENT, onScopeChange);
      window.removeEventListener(UI_STATE_CLEARED_EVENT, onCleared);
    };
  }, [storageKey]);

  const setPersisted = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      setState((prev) => {
        const next = typeof action === "function" ? (action as (p: T) => T)(prev) : action;
        writePersistedUiValue(storageKey, next, defaultRef.current);
        return next;
      });
    },
    [storageKey],
  );

  return [state, setPersisted];
}

const isNullableRecordKey = (raw: unknown): raw is string | number | null =>
  raw === null || typeof raw === "string" || typeof raw === "number";

/**
 * Giữ nguyên hộp thoại / ngăn chi tiết đang mở của một bản ghi qua thao tác tải lại trang (F5 / Reload).
 * Chỉ lưu khóa định danh nhẹ (`id` / `code`) trong `sessionStorage` và tự khớp lại bản ghi mới nhất từ API.
 */
export function usePersistedRecordSelection<T>(
  storageKey: string,
  items: readonly T[] | undefined,
  getKey: (item: T) => string | number,
  loading = false,
): [T | null, (next: T | null) => void] {
  const keyStorageName = `${storageKey}:key`;
  const [selectedKey, setSelectedKey] = usePersistedState<string | number | null>(
    keyStorageName,
    null,
    isNullableRecordKey,
  );
  const [cachedItem, setCachedItem] = useState<T | null>(null);

  const resolvedItem = useMemo<T | null>(() => {
    if (selectedKey === null) return null;
    const keyStr = String(selectedKey);
    if (items !== undefined) {
      const matched = items.find((item) => String(getKey(item)) === keyStr);
      if (matched !== undefined) return matched;
    }
    if (cachedItem !== null && String(getKey(cachedItem)) === keyStr) {
      return cachedItem;
    }
    return null;
  }, [selectedKey, items, cachedItem, getKey]);

  useEffect(() => {
    if (selectedKey !== null && items !== undefined && !loading && resolvedItem === null) {
      removePersistedUiValue(keyStorageName);
    }
  }, [selectedKey, items, loading, resolvedItem, keyStorageName]);

  const select = useCallback(
    (next: T | null) => {
      if (next === null) {
        setCachedItem(null);
        setSelectedKey(null);
      } else {
        setCachedItem(next);
        setSelectedKey(getKey(next));
      }
    },
    [getKey, setSelectedKey],
  );

  return [resolvedItem, select];
}

const NEW_RECORD_SENTINEL = "__puc_new__";

/**
 * Giữ nguyên hộp thoại thêm mới (`"new"`) hoặc chỉnh sửa bản ghi (`T`) qua thao tác tải lại trang (F5 / Reload).
 */
export function usePersistedEditableSelection<T>(
  storageKey: string,
  items: readonly T[] | undefined,
  getKey: (item: T) => string | number,
  loading = false,
): [T | "new" | null, (next: T | "new" | null) => void] {
  const keyStorageName = `${storageKey}:edit`;
  const [selectedKey, setSelectedKey] = usePersistedState<string | number | null>(
    keyStorageName,
    null,
    isNullableRecordKey,
  );
  const [cachedItem, setCachedItem] = useState<T | null>(null);

  const resolved = useMemo<T | "new" | null>(() => {
    if (selectedKey === null) return null;
    if (selectedKey === NEW_RECORD_SENTINEL) return "new";
    const keyStr = String(selectedKey);
    if (items !== undefined) {
      const matched = items.find((item) => String(getKey(item)) === keyStr);
      if (matched !== undefined) return matched;
    }
    if (cachedItem !== null && String(getKey(cachedItem)) === keyStr) {
      return cachedItem;
    }
    return null;
  }, [selectedKey, items, cachedItem, getKey]);

  useEffect(() => {
    if (
      selectedKey !== null &&
      selectedKey !== NEW_RECORD_SENTINEL &&
      items !== undefined &&
      !loading &&
      resolved === null
    ) {
      removePersistedUiValue(keyStorageName);
    }
  }, [selectedKey, items, loading, resolved, keyStorageName]);

  const select = useCallback(
    (next: T | "new" | null) => {
      if (next === null) {
        setCachedItem(null);
        setSelectedKey(null);
      } else if (next === "new") {
        setCachedItem(null);
        setSelectedKey(NEW_RECORD_SENTINEL);
      } else {
        setCachedItem(next);
        setSelectedKey(getKey(next));
      }
    },
    [getKey, setSelectedKey],
  );

  return [resolved, select];
}
