"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, NumberField, SelectField, TextAreaField, TextField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, numberText, parseNumber, requireFields, textOrNull, todayIso } from "@/components/admin/shared/form-utils";
import { APPROVAL_STATUS, optionsOf, PRIORITY } from "@/components/admin/shared/labels";
import { useHouseholdOptions } from "@/components/admin/shared/options";
import type { ApprovalPriority, ApprovalRow, ApprovalStatus } from "@/types/approvals";

const PRIORITY_OPTIONS = optionsOf(PRIORITY);
const STATUS_OPTIONS = optionsOf(APPROVAL_STATUS);

export default function ApprovalFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: ApprovalRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const { households, options: householdOptions } = useHouseholdOptions();

  const [code, setCode] = useState(initial?.code ?? "");
  const [householdId, setHouseholdId] = useState(initial?.householdId ? String(initial.householdId) : "");
  const [applicantName, setApplicantName] = useState(initial?.applicantName ?? "");
  const [requestType, setRequestType] = useState(initial?.requestType ?? "Cấp mã số vùng trồng");
  const [submittedOn, setSubmittedOn] = useState(dateText(initial?.submittedOn) || todayIso());
  const [priority, setPriority] = useState<ApprovalPriority>(initial?.priority ?? "medium");
  const [status, setStatus] = useState<ApprovalStatus>(initial?.status ?? "pending");
  const [docsCount, setDocsCount] = useState(numberText(initial?.docsCount ?? 1));
  const [plotCode, setPlotCode] = useState(initial?.plotCode ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<ApprovalRow>(`/approvals/${initial.id}`, payload);
    return api.post<ApprovalRow>("/approvals", payload);
  });

  const handleHouseholdChange = (val: string) => {
    setHouseholdId(val);
    const found = households.find((h) => String(h.id) === val);
    if (found && !applicantName.trim()) {
      setApplicantName(found.name);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { code, applicantName, requestType, submittedOn },
      {
        code: "mã hồ sơ",
        applicantName: "tên hộ / người nộp",
        requestType: "loại yêu cầu",
        submittedOn: "ngày nộp",
      },
    );
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      code: code.trim(),
      applicantName: applicantName.trim(),
      requestType: requestType.trim(),
      submittedOn,
      priority,
      status,
      docsCount: parseNumber(docsCount) ?? 0,
      householdId: householdId ? Number(householdId) : null,
      plotCode: textOrNull(plotCode),
      note: textOrNull(note),
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật hồ sơ." : "Đã thêm hồ sơ mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Sửa hồ sơ: ${initial?.code}` : "Thêm hồ sơ chờ duyệt"}
      onClose={save.pending ? () => undefined : onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="approval-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Thêm hồ sơ"}
          </button>
        </>
      }
    >
      <form id="approval-form" onSubmit={(e) => void submit(e)} noValidate>
        <FormGrid>
          <TextField
            label="Mã hồ sơ"
            required
            value={code}
            onChange={setCode}
            maxLength={40}
            error={fieldErrors.code}
          />
          <TextField
            label="Ngày nộp"
            required
            type="date"
            value={submittedOn}
            onChange={setSubmittedOn}
            error={fieldErrors.submittedOn}
          />
        </FormGrid>

        <SelectField
          label="Gắn với hộ nông dân (tùy chọn)"
          value={householdId}
          onChange={handleHouseholdChange}
          options={householdOptions}
          placeholder="— Không gắn hộ cụ thể —"
        />

        <FormGrid>
          <TextField
            label="Tên người nộp / Chủ hộ"
            required
            value={applicantName}
            onChange={setApplicantName}
            maxLength={100}
            error={fieldErrors.applicantName}
          />
          <TextField
            label="Loại yêu cầu"
            required
            value={requestType}
            onChange={setRequestType}
            maxLength={100}
            placeholder="Nhập mới, Cập nhật thửa, Gia hạn mã vùng…"
            error={fieldErrors.requestType}
          />
        </FormGrid>

        <FormGrid>
          <SelectField
            label="Mức ưu tiên"
            value={priority}
            onChange={(val) => setPriority(val as ApprovalPriority)}
            options={PRIORITY_OPTIONS}
          />
          <SelectField
            label="Trạng thái"
            value={status}
            onChange={(val) => setStatus(val as ApprovalStatus)}
            options={STATUS_OPTIONS}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Mã thửa (plotCode)"
            value={plotCode}
            onChange={setPlotCode}
            placeholder="VD: TH-01"
            maxLength={40}
          />
          <NumberField
            label="Số tệp tài liệu"
            value={docsCount}
            onChange={setDocsCount}
            min={0}
            step={1}
          />
        </FormGrid>

        <TextAreaField
          label="Ghi chú hồ sơ"
          value={note}
          onChange={setNote}
          rows={3}
          maxLength={2000}
          placeholder="Nội dung chi tiết của yêu cầu…"
        />

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
