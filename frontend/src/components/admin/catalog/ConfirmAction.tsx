"use client";

import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

/**
 * Hộp thoại xác nhận rồi gọi một thao tác ghi (mặc định DELETE `path`).
 * Thành công: toast + `onDone()` (nơi gọi đóng hộp thoại và làm mới danh sách). Lỗi hiện ngay trong hộp thoại.
 */
export default function ConfirmAction({
  title,
  message,
  path,
  method = "delete",
  body,
  confirmLabel = "Xóa",
  danger = true,
  successMessage,
  onClose,
  onDone,
  children,
}: {
  title: string;
  message: ReactNode;
  path: string;
  method?: "delete" | "post" | "patch";
  body?: unknown;
  confirmLabel?: string;
  danger?: boolean;
  successMessage: string;
  onClose: () => void;
  onDone: () => void;
  children?: ReactNode;
}) {
  const { run, pending, error } = useMutation(async () => {
    if (method === "delete") await api.delete(path);
    else if (method === "patch") await api.patch(path, body ?? {});
    else await api.post(path, body);
    return true;
  });

  return (
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      danger={danger}
      pending={pending}
      error={error}
      onClose={onClose}
      onConfirm={async () => {
        if (await run()) {
          toast.success(successMessage);
          onDone();
        }
      }}
    >
      {children}
    </ConfirmDialog>
  );
}
