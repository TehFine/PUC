"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { CheckboxField, FormGrid, NumberField, TextAreaField, TextField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import {
  dateText,
  hasErrors,
  isTime,
  numberText,
  parseNumber,
  requireFields,
  textOrNull,
  timeText,
  todayIso,
} from "@/components/admin/shared/form-utils";
import type { TrainingCourseRecord } from "@/types/training";

export default function TrainingFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: TrainingCourseRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [heldOn, setHeldOn] = useState(dateText(initial?.heldOn) || todayIso());
  const [startsAt, setStartsAt] = useState(timeText(initial?.startsAt) || "08:00");
  const [endsAt, setEndsAt] = useState(timeText(initial?.endsAt) || "11:30");
  const [location, setLocation] = useState(initial?.location ?? "Hội trường HTX Cư Né");
  const [trainer, setTrainer] = useState(initial?.trainer ?? "");
  const [capacity, setCapacity] = useState(numberText(initial?.capacity ?? 60));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [completed, setCompleted] = useState(Boolean(initial?.completed));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<TrainingCourseRecord>(`/training/${initial.id}`, payload);
    return api.post<TrainingCourseRecord>("/training", payload);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs: Record<string, string | undefined> = requireFields(
      { title, capacity },
      { title: "tiêu đề khóa tập huấn", capacity: "sức chứa tối đa" },
    );
    const parsedCap = parseNumber(capacity);
    if (capacity.trim() && (parsedCap === undefined || parsedCap <= 0 || !Number.isInteger(parsedCap))) {
      errs.capacity = "Sức chứa phải là số nguyên dương.";
    }
    if (startsAt.trim() && !isTime(startsAt.trim())) {
      errs.startsAt = "Giờ bắt đầu phải theo định dạng HH:MM.";
    }
    if (endsAt.trim() && !isTime(endsAt.trim())) {
      errs.endsAt = "Giờ kết thúc phải theo định dạng HH:MM.";
    }
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      title: title.trim(),
      heldOn: textOrNull(heldOn),
      startsAt: textOrNull(startsAt),
      endsAt: textOrNull(endsAt),
      location: textOrNull(location),
      trainer: textOrNull(trainer),
      capacity: parsedCap ?? 60,
      description: textOrNull(description),
      completed,
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật khóa tập huấn." : "Đã tạo khóa tập huấn mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Sửa khóa tập huấn" : "Tạo khóa tập huấn"}
      onClose={save.pending ? () => undefined : onClose}
      width={580}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="training-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo khóa tập huấn"}
          </button>
        </>
      }
    >
      <form id="training-form" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label="Tên khóa tập huấn"
          required
          value={title}
          onChange={setTitle}
          placeholder="VD: Quy trình canh tác sầu riêng theo chuẩn VietGAP & GACC"
          maxLength={200}
          error={fieldErrors.title}
        />

        <FormGrid>
          <TextField label="Ngày tổ chức" type="date" value={heldOn} onChange={setHeldOn} />
          <NumberField
            label="Sức chứa tối đa (học viên)"
            required
            value={capacity}
            onChange={setCapacity}
            min={1}
            step={1}
            error={fieldErrors.capacity}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Giờ bắt đầu"
            type="time"
            value={startsAt}
            onChange={setStartsAt}
            error={fieldErrors.startsAt}
          />
          <TextField
            label="Giờ kết thúc"
            type="time"
            value={endsAt}
            onChange={setEndsAt}
            error={fieldErrors.endsAt}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Địa điểm tổ chức"
            value={location}
            onChange={setLocation}
            placeholder="Hội trường HTX Cư Né"
            maxLength={200}
          />
          <TextField
            label="Giảng viên / Báo cáo viên"
            value={trainer}
            onChange={setTrainer}
            placeholder="TS. Nguyễn Văn Hòa"
            maxLength={100}
          />
        </FormGrid>

        <TextAreaField
          label="Mô tả nội dung khóa học"
          value={description}
          onChange={setDescription}
          rows={3}
          maxLength={2000}
          placeholder="Chuyên đề đào tạo, tài liệu chuẩn bị, điều kiện cấp chứng nhận…"
        />

        <CheckboxField label="Đánh dấu khóa học đã hoàn thành" checked={completed} onChange={setCompleted} />

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
