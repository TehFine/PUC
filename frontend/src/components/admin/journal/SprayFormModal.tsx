"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, NumberField, SelectField, TextAreaField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import { submitFieldRecordWithOfflineQueue } from "@/lib/offline-sync";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, numberText, parseNumber, requireFields, textOrNull, todayIso } from "@/components/admin/shared/form-utils";
import { badgeOf, MRL_STATUS, optionsOf } from "@/components/admin/shared/labels";
import { MultiPhotoField, StoredMediaGallery, useMultiPhotoPicker } from "@/components/portal/shared/controls";
import { describeFieldEvidence, FieldTrustBadge } from "@/components/portal/shared/FieldEvidenceCapture";
import { formatDate, formatDateTime, formatDiaryEditor, formatDiaryRole } from "@/utils/format";
import type { PesticideDto } from "@/types/api";
import type { MrlStatus, SprayRow } from "@/types/journal";

const MRL_OPTIONS = optionsOf(MRL_STATUS);

export function SprayDetailModal({
  record,
  canVerify,
  onVerified,
  onClose,
  onEdit,
  onDelete,
  onExportHousehold,
}: {
  record: SprayRow;
  canVerify?: boolean;
  onVerified?: () => void;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExportHousehold?: () => void;
}) {
  const mrl = badgeOf(MRL_STATUS, record.mrlStatus);
  const hasMedia = Boolean(record.photoUrls?.length || record.photoUrl);
  const [verifying, setVerifying] = useState(false);
  const isVerified = record.verificationStatus === "verified";
  const trustInfo = describeFieldEvidence({
    trustLevel: record.trustLevel,
    trustFlags: record.trustFlags,
    verificationStatus: record.verificationStatus,
    gpsVerified: record.gpsVerified,
    signboardQrVerified: record.signboardQrVerified,
    offlineQueued: record.offlineQueued,
    captureSource: record.captureSource,
  });

  const handleToggleVerify = async () => {
    setVerifying(true);
    try {
      await api.post(`/spray/${record.id}/verify`, { verified: !isVerified });
      toast.success(!isVerified ? "Đã xác minh bản ghi phun thuốc." : "Đã chuyển về trạng thái tự khai báo.");
      onVerified?.();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể cập nhật trạng thái xác minh nhật ký phun thuốc."));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal
      title={`Nhật ký phun thuốc: ${record.householdName}`}
      onClose={onClose}
      width="clamp(620px, 50vw, 980px)"
      className="admin-diary-drawer"
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={verifying}>
              Xóa
            </button>
          )}
          {onEdit && (
            <button type="button" className="btn btn-outline" onClick={onEdit} disabled={verifying}>
              Sửa
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div className="admin-diary-media-lead">
        <div className="admin-diary-section-label">Minh chứng hiện trường</div>
        {hasMedia ? (
          <StoredMediaGallery
            urls={record.photoUrls}
            fallbackUrl={record.photoUrl}
            altPrefix={`Hiện trường phun thuốc ${record.pesticideName}`}
            eager
          />
        ) : (
          <div className="admin-diary-empty-media">
            Chưa đính kèm hình ảnh hoặc video hiện trường.
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="admin-diary-section-label">Nguồn gốc vật tư và ghi chú</div>
        <div className="admin-diary-note-box">
          <div>{record.source ? `Đại lý cung cấp: ${record.source}` : "Chưa ghi nhận đại lý cung cấp."}</div>
          {record.note && <div style={{ marginTop: 6 }}>Ghi chú: {record.note}</div>}
        </div>
      </div>

      <div className="admin-detail-list-card" style={{ marginBottom: 0 }}>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Trạng thái kiểm chứng</span>
          <div className={`admin-detail-list-value ${isVerified ? "is-ok" : ""}`}>
            {isVerified ? (
              <>
                HTX đã xác minh
                {record.verifiedByName ? ` (${record.verifiedByName})` : ""}
                {record.verifiedAt ? `, ${formatDateTime(record.verifiedAt)}` : ""}
              </>
            ) : (
              "Nông hộ tự khai báo (chờ HTX xác minh)"
            )}
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Mức tin cậy thực địa</span>
          <div className="admin-detail-list-value">
            <FieldTrustBadge
              trustLevel={record.trustLevel}
              trustFlags={record.trustFlags}
              verificationStatus={record.verificationStatus}
              gpsVerified={record.gpsVerified}
              signboardQrVerified={record.signboardQrVerified}
              offlineQueued={record.offlineQueued}
              captureSource={record.captureSource}
            />
          </div>
        </div>
        {trustInfo.evidenceNotes.length > 0 && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Bằng chứng đối chiếu</span>
            <div className="admin-detail-list-value">{trustInfo.evidenceNotes.join(", ")}</div>
          </div>
        )}
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Ngày phun tại vườn</span>
          <div className="admin-detail-list-value">{formatDate(record.sprayedOn)}</div>
        </div>
        {record.serverRecordedAt && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Thời điểm khai báo thực tế</span>
            <div className="admin-detail-list-value">{formatDateTime(record.serverRecordedAt)}</div>
          </div>
        )}
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Độ trễ khai báo</span>
          <div className={`admin-detail-list-value ${(record.lateDeclarationDays ?? 0) > 0 ? "is-warn" : "is-ok"}`}>
            {(record.lateDeclarationDays ?? 0) > 0
              ? `Khai báo chậm ${record.lateDeclarationDays} ngày`
              : "Đúng trong ngày"}
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Hộ nông dân</span>
          <div className="admin-detail-list-value">{record.householdName}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Mã thửa</span>
          <div className="admin-detail-list-value is-code">{record.plotCode || "Toàn vườn"}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Loại thuốc BVTV</span>
          <div className="admin-detail-list-value">{record.pesticideName}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Liều lượng pha phun</span>
          <div className="admin-detail-list-value">{record.dose}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Diện tích phun</span>
          <div className="admin-detail-list-value">{record.areaHa} ha</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Thời gian cách ly (PHI)</span>
          <div className="admin-detail-list-value is-warn">{record.isolationDays ?? 0} ngày</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Trạng thái dư lượng</span>
          <div className="admin-detail-list-value">
            <span className={`badge ${mrl.badge}`}>{mrl.label}</span>
          </div>
        </div>
        {record.recordedByRole && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Người ghi ban đầu</span>
            <div className="admin-detail-list-value">{formatDiaryRole(record.recordedByRole) || record.recordedByRole}</div>
          </div>
        )}
        {(record.updatedByName || record.updatedAt) && (
          <>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Người chỉnh sửa</span>
              <div className="admin-detail-list-value is-warn">
                {formatDiaryEditor(record.updatedByName, record.updatedByRole) || "Đã chỉnh sửa"}
                {(record.editCount ?? 0) > 1 ? ` (sửa ${record.editCount} lần)` : ""}
              </div>
            </div>
            {record.updatedAt && (
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Thời điểm chỉnh sửa</span>
                <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatDateTime(record.updatedAt)}
                </div>
              </div>
            )}
          </>
        )}
        {(record.latitude != null || record.longitude != null) && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Tọa độ GPS</span>
            <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
              {record.latitude?.toFixed(5)}, {record.longitude?.toFixed(5)}
              {record.gpsAccuracyM != null ? ` (sai số ${Math.round(record.gpsAccuracyM)} m)` : ""}
              {record.gpsVerified
                ? ", khớp ranh giới thửa"
                : record.gpsDistanceM != null
                  ? `, cách ranh giới ${Math.round(record.gpsDistanceM)} m`
                  : ""}
            </div>
          </div>
        )}
        {record.recordHash && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Mã băm niêm phong</span>
            <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
              {record.recordHash.slice(0, 20)}...
            </div>
          </div>
        )}
      </div>

      {(canVerify || onExportHousehold) && (
        <div className="diary-detail-sec-actions">
          {canVerify && (
            <button
              type="button"
              className={`btn ${isVerified ? "btn-outline" : "btn-primary"} account-detail-sec-btn`}
              onClick={() => void handleToggleVerify()}
              disabled={verifying}
            >
              {verifying ? "Đang lưu…" : isVerified ? "Bỏ xác nhận" : "Xác nhận"}
            </button>
          )}
          {onExportHousehold && (
            <button
              type="button"
              className="btn btn-outline account-detail-sec-btn"
              onClick={onExportHousehold}
              disabled={verifying}
            >
              Xuất sổ PDF
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function SprayFormModal({
  initial,
  householdOptions,
  pesticides,
  pesticideOptions,
  onClose,
  onSaved,
}: {
  initial?: SprayRow | null;
  householdOptions: Option[];
  pesticides: PesticideDto[];
  pesticideOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [sprayedOn, setSprayedOn] = useState(dateText(initial?.sprayedOn) || todayIso());
  const [householdId, setHouseholdId] = useState(
    initial?.householdId ? String(initial.householdId) : (householdOptions[0]?.value ?? ""),
  );
  const [pesticideId, setPesticideId] = useState(
    initial?.pesticideId ? String(initial.pesticideId) : (pesticideOptions[0]?.value ?? ""),
  );
  const [plotCode, setPlotCode] = useState(initial?.plotCode ?? "");
  const [source, setSource] = useState(initial?.source ?? "Cửa hàng VTNN hợp chuẩn HTX");
  const [dose, setDose] = useState(initial?.dose ?? "20 ml / bình 25L");
  const [areaHa, setAreaHa] = useState(numberText(initial?.areaHa ?? 0.5));
  const [isolationDays, setIsolationDays] = useState(numberText(initial?.isolationDays ?? 14));
  const [mrlStatus, setMrlStatus] = useState<MrlStatus>(initial?.mrlStatus ?? "pass");
  const [note, setNote] = useState(initial?.note ?? "");
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
          };
        }
      }
      const updated = await api.patch<SprayRow>(`/spray/${initial.id}`, nextPayload);
      return { mode: "synced" as const, data: updated };
    }
    return submitFieldRecordWithOfflineQueue<SprayRow>({
      kind: "admin-journal",
      label: `Nhật ký phun thuốc${plotCode.trim() ? ` - Thửa ${plotCode.trim()}` : ""}`,
      plotCode: plotCode.trim() || undefined,
      endpoint: "/spray",
      payload,
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

  const handlePesticideChange = (val: string) => {
    setPesticideId(val);
    const found = pesticides.find((p) => String(p.id) === val);
    if (found && found.isolationDays != null) {
      setIsolationDays(String(found.isolationDays));
    }
    if (found && found.status === "banned") {
      setMrlStatus("exceeded");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { sprayedOn, householdId, pesticideId, dose, areaHa },
      {
        sprayedOn: "ngày phun",
        householdId: "hộ nông dân",
        pesticideId: "loại thuốc BVTV",
        dose: "liều lượng",
        areaHa: "diện tích phun",
      },
    );
    const parsedArea = parseNumber(areaHa);
    if (areaHa.trim() && (parsedArea === undefined || parsedArea < 0)) {
      errs.areaHa = "Diện tích phải là số không âm.";
    }
    const maxToday = todayIso();
    if (!errs.sprayedOn && sprayedOn > maxToday) {
      errs.sprayedOn = "Ngày phun thuốc không được ở tương lai (chỉ ghi nhận sau khi đã phun thực tế).";
    }
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      sprayedOn,
      householdId: Number(householdId),
      pesticideId: Number(pesticideId),
      plotCode: textOrNull(plotCode),
      source: textOrNull(source),
      dose: dose.trim(),
      areaHa: parsedArea ?? 0,
      isolationDays: parseNumber(isolationDays) ?? 0,
      mrlStatus,
      note: textOrNull(note),
    };

    const res = await save.run(payload);
    if (!res) return;
    if (res.mode === "queued") {
      toast.success("Đã lưu phun thuốc vào máy, tự gửi khi có sóng");
      onClose();
      return;
    }
    toast.success(isEdit ? "Đã cập nhật nhật ký phun thuốc." : "Đã thêm nhật ký phun thuốc.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Sửa nhật ký phun thuốc" : "Ghi nhật ký phun thuốc"}
      onClose={save.pending ? () => undefined : onClose}
      width="clamp(620px, 50vw, 980px)"
      className="admin-diary-drawer"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="spray-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lưu bản ghi"}
          </button>
        </>
      }
    >
      <form id="spray-form" onSubmit={(e) => void submit(e)} noValidate>
        <FormGrid>
          <SelectField
            label="Hộ nông dân"
            required
            value={householdId}
            onChange={setHouseholdId}
            options={householdOptions}
            placeholder="Chọn hộ"
            error={fieldErrors.householdId}
          />
          <TextField
            label="Mã thửa (plotCode)"
            value={plotCode}
            onChange={setPlotCode}
            placeholder="VD: TH-01"
            maxLength={40}
          />
        </FormGrid>

        <SelectField
          label="Thuốc BVTV sử dụng"
          required
          value={pesticideId}
          onChange={handlePesticideChange}
          options={pesticideOptions}
          placeholder="Chọn thuốc BVTV"
          error={fieldErrors.pesticideId}
        />

        <FormGrid>
          <TextField
            label="Ngày phun"
            required
            type="date"
            max={todayIso()}
            value={sprayedOn}
            onChange={setSprayedOn}
            error={fieldErrors.sprayedOn}
          />
          <TextField
            label="Liều lượng pha / phun"
            required
            value={dose}
            onChange={setDose}
            placeholder="20 ml / bình 25L"
            maxLength={100}
            error={fieldErrors.dose}
          />
        </FormGrid>

        <FormGrid>
          <NumberField
            label="Diện tích phun (ha)"
            required
            value={areaHa}
            onChange={setAreaHa}
            min={0}
            step={0.01}
            error={fieldErrors.areaHa}
          />
          <NumberField
            label="Số ngày cách ly (PHI)"
            value={isolationDays}
            onChange={setIsolationDays}
            min={0}
            step={1}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Nguồn gốc vật tư"
            value={source}
            onChange={setSource}
            maxLength={200}
          />
          <SelectField
            label="Trạng thái dư lượng (MRL)"
            value={mrlStatus}
            onChange={(val) => setMrlStatus(val as MrlStatus)}
            options={MRL_OPTIONS}
          />
        </FormGrid>

        <TextAreaField
          label="Ghi chú tình trạng sâu bệnh"
          value={note}
          onChange={setNote}
          rows={2}
          maxLength={500}
          placeholder="Ghi chú thêm về đối tượng sâu bệnh hoặc điều kiện thời tiết khi phun…"
        />

        {isEdit && existingHasMedia && !media.hasFiles && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              Minh chứng hiện trường đang gắn với bản ghi
            </div>
            <StoredMediaGallery
              urls={initial?.photoUrls}
              fallbackUrl={initial?.photoUrl}
              altPrefix={`Hiện trường phun thuốc ${initial?.pesticideName ?? ""}`}
              compact
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <MultiPhotoField
            id="admin-spray-photos"
            label={isEdit && existingHasMedia ? "Cập nhật ảnh, video" : "Ảnh phun thuốc, nhãn thuốc"}
            picker={media}
            description="Tối đa 8 ảnh hoặc video dưới 90 giây."
            cameraLabel="Chụp ảnh"
            galleryLabel="Chọn nhiều ảnh"
            videoLabel="Thêm video"
            disabled={save.pending}
          />
        </div>

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
