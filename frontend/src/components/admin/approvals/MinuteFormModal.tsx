"use client";

import { type ChangeEvent, useState } from "react";
import { MapPin, ShieldCheck } from "@/components/ui/PublicIcon";
import { ConfirmDialog, FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, requireFields, todayIso } from "@/components/admin/shared/form-utils";
import { badgeOf, MINUTE_RESULT, optionsOf } from "@/components/admin/shared/labels";
import { ALLOWED_IMAGE_MIMES } from "@/components/portal/shared/media";
import { formatDate } from "@/utils/format";
import { isSafeMediaUrl } from "@/utils/url-safety";
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

  return (
    <Modal
      title={`Biên bản kiểm tra: ${minute.code}`}
      onClose={onClose}
      width={560}
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
      <div style={{ display: "grid", gap: 12, padding: 16, border: "1px solid var(--line)", background: "var(--mist)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Số biên bản</div>
            <div
              style={{
                fontWeight: 700,
                fontFamily: "var(--font-num-stack)",
                fontVariantNumeric: "tabular-nums",
                color: "#256b45",
              }}
            >
              {minute.code}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Ngày kiểm tra</div>
            <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatDate(minute.heldOn)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Địa điểm / Phạm vi</div>
            <div style={{ fontWeight: 600 }}>{minute.location}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Thửa vườn kiểm tra</div>
            <div style={{ fontWeight: 700, fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}>
              {minute.plotCode || "Toàn vùng"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Cán bộ kiểm tra</div>
            <div style={{ fontWeight: 600 }}>{minute.officer}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Kết luận</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
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
            <div style={{ fontSize: 11.5, color: "#14532d", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <MapPin size={13} />
              <span>
                Tọa độ GPS hiện trường:{" "}
                <span style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}>
                  {Number(minute.latitude).toFixed(5)}, {Number(minute.longitude).toFixed(5)}
                </span>
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

        {isSafeMediaUrl(minute.photoUrl) && (
          <div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 4 }}>Ảnh hiện trường kiểm tra</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={minute.photoUrl}
              alt={`Ảnh kiểm tra ${minute.code}`}
              style={{ width: "100%", maxHeight: 240, objectFit: "cover", border: "1px solid var(--line)" }}
            />
          </div>
        )}

        {minute.recordHash && (
          <div style={{ padding: "8px 10px", background: "#ffffff", border: "1px solid #cbd5e1" }}>
            <div style={{ fontSize: 11, color: "#0f172a", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <ShieldCheck size={13} color="#15803d" />
              <span>Dấu niêm phong chuỗi băm bất biến SHA-256</span>
            </div>
            <code
              style={{
                display: "block",
                marginTop: 3,
                fontSize: 11,
                color: "#334155",
                wordBreak: "break-all",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {minute.recordHash}
            </code>
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
  const [photoId, setPhotoId] = useState<number | null>(initial?.photoId ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.photoUrl ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(initial?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initial?.longitude ?? null);
  const [locating, setLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const isBackdatedOver48h = diffDaysFromToday(heldOn) > 2;

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

  const handlePhotoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingPhoto) return;
    if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
      setUploadError("Chỉ nhận ảnh hiện trường định dạng JPG, PNG hoặc WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Ảnh biên bản kiểm tra không được vượt quá 10 MB.");
      return;
    }
    setUploadingPhoto(true);
    setUploadError(null);
    try {
      const uploaded = await api.upload(file, "inspection");
      setPhotoId(uploaded.id);
      setPhotoUrl(uploaded.url);
      toast.success("Đã tải ảnh minh chứng kiểm tra thực địa.");
    } catch (err) {
      setUploadError(errorMessage(err, "Không thể tải ảnh hiện trường lên máy chủ."));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { code, heldOn, location, officer },
      {
        code: "số biên bản",
        heldOn: "ngày kiểm tra",
        location: "địa điểm / phạm vi",
        officer: "cán bộ kiểm tra",
      },
    );
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      code: code.trim(),
      heldOn,
      location: location.trim(),
      plotCode: plotCode.trim() || null,
      officer: officer.trim(),
      result,
      photoId,
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
      onClose={save.pending || uploadingPhoto ? () => undefined : onClose}
      width={580}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending || uploadingPhoto}>
            Hủy
          </button>
          <button type="submit" form="minute-form" className="btn btn-primary" disabled={save.pending || uploadingPhoto}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo biên bản"}
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
            label="Địa điểm / Phạm vi"
            required
            value={location}
            onChange={setLocation}
            placeholder="VD: Thôn 2 - 12 hộ vùng trồng XK"
            maxLength={200}
            error={fieldErrors.location}
          />
          <TextField
            label="Mã thửa đối chiếu GIS (nếu kiểm tra tại vườn)"
            value={plotCode}
            onChange={setPlotCode}
            placeholder="VD: CN-T1-01"
            maxLength={40}
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
          <SelectField
            label="Kết quả đánh giá"
            value={result}
            onChange={(val) => setResult(val as MinuteResult)}
            options={RESULT_OPTIONS}
          />
        </FormGrid>

        {isBackdatedOver48h && (
          <TextField
            label="Lý do nhập biên bản sau 48 giờ (hiển thị minh bạch trên sổ cái kiểm toán)"
            value={lateReason}
            onChange={setLateReason}
            placeholder="VD: Nhập lại từ biên bản giấy do vùng sâu mất sóng di động"
            maxLength={250}
          />
        )}

        <div
          style={{
            border: "1px solid #d4d4d2",
            borderRadius: 6,
            background: "#f0fdf4",
            padding: "10px 12px",
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#14532d" }}>
              Định vị GPS thực địa (đối chiếu ranh giới đa giác GIS thửa vườn)
            </div>
            <div style={{ fontSize: 11.5, color: "#166534", fontVariantNumeric: "tabular-nums" }}>
              {latitude !== null && longitude !== null
                ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                : gpsStatus || "Chưa gắn tọa độ kiểm tra thực địa"}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleCaptureGps}
            disabled={locating || save.pending}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <MapPin size={13} />
            <span>{locating ? "Đang lấy GPS…" : latitude !== null ? "Cập nhật GPS" : "Lấy tọa độ GPS"}</span>
          </button>
        </div>

        <div className="form-group">
          <label>Ảnh chụp hiện trường kiểm tra tại vườn (JPG, PNG, WEBP)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <label className="btn btn-outline btn-sm" style={{ cursor: uploadingPhoto ? "wait" : "pointer", margin: 0 }}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handlePhotoPick(e)}
                disabled={uploadingPhoto}
                style={{ display: "none" }}
              />
              {uploadingPhoto ? "Đang tải ảnh…" : photoUrl ? "Đổi ảnh hiện trường" : "Chụp / Tải ảnh hiện trường"}
            </label>
            {photoUrl && (
              <>
                {isSafeMediaUrl(photoUrl) && (
                  <a
                    href={photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ textDecoration: "none" }}
                  >
                    Xem ảnh đã gắn
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setConfirmRemovePhoto(true)}
                >
                  Xóa ảnh
                </button>
              </>
            )}
          </div>
          {confirmRemovePhoto && (
            <ConfirmDialog
              title="Xóa ảnh hiện trường"
              message="Xác nhận xóa ảnh hiện trường đã đính kèm khỏi biên bản kiểm tra này?"
              confirmLabel="Xóa ảnh"
              danger
              onConfirm={() => {
                setPhotoId(null);
                setPhotoUrl(null);
                setConfirmRemovePhoto(false);
              }}
              onClose={() => setConfirmRemovePhoto(false)}
            />
          )}
          {uploadError && (
            <small role="alert" style={{ display: "block", marginTop: 5, color: "#b73c20", fontSize: 12 }}>
              {uploadError}
            </small>
          )}
        </div>

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
