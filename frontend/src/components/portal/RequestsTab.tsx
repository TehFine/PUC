"use client";

import { FormEvent, useState } from "react";
import { FileText, Paperclip, XCircle } from "lucide-react";
import { invalidatePortal, usePortal } from "@/hooks/use-portal";
import { api, errorMessage } from "@/lib/api-client";
import { APPROVAL_STATUS, REQUEST_TYPES } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { CreateApprovalBody, PortalApproval, PortalListLike, PortalPlots } from "@/types/portal";
import { listOf } from "@/types/portal";
import {
  AttachmentsField,
  BusyButton,
  ConfirmButton,
  InlineError,
  isSafeMediaUrl,
  type PickedAttachment,
} from "./shared/controls";
import { uploadPortalFile } from "./shared/media";
import { Card, EmptyState, Field, Pill, Sheet, StateBlock, useSheetClose } from "./ui";

function RequestForm({
  plotCodes,
  onDone,
  onClose,
}: {
  plotCodes: string[];
  onDone: () => void;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const [requestType, setRequestType] = useState(REQUEST_TYPES[0]);
  const [plotCode, setPlotCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePlot = plotCode ?? plotCodes[0] ?? "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const attachmentIds: number[] = [];
      for (const item of files) {
        const uploadedId = await uploadPortalFile(item.file, "approval");
        attachmentIds.push(uploadedId);
      }

      const body: CreateApprovalBody = {
        requestType,
        plotCode: effectivePlot.trim() || undefined,
        note: note.trim() || undefined,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      };
      await api.post("/portal/approvals", body);
      invalidatePortal("approvals", "overview");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Không gửi được hồ sơ yêu cầu."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <div className="pt-field-row">
        <Field label="Loại hồ sơ / yêu cầu" htmlFor="pa-type">
          <select id="pa-type" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
            {REQUEST_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Thửa đất liên quan (tùy chọn)" htmlFor="pa-plot">
          {plotCodes.length > 0 ? (
            <select id="pa-plot" value={effectivePlot} onChange={(e) => setPlotCode(e.target.value)}>
              <option value="">Không chọn / Thửa mới</option>
              {plotCodes.map((code) => (
                <option key={code} value={code}>
                  Thửa {code}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="pa-plot"
              placeholder="Ví dụ: KB-VT-005 (nếu có)"
              value={effectivePlot}
              onChange={(e) => setPlotCode(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field label="Nội dung đề nghị / Ghi chú" htmlFor="pa-note">
        <textarea
          id="pa-note"
          rows={3}
          maxLength={1000}
          placeholder="Trình bày chi tiết nội dung đề nghị (diện tích, tờ bản đồ, số thửa, lý do đề nghị...)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <AttachmentsField
        id="pa-attachments"
        label="Giấy tờ, ảnh chụp đính kèm (Sổ đỏ, đơn đề nghị, PDF…)"
        files={files}
        onChange={setFiles}
        max={10}
        disabled={saving}
      />

      <p className="pt-hint">
        Sau khi gửi, cán bộ HTX sẽ nhận thông báo, kiểm tra tệp đính kèm và phản hồi kết quả duyệt ngay trên cổng.
      </p>
      <InlineError message={error} />
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton type="submit" className="pt-btn pt-btn-primary" busy={saving} busyLabel="Đang tải tệp & gửi…">
          Gửi hồ sơ
        </BusyButton>
      </div>
    </form>
  );
}

export default function RequestsTab() {
  const approvals = usePortal<PortalListLike<PortalApproval>>("approvals");
  const plots = usePortal<PortalPlots>("plots");
  const plotCodes = plots.data?.available ? plots.data.data.map((p) => p.code) : [];
  const [open, setOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const items = listOf(approvals.data);

  const handleCancel = async (id: number) => {
    setCancellingId(id);
    setCancelError(null);
    try {
      await api.post(`/portal/approvals/${id}/cancel`);
      invalidatePortal("approvals", "overview");
    } catch (err) {
      setCancelError(errorMessage(err, "Không hủy được yêu cầu này."));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="pt-stack">
      <div className="pt-grid-2">
        <Card
          title={`Hồ sơ & yêu cầu đã gửi (${items.length})`}
          action={
            <button type="button" className="pt-btn pt-btn-primary pt-btn-sm" onClick={() => setOpen(true)}>
              + Gửi hồ sơ mới
            </button>
          }
        >
          <StateBlock loading={approvals.loading} error={approvals.error} />
          <InlineError message={cancelError} />
          {!approvals.loading && items.length === 0 && (
            <EmptyState icon="request">Bạn chưa gửi hồ sơ hay yêu cầu nào cho HTX.</EmptyState>
          )}
          {items.length > 0 && (
            <ul className="pt-list">
              {items.map((item) => {
                const status = APPROVAL_STATUS[item.status] ?? APPROVAL_STATUS.pending;
                const attachments = item.attachments ?? [];
                return (
                  <li key={item.id} className="pt-notice" style={{ borderBottom: "1px solid var(--border-light, #f1f5f9)", paddingBottom: 14 }}>
                    <div className="pt-notice-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <strong style={{ display: "block", fontSize: 14.5 }}>{item.requestType}</strong>
                        <span className="pt-notice-meta">
                          {item.code} · Gửi ngày {formatDate(item.submittedOn)}
                          {item.plotCode ? ` · Thửa ${item.plotCode}` : ""}
                          {item.docsCount > 0 ? ` · ${item.docsCount} tệp đính kèm` : ""}
                        </span>
                      </div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>

                    {item.note && (
                      <p style={{ margin: "6px 0 4px", fontSize: 13.5, color: "var(--text-primary)" }}>
                        <strong>Nội dung:</strong> {item.note}
                      </p>
                    )}

                    {item.reviewNote && (
                      <p
                        style={{
                          margin: "6px 0 4px",
                          padding: "8px 10px",
                          borderRadius: 8,
                          fontSize: 13,
                          background: item.status === "rejected" ? "#fef2f2" : "#ecfdf5",
                          color: item.status === "rejected" ? "#991b1b" : "#065f46",
                          border: `1px solid ${item.status === "rejected" ? "#fecaca" : "#a7f3d0"}`,
                        }}
                      >
                        <strong>Phản hồi của HTX:</strong> {item.reviewNote}
                      </p>
                    )}

                    {attachments.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {attachments
                          .filter((att) => isSafeMediaUrl(att.url))
                          .map((att) => (
                            <a
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="pt-attach-chip"
                              title="Mở tệp đính kèm"
                            >
                              {att.mimeType?.includes("pdf") ? (
                                <FileText size={13} aria-hidden="true" />
                              ) : (
                                <Paperclip size={13} aria-hidden="true" />
                              )}
                              <span>{att.originalName || `Tệp #${att.id}`}</span>
                            </a>
                          ))}
                      </div>
                    )}

                    {item.status === "pending" && (
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                        <ConfirmButton
                          label={
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <XCircle size={14} aria-hidden="true" />
                              <span>Hủy yêu cầu</span>
                            </span>
                          }
                          question="Xác nhận hủy yêu cầu đang chờ duyệt này?"
                          confirmLabel="Đồng ý hủy"
                          busy={cancellingId === item.id}
                          onConfirm={() => void handleCancel(item.id)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Quy trình giải quyết hồ sơ">
          <div className="pt-guide-box">
            <div className="pt-guide-item">
              <div className="pt-guide-content">
                <strong>1. Nộp hồ sơ trực tuyến</strong>
                <p>Khai báo loại thủ tục (cấp mã vùng trồng, đăng ký thửa mới, phúc tra) và đính kèm ảnh chụp giấy tờ hoặc tệp PDF.</p>
              </div>
            </div>

            <div className="pt-guide-item">
              <div className="pt-guide-content">
                <strong>2. Thẩm tra và đối chiếu thực địa</strong>
                <p>Cán bộ kỹ thuật HTX tiếp nhận hồ sơ trên hệ thống và tiến hành kiểm tra đo đạc ranh giới thửa đất.</p>
              </div>
            </div>

            <div className="pt-guide-item">
              <div className="pt-guide-content">
                <strong>3. Phê duyệt và thông báo kết quả</strong>
                <p>Hồ sơ hợp lệ sẽ được HTX duyệt, cập nhật vào danh bạ vùng trồng và gửi thông báo trực tiếp tới tài khoản hộ dân.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {open && (
        <Sheet title="Gửi hồ sơ / yêu cầu tới HTX" onClose={() => setOpen(false)}>
          <RequestForm
            plotCodes={plotCodes}
            onDone={() => {
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </Sheet>
      )}
    </div>
  );
}
