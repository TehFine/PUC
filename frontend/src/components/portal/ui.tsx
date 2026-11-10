"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CircleCheck, FlaskConical, GraduationCap, Map, Microscope, NotebookPen, Package, Search, Send, TreePine } from "lucide-react";
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

export type EmptyIconName = keyof typeof EMPTY_ICONS | "none";

export function EmptyState({ icon, children }: { icon: EmptyIconName; children: ReactNode }) {
  if (icon === "none") {
    return (
      <div className="pt-empty">
        <RadialPngIcon src="/none.png" size={44} className="pt-empty-none-icon" />
        <p>{children}</p>
      </div>
    );
  }
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
  const isClosingRef = useRef(false);

  // Đóng dialog mượt mà trực tiếp từ vị trí hiện tại (không bật lại keyframe CSS làm nhảy về 0)
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 760;
    if (sheet) {
      sheet.style.animation = "none";
      sheet.style.pointerEvents = "none";
      if (isDesktop) {
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
      backdrop.style.transition = "opacity 200ms ease-out";
      backdrop.style.opacity = "0";
    }

    setTimeout(() => {
      onClose();
    }, 220);
  }, [onClose]);

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

  // Vuốt kiểu khung bình luận TikTok / Facebook: cuộn nội dung đến đầu rồi kéo tiếp xuống để đóng popup
  useSheetSwipe({ sheetRef, handleRef: dragZoneRef, onDismiss: handleClose });

  const sheetNode = (
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
          <div ref={dragZoneRef} className="pt-sheet-topbar">
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

          <div className="pt-sheet-body">
            {children}
          </div>
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
 * Đồng bộ lớp mặt nạ mờ dần ở 2 đầu (kiểu thanh điều hướng chế độ Camera trên iPhone)
 * và tự động trượt mượt đưa nút tab đang chọn về vùng trung tâm khi bấm.
 */
function useCameraDialFade(
  trackRef: React.RefObject<HTMLDivElement | null>,
  activeKey?: string,
  maxFade = 52,
) {
  const hasMountedRef = useRef(false);

  const syncFade = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 2) {
      el.classList.remove("has-edge-fade");
      el.style.setProperty("--seg-fade-l", "0px");
      el.style.setProperty("--seg-fade-r", "0px");
      return;
    }
    el.classList.add("has-edge-fade");
    const sl = Math.max(0, el.scrollLeft);
    const sr = Math.max(0, overflow - sl);
    const fadeL = sl <= 1 ? 0 : Math.min(maxFade, Math.round(sl * 1.6));
    const fadeR = sr <= 1 ? 0 : Math.min(maxFade, Math.round(sr * 1.6));
    el.style.setProperty("--seg-fade-l", `${fadeL}px`);
    el.style.setProperty("--seg-fade-r", `${fadeR}px`);
  }, [trackRef, maxFade]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    syncFade();
    const rafId = requestAnimationFrame(syncFade);
    el.addEventListener("scroll", syncFade, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(syncFade);
      ro.observe(el);
    } else {
      window.addEventListener("resize", syncFade);
    }

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", syncFade);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", syncFade);
    };
  }, [trackRef, syncFade]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const isFirst = !hasMountedRef.current;
    hasMountedRef.current = true;

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
    requestAnimationFrame(syncFade);
  }, [activeKey, trackRef, syncFade]);
}

/** Thanh chứa các nút tab con với hiệu ứng mờ dần ở 2 đầu như Camera iPhone. */
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
  const trackRef = useRef<HTMLDivElement>(null);
  useCameraDialFade(trackRef, activeKey, 52);

  return (
    <div className={`pt-segmented ${className}`.trim()}>
      <div
        ref={trackRef}
        className="pt-segmented-track"
        role="tablist"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  );
}

/** Thanh bộ lọc chip ngang với hiệu ứng mờ dần ở 2 đầu khi tràn màn hình. */
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
  useCameraDialFade(trackRef, activeKey, 48);

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
