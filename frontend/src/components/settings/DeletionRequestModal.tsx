"use client";

import { useState } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { FormError, Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { TextAreaField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { DeletionTargetType } from "@/types/accounts";

export default function DeletionRequestModal({
  targetType,
  targetId,
  targetName,
  targetCode,
  onClose,
  onRequested,
}: {
  targetType: DeletionTargetType;
  targetId: number;
  targetName: string;
  targetCode: string;
  onClose: () => void;
  onRequested: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const targetKindLabel = targetType === "account" ? "tài khoản" : "hộ thành viên";

  const submitReq = useMutation(async (cleanReason: string) => {
    return api.post<{
      ok: boolean;
      pendingApproval: boolean;
      message?: string;
    }>("/deletion-requests", {
      targetType,
      targetId,
      reason: cleanReason,
    });
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setReasonError("Vui lòng nhập rõ lý do đề nghị xóa (tối thiểu 5 ký tự).");
      return;
    }
    setReasonError(null);

    const res = await submitReq.run(trimmed);
    if (!res) return;

    toast.success(res.message || "Đã gửi yêu cầu xóa đến Phó HTX để phê duyệt.");
    notifyCountsChanged();
    onRequested();
    onClose();
  };

  return (
    <Modal
      variant="modal"
      width={480}
      title={`Đề nghị xóa ${targetKindLabel}`}
      onClose={submitReq.pending ? () => undefined : onClose}
      footer={
        <>
          <ModalDismissButton
            className="btn btn-outline"
            disabled={submitReq.pending}
            onFallbackClose={onClose}
          >
            Hủy
          </ModalDismissButton>
          <button
            type="submit"
            form="deletion-request-form"
            className="btn btn-danger"
            disabled={submitReq.pending}
          >
            {submitReq.pending ? "Đang gửi..." : "Gửi Phó HTX duyệt xóa"}
          </button>
        </>
      }
    >
      <form id="deletion-request-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div
          style={{
            padding: "12px 14px",
            marginBottom: 14,
            borderRadius: 6,
            border: "1px solid #d4d4d2",
            background: "#f7f7f5",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#14372f",
          }}
        >
          Đối tượng:{" "}
          <strong>{targetName}</strong>{" "}
          <span style={{ fontVariantNumeric: "tabular-nums", color: "#5f6d66" }}>
            ({targetCode})
          </span>
          <div style={{ marginTop: 4, color: "#5f6d66" }}>
            Hệ thống sẽ gửi thông báo đến Phó HTX. Hồ sơ chỉ bị xóa khỏi HTX sau khi Phó HTX phê duyệt.
          </div>
        </div>

        <TextAreaField
          label="Lý do đề nghị xóa"
          required
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(val) => {
            setReason(val);
            if (reasonError) setReasonError(null);
          }}
          placeholder="Ghi rõ căn cứ hoặc lý do đề nghị xóa khỏi HTX..."
          error={reasonError}
        />

        <FormError message={submitReq.error} />
      </form>
    </Modal>
  );
}

