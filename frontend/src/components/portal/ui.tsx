"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { CalendarDays, CircleCheck, FlaskConical, GraduationCap, Map, Microscope, NotebookPen, Package, Search, Send, TreePine } from "lucide-react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { SkeletonCards, SkeletonRows, SkeletonStats } from "@/components/ui/Skeleton";
import type { Tone } from "@/lib/portal-labels";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pt-pill pt-pill-${tone}`}>{children}</span>;
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-card">
      {(title || action) && (
        <header className="pt-card-head">
          {title && <h2 className="pt-card-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const EMPTY_ICONS = {
  request: Send,
  learn: GraduationCap,
  search: Search,
  diary: NotebookPen,
  spray: FlaskConical,
  map: Map,
  plot: TreePine,
  harvest: Package,
  ok: CircleCheck,
  calendar: CalendarDays,
  lab: Microscope,
};

export type EmptyIconName = keyof typeof EMPTY_ICONS;

export function EmptyState({ icon, children }: { icon: EmptyIconName; children: ReactNode }) {
  const Icon = EMPTY_ICONS[icon];
  return (
    <div className="pt-empty">
      <span aria-hidden="true">
        <Icon />
      </span>
      <p>{children}</p>
    </div>
  );
}

/** Hiển thị trạng thái tải (skeleton) / lỗi; trả về null khi đã có dữ liệu để nơi gọi tự vẽ nội dung. */
export function StateBlock({ loading, error, variant = "cards" }: { loading: boolean; error: string | null; variant?: "cards" | "rows" | "stats" }) {
  if (loading) {
    if (variant === "rows") return <SkeletonRows count={4} />;
    if (variant === "stats") return <SkeletonStats />;
    return <SkeletonCards count={2} />;
  }
  if (error) return <div className="pt-state pt-state-error" role="alert">{error}</div>;
  return null;
}

const SheetCloseContext = createContext<(() => void) | null>(null);
export const useSheetClose = () => useContext(SheetCloseContext);

/** Hộp thoại dạng bảng trượt từ dưới lên, hỗ trợ vuốt kéo xuống (swipe/drag down to dismiss) mượt mà */
export function Sheet({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Gesture tracking refs: hoàn toàn sử dụng ref để đảm bảo 120 FPS mượt mà không re-render React gây khựng
  const isTracking = useRef(false);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartX = useRef(0);
  const currentTranslateY = useRef(0);
  const dragStartTime = useRef(0);
  const activePointerId = useRef<number | null>(null);
  const dragSourceRef = useRef<"topbar" | "body">("topbar");
  const isClosingRef = useRef(false);

  // Đóng dialog mượt mà trực tiếp từ vị trí hiện tại (không bật lại keyframe CSS làm nhảy về 0)
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (sheet) {
      sheet.style.animation = "none";
      sheet.style.pointerEvents = "none";
      sheet.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)";
      sheet.style.transform = "translate3d(0, 105%, 0)";
    }
    if (backdrop) {
      backdrop.style.animation = "none";
      backdrop.style.pointerEvents = "none";
      backdrop.style.transition = "opacity 200ms ease-out";
      backdrop.style.opacity = "0";
    }

    setTimeout(() => {
      onClose();
    }, 220);
  }, [onClose]);

  // Khóa scroll body & lắng nghe phím ESC
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKey);
    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = previousHtml;
      document.body.style.overflow = previousBody;
    };
  }, [handleClose]);

  // Sau khi animation mở ban đầu kết thúc, khóa style animation = "none"
  // để thao tác kéo transform trực tiếp trên GPU không bị xung đột với CSS fill-mode forwards
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isClosingRef.current) return;
      if (sheetRef.current) {
        sheetRef.current.style.animation = "none";
        sheetRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.animation = "none";
        backdropRef.current.style.opacity = "1";
      }
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  const beginDragSession = (sheet: HTMLDivElement, originY: number) => {
    isDragging.current = true;
    dragStartY.current = originY;
    dragStartTime.current = performance.now();
    sheet.style.animation = "none";
    sheet.style.transition = "none";
    if (backdropRef.current) {
      backdropRef.current.style.animation = "none";
      backdropRef.current.style.transition = "none";
    }
    dragZoneRef.current?.classList.add("is-dragging");
  };

  const applyDragTransform = (rawDeltaY: number) => {
    const translateY = rawDeltaY < 0 ? rawDeltaY * 0.12 : rawDeltaY;
    currentTranslateY.current = translateY;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translate3d(0, ${translateY}px, 0)`;
    }
  };

  const finishDragSession = () => {
    const wasDragging = isDragging.current;
    isTracking.current = false;
    isDragging.current = false;
    activePointerId.current = null;
    dragZoneRef.current?.classList.remove("is-dragging");

    if (!wasDragging || isClosingRef.current) return;

    const deltaY = currentTranslateY.current;
    const elapsed = Math.max(1, performance.now() - dragStartTime.current);
    const velocity = deltaY / elapsed;

    // Điều kiện đóng: Kéo xuống > 90px hoặc vuốt nhanh > 0.35px/ms với khoảng kéo > 24px
    if (deltaY > 90 || (velocity > 0.35 && deltaY > 24)) {
      handleClose();
    } else if (sheetRef.current) {
      const sheet = sheetRef.current;
      sheet.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
      sheet.style.transform = "translate3d(0, 0, 0)";
    }
  };

  // 1. Kéo bằng Pointer Events trên thanh tiêu đề (.pt-sheet-topbar có touch-action: none)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isClosingRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".pt-icon-btn")) return;

    isTracking.current = true;
    isDragging.current = false;
    dragSourceRef.current = "topbar";
    dragStartY.current = e.clientY;
    dragStartX.current = e.clientX;
    currentTranslateY.current = 0;
    dragStartTime.current = performance.now();
    activePointerId.current = e.pointerId;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTracking.current || activePointerId.current !== e.pointerId || isClosingRef.current) return;

    const rawDeltaY = e.clientY - dragStartY.current;
    if (!isDragging.current) {
      if (Math.abs(rawDeltaY) < 4) return;
      if (sheetRef.current) {
        beginDragSession(sheetRef.current, e.clientY);
      }
      return;
    }

    applyDragTransform(e.clientY - dragStartY.current);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    finishDragSession();
  };

  // 2. Hỗ trợ vuốt xuống mượt mà ngay trên phần thân popup (.pt-sheet-body) khi đang ở đầu trang (scrollTop <= 0)
  const onBodyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isClosingRef.current || isTracking.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    if (bodyRef.current && bodyRef.current.scrollTop > 0) return;

    const touch = e.touches[0];
    if (!touch) return;
    isTracking.current = true;
    isDragging.current = false;
    dragSourceRef.current = "body";
    dragStartY.current = touch.clientY;
    dragStartX.current = touch.clientX;
    currentTranslateY.current = 0;
    dragStartTime.current = performance.now();
  };

  const onBodyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isTracking.current || dragSourceRef.current !== "body" || isClosingRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const rawDeltaY = touch.clientY - dragStartY.current;
    const rawDeltaX = touch.clientX - dragStartX.current;

    if (!isDragging.current) {
      // Nếu vuốt ngang hoặc vuốt lên (để cuộn nội dung xuống) hoặc nội dung đã cuộn: nhường cho scroll tự nhiên
      if (rawDeltaY < -4 || Math.abs(rawDeltaX) > Math.abs(rawDeltaY) + 2 || (bodyRef.current && bodyRef.current.scrollTop > 0)) {
        isTracking.current = false;
        return;
      }
      if (rawDeltaY < 6) return;
      if (sheetRef.current) {
        beginDragSession(sheetRef.current, touch.clientY);
      }
      return;
    }

    const deltaY = Math.max(0, touch.clientY - dragStartY.current);
    applyDragTransform(deltaY);
  };

  const onBodyTouchEnd = () => {
    if (!isTracking.current || dragSourceRef.current !== "body") return;
    finishDragSession();
  };

  return (
    <SheetCloseContext.Provider value={handleClose}>
      <div
        ref={backdropRef}
        className="pt-sheet-backdrop"
        onMouseDown={(event) => event.target === event.currentTarget && handleClose()}
      >
        <div
          ref={sheetRef}
          className={`pt-sheet ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Vùng thanh cầm & tiêu đề: nhận thao tác kéo vuốt xuống mượt mà */}
          <div
            ref={dragZoneRef}
            className="pt-sheet-topbar"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="pt-sheet-handle-zone" title="Kéo hoặc vuốt xuống để đóng">
              <div className="pt-sheet-handle-bar" />
            </div>

            <header className="pt-sheet-head">
              <h2>{title}</h2>
              <button
                type="button"
                className="pt-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Đóng"
              >
                <CloseCircleIcon size={28} />
              </button>
            </header>
          </div>

          <div
            ref={bodyRef}
            className="pt-sheet-body"
            onTouchStart={onBodyTouchStart}
            onTouchMove={onBodyTouchMove}
            onTouchEnd={onBodyTouchEnd}
            onTouchCancel={onBodyTouchEnd}
          >
            {children}
          </div>
        </div>
      </div>
    </SheetCloseContext.Provider>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="pt-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
