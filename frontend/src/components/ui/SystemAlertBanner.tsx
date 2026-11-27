"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  checkSystemHealth,
  clearRecoveredBanner,
  clearRuntimeIncident,
  useSystemAlertSnapshot,
} from "@/lib/system-alert";

const DISMISSED_STORAGE_KEY = "puc_dismissed_system_alert";
const AUTO_DISMISS_MS = 30_000;
const EXIT_DURATION_MS = 250;

function readDismissedId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(DISMISSED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveDismissedId(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, key);
  } catch {
    // Ignore storage restriction
  }
}

function SwipeableAlertCard({
  toneClass,
  role,
  ariaLive,
  pauseTimer = false,
  onDismiss,
  children,
}: {
  toneClass: string;
  role: "alert" | "status";
  ariaLive: "assertive" | "polite";
  pauseTimer?: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isDraggingRef = useRef(false);
  const isLeavingRef = useRef(false);
  const dragYRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number; time: number; captured: boolean } | null>(
    null,
  );
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startedAtRef = useRef(0);
  const onDismissRef = useRef(onDismiss);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const snapTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const triggerClose = useCallback(() => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    isDraggingRef.current = false;
    setIsDragging(false);
    setIsSnapping(false);
    setIsLeaving(true);

    if (exitTimerRef.current !== undefined) {
      window.clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = undefined;
      onDismissRef.current();
    }, EXIT_DURATION_MS);
  }, []);

  const paused = isDragging || isHovered || isLeaving || pauseTimer;

  // Tự động đóng mượt sau 30 giây hiển thị
  useEffect(() => {
    if (paused) return;
    startedAtRef.current = performance.now();
    const waitMs = Math.max(200, remainingRef.current);
    const timer = window.setTimeout(() => {
      triggerClose();
    }, waitMs);

    return () => {
      window.clearTimeout(timer);
      const elapsed = performance.now() - startedAtRef.current;
      remainingRef.current = Math.max(1500, remainingRef.current - elapsed);
    };
  }, [paused, triggerClose]);

  // Hỗ trợ bấm phím Escape trên máy tính để đóng nhanh thông báo
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        triggerClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [triggerClose]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== undefined) {
        window.clearTimeout(exitTimerRef.current);
      }
      if (snapTimerRef.current !== undefined) {
        window.clearTimeout(snapTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || isLeavingRef.current) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest("button, a")) {
      return;
    }
    if (snapTimerRef.current !== undefined) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
    }
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      captured: false,
    };
    setIsSnapping(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || isLeavingRef.current) return;
    const deltaY = e.clientY - start.y;
    const deltaX = e.clientX - start.x;

    if (!isDraggingRef.current) {
      if (Math.abs(deltaY) < 4 && Math.abs(deltaX) < 4) return;
      isDraggingRef.current = true;
      setIsDragging(true);
      if (!start.captured) {
        start.captured = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Bỏ qua nếu trình duyệt không hỗ trợ pointer capture
        }
      }
    }

    const nextY = deltaY < 0 ? deltaY : Math.min(10, deltaY * 0.14);
    dragYRef.current = nextY;
    setDragY(nextY);
  };

  const finishGesture = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const start = pointerStartRef.current;
    if (!start) return;
    pointerStartRef.current = null;

    if (start.captured) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Bỏ qua
      }
    }

    if (!isDraggingRef.current) return;
    const currentY = dragYRef.current;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (!cancelled) {
      const deltaY = e.clientY - start.y;
      const duration = Math.max(1, performance.now() - start.time);
      const velocityY = deltaY / duration;
      const isSwipedUp = currentY <= -24 || (deltaY < -10 && velocityY < -0.22);

      if (isSwipedUp) {
        triggerClose();
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

  const gestureStyle: CSSProperties | undefined = isLeaving
    ? {
        transform: "translate3d(-50%, calc(-100% - 28px), 0)",
        opacity: 0,
        transition: "transform 0.24s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s ease",
        pointerEvents: "none",
      }
    : isDragging
      ? {
          transform: `translate3d(-50%, ${dragY}px, 0)`,
          opacity: dragY < 0 ? Math.max(0.2, 1 + dragY / 110) : 1,
          transition: "none",
        }
      : isSnapping
        ? {
            transform: "translate3d(-50%, 0, 0)",
            opacity: 1,
            transition: "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease",
          }
        : undefined;

  return (
    <div
      className={`sys-alert-banner ${toneClass}${isDragging ? " is-dragging" : ""}${
        isSnapping ? " is-snapping" : ""
      }${isLeaving ? " is-leaving" : ""}`}
      role={role}
      aria-live={ariaLive}
      style={gestureStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishGesture(e, false)}
      onPointerCancel={(e) => finishGesture(e, true)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        className="sys-alert-close"
        aria-label="Đóng thông báo"
        onClick={triggerClose}
      >
        ×
      </button>
      {children}
    </div>
  );
}

function SystemAlertBannerInner() {
  const { session } = useAuth();
  const pathname = usePathname() || "";
  const { runtimeIncident, broadcastAlert, recoveredAt, checking } = useSystemAlertSnapshot();
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => readDismissedId());

  const role = session?.user.role;
  const matchesBroadcastAudience = (() => {
    if (!broadcastAlert || !broadcastAlert.active) return false;
    if (broadcastAlert.audience === "all") return true;
    if (broadcastAlert.audience === "farmer") {
      return role === "farmer" || pathname.startsWith("/portal");
    }
    if (broadcastAlert.audience === "staff") {
      return Boolean((role && role !== "farmer") || pathname.startsWith("/admin"));
    }
    return true;
  })();

  // Ưu tiên 1: Lỗi kết nối máy chủ / CSDL / phiên bản client ngay thời điểm hiện tại.
  if (runtimeIncident) {
    const incidentKey = `${runtimeIncident.id}-${Math.floor(runtimeIncident.occurredAt / 30_000)}`;
    if (dismissedKey !== incidentKey) {
      const isChunk = runtimeIncident.kind === "chunk_error";
      return (
        <SwipeableAlertCard
          key={incidentKey}
          toneClass={isChunk ? "is-warning" : "is-critical"}
          role="alert"
          ariaLive="assertive"
          pauseTimer={checking}
          onDismiss={() => {
            setDismissedKey(incidentKey);
            clearRuntimeIncident();
          }}
        >
          <div className="sys-alert-main">
            <span className="sys-alert-badge">Thông báo</span>
            <strong className="sys-alert-title">{runtimeIncident.title}</strong>
            <p className="sys-alert-desc">{runtimeIncident.message}</p>
          </div>
          <div className="sys-alert-actions">
            {isChunk ? (
              <button
                type="button"
                className="sys-alert-btn is-solid"
                onClick={() => window.location.reload()}
              >
                Tải lại trang
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="sys-alert-btn is-solid"
                  disabled={checking}
                  onClick={() => void checkSystemHealth()}
                >
                  {checking ? "Đang thử lại…" : "Thử lại"}
                </button>
                <a href="tel:0366663778" className="sys-alert-btn is-ghost">
                  Gọi hỗ trợ: 0366 663 778
                </a>
              </>
            )}
          </div>
        </SwipeableAlertCard>
      );
    }
  }

  // Ưu tiên 2: Thông báo từ Ban quản trị / cập nhật / bảo trì / khẩn cấp do HTX phát trên toàn hệ thống.
  if (matchesBroadcastAudience && broadcastAlert) {
    const alertKey = `broadcast-${broadcastAlert.id}-${broadcastAlert.createdAt}`;
    if (dismissedKey !== alertKey) {
      const isCritical = broadcastAlert.severity === "critical";
      const isInfo = broadcastAlert.severity === "info";
      const bannerToneClass = isCritical
        ? "is-critical"
        : isInfo
          ? "is-info"
          : "is-warning";
      return (
        <SwipeableAlertCard
          key={alertKey}
          toneClass={bannerToneClass}
          role={isCritical ? "alert" : "status"}
          ariaLive={isCritical ? "assertive" : "polite"}
          onDismiss={() => {
            setDismissedKey(alertKey);
            saveDismissedId(alertKey);
          }}
        >
          <div className="sys-alert-main">
            <span className="sys-alert-badge">Thông báo</span>
            <strong className="sys-alert-title">{broadcastAlert.title}</strong>
            <p className="sys-alert-desc">{broadcastAlert.message}</p>
          </div>
          {isCritical && (
            <div className="sys-alert-actions">
              <a href="tel:0366663778" className="sys-alert-btn is-ghost">
                Gọi hỗ trợ: 0366 663 778
              </a>
            </div>
          )}
        </SwipeableAlertCard>
      );
    }
  }

  // Ưu tiên 3: Báo ngắn gọn khi hệ thống vừa tự khôi phục sau sự cố.
  if (recoveredAt) {
    return (
      <div
        className="sys-alert-banner is-recovered"
        role="status"
        aria-live="polite"
        onClick={() => clearRecoveredBanner()}
        title="Bấm để ẩn thông báo"
      >
        <div className="sys-alert-recovered-row">
          <span>Đã khôi phục kết nối ổn định</span>
        </div>
      </div>
    );
  }

  return null;
}

export default function SystemAlertBanner() {
  return (
    <Suspense fallback={null}>
      <SystemAlertBannerInner />
    </Suspense>
  );
}
