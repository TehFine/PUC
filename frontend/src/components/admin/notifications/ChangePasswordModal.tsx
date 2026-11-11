"use client";

import { useState, type FormEvent } from "react";
import { BusyButton, InlineError } from "@/components/portal/shared/controls";
import { Field, Sheet, useSheetClose } from "@/components/portal/ui";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api-client";

function ChangePasswordFormContent({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Mật khẩu mới cần tối thiểu 8 ký tự.");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Mật khẩu mới cần bao gồm cả chữ cái và chữ số.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp với mật khẩu mới.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Mật khẩu mới cần khác mật khẩu hiện tại.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.post<{ ok: boolean }>("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      onSuccess();
    } catch (err) {
      setError(errorMessage(err, "Không đổi được mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={(e) => void submit(e)} noValidate>
      <Field label="Mật khẩu hiện tại" htmlFor="admin-cp-current">
        <input
          id="admin-cp-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </Field>
      <Field label="Mật khẩu mới (ít nhất 8 ký tự)" htmlFor="admin-cp-new">
        <input
          id="admin-cp-new"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </Field>
      <Field label="Nhập lại mật khẩu mới" htmlFor="admin-cp-confirm">
        <input
          id="admin-cp-confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </Field>
      <p className="pt-hint">
        Sau khi đổi mật khẩu thành công, hệ thống sẽ đăng xuất để bạn đăng nhập lại bằng mật khẩu mới.
      </p>
      <InlineError message={error} />
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel="Đang cập nhật…"
          disabled={!currentPassword || !newPassword || !confirmPassword}
        >
          Lưu mật khẩu mới
        </BusyButton>
      </div>
    </form>
  );
}

export default function ChangePasswordModal({
  onClose,
  onSuccessLogout,
}: {
  onClose: () => void;
  onSuccessLogout: () => Promise<void>;
}) {
  return (
    <Sheet variant="drawer" title="Đổi mật khẩu tài khoản" onClose={onClose} className="pt-password-sheet">
      <ChangePasswordFormContent
        onClose={onClose}
        onSuccess={() => {
          toast.success("Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
          onClose();
          void onSuccessLogout();
        }}
      />
    </Sheet>
  );
}
