"use client";

import { useState } from "react";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import { submitFieldRecordWithOfflineQueue } from "@/lib/offline-sync";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, requireFields, todayIso } from "@/components/admin/shared/form-utils";
import { badgeOf, MINUTE_RESULT, optionsOf } from "@/components/admin/shared/labels";
import {
  MultiPhotoField,
  StoredMediaGallery,
  useMultiPhotoPicker,
} from "@/components/portal/shared/controls";
import { formatDate } from "@/utils/format";
import type { MinuteResult, MinuteRow } from "@/types/approvals";

const RESULT_OPTIONS = optionsOf(MINUTE_RESULT);

function diffDaysFromToday(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return 0;
  const targetUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = todayIso();
  const tm = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!tm) return 0;
  const nowUtc = Date.UTC(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]));
  return Math.round((nowUtc - targetUtc) / (24 * 60 * 60 * 1000));
}

function extractInitialMediaItems(initial?: MinuteRow | null): Array<{ id: number; url: string }> {
  if (!initial) return [];
  const ids =
    initial.photoIds && initial.photoIds.length > 0
      ? initial.photoIds
      : initial.photoId
        ? [initial.photoId]
        : [];
  const urls =
    initial.photoUrls && initial.photoUrls.length > 0
      ? initial.photoUrls
      : initial.photoUrl
        ? [initial.photoUrl]
        : [];
  const out: Array<{ id: number; url: string }> = [];
  for (let i = 0; i < Math.min(ids.length, urls.length); i += 1) {
    if (ids[i] && urls[i]) {
      out.push({ id: Number(ids[i]), url: urls[i] });
    }
  }
  return out;
}

export function MinuteDetailModal({
  minute,
  onClose,
  onEdit,
}: {
  minute: MinuteRow;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const resBadge = badgeOf(MINUTE_RESULT, minute.result);
  const hasCoords = typeof minute.latitude === "number" && typeof minute.longitude === "number";
  const hasMedia = Boolean(minute.photoUrls?.length || minute.photoUrl);

  return (
    <Modal
      title={`Biên bản kiểm tra: ${minute.code}`}
      onClose={onClose}
      width={580}
      footer={
        <>
          {onEdit && (
            <button type="button" className="btn btn-outline" onClick={onEdit}>
              Sửa biên bản
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div className="admin-detail-list-card" style={{ marginBottom: 0 }}>
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Số biên bản</span>
            <div className="admin-detail-list-value is-code">{minute.code}</div>
          </div>
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Ngày kiểm tra</span>
            <div className="admin-detail-list-value">{formatDate(minute.heldOn)}</div>
          </div>
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Địa điểm và phạm vi</span>
            <div className="admin-detail-list-value">{minute.location}</div>
          </div>
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Thửa vườn kiểm tra</span>
            <div className="admin-detail-list-value is-code">{minute.plotCode || "Toàn vùng"}</div>
          </div>
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Cán bộ kiểm tra</span>
            <div className="admin-detail-list-value">{minute.officer}</div>
          </div>
          <div className="admin-detail-list-row">
            <span className="admin-detail-list-label">Kết luận</span>
            <div className="admin-detail-list-value">
              <span className={`badge ${resBadge.badge}`}>{resBadge.label}</span>
              {minute.isLateEntry ? (
                <span className="badge badge-gold">Ghi nhận bổ sung (&gt;48h)</span>
              ) : (
                <span className="badge badge-green">Đúng hạn thời gian thực</span>
              )}
            </div>
          </div>
        </div>

        {hasCoords && (
          <div style={{ padding: "8px 10px", background: "#ffffff", border: "1px solid #d4d4d2", borderRadius: 6 }}>
            <div style={{ fontSize: 11.5, color: "#14532d", fontWeight: 700 }}>
              Tọa độ GPS hiện trường:{" "}
              <span style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}>
                {Number(minute.latitude).toFixed(5)}, {Number(minute.longitude).toFixed(5)}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: minute.gpsVerified ? "#166534" : "#64748b", marginTop: 2 }}>
              {minute.gpsVerified
                ? "Đã xác thực khớp ranh giới GIS thửa đất đăng ký"
                : minute.gpsDistanceM != null
                  ? `Cách ranh giới thửa khoảng ${Math.round(minute.gpsDistanceM)} m`
                  : "Đã lưu tọa độ định vị thực địa"}
            </div>
          </div>
        )}

        {hasMedia && (
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6 }}>
              Minh chứng hiện trường kiểm tra
            </div>
            <StoredMediaGallery
              urls={minute.photoUrls}
              fallbackUrl={minute.photoUrl}
              altPrefix={`Hiện trường kiểm tra ${minute.code}`}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function MinuteFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: MinuteRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [code, setCode] = useState(initial?.code ?? "");
  const [heldOn, setHeldOn] = useState(dateText(initial?.heldOn) || todayIso());
  const [location, setLocation] = useState(initial?.location ?? "");
  const [plotCode, setPlotCode] = useState(initial?.plotCode ?? "");
  const [officer, setOfficer] = useState(initial?.officer ?? "");
  const [result, setResult] = useState<MinuteResult>(initial?.result ?? "pass");
  const [lateReason, setLateReason] = useState(initial?.lateReason ?? "");
  const media = useMultiPhotoPicker("inspection", {
    maxFiles: 8,
    allowVideo: true,
    initialItems: extractInitialMediaItems(initial),
  });
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(initial?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initial?.longitude ?? null);
  const [locating, setLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const isBackdatedOver48h = diffDaysFromToday(heldOn) > 2;
  const busy = uploadingMedia;

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<MinuteRow>(`/minutes/${initial.id}`, payload);
    return api.post<MinuteRow>("/minutes", payload);
  });

  const handleCaptureGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("Trình duyệt không hỗ trợ định vị GPS.");
      return;
    }
    setLocating(true);
    setGpsStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        setGpsStatus(`Đã định vị: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setGpsStatus("Không lấy được tọa độ GPS từ thiết bị.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { code, heldOn, location, officer },
      {
        code: "số biên bản",
        heldOn: "ngày kiểm tra",
        location: "địa điểm và phạm vi",
        officer: "cán bộ kiểm tra",
      },
    );
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    setUploadError(null);
    if (!isEdit) {
      setUploadingMedia(true);
      try {
        const basePayload: Record<string, unknown> = {
          code: code.trim(),
          heldOn,
          location: location.trim(),
          plotCode: plotCode.trim() || null,
          officer: officer.trim(),
          result,
          latitude,
          longitude,
          lateReason: lateReason.trim() || null,
        };
        const outcome = await submitFieldRecordWithOfflineQueue<MinuteRow>({
          kind: "admin-minute",
          label: `Biên bản kiểm tra ${code.trim()}`,
          plotCode: plotCode.trim() || undefined,
          endpoint: "/minutes",
          payload: basePayload,
          mediaGroups: media.hasFiles
            ? [
                {
                  slotKey: "photos",
                  purpose: "inspection",
                  items: media.items,
                  binding: { arrayField: "photoIds", primaryField: "photoId" },
                },
              ]
            : [],
          onProgress: media.setUploadProgress,
        });
        setUploadingMedia(false);
        if (outcome.mode === "queued") {
          toast.success("Mạng hiện trường yếu: đã lưu biên bản kèm ảnh vào máy để tự động đồng bộ khi có sóng.");
          onClose();
          return;
        }
        toast.success("Đã tạo biên bản kiểm tra mới.");
        notifyCountsChanged();
        onSaved();
        onClose();
        return;
      } catch (err) {
        setUploadingMedia(false);
        setUploadError(errorMessage(err, "Không thể lưu biên bản kiểm tra hiện trường."));
        return;
      }
    }

    setUploadingMedia(true);
    let photoIds: number[] = [];
    try {
      photoIds = media.hasFiles ? await media.ensureUploadedAll() : [];
    } catch (err) {
      setUploadError(errorMessage(err, "Không thể tải ảnh hoặc video hiện trường lên máy chủ."));
      setUploadingMedia(false);
      return;
    }
    setUploadingMedia(false);

    const payload: Record<string, unknown> = {
      code: code.trim(),
      heldOn,
      location: location.trim(),
      plotCode: plotCode.trim() || null,
      officer: officer.trim(),
      result,
      photoId: photoIds[0] ?? null,
      photoIds,
      latitude,
      longitude,
      lateReason: lateReason.trim() || null,
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật biên bản kiểm tra." : "Đã tạo biên bản kiểm tra mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Sửa biên bản: ${initial?.code}` : "Tạo biên bản kiểm tra thực địa"}
      onClose={save.pending || busy ? () => undefined : onClose}
      width={600}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending || busy}>
            Hủy
          </button>
          <button type="submit" form="minute-form" className="btn btn-primary" disabled={save.pending || busy}>
            {busy ? "Đang nén và tải tệp..." : save.pending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Tạo biên bản"}
          </button>
        </>
      }
    >
      <form id="minute-form" onSubmit={(e) => void submit(e)} noValidate>
        <FormGrid>
          <TextField
            label="Số biên bản"
            required
            value={code}
            onChange={setCode}
            maxLength={40}
            error={fieldErrors.code}
          />
          <TextField
            label="Ngày kiểm tra"
            required
            type="date"
            value={heldOn}
            onChange={setHeldOn}
            error={fieldErrors.heldOn}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Địa điểm và phạm vi"
            required
            value={location}
            onChange={setLocation}
            placeholder="Ví dụ: Thôn 2, 12 hộ vùng trồng xuất khẩu"
            maxLength={200}
            error={fieldErrors.location}
          />
          <TextField
            label="Mã thửa kiểm tra"
            value={plotCode}
            onChange={setPlotCode}
            placeholder="Ví dụ: CN-T1-01"
            maxLength={40}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Cán bộ kiểm tra"
            required
            value={officer}
            onChange={setOfficer}
            placeholder="Ví dụ: KS. Trần Quốc Bảo"
            maxLength={100}
            error={fieldErrors.officer}
          />
          <SelectField
            label="Kết quả đánh giá"
            value={result}
            onChange={(val) => setResult(val as MinuteResult)}
            options={RESULT_OPTIONS}
          />
        </FormGrid>

        {isBackdatedOver48h && (
          <TextField
            label="Lý do nhập biên bản sau 48 giờ"
            value={lateReason}
            onChange={setLateReason}
            placeholder="Ví dụ: Nhập lại từ biên bản giấy do vùng sâu mất sóng di động"
            maxLength={250}
          />
        )}

        <div
          style={{
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#14372f", lineHeight: 1.35 }}>
              Tọa độ GPS
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: latitude !== null && longitude !== null ? "#15803d" : "#5f6d66",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {latitude !== null && longitude !== null
                ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                : gpsStatus || "Chưa định vị"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCaptureGps}
            disabled={locating || save.pending || busy}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              border: "none",
              background: "#e6f0ec",
              color: "#14372f",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: locating || save.pending || busy ? "not-allowed" : "pointer",
              opacity: locating || save.pending || busy ? 0.6 : 1,
            }}
          >
            {locating ? "Đang lấy GPS..." : latitude !== null ? "Cập nhật GPS" : "Lấy tọa độ GPS"}
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <MultiPhotoField
            id="minute-field-photos"
            label="Ảnh, video hiện trường"
            picker={media}
            description="Tối đa 8 ảnh hoặc video dưới 90 giây."
            cameraLabel="Chụp ảnh"
            galleryLabel="Chọn nhiều ảnh"
            videoLabel="Thêm video"
            disabled={save.pending || busy}
          />
        </div>

        <FormError message={uploadError || save.error} />
      </form>
    </Modal>
  );
}
