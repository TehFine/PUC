"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { CalendarDays, CircleCheck, FlaskConical, GraduationCap, Map, Microscope, NotebookPen, Package, Search, Send, TreePine } from "lucide-react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { SkeletonCards, SkeletonRows, SkeletonStats } from "@/components/ui/Skeleton";
import type { Tone } from "@/lib/portal-labels";
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

  // Vuốt kiểu khung bình luận TikTok / Facebook: cuộn nội dung đến đầu rồi kéo tiếp xuống để đóng popup
  useSheetSwipe({ sheetRef, handleRef: dragZoneRef, onDismiss: handleClose });

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
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="pt-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
