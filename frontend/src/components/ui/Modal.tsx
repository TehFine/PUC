"use client";

import { useCallback, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { lockRootScroll } from "@/lib/scroll-lock";

/**
 * Hộp thoại dùng chung cho khu quản trị — đồng bộ thiết kế và thao tác vuốt đóng (Bottom Sheet / Modal)
 * với Cổng hộ dân (`Sheet` trong `portal/ui.tsx`).
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 560,
  closeOnBackdrop = true,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  closeOnBackdrop?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const sheet = panelRef.current;
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
      onCloseRef.current();
    }, 220);
  }, []);

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
    (focusable().find((el) => el.tagName !== "BUTTON") ?? focusable()[0] ?? panel)?.focus();

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
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      previousFocus?.focus?.();
    };
  }, [handleClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isClosingRef.current) return;
      if (panelRef.current) {
        panelRef.current.style.animation = "none";
        panelRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.animation = "none";
        backdropRef.current.style.opacity = "1";
      }
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  useSheetSwipe({ sheetRef: panelRef, handleRef: dragZoneRef, onDismiss: handleClose });

  const modalNode = (
    <div
      ref={backdropRef}
      className="modal-overlay pt-sheet-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal pt-sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ "--modal-max-w": `${width}px` } as CSSProperties}
      >
        <div ref={dragZoneRef} className="modal-topbar pt-sheet-topbar">
          <div className="pt-sheet-handle-zone" title="Kéo hoặc vuốt xuống để đóng">
            <div className="pt-sheet-handle-bar" />
          </div>

          <header className="modal-header pt-sheet-head">
            <h2 id={titleId}>{title}</h2>
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

        <div className="modal-body pt-sheet-body">
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
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
