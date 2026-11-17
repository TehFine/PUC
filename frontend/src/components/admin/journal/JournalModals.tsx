"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { submitFieldRecordWithOfflineQueue } from "@/lib/offline-sync";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, requireFields, textOrNull, todayIso } from "@/components/admin/shared/form-utils";
import { MultiPhotoField, StoredMediaGallery, useMultiPhotoPicker } from "@/components/portal/shared/controls";
import { formatDate, formatDateTime } from "@/utils/format";
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
  const hasMedia = Boolean(entry.photoUrls?.length || entry.photoUrl);

  return (
    <Modal
      title={`Nhật ký canh tác: ${entry.householdName}`}
      onClose={onClose}
      width={580}
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
      <div className="admin-detail-list-card">
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Ngày thực hiện tại vườn</span>
          <div className="admin-detail-list-value">{formatDate(entry.entryOn)}</div>
        </div>
        {entry.serverRecordedAt && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Thời điểm khai báo thực tế</span>
            <div className="admin-detail-list-value">{formatDateTime(entry.serverRecordedAt)}</div>
          </div>
        )}
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Độ trễ khai báo</span>
          <div className={`admin-detail-list-value ${(entry.lateDeclarationDays ?? 0) > 0 ? "is-warn" : "is-ok"}`}>
            {(entry.lateDeclarationDays ?? 0) > 0
              ? `Khai báo chậm ${entry.lateDeclarationDays} ngày`
              : "Đúng trong ngày"}
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Hộ nông dân</span>
          <div className="admin-detail-list-value">{entry.householdName}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Mã thửa</span>
          <div className="admin-detail-list-value is-code">{entry.plotCode}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Hoạt động</span>
          <div className="admin-detail-list-value">{entry.activity}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Người ghi nhận</span>
          <div className="admin-detail-list-value">{entry.recorder}</div>
        </div>
        {(entry.latitude != null || entry.longitude != null) && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Tọa độ GPS</span>
            <div className="admin-detail-list-value" style={{ fontFamily: "var(--font-num-stack)" }}>
              {entry.latitude?.toFixed(5)}, {entry.longitude?.toFixed(5)}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
          Chi tiết công việc
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "var(--bg-input)", fontSize: 13.5 }}>
          {entry.detail || "Không có mô tả chi tiết."}
        </div>
      </div>

      {(hasMedia || entry.hasPhoto) && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Minh chứng hiện trường
          </div>
          {hasMedia ? (
            <StoredMediaGallery
              urls={entry.photoUrls}
              fallbackUrl={entry.photoUrl}
              altPrefix={`Hiện trường nhật ký ${entry.plotCode}`}
            />
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
  const [hasPhoto, setHasPhoto] = useState(Boolean(initial?.hasPhoto || initial?.photoUrl || initial?.photoUrls?.length));
  const media = useMultiPhotoPicker("journal", { maxFiles: 8, allowVideo: true });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const existingHasMedia = Boolean(initial?.photoUrls?.length || initial?.photoUrl);

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) {
      let nextPayload = payload;
      if (media.hasFiles) {
        const uploadedIds = await media.ensureUploadedAll();
        if (uploadedIds.length > 0) {
          nextPayload = {
            ...payload,
            photoIds: uploadedIds,
            photoId: uploadedIds[0],
            hasPhoto: true,
          };
        }
      }
      const updated = await api.patch<JournalRow>(`/journal/${initial.id}`, nextPayload);
      return { mode: "synced" as const, data: updated };
    }
    return submitFieldRecordWithOfflineQueue<JournalRow>({
      kind: "admin-journal",
      label: `Nhật ký ${String(payload.activity ?? "")} - Thửa ${String(payload.plotCode ?? "")}`,
      plotCode: typeof payload.plotCode === "string" ? payload.plotCode : undefined,
      endpoint: "/journal",
      payload: media.hasFiles ? { ...payload, hasPhoto: true } : payload,
      mediaGroups: media.hasFiles
        ? [
            {
              slotKey: "photos",
              purpose: "journal",
              items: media.items,
              binding: { arrayField: "photoIds", primaryField: "photoId" },
            },
          ]
        : [],
      onProgress: media.setUploadProgress,
    });
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
    const maxToday = todayIso();
    if (!errs.entryOn && entryOn > maxToday) {
      errs.entryOn = "Ngày thực hiện không được ở tương lai (chỉ ghi nhận công việc đã thực hiện).";
    }
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
    if (res.mode === "queued") {
      toast.success("Mạng hiện trường yếu: đã lưu nhật ký vào máy để tự động đồng bộ khi có sóng.");
      onClose();
      return;
    }
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
            max={todayIso()}
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

        {isEdit && existingHasMedia && !media.hasFiles && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              Minh chứng hiện trường đang gắn với bản ghi
            </div>
            <StoredMediaGallery
              urls={initial?.photoUrls}
              fallbackUrl={initial?.photoUrl}
              altPrefix={`Hiện trường thửa ${plotCode}`}
              compact
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <MultiPhotoField
            id="admin-journal-photos"
            label={isEdit && existingHasMedia ? "Cập nhật ảnh hoặc video hiện trường mới" : "Ảnh và video hiện trường vườn"}
            picker={media}
            description="Ảnh được tự động nén nhẹ và lưu trữ bền vững trong cơ sở dữ liệu."
            cameraLabel="Chụp ảnh hiện trường"
            galleryLabel="Chọn nhiều ảnh"
            videoLabel="Thêm video ngắn"
            disabled={save.pending}
          />
        </div>

        <CheckboxField
          label="Có hình ảnh xác thực hiện trường"
          checked={hasPhoto || media.hasFiles}
          onChange={setHasPhoto}
        />

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
