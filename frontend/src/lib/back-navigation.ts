"use client";

import { useCallback, useEffect, useRef } from "react";

export const PUC_URL_SYNC_EVENT = "puc:url-sync";

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
let pendingReplaceUrl: string | null = null;
let pendingPushUrl: string | null = null;
let syncQueued = false;
let listenerInstalled = false;

function buildCleanPageState(): Record<string, unknown> {
  const raw =
    typeof window !== "undefined" &&
    typeof window.history.state === "object" &&
    window.history.state !== null
      ? (window.history.state as Record<string, unknown>)
      : {};
  const clone: Record<string, unknown> = { ...raw };
  delete clone.__pucOverlaySession;
  delete clone.__pucOverlayDepth;
  return clone;
}

export function replaceUrlPreservingState(nextUrl: string): void {
  if (typeof window === "undefined") return;
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
      if (pendingReplaceUrl !== null) {
        const targetUrl = pendingReplaceUrl;
        pendingReplaceUrl = null;
        try {
          window.history.replaceState(buildCleanPageState(), "", targetUrl);
        } catch {
          // ignore
        }
        window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
      } else if (pendingPushUrl !== null) {
        const targetUrl = pendingPushUrl;
        pendingPushUrl = null;
        try {
          window.history.pushState(buildCleanPageState(), "", targetUrl);
        } catch {
          // ignore
        }
        window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
      }
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
  window.dispatchEvent(new CustomEvent(PUC_URL_SYNC_EVENT));
}

function ensurePopStateListener(): void {
  if (listenerInstalled || typeof window === "undefined") return;
  listenerInstalled = true;
  window.addEventListener("popstate", handleWindowPopState, true);
}

function scheduleOverlaySync(): void {
  if (syncQueued || typeof window === "undefined") return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    if (typeof window === "undefined") return;

    const currentPath = window.location.pathname;
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
      try {
        window.history.go(-delta);
      } catch {
        pendingGoBacks = Math.max(0, pendingGoBacks - delta);
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
 * Đẩy một bước điều hướng trang / phân mục / tab con vào lịch sử trình duyệt một cách tuần tự.
 * Nếu thao tác điều hướng xuất phát từ bên trong một ngăn kéo menu / ô tìm kiếm đang mở,
 * tự động thay thế mục lịch sử của ngăn kéo đó để khi bấm Back sẽ lùi thẳng về trang trước đó.
 */
export function pushUrlNavigation(nextUrl: string): void {
  if (typeof window === "undefined") return;
  ensurePopStateListener();

  const currentUrl = window.location.pathname + window.location.search + window.location.hash;
  if (nextUrl === currentUrl && pushedOverlayCount === 0) return;

  if (pushedOverlayCount > 0) {
    overlayStack.length = 0;
    if (pushedOverlayCount === 1 && pendingGoBacks === 0) {
      pushedOverlayCount = 0;
      try {
        window.history.replaceState(buildCleanPageState(), "", nextUrl);
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
      try {
        window.history.go(-extra);
      } catch {
        pendingGoBacks = Math.max(0, pendingGoBacks - extra);
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
    window.history.pushState(buildCleanPageState(), "", nextUrl);
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
  try {
    const raw =
      typeof window.history.state === "object" && window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};
    if (raw.__pucRootSeeded) return;
    window.history.replaceState({ ...buildCleanPageState(), __pucRootSeeded: true }, "", rootUrl);
    window.history.pushState({ ...buildCleanPageState(), __pucRootSeeded: true }, "", currentSubUrl);
  } catch {
    // ignore
  }
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

    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get(paramName);
    if (raw && isValidRef.current(raw) && raw !== valueRef.current) {
      setValueRef.current(raw);
    } else if (!raw && valueRef.current !== defaultValue) {
      // Tab con được mở sẵn bởi intent / sự kiện nội bộ -> ghi nhẹ lên URL hiện tại
      const nextSp = new URLSearchParams(window.location.search);
      nextSp.set(paramName, valueRef.current);
      const qs = nextSp.toString();
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
      const sp = new URLSearchParams(window.location.search);
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
