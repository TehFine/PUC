"use client";

import { useCallback, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { SheetCloseContext, useIsDesktopViewport } from "@/components/portal/ui";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { lockRootScroll } from "@/lib/scroll-lock";

/**
 * Hộp thoại dùng chung cho khu quản trị — đồng bộ thiết kế ngăn kéo dọc cạnh phải trên màn hình lớn
 * (`variant="drawer"`) và thao tác vuốt đóng Bottom Sheet trên di động với Cổng hộ dân (`Sheet`).
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 560,
  variant = "drawer",
  closeOnBackdrop = true,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  variant?: "drawer" | "modal";
  closeOnBackdrop?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const isDesktop = useIsDesktopViewport(760);
  const isDesktopDrawer = variant === "drawer" && isDesktop;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const sheet = panelRef.current;
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
      onCloseRef.current();
    }, closeDuration);
  }, [variant]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const unlockScroll = lockRootScroll();

    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusable().find((el) => el.tagName !== "BUTTON") ?? focusable()[0] ?? panel)?.focus({
      preventScroll: true,
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [handleClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isClosingRef.current) return;
      if (panelRef.current) {
        panelRef.current.style.animation = "none";
        panelRef.current.style.transform = "translate3d(0, 0, 0)";
        panelRef.current.style.willChange = "auto";
      }
      if (backdropRef.current) {
        backdropRef.current.style.animation = "none";
        backdropRef.current.style.opacity = "1";
      }
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  useSheetSwipe({
    sheetRef: panelRef,
    handleRef: dragZoneRef,
    onDismiss: handleClose,
    enabled: !isDesktopDrawer,
  });

  const modalNode = (
    <SheetCloseContext.Provider value={handleClose}>
      <div
        ref={backdropRef}
        className={`modal-overlay pt-sheet-backdrop ${variant === "drawer" ? "is-drawer" : ""}`.trim()}
        onMouseDown={(event) => {
          if (closeOnBackdrop && event.target === event.currentTarget) handleClose();
        }}
      >
        <div
          ref={panelRef}
          className={`modal pt-sheet ${variant === "drawer" ? "is-drawer" : ""} ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={
            {
              "--modal-max-w": `${width}px`,
              ...(width > 580 ? { "--drawer-w": `${width}px` } : {}),
            } as CSSProperties
          }
        >
          <div ref={dragZoneRef} className="modal-topbar pt-sheet-topbar">
            <header className="modal-header pt-sheet-head">
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

          <div className="modal-body pt-sheet-body">
            {children}
          </div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </SheetCloseContext.Provider>
  );

  return typeof document !== "undefined" ? createPortal(modalNode, document.body) : modalNode;
}

/** Hộp thoại xác nhận (xóa, từ chối...). `onConfirm` có thể là async; hộp thoại tự hiện trạng thái đang xử lý. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Xác nhận",
  danger = false,
  pending = false,
  error,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      title={title}
      onClose={pending ? () => undefined : onClose}
      width={460}
      variant="modal"
      className="modal-confirm-sheet"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Hủy
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={pending}>
            {pending ? "Đang xử lý…" : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)" }}>{message}</div>
      {children}
      <FormError message={error} />
    </Modal>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="form-error pt-form-error" style={{ marginTop: 12 }}>
      {message}
    </div>
  );
}
