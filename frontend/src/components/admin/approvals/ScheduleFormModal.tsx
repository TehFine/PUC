"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, NumberField, SelectField, TextField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, numberText, parseNumber, requireFields, todayIso } from "@/components/admin/shared/form-utils";
import { optionsOf, SCHEDULE_KIND } from "@/components/admin/shared/labels";
import type { ScheduleKind, ScheduleRow } from "@/types/approvals";

const KIND_OPTIONS = optionsOf(SCHEDULE_KIND);

export default function ScheduleFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: ScheduleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [scheduledOn, setScheduledOn] = useState(dateText(initial?.scheduledOn) || todayIso());
  const [title, setTitle] = useState(initial?.title ?? "");
  const [officer, setOfficer] = useState(initial?.officer ?? "");
  const [plotCount, setPlotCount] = useState(numberText(initial?.plotCount ?? 5));
  const [kind, setKind] = useState<ScheduleKind>(initial?.kind ?? "periodic");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<ScheduleRow>(`/schedule/${initial.id}`, payload);
    return api.post<ScheduleRow>("/schedule", payload);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { scheduledOn, title, officer },
      {
        scheduledOn: "ngày kiểm tra",
        title: "tiêu đề lịch kiểm tra",
        officer: "cán bộ phụ trách",
      },
    );
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload = {
      scheduledOn,
      title: title.trim(),
      officer: officer.trim(),
      plotCount: parseNumber(plotCount) ?? 0,
      kind,
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật lịch kiểm tra." : "Đã lên lịch kiểm tra mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Sửa lịch kiểm tra" : "Lên lịch kiểm tra"}
      onClose={save.pending ? () => undefined : onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="schedule-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lên lịch"}
          </button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label="Tiêu đề đợt kiểm tra"
          required
          value={title}
          onChange={setTitle}
          placeholder="VD: Kiểm tra định kỳ Thôn 1 – Đợt 2"
          maxLength={200}
          error={fieldErrors.title}
        />

        <FormGrid>
          <TextField
            label="Ngày thực hiện"
            required
            type="date"
            value={scheduledOn}
            onChange={setScheduledOn}
            error={fieldErrors.scheduledOn}
          />
          <SelectField
            label="Hình thức kiểm tra"
            value={kind}
            onChange={(val) => setKind(val as ScheduleKind)}
            options={KIND_OPTIONS}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Cán bộ kiểm tra"
            required
            value={officer}
            onChange={setOfficer}
            placeholder="KS. Trần Quốc Bảo"
            maxLength={100}
            error={fieldErrors.officer}
          />
          <NumberField
            label="Số thửa dự kiến kiểm tra"
            value={plotCount}
            onChange={setPlotCount}
            min={0}
            step={1}
          />
        </FormGrid>

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
