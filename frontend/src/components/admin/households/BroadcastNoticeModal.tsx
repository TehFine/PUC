"use client";

import { useState } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { useAuth } from "@/components/auth/AuthProvider";
import { FormError, Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { TextAreaField, TextField } from "@/components/ui/form/fields";
import { ROLE_LABELS } from "@/constants/roles";
import { refreshMountedApiQueries, useMutation } from "@/hooks/use-api";
import { invalidateQueries, NOTIFICATIONS_PATH } from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import { notifySystemAlertsChanged } from "@/lib/system-alert";

const QUICK_TEMPLATES: { label: string; title: string; message: string }[] = [
  {
    label: "Lịch họp xã viên",
    title: "Thông báo lịch họp toàn thể hộ thành viên HTX",
    message:
      "Mời đại diện các hộ vùng trồng tham dự buổi họp triển khai kế hoạch mùa vụ và phổ biến quy trình canh tác mới tại văn phòng HTX.",
  },
  {
    label: "Nhắc ghi nhật ký",
    title: "Đề nghị cập nhật đầy đủ nhật ký canh tác và phun thuốc",
    message:
      "Đề nghị các hộ kiểm tra và cập nhật đầy đủ các đợt bón phân, tưới nước, phun thuốc BVTV trong tuần lên sổ nhật ký điện tử.",
  },
  {
    label: "Lịch lấy mẫu kiểm nghiệm",
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
  const { session } = useAuth();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const senderSummary = session?.user
    ? `${ROLE_LABELS[session.user.role] ?? "Ban điều hành"} ${session.user.fullName}`
    : "Ban điều hành HTX";

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
      width={540}
      title="Soạn thông báo gửi toàn thể nông hộ"
      onClose={sendMut.pending ? () => undefined : onClose}
      footer={
        <>
          <ModalDismissButton
            className="btn btn-outline"
            disabled={sendMut.pending}
            onFallbackClose={onClose}
          >
            Hủy
          </ModalDismissButton>
          <button
            type="submit"
            form="broadcast-household-notice-form"
            className="btn btn-primary"
            disabled={sendMut.pending}
          >
            {sendMut.pending ? "Đang gửi..." : "Gửi toàn thể nông hộ"}
          </button>
        </>
      }
    >
      <form
        id="broadcast-household-notice-form"
        autoComplete="off"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
      >
        <div
          style={{
            padding: "10px 12px",
            marginBottom: 12,
            borderRadius: 6,
            border: "1px solid #d4d4d2",
            background: "#f7f7f5",
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "#5f6d66",
          }}
        >
          Người gửi: <strong style={{ color: "#14372f" }}>{senderSummary}</strong>. Thông báo sẽ đẩy tức thời tới hộp thư chuông của toàn thể nông hộ đang hoạt động, đồng thời gửi bản sao đối ứng giữa Trưởng HTX và Phó HTX.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              className="btn btn-outline btn-sm"
              disabled={sendMut.pending}
              onClick={() => {
                setTitle(tpl.title);
                setMessage(tpl.message);
                if (localError) setLocalError(null);
              }}
            >
              Mẫu: {tpl.label}
            </button>
          ))}
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
          rows={4}
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

