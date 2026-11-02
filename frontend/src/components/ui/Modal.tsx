"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";

/**
 * Hộp thoại dùng chung cho khu quản trị (dùng class `.modal*` trong globals.css).
 * Có `role="dialog"`, đóng bằng Esc/nút X/bấm nền, khóa cuộn trang, giữ focus trong hộp thoại.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 520,
  closeOnBackdrop = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  closeOnBackdrop?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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
        onCloseRef.current();
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
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ width, maxHeight: "calc(100dvh - 32px)", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <CloseCircleIcon size={28} />
          </button>
        </div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
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
      width={440}
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
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{message}</div>
      {children}
      <FormError message={error} />
    </Modal>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="form-error" style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "#fbe0d8", color: "#9a2f17", fontSize: 13.5 }}>
      {message}
    </div>
  );
}
