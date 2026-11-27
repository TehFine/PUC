"use client";

import {
  useCallback,
  useEffect,
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

/** Thông báo nổi sau mỗi thao tác: trên Mobile thả xuống cỡ banner iPhone ở đỉnh màn hình, trên Laptop hiển thị gọn ở góc dưới bên phải. */
export const toast = {
  success: (message: string) => push("success", message, 3000),
  error: (message: string) => push("error", message, 4800),
  info: (message: string) => push("info", message, 3200),
};

function isMobileToastViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 768;
}

function ToastCard({ item }: { item: ToastItem }) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerStartRef = useRef<{ x: number; y: number; time: number; mobile: boolean } | null>(
    null,
  );
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
      mobile: isMobileToastViewport(),
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
    const start = pointerStartRef.current;
    if (!isDraggingRef.current || !start || item.leaving) return;
    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;

    let nextX = 0;
    let nextY = 0;
    if (start.mobile) {
      // Mobile (ở đỉnh màn hình): vuốt lên để đóng
      nextY = deltaY < 0 ? deltaY : Math.min(8, deltaY * 0.14);
    } else {
      // Laptop (ở góc dưới bên phải): kéo xuống hoặc sang phải để đóng
      nextX = deltaX > 0 ? deltaX : Math.max(-8, deltaX * 0.12);
      nextY = deltaY > 0 ? deltaY : Math.max(-8, deltaY * 0.12);
    }

    const next = { x: nextX, y: nextY };
    dragOffsetRef.current = next;
    setDragOffset(next);
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
    const current = dragOffsetRef.current;
    isDraggingRef.current = false;
    setIsDragging(false);
    pointerStartRef.current = null;

    if (!cancelled && start) {
      const rawDeltaX = e.clientX - start.x;
      const rawDeltaY = e.clientY - start.y;
      const duration = Math.max(1, performance.now() - start.time);
      const velocityX = rawDeltaX / duration;
      const velocityY = rawDeltaY / duration;
      const isTap = Math.abs(rawDeltaX) < 6 && Math.abs(rawDeltaY) < 6 && duration < 350;

      const isDismissSwipe = start.mobile
        ? current.y <= -18 || (rawDeltaY < -8 && velocityY < -0.22)
        : current.y >= 18 ||
          current.x >= 28 ||
          (rawDeltaY > 8 && velocityY > 0.22) ||
          (rawDeltaX > 12 && velocityX > 0.25);

      if (isDismissSwipe || isTap) {
        triggerDismiss();
        return;
      }
    }

    setIsSnapping(true);
    const zero = { x: 0, y: 0 };
    setDragOffset(zero);
    dragOffsetRef.current = zero;
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

  const dismissDistance =
    dragOffset.y < 0
      ? Math.abs(dragOffset.y)
      : Math.max(0, dragOffset.y, dragOffset.x * 0.75);

  const inlineGestureStyle: React.CSSProperties | undefined = item.leaving
    ? undefined
    : isDragging
      ? {
          transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
          opacity: dismissDistance > 0 ? Math.max(0.18, 1 - dismissDistance / 92) : 1,
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
      aria-label={`${item.message}. Bấm hoặc kéo để đóng.`}
      title="Bấm hoặc kéo để đóng"
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
  if (list.length === 0) return null;

  return (
    <div
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
