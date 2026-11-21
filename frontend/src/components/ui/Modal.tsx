"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "@/components/ui/PublicIcon";
import { SheetCloseContext, useIsDesktopViewport, useSheetClose } from "@/components/portal/ui";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { useBackLayer } from "@/lib/back-navigation";
import { useDialogKeyboardViewport } from "@/lib/keyboard-scroll";
import {
  animatePopupExit,
  attachSmoothSheetSettle,
  resolvePopupExitKind,
  spawnExitCloneIfNeeded,
} from "@/lib/popup-motion";
import { lockRootScroll } from "@/lib/scroll-lock";

/** Nút đóng/hủy bên trong chân Modal/Sheet tự động kích hoạt hiệu ứng thu gọn trước khi đóng */
export function ModalDismissButton({
  onFallbackClose,
  onClick,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { onFallbackClose?: () => void }) {
  const sheetClose = useSheetClose();
  return (
    <button
      type="button"
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (sheetClose) sheetClose();
        else onFallbackClose?.();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Hộp thoại dùng chung cho khu quản trị — đồng bộ thiết kế ngăn kéo dọc cạnh phải trên màn hình lớn
 * (`variant="drawer"`), hộp thoại thu phóng trung tâm (`variant="modal"`) và Bottom Sheet trên di động
 * với Cổng hộ dân (`Sheet`).
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 560,
  variant = "drawer",
  closeOnBackdrop = true,
  hideCloseButton = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  variant?: "drawer" | "modal";
  closeOnBackdrop?: boolean;
  hideCloseButton?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
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

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const exitKind = resolvePopupExitKind(variantRef.current, 760);
    const closeDuration = animatePopupExit(panelRef.current, backdropRef.current, exitKind);

    window.setTimeout(() => {
      onCloseRef.current();
    }, closeDuration);
  }, []);

  // Nếu thành phần cha đóng trực tiếp (ví dụ sau khi lưu biểu mẫu hoặc bấm nút Hủy/Đóng tùy biến),
  // vẫn giữ hiệu ứng thu gọn mượt mà nhờ bản sao giao diện tĩnh trước khi tháo khỏi DOM.
  useLayoutEffect(() => {
    const backdropEl = backdropRef.current;
    const panelEl = panelRef.current;
    return () => {
      if (!isClosingRef.current) {
        spawnExitCloneIfNeeded(
          backdropEl,
          panelEl,
          resolvePopupExitKind(variantRef.current, 760),
        );
      }
    };
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

    const focusRaf = window.requestAnimationFrame(() => {
      if (isClosingRef.current) return;
      if (window.visualViewport && window.visualViewport.scale > 1.01) return;
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      // Trên thiết bị cảm ứng, dời focus sang thời điểm popup đã trượt dừng hẳn để tránh khựng frame đầu
      if (isCoarsePointer) return;
      const items = focusable();
      const initial = items.find((el) => el.tagName !== "BUTTON") ?? items[0] ?? panel;
      initial?.focus({ preventScroll: true });
    });

    const onKey = (event: KeyboardEvent) => {
      const overlays = document.querySelectorAll(
        ".pt-sheet-backdrop, .modal-overlay, .cert-modal-backdrop, .pt-radial-backdrop",
      );
      if (overlays.length > 0 && overlays[overlays.length - 1] !== backdropRef.current) return;
      if (event.key === "Escape") {
        if (!closeOnBackdrop) return;
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
      window.cancelAnimationFrame(focusRaf);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [handleClose, closeOnBackdrop]);

  useEffect(
    () =>
      attachSmoothSheetSettle(panelRef.current, backdropRef.current, isClosingRef, () => {
        if (window.visualViewport && window.visualViewport.scale > 1.01) return;
        if (window.matchMedia("(pointer: coarse)").matches) {
          panelRef.current?.focus({ preventScroll: true });
        }
      }),
    [],
  );

  useBackLayer(true, handleClose);
  useDialogKeyboardViewport(backdropRef, panelRef, isClosingRef);

  useSheetSwipe({
    sheetRef: panelRef,
    handleRef: dragZoneRef,
    onDismiss: handleClose,
    enabled: !isDesktop && !isDesktopDrawer,
  });

  const modalNode = (
    <SheetCloseContext.Provider value={handleClose}>
      <div
        ref={backdropRef}
        className={`modal-overlay pt-sheet-backdrop ${variant === "drawer" ? "is-drawer" : "is-confirm-overlay"}`.trim()}
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
          ref={panelRef}
          className={`modal pt-sheet ${variant === "drawer" ? "is-drawer" : ""} ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={
            {
              "--modal-max-w": `${width}px`,
              ...(width ? { "--drawer-w": `${width}px` } : {}),
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

          <div className="modal-body pt-sheet-body">{children}</div>
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
      closeOnBackdrop={!pending}
      width={420}
      variant="modal"
      hideCloseButton
      className="modal-confirm-sheet"
      footer={
        <>
          <ModalDismissButton
            className="btn btn-confirm-cancel"
            onFallbackClose={onClose}
            disabled={pending}
          >
            Hủy
          </ModalDismissButton>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-confirm-primary"}`}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Đang xử lý…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="modal-confirm-message">{message}</div>
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
