"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField, type Option } from "@/components/ui/form/fields";
import { isCoopStaffRole } from "@/constants/roles";
import { useMutation } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import { submitFieldRecordWithOfflineQueue } from "@/lib/offline-sync";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, requireFields, textOrNull, todayIso } from "@/components/admin/shared/form-utils";
import { MultiPhotoField, StoredMediaGallery, useMultiPhotoPicker } from "@/components/portal/shared/controls";
import { describeFieldEvidence, FieldTrustBadge } from "@/components/portal/shared/FieldEvidenceCapture";
import { buildExcelXlsxBlob, triggerBlobDownload } from "@/utils/download";
import { formatDate, formatDateTime, formatDiaryEditor } from "@/utils/format";
import {
  openPrintProgressWindow,
  renderPrintableReportAsync,
  type ReportDataPayload,
} from "@/utils/report-pdf";
import type { HouseholdRow } from "@/types/households";
import type { JournalRow } from "@/types/journal";

export function JournalDetailModal({
  entry,
  canVerify,
  onVerified,
  onClose,
  onEdit,
  onDelete,
  onExportHousehold,
}: {
  entry: JournalRow;
  canVerify?: boolean;
  onVerified?: () => void;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExportHousehold?: () => void;
}) {
  const hasMedia = Boolean(entry.photoUrls?.length || entry.photoUrl);
  const [verifying, setVerifying] = useState(false);
  const isVerified = entry.verificationStatus === "verified";
  const trustInfo = describeFieldEvidence({
    trustLevel: entry.trustLevel,
    trustFlags: entry.trustFlags,
    verificationStatus: entry.verificationStatus,
    gpsVerified: entry.gpsVerified,
    signboardQrVerified: entry.signboardQrVerified,
    offlineQueued: entry.offlineQueued,
    captureSource: entry.captureSource,
  });

  const handleToggleVerify = async () => {
    setVerifying(true);
    try {
      await api.post(`/journal/${entry.id}/verify`, { verified: !isVerified });
      toast.success(!isVerified ? "Đã xác minh bản ghi nhật ký canh tác." : "Đã chuyển về trạng thái tự khai báo.");
      onVerified?.();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể cập nhật trạng thái xác minh nhật ký."));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal
      title="Nhật ký canh tác"
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
            urls={entry.photoUrls}
            fallbackUrl={entry.photoUrl}
            altPrefix={`Hiện trường nhật ký ${entry.plotCode}`}
            eager
          />
        ) : entry.hasPhoto ? (
          <div className="admin-diary-empty-media">
            Đã xác nhận có ảnh hiện trường lưu tại hồ sơ hộ.
          </div>
        ) : (
          <div className="admin-diary-empty-media">
            Chưa đính kèm hình ảnh hoặc video hiện trường.
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="admin-diary-section-label">Chi tiết công việc</div>
        <div className="admin-diary-note-box">
          {entry.detail || "Không có mô tả chi tiết."}
        </div>
      </div>

      <div className="admin-detail-list-card" style={{ marginBottom: 0 }}>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Trạng thái kiểm chứng</span>
          <div className={`admin-detail-list-value ${isVerified ? "is-ok" : ""}`}>
            {isVerified ? (
              <>
                HTX đã xác minh
                {entry.verifiedByName ? ` (${entry.verifiedByName})` : ""}
                {entry.verifiedAt ? `, ${formatDateTime(entry.verifiedAt)}` : ""}
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
              trustLevel={entry.trustLevel}
              trustFlags={entry.trustFlags}
              verificationStatus={entry.verificationStatus}
              gpsVerified={entry.gpsVerified}
              signboardQrVerified={entry.signboardQrVerified}
              offlineQueued={entry.offlineQueued}
              captureSource={entry.captureSource}
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
          <span className="admin-detail-list-label">Người ghi ban đầu</span>
          <div className="admin-detail-list-value">{entry.recorder}</div>
        </div>
        {(entry.updatedByName || entry.updatedAt) && (
          <>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Người chỉnh sửa</span>
              <div className="admin-detail-list-value is-warn">
                {formatDiaryEditor(entry.updatedByName, entry.updatedByRole) || "Đã chỉnh sửa"}
                {(entry.editCount ?? 0) > 1 ? ` (sửa ${entry.editCount} lần)` : ""}
              </div>
            </div>
            {entry.updatedAt && (
              <div className="admin-detail-list-row">
                <span className="admin-detail-list-label">Thời điểm chỉnh sửa</span>
                <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatDateTime(entry.updatedAt)}
                </div>
              </div>
            )}
          </>
        )}
        {(entry.latitude != null || entry.longitude != null) && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Tọa độ GPS</span>
            <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
              {entry.latitude?.toFixed(5)}, {entry.longitude?.toFixed(5)}
              {entry.gpsAccuracyM != null ? ` (sai số ${Math.round(entry.gpsAccuracyM)} m)` : ""}
              {entry.gpsVerified
                ? ", khớp ranh giới thửa"
                : entry.gpsDistanceM != null
                  ? `, cách ranh giới ${Math.round(entry.gpsDistanceM)} m`
                  : ""}
            </div>
          </div>
        )}
        {entry.recordHash && (
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Mã băm niêm phong</span>
            <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
              {entry.recordHash.slice(0, 20)}...
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
      toast.success("Đã lưu nhật ký vào máy, tự gửi khi có sóng");
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
      width="clamp(620px, 50vw, 980px)"
      className="admin-diary-drawer"
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
            label={isEdit ? "Người ghi ban đầu" : "Người ghi nhận"}
            required
            value={recorder}
            onChange={setRecorder}
            disabled={isEdit}
            hint={isEdit ? "Hệ thống tự ghi nhận tài khoản của bạn là người chỉnh sửa." : undefined}
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
            label={isEdit && existingHasMedia ? "Cập nhật ảnh, video" : "Ảnh, video hiện trường"}
            picker={media}
            description="Tối đa 8 ảnh hoặc video dưới 90 giây."
            cameraLabel="Chụp ảnh"
            galleryLabel="Chọn nhiều ảnh"
            videoLabel="Thêm video"
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

function normalizePersonKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanVillageLabel(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/\s*[–—]\s*/g, ", ")
    .trim();
}

export function HouseholdLogbookExportModal({
  householdOptions,
  households,
  initialHouseholdId = "",
  onClose,
}: {
  householdOptions: Option[];
  households?: HouseholdRow[];
  initialHouseholdId?: string;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const canExportAudit = isCoopStaffRole(session?.user.role);
  const [householdId, setHouseholdId] = useState(
    initialHouseholdId || (householdOptions.length === 1 ? householdOptions[0].value : ""),
  );
  const [hhQuery, setHhQuery] = useState("");
  const [timeScope, setTimeScope] = useState<"all" | "range">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayIso());
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeInvoices, setIncludeInvoices] = useState(false);
  const [busyMode, setBusyMode] = useState<"PDF" | "EXCEL" | null>(null);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedExportOptions = useMemo<Option[]>(() => {
    if (!households || households.length === 0) {
      return householdOptions;
    }
    const qNorm = normalizePersonKey(hhQuery);
    const list = [...households]
      .sort((a, b) => {
        const aCnt = a.diaryCount ?? 0;
        const bCnt = b.diaryCount ?? 0;
        if ((aCnt > 0) !== (bCnt > 0)) return bCnt > 0 ? 1 : -1;
        if (bCnt !== aCnt) return bCnt - aCnt;
        return a.id - b.id;
      })
      .filter((h) => {
        if (!qNorm) return true;
        if (String(h.id) === householdId) return true;
        const hay = normalizePersonKey(
          `${h.name} ${h.code} ${h.plotCodesSummary ?? ""} ${h.villageName ?? ""} ${h.phone ?? ""}`,
        );
        return hay.includes(qNorm);
      });

    return list.map((h) => {
      const cnt = h.diaryCount ?? 0;
      const plotText = h.plotCodesSummary ? `, Thửa ${h.plotCodesSummary}` : "";
      const villageText = h.villageName ? `, ${cleanVillageLabel(h.villageName)}` : "";
      const countText = cnt > 0 ? `${cnt} bản ghi` : "0 bản ghi";
      return {
        value: String(h.id),
        label: `${h.name}${plotText} (${countText}) - ${h.code}${villageText}`,
      };
    });
  }, [householdOptions, households, hhQuery, householdId]);

  const selectedHousehold = useMemo(
    () => households?.find((h) => String(h.id) === householdId) ?? null,
    [households, householdId],
  );

  const sameNameAlternativeWithLogs = useMemo(() => {
    if (!selectedHousehold || !households || (selectedHousehold.diaryCount ?? 0) > 0) {
      return null;
    }
    const targetName = normalizePersonKey(selectedHousehold.name);
    return (
      households.find(
        (h) =>
          h.id !== selectedHousehold.id &&
          normalizePersonKey(h.name) === targetName &&
          (h.diaryCount ?? 0) > 0,
      ) ?? null
    );
  }, [households, selectedHousehold]);

  const effectiveFrom = timeScope === "range" ? from : "";
  const effectiveTo = timeScope === "range" ? to : "";

  const handleExport = async (mode: "PDF" | "EXCEL") => {
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }
    setError(null);
    setPhotoProgress(null);
    setBusyMode(mode);

    const docSpec = {
      title: "Sổ nhật ký hộ dân",
      docTitle: "Sổ nhật ký canh tác điện tử nông hộ (VietGAP / GACC)",
      desc: "Tổng hợp sổ nhật ký theo hộ kèm phụ lục ảnh thực địa chuẩn A4.",
    };
    const popupWin = mode === "PDF" ? openPrintProgressWindow(docSpec.docTitle) : null;

    try {
      const params = new URLSearchParams();
      params.set("format", "json");
      params.set("export", "1");
      if (canExportAudit) {
        params.set("audit", "1");
      }
      if (effectiveFrom) params.set("from", effectiveFrom);
      if (effectiveTo) params.set("to", effectiveTo);
      if (householdId) params.set("householdId", householdId);

      const wantPhotos = mode === "PDF" && Boolean(householdId) && includePhotos;
      if (wantPhotos) {
        params.set("includePhotos", "1");
        if (canExportAudit && includeInvoices) {
          params.set("includeInvoices", "1");
        }
      }

      const data = await api.get<ReportDataPayload>(
        `/reports/household-logbook?${params.toString()}`,
      );

      if (mode === "PDF") {
        const totalPhotos = data.evidencePhotos?.length ?? 0;
        if (totalPhotos > 0) {
          setPhotoProgress({ done: 0, total: totalPhotos });
        }
        await renderPrintableReportAsync(
          popupWin,
          docSpec,
          data,
          {
            from: effectiveFrom,
            to: effectiveTo,
            villageName: data.householdMeta?.villageName || "Tất cả thôn / tổ",
          },
          (done, total) => setPhotoProgress({ done, total }),
        );
        toast.success(`Đã mở bản in sổ nhật ký (${data.total} bản ghi)`);
        onClose();
      } else {
        const hhSuffix = data.householdMeta ? `-${data.householdMeta.code.toLowerCase()}` : "";
        const dateSuffix = effectiveTo || todayIso();
        const blob = buildExcelXlsxBlob(data.headers, data.rows, "Sổ nhật ký hộ dân");
        triggerBlobDownload(blob, `so-nhat-ky${hhSuffix}-${dateSuffix}.xlsx`);
        toast.success(`Đã xuất Excel sổ nhật ký (${data.total} bản ghi)`);
        onClose();
      }
    } catch (err) {
      if (popupWin && !popupWin.closed) popupWin.close();
      const msg = errorMessage(err, "Không xuất được sổ nhật ký canh tác.");
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyMode(null);
      setPhotoProgress(null);
    }
  };

  const pdfBtnLabel =
    busyMode === "PDF"
      ? photoProgress && photoProgress.total > 0
        ? `Đang chuẩn bị ảnh (${photoProgress.done}/${photoProgress.total})…`
        : "Đang tạo PDF…"
      : "Xuất sổ PDF";

  return (
    <Modal
      title="Xuất sổ nhật ký hộ dân"
      onClose={busyMode ? () => undefined : onClose}
      width={620}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busyMode !== null}>
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void handleExport("EXCEL")}
            disabled={busyMode !== null}
          >
            {busyMode === "EXCEL" ? "Đang xuất…" : "Xuất Excel"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleExport("PDF")}
            disabled={busyMode !== null}
          >
            {pdfBtnLabel}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        Xuất sổ nhật ký canh tác và phun thuốc chuẩn khổ A4 cho từng nông hộ (hoặc bảng tổng hợp toàn vùng) để kiểm tra, lưu trữ và phục vụ đoàn thẩm định.
      </p>

      {(households?.length ?? householdOptions.length) > 5 && (
        <TextField
          label="Tìm nhanh nông hộ hoặc mã thửa"
          value={hhQuery}
          onChange={(val) => {
            setHhQuery(val);
            const qNorm = normalizePersonKey(val);
            if (qNorm && households) {
              const matches = households.filter((h) =>
                normalizePersonKey(
                  `${h.name} ${h.code} ${h.plotCodesSummary ?? ""} ${h.villageName ?? ""}`,
                ).includes(qNorm),
              );
              const withLogs = matches.filter((h) => (h.diaryCount ?? 0) > 0);
              if (withLogs.length === 1) {
                setHouseholdId(String(withLogs[0].id));
              } else if (matches.length === 1) {
                setHouseholdId(String(matches[0].id));
              }
            }
          }}
          placeholder="Nhập tên hộ, mã thửa (VD: EK12-01) hoặc mã hộ..."
          disabled={busyMode !== null}
        />
      )}

      <SelectField
        label="Nông hộ cần xuất sổ"
        value={householdId}
        onChange={setHouseholdId}
        placeholder="Tất cả hộ nông dân (Bảng tổng hợp toàn vùng)"
        options={sortedExportOptions}
      />

      {selectedHousehold && (
        <div
          style={{
            marginTop: -4,
            marginBottom: 12,
            padding: "9px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: (selectedHousehold.diaryCount ?? 0) > 0 ? "#f7f9f7" : "#fdf8ee",
            color: (selectedHousehold.diaryCount ?? 0) > 0 ? "var(--ink)" : "#9a6712",
            fontSize: 12.5,
            lineHeight: 1.48,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {(selectedHousehold.diaryCount ?? 0) > 0 ? (
            <span>
              Hộ đang chọn{" "}
              <strong>
                {selectedHousehold.name}
                {selectedHousehold.plotCodesSummary ? ` (Thửa ${selectedHousehold.plotCodesSummary})` : ""}
              </strong>{" "}
              hiện có <strong>{selectedHousehold.diaryCount} bản ghi</strong> nhật ký.
            </span>
          ) : sameNameAlternativeWithLogs ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>
                Hộ <strong>{selectedHousehold.name}</strong> tại{" "}
                {selectedHousehold.plotCodesSummary
                  ? `Thửa ${selectedHousehold.plotCodesSummary} (${cleanVillageLabel(selectedHousehold.villageName)})`
                  : cleanVillageLabel(selectedHousehold.villageName)}{" "}
                chưa có nhật ký. Phát hiện hộ trùng tên tại{" "}
                <strong>
                  {sameNameAlternativeWithLogs.plotCodesSummary
                    ? `Thửa ${sameNameAlternativeWithLogs.plotCodesSummary}`
                    : sameNameAlternativeWithLogs.code}
                </strong>{" "}
                đang có <strong>{sameNameAlternativeWithLogs.diaryCount} bản ghi</strong>.
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ height: 30, padding: "0 10px", fontSize: 12 }}
                onClick={() => setHouseholdId(String(sameNameAlternativeWithLogs.id))}
              >
                Chọn hộ có {sameNameAlternativeWithLogs.diaryCount} bản ghi
              </button>
            </div>
          ) : (
            <span>
              Hộ đang chọn{" "}
              <strong>
                {selectedHousehold.name}
                {selectedHousehold.plotCodesSummary ? ` (Thửa ${selectedHousehold.plotCodesSummary})` : ""}
              </strong>{" "}
              hiện có <strong>0 bản ghi</strong> nhật ký trên hệ thống.
            </span>
          )}
        </div>
      )}

      <div className="form-group">
        <label>Phạm vi thời gian</label>
        <div className="format-btns">
          <button
            type="button"
            className={`fmt-btn ${timeScope === "all" ? "active" : ""}`}
            onClick={() => setTimeScope("all")}
            disabled={busyMode !== null}
          >
            Toàn bộ lịch sử nhật ký
          </button>
          <button
            type="button"
            className={`fmt-btn ${timeScope === "range" ? "active" : ""}`}
            onClick={() => {
              setTimeScope("range");
              if (!to) setTo(todayIso());
            }}
            disabled={busyMode !== null}
          >
            Tính đến thời điểm chỉ định
          </button>
        </div>
      </div>

      {timeScope === "range" && (
        <FormGrid>
          <TextField
            label="Từ ngày (để trống = từ đầu lịch sử)"
            type="date"
            max={to || todayIso()}
            value={from}
            onChange={setFrom}
            disabled={busyMode !== null}
          />
          <TextField
            label="Tính đến ngày"
            type="date"
            max={todayIso()}
            value={to}
            onChange={setTo}
            disabled={busyMode !== null}
          />
        </FormGrid>
      )}

      <div className="report-photo-options" style={{ marginTop: 4 }}>
        {householdId ? (
          <>
            <label className="report-photo-check">
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={(e) => setIncludePhotos(e.target.checked)}
                disabled={busyMode !== null}
              />
              <span>
                Đính kèm phụ lục hình ảnh minh chứng thực địa trên khổ giấy A4 (tự động nén tối ưu dung lượng)
              </span>
            </label>
            {canExportAudit && includePhotos && (
              <label className="report-photo-check">
                <input
                  type="checkbox"
                  checked={includeInvoices}
                  onChange={(e) => setIncludeInvoices(e.target.checked)}
                  disabled={busyMode !== null}
                />
                <span>
                  Bao gồm ảnh chứng từ, hóa đơn vật tư lưu nội bộ HTX (dành cho kiểm toán nội bộ)
                </span>
              </label>
            )}
          </>
        ) : (
          <div className="report-photo-mode-hint">
            Đang chọn tất cả hộ: tệp PDF xuất bảng tổng hợp gọn nhẹ kèm đường dẫn hồ sơ số. Chọn một nông hộ cụ thể để xuất chi tiết toàn bộ lịch sử nhật ký kèm phụ lục ảnh thực địa.
          </div>
        )}
      </div>

      <FormError message={error} />
    </Modal>
  );
}
