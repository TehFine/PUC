"use client";

import { useState } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { FormError, Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { TextAreaField, TextField } from "@/components/ui/form/fields";
import { refreshMountedApiQueries, useMutation } from "@/hooks/use-api";
import { invalidateQueries, NOTIFICATIONS_PATH } from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import { notifySystemAlertsChanged } from "@/lib/system-alert";

const QUICK_TEMPLATES: { label: string; title: string; message: string }[] = [
  {
    label: "Nhắc ghi nhật ký",
    title: "Đề nghị cập nhật đầy đủ nhật ký canh tác và phun thuốc",
    message:
      "Đề nghị các hộ kiểm tra và cập nhật đầy đủ các đợt bón phân, tưới nước, phun thuốc BVTV trong tuần lên sổ nhật ký điện tử.",
  },
  {
    label: "Lịch họp xã viên",
    title: "Thông báo lịch họp toàn thể hộ thành viên HTX",
    message:
      "Mời đại diện các hộ vùng trồng tham dự buổi họp triển khai kế hoạch mùa vụ và phổ biến quy trình canh tác mới tại văn phòng HTX.",
  },
  {
    label: "Lấy mẫu kiểm nghiệm",
    title: "Thông báo chuẩn bị đợt lấy mẫu kiểm nghiệm an toàn trước thu hoạch",
    message:
      "Tổ kỹ thuật sẽ phối hợp lấy mẫu kiểm tra chỉ tiêu Cadimi, Vàng O và dư lượng BVTV. Đề nghị các hộ tuân thủ nghiêm thời gian cách ly thuốc.",
  },
];

export default function BroadcastNoticeModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const sendMut = useMutation(async () => {
    return api.post("/system-alerts", {
      severity: "info",
      audience: "farmer",
      title: title.trim(),
      message: message.trim(),
    });
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setLocalError("Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo.");
      return;
    }
    setLocalError(null);

    const res = await sendMut.run();
    if (!res) return;

    setTitle("");
    setMessage("");
    toast.success("Đã gửi thông báo đến toàn thể nông hộ và Ban điều hành HTX.");
    refreshMountedApiQueries("/system-alerts");
    invalidateQueries(NOTIFICATIONS_PATH);
    notifySystemAlertsChanged();
    notifyCountsChanged();
    onClose();
  };

  return (
    <Modal
      variant="modal"
      width={700}
      className="broadcast-notice-modal"
      title="Soạn thông báo"
      onClose={sendMut.pending ? () => undefined : onClose}
      footer={
        <>
          <ModalDismissButton
            className="btn btn-outline broadcast-cancel-btn"
            disabled={sendMut.pending}
            onFallbackClose={onClose}
          >
            Hủy
          </ModalDismissButton>
          <button
            type="submit"
            form="broadcast-household-notice-form"
            className="btn btn-primary broadcast-submit-btn"
            disabled={sendMut.pending}
          >
            {sendMut.pending ? "Đang gửi..." : "Gửi thông báo"}
          </button>
        </>
      }
    >
      <form
        id="broadcast-household-notice-form"
        className="broadcast-notice-form"
        autoComplete="off"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
      >
        <div className="broadcast-tpl-section">
          <span className="broadcast-tpl-label">Mẫu điền nhanh</span>
          <div className="broadcast-tpl-grid">
            {QUICK_TEMPLATES.map((tpl) => {
              const isSelected = title === tpl.title && message === tpl.message;
              return (
                <button
                  key={tpl.label}
                  type="button"
                  className={`broadcast-tpl-btn${isSelected ? " is-active" : ""}`}
                  disabled={sendMut.pending}
                  onClick={() => {
                    setTitle(tpl.title);
                    setMessage(tpl.message);
                    if (localError) setLocalError(null);
                  }}
                >
                  {tpl.label}
                </button>
              );
            })}
          </div>
        </div>

        <TextField
          label="Tiêu đề thông báo"
          required
          maxLength={160}
          value={title}
          onChange={(v) => {
            setTitle(v);
            if (localError) setLocalError(null);
          }}
          placeholder="Ví dụ: Lịch họp xã viên hoặc hướng dẫn chăm sóc vụ mới"
        />

        <TextAreaField
          label="Nội dung thông báo"
          required
          rows={5}
          maxLength={600}
          value={message}
          onChange={(v) => {
            setMessage(v);
            if (localError) setLocalError(null);
          }}
          placeholder="Nhập nội dung chi tiết gửi đến tất cả các hộ thành viên..."
        />

        <FormError message={localError ?? sendMut.error} />
      </form>
    </Modal>
  );
}

