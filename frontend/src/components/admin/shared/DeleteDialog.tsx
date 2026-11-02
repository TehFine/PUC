"use client";

import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "./counts-events";

/** Hộp thoại xác nhận xóa một bản ghi: `DELETE /api{path}`, thông báo, rồi gọi `onDeleted` để làm mới danh sách. */
export default function DeleteDialog({
  title = "Xóa bản ghi",
  message,
  path,
  successMessage = "Đã xóa.",
  onClose,
  onDeleted,
}: {
  title?: string;
  message: React.ReactNode;
  path: string;
  successMessage?: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useMutation(() => api.delete(path).then(() => true));

  const confirm = async () => {
    const ok = await remove.run();
    if (!ok) return;
    toast.success(successMessage);
    notifyCountsChanged();
    onDeleted();
    onClose();
  };

  return (
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel="Xóa"
      danger
      pending={remove.pending}
      error={remove.error}
      onConfirm={() => void confirm()}
      onClose={onClose}
    />
  );
}
