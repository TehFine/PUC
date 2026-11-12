"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, CircleCheck, FlaskConical, GraduationCap, Map, Microscope, NotebookPen, Package, Search, Send, TreePine } from "lucide-react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { SkeletonCards, SkeletonRows, SkeletonStats } from "@/components/ui/Skeleton";
import type { Tone } from "@/lib/portal-labels";
import { lockRootScroll } from "@/lib/scroll-lock";
import { RadialPngIcon } from "./RadialIcons";
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

export type EmptyIconName = keyof typeof EMPTY_ICONS | "none" | "recyclebin" | "empty";

export function EmptyState({ icon, children }: { icon: EmptyIconName; children: ReactNode }) {
  if (icon === "none") {
    return (
      <div className="pt-empty">
        <RadialPngIcon src="/none.png" size={44} className="pt-empty-icon" />
        <p>{children}</p>
      </div>
    );
  }
  if (icon === "recyclebin") {
    return (
      <div className="pt-empty">
        <RadialPngIcon src="/recyclebin.png" size={34} className="pt-empty-icon" />
        <p>{children}</p>
      </div>
    );
  }
  if (icon === "empty") {
    return (
      <div className="pt-empty">
        <RadialPngIcon src="/empty.png" size={32} className="pt-empty-icon" />
        <p>{children}</p>
      </div>
    );
  }
  const Icon = EMPTY_ICONS[icon];
  return (
    <div className="pt-empty">
      <span className="pt-empty-icon" aria-hidden="true">
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
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
  className?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);
  const isDesktop = useIsDesktopViewport(760);
  const isDesktopDrawer = variant === "drawer" && isDesktop;

  // Đóng dialog mượt mà trực tiếp từ vị trí hiện tại (không bật lại keyframe CSS làm nhảy về 0)
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    const desktopNow = typeof window !== "undefined" && window.innerWidth >= 760;
    const closeDuration = desktopNow && variant === "drawer" ? 240 : 220;

    if (sheet) {
      sheet.style.animation = "none";
      sheet.style.pointerEvents = "none";
      if (desktopNow && variant === "drawer") {
        sheet.style.transition = "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)";
        sheet.style.transform = "translate3d(100%, 0, 0)";
      } else if (desktopNow) {
        sheet.style.transition = "transform 180ms cubic-bezier(0.25, 1, 0.5, 1), opacity 180ms ease-out";
        sheet.style.transform = "translate3d(0, 12px, 0) scale(0.97)";
        sheet.style.opacity = "0";
      } else {
        sheet.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)";
        sheet.style.transform = "translate3d(0, 105%, 0)";
      }
    }
    if (backdrop) {
      backdrop.style.animation = "none";
      backdrop.style.pointerEvents = "none";
      backdrop.style.transition = "opacity 210ms ease-out";
      backdrop.style.opacity = "0";
    }

    setTimeout(() => {
      onClose();
    }, closeDuration);
  }, [onClose, variant]);

  // Khóa cuộn ở tầng root (<html>) & lắng nghe phím ESC
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKey);
    const unlockScroll = lockRootScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
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

  // Vuốt kiểu khung bình luận TikTok / Facebook trên mobile; tắt trên ngăn kéo dọc desktop
  useSheetSwipe({
    sheetRef,
    handleRef: dragZoneRef,
    onDismiss: handleClose,
    enabled: !isDesktopDrawer,
  });

  const sheetNode = (
    <SheetCloseContext.Provider value={handleClose}>
      <div
        ref={backdropRef}
        className={`pt-sheet-backdrop ${variant === "drawer" ? "is-drawer" : ""}`.trim()}
        onMouseDown={(event) => event.target === event.currentTarget && handleClose()}
      >
        <div
          ref={sheetRef}
          className={`pt-sheet ${variant === "drawer" ? "is-drawer" : ""} ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
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
              <h2>{title}</h2>
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
              {variant === "drawer" && <span className="pt-drawer-head-spacer" aria-hidden="true" />}
            </header>
          </div>

          <div className="pt-sheet-body">
            {children}
          </div>

          {footer && (
            <footer className="pt-sheet-footer">
              {footer}
            </footer>
          )}
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

  const syncOverflow = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const host = containerRef?.current ?? el;
    const style = window.getComputedStyle(el);
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const intrinsicWidth = el.scrollWidth - padX;
    const isOverflowing = intrinsicWidth - el.clientWidth > 2;
    host.classList.toggle("has-edge-fade", isOverflowing);
  }, [trackRef, containerRef]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    syncOverflow();
    const rafId = requestAnimationFrame(syncOverflow);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(syncOverflow);
      ro.observe(el);
    } else {
      window.addEventListener("resize", syncOverflow);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", syncOverflow);
    };
  }, [trackRef, syncOverflow]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const isFirst = !hasMountedRef.current;
    hasMountedRef.current = true;

    syncOverflow();
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow > 2) {
      const activeBtn = el.querySelector<HTMLElement>(
        '[aria-selected="true"], button.active, button.is-active',
      );
      if (activeBtn) {
        const target =
          activeBtn.offsetLeft + activeBtn.offsetWidth / 2 - el.clientWidth / 2;
        const clamped = Math.max(0, Math.min(overflow, target));
        el.scrollTo({
          left: clamped,
          behavior: isFirst ? "auto" : "smooth",
        });
      }
    }
  }, [activeKey, trackRef, syncOverflow]);
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
