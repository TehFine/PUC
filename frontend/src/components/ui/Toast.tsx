"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PublicIcon } from "@/components/ui/PublicIcon";
import "./skeleton.css";

export type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  ttl: number;
  createdAt: number;
  leaving: boolean;
}

const MAX_ACTIVE_TOASTS = 3;
const EXIT_DURATION_MS = 250;
const DEDUPE_WINDOW_MS = 650;
const HEADER_SELECTOR =
  ".app-header, .pt-topbar, .eh-sticky-bar, .auth-topbar, .tr-topbar, header";

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const exitTimers = new Map<number, number>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

export function dismissToast(id: number) {
  if (typeof window === "undefined") return;
  const target = items.find((it) => it.id === id);
  if (!target || target.leaving) return;

  items = items.map((it) => (it.id === id ? { ...it, leaving: true } : it));
  emit();

  const existingTimer = exitTimers.get(id);
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }
  const timer = window.setTimeout(() => {
    exitTimers.delete(id);
    items = items.filter((it) => it.id !== id);
    emit();
  }, EXIT_DURATION_MS);
  exitTimers.set(id, timer);
}

function normalizeToastText(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, " ");
  if (clean.endsWith(".") && !clean.endsWith("...")) {
    return clean.slice(0, -1);
  }
  return clean;
}

function push(tone: ToastTone, rawMessage: string, ttl: number) {
  if (typeof window === "undefined") return;
  const message = normalizeToastText(rawMessage);
  if (!message) return;

  const now = Date.now();
  const duplicate = items.find(
    (it) =>
      !it.leaving &&
      it.tone === tone &&
      it.message === message &&
      now - it.createdAt < DEDUPE_WINDOW_MS,
  );
  if (duplicate) return;

  const id = nextId++;
  items = [...items, { id, tone, message, ttl, createdAt: now, leaving: false }];

  const activeItems = items.filter((it) => !it.leaving);
  if (activeItems.length > MAX_ACTIVE_TOASTS) {
    const overflowCount = activeItems.length - MAX_ACTIVE_TOASTS;
    for (let i = 0; i < overflowCount; i += 1) {
      const oldest = activeItems[i];
      if (oldest) dismissToast(oldest.id);
    }
  }

  emit();
}

/** Thông báo nổi sau mỗi thao tác: trên Mobile thả xuống cỡ banner iPhone, trên Laptop nằm ngay dưới thanh Header. */
export const toast = {
  success: (message: string) => push("success", message, 3000),
  error: (message: string) => push("error", message, 4800),
  info: (message: string) => push("info", message, 3200),
};

function measureDesktopToastTopPx(): number | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (window.innerWidth <= 768) return null;

  const candidates = document.querySelectorAll<HTMLElement>(HEADER_SELECTOR);
  for (const el of candidates) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = el.getBoundingClientRect();
    // Chỉ lấy thanh header đầu trang thực sự đang hiển thị ở vùng đỉnh màn hình
    if (rect.height >= 36 && rect.height <= 120 && rect.top >= -4 && rect.top <= 96 && rect.bottom > 0) {
      return Math.min(156, Math.max(16, Math.round(rect.bottom) + 10));
    }
  }
  return 16;
}

function ToastCard({ item }: { item: ToastItem }) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isDraggingRef = useRef(false);
  const dragYRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const remainingRef = useRef(item.ttl);
  const startedAtRef = useRef(0);
  const snapTimerRef = useRef<number | undefined>(undefined);

  const paused = isDragging || isHovered || item.leaving;

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = performance.now();
    const waitMs = Math.max(120, remainingRef.current);
    const timer = window.setTimeout(() => {
      dismissToast(item.id);
    }, waitMs);

    return () => {
      window.clearTimeout(timer);
      const elapsed = performance.now() - startedAtRef.current;
      remainingRef.current = Math.max(250, remainingRef.current - elapsed);
    };
  }, [item.id, paused]);

  useEffect(() => {
    return () => {
      if (snapTimerRef.current !== undefined) {
        window.clearTimeout(snapTimerRef.current);
      }
    };
  }, []);

  const triggerDismiss = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    dismissToast(item.id);
  }, [item.id]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || item.leaving) return;
    if (snapTimerRef.current !== undefined) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
    }
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
    };
    isDraggingRef.current = true;
    setIsDragging(true);
    setIsSnapping(false);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Bỏ qua nếu thiết bị không hỗ trợ pointer capture
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !pointerStartRef.current || item.leaving) return;
    const deltaY = e.clientY - pointerStartRef.current.y;
    const nextY = deltaY < 0 ? deltaY : Math.min(8, deltaY * 0.14);
    dragYRef.current = nextY;
    setDragY(nextY);
  };

  const finishGesture = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!isDraggingRef.current) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Bỏ qua
    }

    const start = pointerStartRef.current;
    const currentY = dragYRef.current;
    isDraggingRef.current = false;
    setIsDragging(false);
    pointerStartRef.current = null;

    if (!cancelled && start) {
      const deltaX = Math.abs(e.clientX - start.x);
      const deltaY = e.clientY - start.y;
      const duration = Math.max(1, performance.now() - start.time);
      const velocityY = deltaY / duration;
      const isSwipedUp = currentY <= -18 || (deltaY < -8 && velocityY < -0.22);
      const isTap = deltaX < 6 && Math.abs(deltaY) < 6 && duration < 350;

      if (isSwipedUp || isTap) {
        triggerDismiss();
        return;
      }
    }

    setIsSnapping(true);
    setDragY(0);
    dragYRef.current = 0;
    snapTimerRef.current = window.setTimeout(() => {
      setIsSnapping(false);
    }, 240);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      triggerDismiss();
    }
  };

  const inlineGestureStyle: React.CSSProperties | undefined = item.leaving
    ? undefined
    : isDragging
      ? {
          transform: `translate3d(0, ${dragY}px, 0)`,
          opacity: dragY < 0 ? Math.max(0.18, 1 + dragY / 88) : 1,
          transition: "none",
        }
      : isSnapping
        ? {
            transform: "translate3d(0, 0, 0)",
            opacity: 1,
            transition: "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease",
          }
        : undefined;

  const iconColor =
    item.tone === "error" ? "#b91c1c" : item.tone === "info" ? "#14372f" : "#15803d";
  const iconSrc = item.tone === "error" ? "/icons/alert-triangle.svg" : "/accept.png";

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      tabIndex={0}
      aria-label={`${item.message}. Vuốt lên hoặc chạm để đóng.`}
      title="Vuốt lên hoặc chạm để đóng"
      className={`puc-toast is-${item.tone}${item.leaving ? " is-leaving" : ""}${
        isDragging ? " is-dragging" : ""
      }${isSnapping ? " is-snapping" : ""}`}
      style={inlineGestureStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishGesture(e, false)}
      onPointerCancel={(e) => finishGesture(e, true)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
    >
      <span className="puc-toast-icon" aria-hidden="true">
        <PublicIcon src={iconSrc} color={iconColor} />
      </span>
      <span className="puc-toast-text">{item.message}</span>
    </div>
  );
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => items;

/** Đặt một lần ở layout gốc. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const pathname = usePathname();
  const dockRef = useRef<HTMLDivElement>(null);
  const hasItems = list.length > 0;

  useLayoutEffect(() => {
    if (!hasItems) return;
    const syncHeaderOffset = () => {
      const el = dockRef.current;
      if (!el) return;
      const topPx = measureDesktopToastTopPx();
      if (topPx !== null) {
        el.style.setProperty("--puc-toast-desktop-top", `${topPx}px`);
      } else {
        el.style.removeProperty("--puc-toast-desktop-top");
      }
    };

    syncHeaderOffset();
    const raf = window.requestAnimationFrame(syncHeaderOffset);
    window.addEventListener("resize", syncHeaderOffset, { passive: true });
    window.addEventListener("scroll", syncHeaderOffset, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", syncHeaderOffset);
      window.removeEventListener("scroll", syncHeaderOffset);
    };
  }, [hasItems, pathname]);

  if (!hasItems) return null;

  return (
    <div
      ref={dockRef}
      className="puc-toast-dock"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {list.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
