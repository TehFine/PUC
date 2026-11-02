"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { TextAreaField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { HarvestDeclarationRecord } from "@/types/harvest";

export default function DeclarationReviewModal({
  declaration,
  mode,
  onClose,
  onDone,
}: {
  declaration: HarvestDeclarationRecord;
  mode: "confirm" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState(declaration.reviewNote ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const trimmed = note.trim();
    const path = `/harvest-declarations/${declaration.id}/${mode}`;
    return api.post(path, trimmed ? { note: trimmed } : {});
  });

  const submit = async () => {
    if (mode === "reject" && !note.trim()) {
      return setLocalError("Vui lòng nhập lý do từ chối để thông báo cho nông hộ.");
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(mode === "confirm" ? "Đã xác nhận khai báo thu hoạch." : "Đã từ chối khai báo thu hoạch.");
      onDone();
    }
  };

  return (
    <FormModal
      title={mode === "confirm" ? "Xác nhận khai báo thu hoạch" : "Từ chối khai báo thu hoạch"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      submitLabel={mode === "confirm" ? "Xác nhận duyệt" : "Xác nhận từ chối"}
      width={500}
    >
      <p style={{ marginTop: 0, fontSize: 13.5, color: "var(--text-secondary)" }}>
        Hộ: <strong>{declaration.householdName || declaration.householdCode || `#${declaration.householdId}`}</strong> · Thửa{" "}
        <strong>{declaration.plotCode}</strong> · Sản lượng <strong>{declaration.weightKg} kg</strong>
      </p>
      <TextAreaField
        label={mode === "confirm" ? "Ghi chú xác nhận (tùy chọn)" : "Lý do từ chối"}
        required={mode === "reject"}
        value={note}
        onChange={setNote}
        rows={3}
        placeholder={mode === "confirm" ? "VD: Đủ điều kiện gộp vào lô xuất khẩu…" : "VD: Chưa hết thời gian cách ly thuốc BVTV…"}
      />
    </FormModal>
  );
}
