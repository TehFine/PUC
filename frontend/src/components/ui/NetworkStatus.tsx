"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkQuality, usePerformanceTier, type NetQuality } from "@/lib/network";
import "./skeleton.css";

type Toast = { kind: "slow" | "offline" | "ok"; text: string } | null;

const MESSAGES = {
  slow: "Mạng yếu, đang tải chậm",
  offline: "Mất kết nối, đang chờ mạng",
  ok: "Đã kết nối lại mạng",
} as const;

function IosSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="11" y="2" width="2" height="5.5" rx="1" opacity="1.0" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(30 12 12)" opacity="0.92" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(60 12 12)" opacity="0.84" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(90 12 12)" opacity="0.75" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(120 12 12)" opacity="0.67" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(150 12 12)" opacity="0.58" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(180 12 12)" opacity="0.50" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(210 12 12)" opacity="0.42" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(240 12 12)" opacity="0.33" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(270 12 12)" opacity="0.25" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(300 12 12)" opacity="0.17" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(330 12 12)" opacity="0.08" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 10.5l3.6 3.6L15.5 6.8" />
    </svg>
  );
}

/**
 * Ghi trạng thái mạng và chế độ hiệu năng vào <html data-net="…" data-perf="…">
 * và hiển thị dock thông báo. Hỗ trợ bấm hoặc vuốt ngược lên cạnh trên màn hình để đóng.
 */
export default function NetworkStatus() {
  const quality = useNetworkQuality();
  const tier = usePerformanceTier();
  const [toast, setToast] = useState<Toast>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [dragY, setDragY] = useState(0);

  const previous = useRef<NetQuality>("good");
  const toastRef = useRef<HTMLDivElement>(null);
  const isDismissingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragYRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    document.documentElement.dataset.net = quality;
    document.documentElement.dataset.perf = tier;
    return () => {
      delete document.documentElement.dataset.net;
      delete document.documentElement.dataset.perf;
    };
  }, [quality, tier]);

  /** Kích hoạt hiệu ứng di chuyển ngược lên cạnh trên màn hình và biến mất */
  const triggerDismiss = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    setIsDismissing(true);
    setIsDragging(false);
    isDraggingRef.current = false;

    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = undefined;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
    }

    exitTimerRef.current = setTimeout(() => {
      setToast(null);
      setIsDismissing(false);
      isDismissingRef.current = false;
      setDragY(0);
      dragYRef.current = 0;
    }, 320);
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = quality;

    let next: Toast = null;
    if (quality === "slow") next = { kind: "slow", text: MESSAGES.slow };
    else if (quality === "offline") next = { kind: "offline", text: MESSAGES.offline };
    else if (before === "offline") next = { kind: "ok", text: MESSAGES.ok };

    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = undefined;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = undefined;
    }

    isDismissingRef.current = false;
    isDraggingRef.current = false;
    dragYRef.current = 0;
    queueMicrotask(() => {
      setIsDismissing(false);
      setIsDragging(false);
      setIsSnapping(false);
      setDragY(0);
      setToast(next);
    });
    if (!next || next.kind === "offline") return;

    // Tự động kích hoạt hiệu ứng lướt lên ẩn đi sau thời gian chờ
    autoDismissTimerRef.current = setTimeout(() => {
      triggerDismiss();
    }, next.kind === "ok" ? 2500 : 7000);

    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, [quality, triggerDismiss]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isDismissingRef.current) return;

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
      // Bỏ qua nếu môi trường không hỗ trợ pointer capture
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !pointerStartRef.current || isDismissingRef.current) return;

    const deltaY = e.clientY - pointerStartRef.current.y;
    let nextY = 0;

    if (deltaY < 0) {
      // Vuốt lên trên: theo sát vị trí ngón tay / con trỏ
      nextY = deltaY;
    } else {
      // Kéo xuống: tạo lực cản đàn hồi (rubber-band)
      nextY = Math.min(10, deltaY * 0.16);
    }

    dragYRef.current = nextY;
    setDragY(nextY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !pointerStartRef.current) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Bỏ qua
    }

    const currentY = dragYRef.current;
    const deltaX = Math.abs(e.clientX - pointerStartRef.current.x);
    const deltaY = e.clientY - pointerStartRef.current.y;
    const duration = performance.now() - pointerStartRef.current.time;
    const velocityY = duration > 0 ? deltaY / duration : 0;

    isDraggingRef.current = false;
    setIsDragging(false);
    pointerStartRef.current = null;

    // Điều kiện vuốt lên: kéo lên > 24px hoặc vuốt nhanh với vận tốc âm
    const isSwipedUp = currentY < -24 || (deltaY < -10 && velocityY < -0.25);
    // Điều kiện chạm / click ngắn: không dịch chuyển đáng kể
    const isTap = deltaX < 6 && Math.abs(deltaY) < 6 && duration < 350;

    if (isSwipedUp || isTap) {
      triggerDismiss();
    } else {
      // Thả tay mà chưa đủ ngưỡng vuốt: bật đàn hồi về vị trí cũ
      setIsSnapping(true);
      setDragY(0);
      dragYRef.current = 0;
      setTimeout(() => setIsSnapping(false), 360);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Bỏ qua
    }
    isDraggingRef.current = false;
    setIsDragging(false);
    pointerStartRef.current = null;
    setIsSnapping(true);
    setDragY(0);
    dragYRef.current = 0;
    setTimeout(() => setIsSnapping(false), 360);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      triggerDismiss();
    }
  };

  if (!toast) return null;

  const dismissStyle: React.CSSProperties | undefined = isDismissing
    ? {
        transform: "translate(-50%, calc(-100% - 36px)) scale(0.92)",
        opacity: 0,
        transition:
          "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.26s ease",
        pointerEvents: "none",
      }
    : isDragging
    ? {
        transform: `translate(-50%, ${dragY}px)`,
        opacity: Math.max(0.2, 1 + dragY / 90),
        transition: "none",
      }
    : isSnapping
    ? {
        transform: "translate(-50%, 0px)",
        opacity: 1,
        transition:
          "transform 0.36s cubic-bezier(0.18, 0.89, 0.32, 1.25), opacity 0.2s ease",
      }
    : undefined;

  return (
    <div
      ref={toastRef}
      className={`net-toast is-${toast.kind}${
        isDismissing ? " is-dismissing" : ""
      }${isDragging ? " is-dragging" : ""}${isSnapping ? " is-snapping" : ""}`}
      role="button"
      tabIndex={0}
      lang="vi"
      translate="no"
      aria-label={`${toast.text}. Bấm hoặc vuốt lên để ẩn.`}
      title="Bấm hoặc vuốt lên để ẩn"
      style={dismissStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={triggerDismiss}
      onKeyDown={handleKeyDown}
    >
      <span className="net-toast-badge" aria-hidden="true">
        {toast.kind === "ok" ? (
          <CheckIcon />
        ) : (
          <IosSpinner className="net-toast-ios-spinner" />
        )}
      </span>
      <span className="net-toast-text">{toast.text}</span>
    </div>
  );
}
