"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { TextField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { hasErrors, requireFields } from "@/components/admin/shared/form-utils";

export default function ChangePasswordModal({
  onClose,
  onSuccessLogout,
}: {
  onClose: () => void;
  onSuccessLogout: () => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const change = useMutation(async () => {
    return api.post<{ ok: boolean }>("/auth/change-password", {
      currentPassword,
      newPassword,
    });
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { currentPassword, newPassword, confirmPassword },
      {
        currentPassword: "mật khẩu hiện tại",
        newPassword: "mật khẩu mới",
        confirmPassword: "xác nhận mật khẩu mới",
      },
    );
    if (newPassword && newPassword.length < 8) {
      errs.newPassword = "Mật khẩu mới cần tối thiểu 8 ký tự.";
    } else if (newPassword && (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword))) {
      errs.newPassword = "Mật khẩu mới cần bao gồm cả chữ cái và chữ số.";
    }
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      errs.confirmPassword = "Mật khẩu xác nhận không khớp.";
    }

    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const res = await change.run();
    if (!res) return;
    toast.success("Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
    onClose();
    await onSuccessLogout();
  };

  return (
    <Modal
      title="Đổi mật khẩu tài khoản"
      onClose={change.pending ? () => undefined : onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={change.pending}>
            Hủy
          </button>
          <button type="submit" form="change-password-form" className="btn btn-primary" disabled={change.pending}>
            {change.pending ? "Đang lưu…" : "Đổi mật khẩu"}
          </button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label="Mật khẩu hiện tại"
          required
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          error={fieldErrors.currentPassword}
        />
        <TextField
          label="Mật khẩu mới"
          required
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          hint="Tối thiểu 8 ký tự, gồm cả chữ cái và chữ số."
          error={fieldErrors.newPassword}
        />
        <TextField
          label="Nhập lại mật khẩu mới"
          required
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={fieldErrors.confirmPassword}
        />
        <FormError message={change.error} />
      </form>
    </Modal>
  );
}
