"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, requireFields, textOrNull, todayIso } from "@/components/admin/shared/form-utils";
import { formatDate } from "@/utils/format";
import type { JournalRow } from "@/types/journal";

export function JournalDetailModal({
  entry,
  onClose,
  onEdit,
}: {
  entry: JournalRow;
  onClose: () => void;
  onEdit?: () => void;
}) {
  return (
    <Modal
      title={`Nhật ký canh tác – ${entry.householdName}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          {onEdit && (
            <button type="button" className="btn btn-outline" onClick={onEdit}>
              Sửa nhật ký
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          padding: 16,
          borderRadius: 16,
          background: "var(--mist)",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Ngày thực hiện</div>
          <div style={{ fontWeight: 600 }}>{formatDate(entry.entryOn)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Hộ nông dân</div>
          <div style={{ fontWeight: 600 }}>{entry.householdName}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Mã thửa</div>
          <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#256b45" }}>{entry.plotCode}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Hoạt động</div>
          <div style={{ fontWeight: 600 }}>{entry.activity}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Người ghi nhận</div>
          <div style={{ fontWeight: 600 }}>{entry.recorder}</div>
        </div>
        {(entry.latitude != null || entry.longitude != null) && (
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Tọa độ GPS</div>
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>
              {entry.latitude?.toFixed(5)}, {entry.longitude?.toFixed(5)}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
          Chi tiết công việc
        </div>
        <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--bg-input)", fontSize: 13.5 }}>
          {entry.detail || "Không có mô tả chi tiết."}
        </div>
      </div>

      {(entry.photoUrl || entry.hasPhoto) && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Hình ảnh thực địa
          </div>
          {entry.photoUrl && /^(\/api\/uploads\/\d+|\/[A-Za-z0-9._/-]+|https?:\/\/)/i.test(entry.photoUrl) ? (
            <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.photoUrl}
                alt={`Ảnh nhật ký ${entry.plotCode}`}
                style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }}
              />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Đã xác nhận có ảnh hiện trường lưu tại hồ sơ hộ.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function JournalFormModal({
  initial,
  householdOptions,
  onClose,
  onSaved,
}: {
  initial?: JournalRow | null;
  householdOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const isEdit = Boolean(initial);
  const [entryOn, setEntryOn] = useState(dateText(initial?.entryOn) || todayIso());
  const [householdId, setHouseholdId] = useState(
    initial?.householdId ? String(initial.householdId) : (householdOptions[0]?.value ?? ""),
  );
  const [plotCode, setPlotCode] = useState(initial?.plotCode ?? "");
  const [activity, setActivity] = useState(initial?.activity ?? "Bón phân hữu cơ");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [recorder, setRecorder] = useState(initial?.recorder ?? session?.user.fullName ?? "Cán bộ HTX");
  const [hasPhoto, setHasPhoto] = useState(Boolean(initial?.hasPhoto || initial?.photoUrl));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<JournalRow>(`/journal/${initial.id}`, payload);
    return api.post<JournalRow>("/journal", payload);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { entryOn, householdId, plotCode, activity, recorder },
      {
        entryOn: "ngày thực hiện",
        householdId: "hộ nông dân",
        plotCode: "mã thửa",
        activity: "hoạt động canh tác",
        recorder: "người ghi nhận",
      },
    );
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      entryOn,
      householdId: Number(householdId),
      plotCode: plotCode.trim(),
      activity: activity.trim(),
      detail: textOrNull(detail),
      recorder: recorder.trim(),
      hasPhoto,
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật nhật ký canh tác." : "Đã ghi nhật ký canh tác mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Sửa nhật ký canh tác" : "Ghi nhật ký canh tác"}
      onClose={save.pending ? () => undefined : onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="journal-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lưu nhật ký"}
          </button>
        </>
      }
    >
      <form id="journal-form" onSubmit={(e) => void submit(e)} noValidate>
        <SelectField
          label="Hộ nông dân"
          required
          value={householdId}
          onChange={setHouseholdId}
          options={householdOptions}
          placeholder="Chọn hộ nông dân"
          error={fieldErrors.householdId}
        />

        <FormGrid>
          <TextField
            label="Ngày thực hiện"
            required
            type="date"
            value={entryOn}
            onChange={setEntryOn}
            error={fieldErrors.entryOn}
          />
          <TextField
            label="Mã thửa (plotCode)"
            required
            value={plotCode}
            onChange={setPlotCode}
            placeholder="VD: TH-01"
            maxLength={40}
            error={fieldErrors.plotCode}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Hoạt động canh tác"
            required
            value={activity}
            onChange={setActivity}
            placeholder="Bón phân, Tỉa cành, Tưới nước…"
            maxLength={100}
            error={fieldErrors.activity}
          />
          <TextField
            label="Người ghi nhận"
            required
            value={recorder}
            onChange={setRecorder}
            maxLength={100}
            error={fieldErrors.recorder}
          />
        </FormGrid>

        <TextAreaField
          label="Chi tiết công việc"
          value={detail}
          onChange={setDetail}
          rows={3}
          maxLength={500}
          placeholder="Liều lượng, quy cách thực hiện, tình trạng cây trồng…"
        />

        <CheckboxField label="Có hình ảnh xác thực hiện trường" checked={hasPhoto} onChange={setHasPhoto} />

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
