"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, CircleCheck, FlaskConical, GraduationCap, Map, Microscope, NotebookPen, Package, Search, Send, TreePine, X } from "lucide-react";
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
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);

  // Gesture tracking refs: hoàn toàn sử dụng ref để đảm bảo 120 FPS mượt mà không re-render React gây khựng
  const isTracking = useRef(false);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const currentTranslateY = useRef(0);
  const dragStartTime = useRef(0);
  const activePointerId = useRef<number | null>(null);
  const isClosingRef = useRef(false);

  // Đóng dialog mượt mà với transition tinh chỉnh
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setClosing(true);

    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.22s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.2s ease-out";
      sheetRef.current.style.transform = "translate3d(0, 100%, 0)";
      sheetRef.current.style.opacity = "0";
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = "opacity 0.2s ease-out";
      backdropRef.current.style.opacity = "0";
    }

    setTimeout(() => {
      onClose();
    }, 220);
  }, [onClose]);

  // Khóa scroll body & lắng nghe phím ESC
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [handleClose]);

  // Sau khi animation mở ban đầu (slide-up 350ms) kết thúc, khóa style animation = "none"
  // để trình duyệt KHÔNG BAO GIỜ tự chạy lại keyframe gây hiện tượng giật sáng/load lại màn hình
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sheetRef.current) {
        sheetRef.current.style.animation = "none";
        sheetRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.animation = "none";
        backdropRef.current.style.opacity = "1";
      }
    }, 380);
    return () => clearTimeout(timer);
  }, []);

  // Bắt đầu chạm / nhấn chuột vào vùng thanh kéo & tiêu đề
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isClosingRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Bỏ qua nếu người dùng bấm nút đóng X
    if ((e.target as HTMLElement).closest(".pt-icon-btn")) return;

    isTracking.current = true;
    isDragging.current = false;
    dragStartY.current = e.clientY;
    currentTranslateY.current = 0;
    dragStartTime.current = Date.now();
    activePointerId.current = e.pointerId;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Di chuyển ngón tay / chuột
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTracking.current || activePointerId.current !== e.pointerId || isClosingRef.current) return;

    const rawDeltaY = e.clientY - dragStartY.current;

    // Ngưỡng dịch chuyển tối thiểu (4px) để tránh giật khi người dùng chỉ bấm chạm nhẹ
    if (!isDragging.current) {
      if (Math.abs(rawDeltaY) < 4) return;
      isDragging.current = true;

      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
        sheetRef.current.style.animation = "none";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "none";
        backdropRef.current.style.animation = "none";
      }
      dragZoneRef.current?.classList.add("is-dragging");
    }

    // Tính khoảng dịch chuyển với kháng lực đàn hồi khi kéo ngược lên
    let translateY = rawDeltaY;
    if (translateY < 0) {
      translateY = translateY * 0.12;
    }
    currentTranslateY.current = translateY;

    if (sheetRef.current) {
      sheetRef.current.style.transform = `translate3d(0, ${translateY}px, 0)`;
    }

    if (backdropRef.current) {
      if (translateY > 0) {
        // Giảm mờ nền dịu nhẹ, không bao giờ tụt quá mức gây chớp giật sáng
        const progress = Math.min(1, translateY / 500);
        const opacity = Math.max(0.4, 1 - progress * 0.6);
        backdropRef.current.style.opacity = opacity.toFixed(3);
      } else {
        backdropRef.current.style.opacity = "1";
      }
    }
  };

  // Kết thúc thao tác kéo
  const endDrag = (pointerId: number, currentTarget?: HTMLElement | null) => {
    if (activePointerId.current !== pointerId) return;
    activePointerId.current = null;
    const wasDragging = isDragging.current;
    isTracking.current = false;
    isDragging.current = false;
    dragZoneRef.current?.classList.remove("is-dragging");

    if (currentTarget) {
      try {
        currentTarget.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }

    if (!wasDragging) return;

    const deltaY = currentTranslateY.current;
    const elapsed = Math.max(1, Date.now() - dragStartTime.current);
    const velocity = deltaY / elapsed;

    // Điều kiện đóng: Kéo xuống > 115px hoặc flick nhanh > 0.4px/ms với khoảng kéo > 30px
    const shouldDismiss = deltaY > 115 || (velocity > 0.4 && deltaY > 30);

    if (shouldDismiss) {
      handleClose();
    } else {
      // THAO TÁC CHƯA TỚI ĐIỂM THU:
      // Đẩy nhẹ nhàng và êm dịu popup trở lại vị trí cũ (Snap back)
      // Đường cong cubic-bezier(0.25, 1, 0.5, 1) giúp popup về vị trí mượt mà, không giật khựng
      const sheet = sheetRef.current;
      const backdrop = backdropRef.current;
      const duration = Math.round(Math.min(320, Math.max(220, 180 + Math.max(0, deltaY) * 1.2)));

      if (sheet) {
        sheet.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        sheet.style.transform = "translate3d(0, 0, 0)";
        sheet.style.opacity = "1";
      }
      if (backdrop) {
        backdrop.style.transition = `opacity ${Math.min(280, duration)}ms ease-out`;
        backdrop.style.opacity = "1";
      }

      // Sau khi animation snap-back hoàn tất: chỉ xóa transition, TUYỆT ĐỐI GIỮ animation = "none"
      // để trình duyệt không kích hoạt lại keyframe css ban đầu
      setTimeout(() => {
        if (isClosingRef.current) return;
        if (sheetRef.current) {
          sheetRef.current.style.transition = "";
          sheetRef.current.style.transform = "translate3d(0, 0, 0)";
          sheetRef.current.style.animation = "none";
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition = "";
          backdropRef.current.style.opacity = "1";
          backdropRef.current.style.animation = "none";
        }
      }, duration + 20);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    endDrag(e.pointerId, e.currentTarget as HTMLElement);
  };

  // Dự phòng an toàn nếu ngón tay nhả ngoài viewport
  useEffect(() => {
    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (activePointerId.current === e.pointerId) {
        endDrag(e.pointerId, null);
      }
    };
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, []);

  return (
    <SheetCloseContext.Provider value={handleClose}>
      <div
        ref={backdropRef}
        className={`pt-sheet-backdrop ${closing ? "is-closing" : ""}`}
        onMouseDown={(event) => event.target === event.currentTarget && handleClose()}
      >
        <div
          ref={sheetRef}
          className={`pt-sheet ${closing ? "is-closing" : ""}`}
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
                <X aria-hidden="true" />
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
