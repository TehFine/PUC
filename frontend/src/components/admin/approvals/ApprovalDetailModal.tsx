"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { TextAreaField } from "@/components/ui/form/fields";
import { useApi, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { textOrNull } from "@/components/admin/shared/form-utils";
import { APPROVAL_STATUS, badgeOf, PRIORITY } from "@/components/admin/shared/labels";
import { formatDate } from "@/utils/format";
import type { ApprovalDetail, ApprovalRow } from "@/types/approvals";

export function ApprovalDecisionModal({
  approval,
  mode,
  onClose,
  onDone,
}: {
  approval: ApprovalRow;
  mode: "approve" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const act = useMutation(async () => {
    const cleanNote = textOrNull(note);
    if (mode === "approve") {
      return api.post(`/approvals/${approval.id}/approve`, { note: cleanNote });
    }
    return api.post(`/approvals/${approval.id}/reject`, { note: cleanNote ?? "" });
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "reject" && !note.trim()) {
      setNoteError("Vui lòng nhập lý do từ chối hồ sơ.");
      return;
    }
    setNoteError(null);
    const res = await act.run();
    if (res === undefined) return;
    toast.success(mode === "approve" ? `Đã duyệt hồ sơ ${approval.code}.` : `Đã từ chối hồ sơ ${approval.code}.`);
    notifyCountsChanged();
    onDone();
    onClose();
  };

  return (
    <Modal
      title={mode === "approve" ? `Duyệt hồ sơ ${approval.code}` : `Từ chối hồ sơ ${approval.code}`}
      onClose={act.pending ? () => undefined : onClose}
      width={480}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={act.pending}>
            Hủy
          </button>
          <button
            type="submit"
            form="approval-decision-form"
            className={`btn ${mode === "reject" ? "btn-danger" : "btn-primary"}`}
            disabled={act.pending}
          >
            {act.pending ? "Đang xử lý…" : mode === "approve" ? "Xác nhận duyệt" : "Xác nhận từ chối"}
          </button>
        </>
      }
    >
      <form id="approval-decision-form" onSubmit={(e) => void submit(e)} noValidate>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
          Hộ nộp: <strong>{approval.applicantName}</strong> · Loại yêu cầu: <strong>{approval.requestType}</strong>
        </p>
        <TextAreaField
          label={mode === "approve" ? "Ghi chú phản hồi (không bắt buộc)" : "Lý do từ chối"}
          required={mode === "reject"}
          value={note}
          onChange={setNote}
          rows={3}
          maxLength={1000}
          placeholder={
            mode === "approve"
              ? "VD: Hồ sơ hợp lệ, đã đối chiếu thực địa."
              : "VD: Thiếu ảnh chụp biên bản cam kết sử dụng thuốc BVTV."
          }
          error={noteError}
        />
        <FormError message={act.error} />
      </form>
    </Modal>
  );
}

export default function ApprovalDetailModal({
  approval,
  canUpdate,
  onClose,
  onApprove,
  onReject,
}: {
  approval: ApprovalRow;
  canUpdate: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { data: detail, loading, error } = useApi<ApprovalDetail>(`/approvals/${approval.id}`);
  const record: ApprovalDetail = detail ?? approval;
  const st = badgeOf(APPROVAL_STATUS, record.status);
  const pr = badgeOf(PRIORITY, record.priority);
  const attachments = record.attachments ?? [];

  return (
    <Modal
      title={`Chi tiết hồ sơ: ${record.code}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          {canUpdate && record.status === "pending" && (
            <>
              <button type="button" className="btn btn-danger" onClick={onReject}>
                Từ chối
              </button>
              <button type="button" className="btn btn-primary" onClick={onApprove}>
                Duyệt hồ sơ
              </button>
            </>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          padding: 16,
          borderRadius: 16,
          background: "var(--mist)",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Mã hồ sơ</div>
          <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#256b45" }}>{record.code}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Người nộp / Hộ dân</div>
          <div style={{ fontWeight: 600 }}>{record.applicantName}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Loại yêu cầu</div>
          <div style={{ fontWeight: 600 }}>{record.requestType}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Ngày nộp</div>
          <div style={{ fontWeight: 600 }}>{formatDate(record.submittedOn)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Mã thửa (plotCode)</div>
          <div style={{ fontWeight: 600, fontFamily: "monospace" }}>{record.plotCode || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Mức ưu tiên &amp; Trạng thái</div>
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <span className={`badge ${pr.badge}`}>{pr.label}</span>
            <span className={`badge ${st.badge}`}>{st.label}</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
          Ghi chú của hộ dân (note)
        </div>
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            background: "var(--bg-input)",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          {record.note || "Không có ghi chú."}
        </div>
      </div>

      {record.reviewNote && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Nhận xét duyệt / từ chối (reviewNote)
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: record.status === "rejected" ? "#fbe0d8" : "#eef8e3",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            {record.reviewNote}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
          Tệp đính kèm ({attachments.length || record.docsCount || 0})
        </div>
        {loading && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Đang tải danh sách tệp đính kèm…</div>}
        {error && <FormError message={error} />}
        {!loading && attachments.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Không có tệp đính kèm trực tuyến.</div>
        )}
        {attachments.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {attachments
              .filter((att) => /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/.test(att.url))
              .map((att) => {
                const isImage = att.mimeType?.startsWith("image/") ?? /\.(png|jpe?g|webp|gif)$/i.test(att.url);
                const isVideo = att.mimeType?.startsWith("video/") ?? /\.(mp4|webm)$/i.test(att.url);
                return (
                  <div
                    key={att.id}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {isImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={att.url}
                          alt={att.originalName || `Tệp #${att.id}`}
                          loading="lazy"
                          decoding="async"
                          style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                        />
                      )}
                      {isVideo && (
                        <video
                          src={att.url}
                          preload="metadata"
                          playsInline
                          muted
                          style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {att.originalName || `Tệp đính kèm #${att.id}`}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                          {att.mimeType || "Tệp"}
                          {att.sizeBytes ? ` · ${Math.round(att.sizeBytes / 1024)} KB` : ""}
                        </div>
                      </div>
                    </div>
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                      Mở tệp
                    </a>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </Modal>
  );
}
