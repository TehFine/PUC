"use client";

import { useId, type FormEvent, type ReactNode } from "react";
import { FormError, Modal } from "@/components/ui/Modal";

/**
 * Hộp thoại biểu mẫu chuẩn: nội dung là <form>, chân hộp thoại có nút Hủy / Lưu (nút Lưu hiện trạng thái đang lưu).
 * Lỗi máy chủ hiển thị ngay dưới biểu mẫu.
 */
export default function FormModal({
  title,
  onClose,
  onSubmit,
  pending,
  error,
  submitLabel = "Lưu",
  width = 620,
  extraActions,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string | null;
  submitLabel?: string;
  width?: number;
  extraActions?: ReactNode;
  children: ReactNode;
}) {
  const formId = useId();
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending) onSubmit();
  };

  return (
    <Modal
      title={title}
      onClose={pending ? () => undefined : onClose}
      width={width}
      closeOnBackdrop={false}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Hủy
          </button>
          {extraActions}
          <button type="submit" form={formId} className="btn btn-primary" disabled={pending}>
            {pending ? "Đang lưu…" : submitLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        {children}
      </form>
      <FormError message={error} />
    </Modal>
  );
}
