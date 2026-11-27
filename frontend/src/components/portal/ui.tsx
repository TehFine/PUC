"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "@/components/ui/PublicIcon";
import { ContextualEmptyBox } from "@/components/ui/EmptyStateArt";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { SkeletonCards, SkeletonRows, SkeletonStats } from "@/components/ui/Skeleton";
import type { Tone } from "@/lib/portal-labels";
import { useBackLayer } from "@/lib/back-navigation";
import { useDialogKeyboardViewport } from "@/lib/keyboard-scroll";
import {
  animatePopupExit,
  attachSmoothSheetSettle,
  resolvePopupExitKind,
  spawnExitCloneIfNeeded,
} from "@/lib/popup-motion";
import { lockRootScroll } from "@/lib/scroll-lock";
import { centerDockItem } from "@/lib/dock-scroll";
import { useSheetSwipe } from "./use-sheet-swipe";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pt-pill pt-pill-${tone}`}>{children}</span>;
}

/** Đường kẻ mảnh phân tách các phần nội dung lớn trong một tab (chỉ hiện trên giao diện di động). */
export function SectionDivider() {
  return <hr className="pt-section-divider" aria-hidden="true" />;
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

export type EmptyIconName =
  | "request"
  | "learn"
  | "search"
  | "diary"
  | "spray"
  | "map"
  | "plot"
  | "harvest"
  | "ok"
  | "calendar"
  | "lab"
  | "none"
  | "recyclebin"
  | "empty";

export function EmptyState({ icon, children }: { icon: EmptyIconName; children: ReactNode }) {
  return (
    <ContextualEmptyBox iconHint={icon} className="pt-empty">
      {children}
    </ContextualEmptyBox>
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

export const SheetCloseContext = createContext<(() => void) | null>(null);
export const useSheetClose = () => useContext(SheetCloseContext);

/** Nhận diện màn hình lớn / laptop (>= 760px) và tự động đồng bộ khi thay đổi kích thước cửa sổ */
export function useIsDesktopViewport(minWidth = 760): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${minWidth}px)`).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(min-width: ${minWidth}px)`);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [minWidth]);

  return matches;
}

export interface DrawerSummaryRow {
  label: string;
  value: ReactNode;
  tone?: "default" | "accent" | "danger";
}

/** Khung tổng kết & nút hành động ghim cố định ở chân Drawer màn hình lớn */
export function DrawerSummaryFooter({
  rows,
  actions,
}: {
  rows?: DrawerSummaryRow[];
  actions?: ReactNode;
}) {
  return (
    <div className="pt-drawer-summary">
      {rows && rows.length > 0 && (
        <div className="pt-drawer-summary-rows">
          {rows.map((row) => (
            <div key={row.label} className="pt-drawer-summary-row">
              <span className="pt-drawer-summary-label">{row.label}</span>
              <strong
                className={`pt-drawer-summary-val ${row.tone && row.tone !== "default" ? `is-${row.tone}` : ""}`.trim()}
              >
                {row.value}
              </strong>
            </div>
          ))}
        </div>
      )}
      {actions && <div className="pt-drawer-summary-actions">{actions}</div>}
    </div>
  );
}

/** Hộp thoại dạng ngăn kéo dọc cạnh phải trên màn hình lớn (mặc định `variant="drawer"`), hoặc Bottom Sheet trên di động */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  variant = "drawer",
  closeOnBackdrop = true,
  hideCloseButton = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
  closeOnBackdrop?: boolean;
  hideCloseButton?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const backdropDownRef = useRef(false);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const variantRef = useRef(variant);
  const isDesktop = useIsDesktopViewport(760);
  const isDesktopDrawer = variant === "drawer" && isDesktop;

  useEffect(() => {
    onCloseRef.current = onClose;
    variantRef.current = variant;
  }, [onClose, variant]);

  // Đóng dialog mượt mà trực tiếp từ vị trí hiện tại đồng bộ hoàn toàn với Modal khu quản trị
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const exitKind = resolvePopupExitKind(variantRef.current, 760);
    const closeDuration = animatePopupExit(sheetRef.current, backdropRef.current, exitKind);

    window.setTimeout(() => {
      onCloseRef.current();
    }, closeDuration);
  }, []);

  // Bảo toàn hiệu ứng thu gọn ngay cả khi thành phần cha đóng trực tiếp (setOpen(false))
  useLayoutEffect(() => {
    const backdropEl = backdropRef.current;
    const sheetEl = sheetRef.current;
    return () => {
      if (!isClosingRef.current) {
        spawnExitCloneIfNeeded(
          backdropEl,
          sheetEl,
          resolvePopupExitKind(variantRef.current, 760),
        );
      }
    };
  }, []);

  // Khóa cuộn ở tầng root (<html>), khôi phục focus & lắng nghe phím ESC (chỉ đóng lớp hộp thoại trên cùng)
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const unlockScroll = lockRootScroll();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const overlays = document.querySelectorAll(
        ".pt-sheet-backdrop, .modal-overlay, .cert-modal-backdrop, .pt-radial-backdrop",
      );
      if (overlays.length > 0 && overlays[overlays.length - 1] !== backdropRef.current) return;
      if (!closeOnBackdrop) return;
      event.stopPropagation();
      handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [handleClose, closeOnBackdrop]);

  // Chỉ gỡ animation & transform sau khi sự kiện `animationend` hoàn tất trọn vẹn pha giảm tốc
  // để popup trượt mượt hết hành trình trên di động và vẫn sắc nét khi người dùng zoom to
  useEffect(
    () => attachSmoothSheetSettle(sheetRef.current, backdropRef.current, isClosingRef),
    [],
  );

  useBackLayer(true, handleClose);
  useDialogKeyboardViewport(backdropRef, sheetRef, isClosingRef);

  // Vuốt đóng trên mobile cho toàn bộ popup trượt từ cạnh dưới lên; tắt trên desktop
  useSheetSwipe({
    sheetRef,
    handleRef: dragZoneRef,
    onDismiss: handleClose,
    enabled: !isDesktop && !isDesktopDrawer,
  });

  const sheetNode = (
    <SheetCloseContext.Provider value={handleClose}>
      <div
        ref={backdropRef}
        className={`pt-sheet-backdrop ${variant === "drawer" ? "is-drawer" : "is-confirm-overlay"}`.trim()}
        onPointerDown={(event) => {
          backdropDownRef.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          const startedOnBackdrop = backdropDownRef.current;
          backdropDownRef.current = false;
          if (closeOnBackdrop && startedOnBackdrop && event.target === event.currentTarget) {
            handleClose();
          }
        }}
      >
        <div
          ref={sheetRef}
          className={`pt-sheet ${variant === "drawer" ? "is-drawer" : ""} ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          {/* Vùng tiêu đề (hỗ trợ kéo xuống để đóng) */}
          <div ref={dragZoneRef} className="pt-sheet-topbar">
            <header className="pt-sheet-head">
              {variant === "drawer" && (
                <button
                  type="button"
                  className="pt-drawer-back-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Thu gọn bảng"
                  title="Thu gọn"
                >
                  <ArrowRight size={19} strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}
              <h2 id={titleId}>{title}</h2>
              {!hideCloseButton && (
                <button
                  type="button"
                  className="pt-icon-btn pt-sheet-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Đóng"
                >
                  <CloseCircleIcon size={28} />
                </button>
              )}
              {variant === "drawer" && <span className="pt-drawer-head-spacer" aria-hidden="true" />}
            </header>
          </div>

          <div className="pt-sheet-body">{children}</div>

          {footer && <footer className="pt-sheet-footer">{footer}</footer>}
        </div>
      </div>
    </SheetCloseContext.Provider>
  );

  return typeof document !== "undefined" ? createPortal(sheetNode, document.body) : sheetNode;
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="pt-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Giữ lớp mờ dần tinh tế cố định ở 2 cạnh khi thanh tab tràn ngang
 * và tự động trượt mượt đưa nút tab đang chọn về vùng trung tâm khi bấm.
 */
function useCameraDialFade(
  trackRef: React.RefObject<HTMLDivElement | null>,
  activeKey?: string,
  containerRef?: React.RefObject<HTMLDivElement | null>,
) {
  const hasMountedRef = useRef(false);
  const maxScrollRef = useRef<number | null>(null);
  const lastFadeRef = useRef<{ over: boolean; l: string; r: string } | null>(null);

  const applyFadeValues = useCallback(
    (el: HTMLDivElement, maxScroll: number) => {
      const host = containerRef?.current ?? el;
      const isOverflowing = maxScroll > 2;
      let nextL = "0px";
      let nextR = "0px";
      if (isOverflowing) {
        const scrollLeft = el.scrollLeft;
        const leftRatio = Math.min(1, Math.max(0, scrollLeft) / 24);
        const rightRatio = Math.min(1, Math.max(0, maxScroll - scrollLeft) / 24);
        nextL = leftRatio >= 0.999 ? "var(--seg-fade)" : leftRatio <= 0.001 ? "0px" : `calc(var(--seg-fade) * ${leftRatio.toFixed(2)})`;
        nextR = rightRatio >= 0.999 ? "var(--seg-fade)" : rightRatio <= 0.001 ? "0px" : `calc(var(--seg-fade) * ${rightRatio.toFixed(2)})`;
      }
      const prev = lastFadeRef.current;
      if (!prev || prev.over !== isOverflowing) {
        host.classList.toggle("has-edge-fade", isOverflowing);
      }
      if (!prev || prev.l !== nextL) {
        host.style.setProperty("--seg-fade-l", nextL);
      }
      if (!prev || prev.r !== nextR) {
        host.style.setProperty("--seg-fade-r", nextR);
      }
      lastFadeRef.current = { over: isOverflowing, l: nextL, r: nextR };
    },
    [containerRef],
  );

  const measureAndSync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    maxScrollRef.current = maxScroll;
    applyFadeValues(el, maxScroll);
  }, [trackRef, applyFadeValues]);

  const syncScrollOnly = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = maxScrollRef.current ?? Math.max(0, el.scrollWidth - el.clientWidth);
    maxScrollRef.current = maxScroll;
    applyFadeValues(el, maxScroll);
  }, [trackRef, applyFadeValues]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let rafId = requestAnimationFrame(measureAndSync);
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        syncScrollOnly();
      });
    };
    const onResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measureAndSync();
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onResize);
      ro.observe(el);
    } else {
      window.addEventListener("resize", onResize, { passive: true });
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", onScroll);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", onResize);
    };
  }, [trackRef, measureAndSync, syncScrollOnly]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const isFirst = !hasMountedRef.current;
    hasMountedRef.current = true;

    // Gom toàn bộ thao tác đọc kích thước DOM vào 1 frame trước khi ghi class / cuộn thanh tab
    const rafId = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      const scrollW = track.scrollWidth;
      const clientW = track.clientWidth;
      const overflow = Math.max(0, scrollW - clientW);
      maxScrollRef.current = overflow;

      if (overflow > 2) {
        const activeBtn = track.querySelector<HTMLElement>(
          '[aria-selected="true"], button.active, button.is-active',
        );
        if (activeBtn) {
          const preferInstant =
            isFirst ||
            (typeof document !== "undefined" && document.documentElement.dataset.perf === "lite");
          centerDockItem(track, activeBtn, preferInstant ? "auto" : "smooth");
        }
      }
      applyFadeValues(track, overflow);
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeKey, trackRef, applyFadeValues]);
}

/** Thanh chứa các nút tab con với hiệu ứng mờ dần cố định ở 2 cạnh dock. */
export function SegmentedTabs({
  ariaLabel,
  activeKey,
  className = "",
  children,
}: {
  ariaLabel: string;
  activeKey?: string;
  className?: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useCameraDialFade(trackRef, activeKey, containerRef);

  return (
    <div ref={containerRef} className={`pt-segmented ${className}`.trim()}>
      <div className="pt-segmented-viewport">
        <div
          ref={trackRef}
          className="pt-segmented-track"
          role="tablist"
          aria-label={ariaLabel}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Thanh bộ lọc chip ngang với hiệu ứng mờ dần cố định ở 2 đầu khi tràn màn hình. */
export function FadeFilterBar({
  ariaLabel,
  activeKey,
  className = "",
  children,
}: {
  ariaLabel: string;
  activeKey?: string;
  className?: string;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  useCameraDialFade(trackRef, activeKey);

  return (
    <div
      ref={trackRef}
      className={`pt-pest-filter-bar ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
