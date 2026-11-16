"use client";

import { FormEvent, useMemo, useState } from "react";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { OfflinePendingDiaryCards } from "@/components/ui/OfflineSyncBar";
import { invalidatePortal, useCatalog, usePortal } from "@/hooks/use-portal";
import { api, errorMessage } from "@/lib/api-client";
import { submitFieldRecordWithOfflineQueue } from "@/lib/offline-sync";
import { daysUntil, JOURNAL_ACTIVITIES, todayIso, toNumber } from "@/lib/portal-labels";
import { formatDate, formatDateTime } from "@/utils/format";
import type { PesticideDto } from "@/types/api";
import type {
  CreateJournalBody,
  CreateSprayBody,
  PortalJournalEntry,
  PortalList,
  PortalPlot,
  PortalPlots,
  PortalSprayRecord,
} from "@/types/portal";
import {
  BusyButton,
  ConfirmButton,
  InlineError,
  LateDeclarationNotice,
  MultiPhotoField,
  StoredMediaGallery,
  useMultiPhotoPicker,
} from "./shared/controls";
import type { PortalAction } from "./PortalSearch";
import { EmptyState, Field, Sheet, StateBlock, useSheetClose } from "./ui";

function canDeleteEntry(entry: PortalJournalEntry): boolean {
  if (typeof entry.canDelete === "boolean") return entry.canDelete;
  if (entry.recorder !== "Chủ hộ") return false;
  if (!entry.createdAt) return false;
  const createdMs = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < 24 * 60 * 60 * 1000;
}

function canDeleteSpray(record: PortalSprayRecord): boolean {
  if (typeof record.canDelete === "boolean") return record.canDelete;
  if (record.pesticideStatus === "banned") return false;
  if (!record.createdAt) return false;
  const createdMs = new Date(record.createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < 24 * 60 * 60 * 1000;
}

function addIsoDays(isoDate: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function diffDaysFromToday(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const tm = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayIso());
  if (!m || !tm) return 0;
  const targetUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const nowUtc = Date.UTC(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]));
  return Math.round((nowUtc - targetUtc) / (24 * 60 * 60 * 1000));
}

const SPRAY_ACTIVITY_NAME = "Phun thuốc BVTV";

function DiarySheetActionFooter({
  saving,
  canSubmit,
  hasFiles,
  fallbackOnClose,
}: {
  saving: boolean;
  canSubmit: boolean;
  hasFiles: boolean;
  fallbackOnClose: () => void;
}) {
  const sheetClose = useSheetClose();
  return (
    <>
      <button
        type="button"
        className="pt-diary-footer-btn pt-diary-footer-cancel"
        onClick={sheetClose ?? fallbackOnClose}
        disabled={saving}
      >
        Hủy
      </button>
      <BusyButton
        type="submit"
        form="pt-unified-diary-form"
        className="pt-diary-footer-btn pt-diary-footer-submit"
        busy={saving}
        busyLabel="Đang lưu…"
        disabled={!canSubmit}
        title={!hasFiles ? "Vui lòng chụp ảnh hiện trường trước khi lưu" : undefined}
      >
        Lưu nhật ký
      </BusyButton>
    </>
  );
}

function UnifiedDiaryForm({
  plotsList,
  initialActivity,
  onDone,
  onClose,
}: {
  plotsList: PortalPlot[];
  initialActivity?: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const plotCodes = plotsList.map((p) => p.code);
  const defaultPlotCode = plotCodes[0] ?? "";
  const defaultPlotArea = plotsList[0]?.areaHa ? String(plotsList[0].areaHa) : "0.5";

  const [entryOn, setEntryOn] = useState(todayIso());
  const [plotCode, setPlotCode] = useState(defaultPlotCode);
  const [activity, setActivity] = useState(initialActivity ?? JOURNAL_ACTIVITIES[0]);
  const [detail, setDetail] = useState("");
  const [lateReason, setLateReason] = useState("");

  const isSprayActivity = activity === SPRAY_ACTIVITY_NAME;
  const pesticides = useCatalog<PesticideDto>("pesticides", isSprayActivity);
  const [pesticideId, setPesticideId] = useState("");
  const [dose, setDose] = useState("");
  const [areaHa, setAreaHa] = useState(defaultPlotArea);
  const [areaTouched, setAreaTouched] = useState(false);
  const [source, setSource] = useState("");

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const media = useMultiPhotoPicker("journal", { maxFiles: 8, allowVideo: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePlot = plotCode || defaultPlotCode;
  const minBackdateIso = addIsoDays(todayIso(), -7) ?? undefined;
  const selectedDelayDays = Math.max(0, diffDaysFromToday(entryOn));
  const isLateOver48h = selectedDelayDays > 2;

  const chosenPesticide = isSprayActivity
    ? pesticides.rows.find((item) => String(item.id) === pesticideId)
    : undefined;
  const safeFromIso =
    chosenPesticide && (chosenPesticide.isolationDays ?? 0) > 0
      ? addIsoDays(entryOn, chosenPesticide.isolationDays ?? 0)
      : null;

  const handlePlotChange = (nextCode: string) => {
    setPlotCode(nextCode);
    if (!areaTouched) {
      const matched = plotsList.find((p) => p.code === nextCode);
      if (matched?.areaHa) setAreaHa(String(matched.areaHa));
    }
  };

  const getGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCoords(null);
      setGpsStatus("Thiết bị không hỗ trợ GPS");
      return;
    }
    setLocating(true);
    setGpsStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = Number(pos.coords.latitude.toFixed(6));
        const longitude = Number(pos.coords.longitude.toFixed(6));
        setCoords({ latitude, longitude });
        setGpsStatus(`Đã định vị: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setCoords(null);
        setGpsStatus(
          err.code === err.PERMISSION_DENIED
            ? "Chưa cấp quyền vị trí GPS"
            : "Không lấy được tín hiệu GPS",
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const canSubmit = isSprayActivity
    ? Boolean(effectivePlot.trim() && pesticideId && dose.trim() && Number(areaHa) > 0 && media.hasFiles)
    : Boolean(effectivePlot.trim() && media.hasFiles);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const finalPlot = effectivePlot.trim();
    if (!finalPlot) {
      setError("Vui lòng chọn hoặc nhập mã thửa đất.");
      return;
    }
    if (!media.hasFiles) {
      setError("Vui lòng chụp hoặc chọn ít nhất 1 ảnh hiện trường trước khi lưu.");
      return;
    }
    if (isSprayActivity) {
      if (!pesticideId) {
        setError("Vui lòng chọn loại thuốc bảo vệ thực vật đã sử dụng.");
        return;
      }
      if (!dose.trim()) {
        setError("Vui lòng nhập liều lượng pha phun.");
        return;
      }
      if (!(Number(areaHa) > 0)) {
        setError("Vui lòng nhập diện tích phun hợp lệ.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      if (isSprayActivity) {
        const sprayBody: Omit<CreateSprayBody, "photoId" | "photoIds"> = {
          sprayedOn: entryOn,
          pesticideId: Number(pesticideId),
          dose: dose.trim(),
          areaHa: Number(areaHa),
          source: source.trim() || undefined,
          plotCode: finalPlot,
          note: detail.trim() || undefined,
          lateReason: selectedDelayDays >= 1 && lateReason.trim() ? lateReason.trim() : undefined,
        };
        const outcome = await submitFieldRecordWithOfflineQueue<PortalSprayRecord>({
          kind: "portal-spray",
          label: `Phun thuốc${chosenPesticide ? ` ${chosenPesticide.name}` : ""} - Thửa ${finalPlot}`,
          plotCode: finalPlot,
          endpoint: "/portal/spray",
          payload: sprayBody as Record<string, unknown>,
          mediaGroups: [
            {
              slotKey: "photos",
              purpose: "journal",
              items: media.items,
              binding: { arrayField: "photoIds", primaryField: "photoId" },
            },
          ],
          portalKeysToInvalidate: ["journal", "spray", "violations", "overview"],
          onProgress: media.setUploadProgress,
        });
        if (outcome.mode === "synced") {
          invalidatePortal("journal", "spray", "violations", "overview");
        }
        onDone();
        return;
      }

      const baseBody: Omit<CreateJournalBody, "photoId" | "photoIds"> = {
        entryOn,
        plotCode: finalPlot,
        activity,
        detail: detail.trim() || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        lateReason: selectedDelayDays >= 1 && lateReason.trim() ? lateReason.trim() : undefined,
      };
      const outcome = await submitFieldRecordWithOfflineQueue<PortalJournalEntry>({
        kind: "portal-journal",
        label: `Nhật ký ${activity} - Thửa ${finalPlot}`,
        plotCode: finalPlot,
        endpoint: "/portal/journal",
        payload: baseBody as Record<string, unknown>,
        mediaGroups: [
          {
            slotKey: "photos",
            purpose: "journal",
            items: media.items,
            binding: { arrayField: "photoIds", primaryField: "photoId" },
          },
        ],
        portalKeysToInvalidate: ["journal", "spray", "violations", "overview"],
        onProgress: media.setUploadProgress,
      });
      if (outcome.mode === "synced") {
        invalidatePortal("journal", "spray", "violations", "overview");
      }
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Không lưu được nhật ký. Vui lòng thử lại."));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Ghi nhật ký canh tác"
      className="pt-diary-sheet pt-diary-form-sheet"
      onClose={onClose}
      footer={
        <DiarySheetActionFooter
          saving={saving}
          canSubmit={canSubmit}
          hasFiles={media.hasFiles}
          fallbackOnClose={onClose}
        />
      }
    >
    <form id="pt-unified-diary-form" className="pt-form" onSubmit={submit}>
      <div className="pt-field-row">
        <Field label="Ngày thực hiện" htmlFor="pj-date">
          <input
            id="pj-date"
            type="date"
            className="pt-input-date"
            min={minBackdateIso}
            max={todayIso()}
            value={entryOn}
            onChange={(e) => setEntryOn(e.target.value)}
            required
          />
        </Field>
        <Field label="Thửa đất" htmlFor="pj-plot">
          {plotsList.length > 0 ? (
            <select
              id="pj-plot"
              value={effectivePlot}
              onChange={(e) => handlePlotChange(e.target.value)}
              required
            >
              {plotsList.map((p) => (
                <option key={p.code} value={p.code}>
                  Thửa {p.code}{p.areaHa ? ` (${p.areaHa} ha)` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="pj-plot"
              placeholder="Nhập mã thửa đất"
              value={plotCode}
              onChange={(e) => setPlotCode(e.target.value)}
              required
            />
          )}
        </Field>
      </div>

      <LateDeclarationNotice
        selectedDate={entryOn}
        todayDate={todayIso()}
        delayDays={selectedDelayDays}
      />

      {selectedDelayDays >= 1 && (
        <Field
          label={
            isLateOver48h
              ? `Lý do ghi bổ sung chậm ${selectedDelayDays} ngày (bắt buộc)`
              : `Ghi chú lý do khai báo chậm ${selectedDelayDays} ngày (không bắt buộc)`
          }
          htmlFor="pj-late-reason"
        >
          <input
            id="pj-late-reason"
            maxLength={250}
            placeholder="Ví dụ: Vườn xa mất sóng 4G nên về nhà mới tải ảnh lên..."
            value={lateReason}
            onChange={(e) => setLateReason(e.target.value)}
            required={isLateOver48h}
          />
        </Field>
      )}

      <Field label="Công việc thực hiện" htmlFor="pj-activity">
        <select
          id="pj-activity"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
        >
          {JOURNAL_ACTIVITIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>

      {isSprayActivity && (
        <>
          <Field label="Loại thuốc bảo vệ thực vật sử dụng" htmlFor="ps-pesticide">
            <select
              id="ps-pesticide"
              value={pesticideId}
              onChange={(e) => setPesticideId(e.target.value)}
              required
            >
              <option value="" disabled>
                {pesticides.loading ? "Đang tải danh mục thuốc…" : "Chọn loại thuốc đã phun"}
              </option>
              {pesticides.rows.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.status === "banned"
                    ? " (BỊ CẤM)"
                    : item.status === "restricted"
                      ? " (HẠN CHẾ)"
                      : ""}
                </option>
              ))}
            </select>
          </Field>

          {chosenPesticide?.status === "banned" && (
            <p className="pt-form-error" role="alert">
              Thuốc này nằm trong danh mục cấm sử dụng cho sầu riêng xuất khẩu. Nếu đã phun, vui lòng vẫn lưu lại trung thực để cán bộ kỹ thuật HTX kịp thời hỗ trợ khoanh vùng xử lý.
            </p>
          )}

          {chosenPesticide?.status === "restricted" && (
            <p
              className="pt-hint"
              role="status"
              style={{
                background: "#fffbeb",
                border: "1px solid #d4d4d2",
                color: "#92400e",
                borderRadius: 6,
                padding: "8px 10px",
              }}
            >
              Hoạt chất kiểm soát đặc biệt: chỉ dùng theo hướng dẫn kỹ thuật của HTX và tuân thủ thời gian cách ly {chosenPesticide.isolationDays ?? 0} ngày.
            </p>
          )}

          {chosenPesticide && chosenPesticide.status !== "banned" && (
            <p className="pt-hint" style={{ fontVariantNumeric: "tabular-nums" }}>
              Thời gian cách ly tự động: <strong>{chosenPesticide.isolationDays ?? 0} ngày</strong> trước thu hoạch
              {safeFromIso ? ` (được phép thu hái từ ngày ${formatDate(safeFromIso)})` : ""}.
            </p>
          )}

          <div className="pt-field-row">
            <Field label="Liều lượng pha phun" htmlFor="ps-dose">
              <input
                id="ps-dose"
                placeholder="Ví dụ: 100 ml / bình 20L"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                required
              />
            </Field>
            <Field label="Diện tích phun (ha)" htmlFor="ps-area">
              <input
                id="ps-area"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={areaHa}
                onChange={(e) => {
                  setAreaTouched(true);
                  setAreaHa(e.target.value);
                }}
                required
              />
            </Field>
          </div>

          <Field label="Cửa hàng / Đại lý cung cấp thuốc (không bắt buộc)" htmlFor="ps-source">
            <input
              id="ps-source"
              placeholder="Tên đại lý vật tư nông nghiệp"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </Field>
        </>
      )}

      <Field
        label={isSprayActivity ? "Ghi chú tình trạng sâu bệnh (không bắt buộc)" : "Ghi chú công việc và vật tư"}
        htmlFor="pj-detail"
      >
        <textarea
          id="pj-detail"
          rows={3}
          maxLength={500}
          placeholder={
            isSprayActivity
              ? "Ví dụ: Phun phòng rầy xanh trên cơi đọt 2 vào sáng sớm..."
              : "Mô tả công việc (ví dụ: Bón phân hữu cơ vi sinh 5 kg/gốc, tưới ẩm, tỉa cành thông thoáng...)"
          }
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </Field>

      {!isSprayActivity && (
        <div className="pt-journal-gps-card">
          <div className="pt-journal-gps-text">
            <span className="pt-journal-gps-title">Tọa độ GPS vườn (tùy chọn)</span>
            <span className="pt-journal-gps-desc">
              {coords
                ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                : gpsStatus || "Chưa định vị"}
            </span>
          </div>
          <button
            type="button"
            className={`pt-gps-btn ${coords ? "is-active" : ""}`}
            onClick={getGps}
            disabled={locating || saving}
            title={coords ? `Đã định vị: ${coords.latitude}, ${coords.longitude}` : "Lấy vị trí định vị của vườn hiện tại"}
          >
            <img
              src="/location-pin.png"
              alt=""
              width={16}
              height={16}
              className="pt-gps-icon"
              aria-hidden="true"
            />
            <span>{locating ? "Đang lấy GPS…" : coords ? "Cập nhật GPS" : "Định vị vườn"}</span>
          </button>
        </div>
      )}

      <MultiPhotoField
        id="pj-photo-input"
        label={isSprayActivity ? "Ảnh hiện trường phun thuốc hoặc nhãn chai thuốc" : "Ảnh và video hiện trường vườn"}
        picker={media}
        required
        description="Tối đa 8 ảnh hoặc video dưới 90 giây."
        cameraLabel="Chụp ảnh hiện trường"
        galleryLabel="Chọn nhiều ảnh"
        videoLabel="Quay hoặc chọn video"
        disabled={saving}
      />

      <InlineError message={error} />
    </form>
    </Sheet>
  );
}

function JournalDetailModal({
  entry,
  onClose,
  onDeleted,
}: {
  entry: PortalJournalEntry;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const sheetClose = useSheetClose();
  const closeModal = sheetClose ?? onClose;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const lat = toNumber(entry.latitude);
  const lng = toNumber(entry.longitude);
  const hasRealCoords = lat !== null && lng !== null;
  const allowDelete = canDeleteEntry(entry);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/portal/journal/${entry.id}`);
      // Xóa nhật ký có thể làm mất bằng chứng khắc phục vi phạm: làm mới cả danh sách vi phạm
      invalidatePortal("journal", "spray", "violations", "overview");
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err, "Không xóa được bản ghi nhật ký."));
      setDeleting(false);
    }
  };

  return (
    <div className="pt-diary-detail-body">
      <div className="pt-detail-hero">
        <div className="pt-detail-hero-icon-box">
          <img src="/note.png?v=2" alt="" width={28} height={28} className="pt-detail-hero-icon" />
        </div>
        <div className="pt-detail-hero-info">
          <h3 className="pt-detail-hero-title">{entry.activity}</h3>
        </div>
      </div>

      <div className="pt-detail-grid">
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Thửa canh tác</span>
          <span className="pt-detail-cell-value">Thửa {entry.plotCode}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Ngày thực hiện tại vườn</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDate(entry.entryOn)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Thời điểm khai báo thực tế</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDateTime(entry.serverRecordedAt || entry.createdAt)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Độ trễ khai báo</span>
          <span
            className="pt-detail-cell-value"
            style={{
              fontVariantNumeric: "tabular-nums",
              color: (entry.lateDeclarationDays ?? 0) > 0 ? "#9a6712" : "#15803d",
            }}
          >
            {(entry.lateDeclarationDays ?? 0) > 0
              ? `Khai báo chậm ${entry.lateDeclarationDays} ngày`
              : "Khai báo đúng trong ngày"}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Người ghi chép</span>
          <span className="pt-detail-cell-value">{entry.recorder || "Chủ hộ"}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Mã ghi nhận</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>#NK-{entry.id}</span>
        </div>
      </div>

      {hasRealCoords && (
        <div className="pt-detail-gps-box">
          <img
            src="/location-pin.png"
            alt=""
            width={18}
            height={18}
            className="pt-detail-gps-icon"
            aria-hidden="true"
          />
          <div>
            <div className="pt-detail-gps-title">
              Tọa độ GPS thực địa{entry.gpsVerified ? " - Khớp ranh giới GIS thửa vườn" : ""}
            </div>
            <div className="pt-detail-gps-coords" style={{ fontVariantNumeric: "tabular-nums" }}>
              {lat.toFixed(5)}, {lng.toFixed(5)}
              {!entry.gpsVerified && entry.gpsDistanceM != null
                ? ` (cách ranh giới ${Math.round(Number(entry.gpsDistanceM))} m)`
                : ""}
            </div>
          </div>
        </div>
      )}

      {entry.lateReason && entry.lateReason !== "Khai báo bổ sung sau thời điểm thực hiện" && (
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Lý do ghi bổ sung</span>
          <span className="pt-detail-cell-value">{entry.lateReason}</span>
        </div>
      )}

      {/* Ảnh và video chụp hiện trường minh chứng thực tế */}
      <div className="pt-detail-section">
        <div className="pt-detail-section-header">
          <h4 className="pt-detail-section-title">Minh chứng hiện trường vườn</h4>
          {(entry.photoUrls?.length || entry.photoUrl) && (
            <span className="pt-detail-photo-tag">Đã xác thực thực địa</span>
          )}
        </div>
        {entry.photoUrls?.length || entry.photoUrl ? (
          <StoredMediaGallery
            urls={entry.photoUrls}
            fallbackUrl={entry.photoUrl}
            altPrefix={`Hiện trường ${entry.activity}`}
            caption={`Thửa ${entry.plotCode} - Ngày ${formatDate(entry.entryOn)}`}
          />
        ) : (
          <div className="pt-detail-no-photo">
            <span>Bản ghi này không có tệp ảnh đính kèm trên máy chủ.</span>
          </div>
        )}
      </div>

      <div className="pt-detail-section">
        <h4 className="pt-detail-section-title">Nội dung công việc & vật tư sử dụng</h4>
        <div className="pt-detail-content-box">
          {entry.detail ? (
            <p className="pt-detail-text">{entry.detail}</p>
          ) : (
            <p className="pt-detail-empty">Không có ghi chú thêm cho lần canh tác này.</p>
          )}
        </div>
      </div>

      <InlineError message={deleteError} />

      <div className="pt-detail-footer" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {allowDelete && (
          <ConfirmButton
            label="Xóa bản ghi này (trong 24h)"
            title="Xóa nhật ký canh tác"
            question="Xác nhận xóa bản ghi nhật ký canh tác này? Thao tác không thể hoàn tác."
            confirmLabel="Xóa nhật ký"
            className="pt-btn pt-btn-danger pt-btn-block"
            busy={deleting}
            onConfirm={handleDelete}
          />
        )}
        <button type="button" className="pt-btn pt-btn-primary pt-btn-block" onClick={closeModal} disabled={deleting}>
          Đóng chi tiết
        </button>
      </div>
    </div>
  );
}

function SprayDetailModal({
  record,
  onClose,
  onDeleted,
}: {
  record: PortalSprayRecord;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const sheetClose = useSheetClose();
  const closeModal = sheetClose ?? onClose;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isPass = record.mrlStatus === "pass";
  const isBanned = record.pesticideStatus === "banned";
  const allowDelete = canDeleteSpray(record);

  const safeDateIso =
    record.isolationEndsOn ||
    (record.isolationDays > 0 ? addIsoDays(record.sprayedOn, record.isolationDays) : null);
  const remainingPhiDays = safeDateIso ? daysUntil(safeDateIso) : null;
  const inIsolation = remainingPhiDays !== null && remainingPhiDays > 0;

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/portal/spray/${record.id}`);
      invalidatePortal("spray", "journal", "overview", "violations");
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err, "Không xóa được bản ghi phun thuốc."));
      setDeleting(false);
    }
  };

  return (
    <div className="pt-diary-detail-body">
      <div className="pt-detail-hero">
        <div className="pt-detail-hero-icon-box">
          <img src="/note.png?v=2" alt="" width={28} height={28} className="pt-detail-hero-icon" />
        </div>
        <div className="pt-detail-hero-info">
          <h3 className="pt-detail-hero-title">{record.pesticide}</h3>
        </div>
      </div>

      <div className="pt-detail-grid">
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Ngày phun tại vườn</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDate(record.sprayedOn)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Thời điểm khai báo thực tế</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDateTime(record.serverRecordedAt || record.createdAt)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Độ trễ khai báo</span>
          <span
            className="pt-detail-cell-value"
            style={{
              fontVariantNumeric: "tabular-nums",
              color: (record.lateDeclarationDays ?? 0) > 0 ? "#9a6712" : "#15803d",
            }}
          >
            {(record.lateDeclarationDays ?? 0) > 0
              ? `Khai báo chậm ${record.lateDeclarationDays} ngày`
              : "Khai báo đúng trong ngày"}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Liều lượng sử dụng</span>
          <span className="pt-detail-cell-value">{record.dose}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Diện tích phun</span>
          <span className="pt-detail-cell-value">
            {record.areaHa} ha{record.plotCode ? ` - Thửa ${record.plotCode}` : " - Toàn vườn"}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Cách ly trước thu hoạch (PHI)</span>
          <span className="pt-detail-cell-value">
            {record.isolationDays} ngày (thu từ {safeDateIso ? formatDate(safeDateIso) : formatDate(record.sprayedOn)})
          </span>
        </div>
      </div>

      <div className="pt-detail-section">
        <h4 className="pt-detail-section-title">Nguồn gốc và ghi chú</h4>
        <div className="pt-detail-content-box">
          <p className="pt-detail-text">
            {record.source ? `Đại lý cung cấp: ${record.source}` : "Chưa ghi nhận đại lý cung cấp"}
          </p>
          {record.note && (
            <p className="pt-detail-text" style={{ marginTop: 6 }}>
              Ghi chú: {record.note}
            </p>
          )}
        </div>
      </div>

      {(record.photoUrls?.length || record.photoUrl) && (
        <div className="pt-detail-section">
          <h4 className="pt-detail-section-title">Minh chứng hiện trường</h4>
          <StoredMediaGallery
            urls={record.photoUrls}
            fallbackUrl={record.photoUrl}
            altPrefix={`Hiện trường phun thuốc ${record.pesticide}`}
            caption={`Ảnh hiện trường phun thuốc ngày ${formatDate(record.sprayedOn)}`}
          />
        </div>
      )}

      {record.lateReason && record.lateReason !== "Khai báo bổ sung sau thời điểm thực hiện" && (
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Lý do khai báo bổ sung</span>
          <span className="pt-detail-cell-value">{record.lateReason}</span>
        </div>
      )}

      <div className={`pt-detail-compliance-box ${isPass && !isBanned ? "is-safe" : "is-warning"}`}>
        <div className="pt-detail-compliance-title">
          {isBanned
            ? "Cảnh báo hoạt chất cấm xuất khẩu"
            : inIsolation
              ? `Đang trong thời gian cách ly PHI (còn ${remainingPhiDays} ngày)`
              : isPass
                ? "Đáp ứng tiêu chuẩn an toàn VietGAP & GACC"
                : "Cảnh báo an toàn dư lượng"}
        </div>
        <div className="pt-detail-compliance-desc">
          {isBanned
            ? "Hoạt chất nằm trong danh mục cấm sử dụng. Thông tin đã được chuyển tới cán bộ kỹ thuật HTX để hỗ trợ khoanh vùng xử lý."
            : inIsolation && safeDateIso
              ? `Tuyệt đối chưa thu hái hoặc kích hoạt tem quả trên thửa này trước ngày ${formatDate(safeDateIso)}.`
              : `Đã đảm bảo thời gian cách ly tối thiểu ${record.isolationDays} ngày trước thu hoạch.`}
        </div>
      </div>

      <InlineError message={deleteError} />

      <div className="pt-detail-footer" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {allowDelete && (
          <ConfirmButton
            label="Xóa bản ghi này (trong 24h)"
            title="Xóa nhật ký phun thuốc"
            question="Xác nhận xóa bản ghi phun thuốc nhập nhầm này? Thao tác không thể hoàn tác."
            confirmLabel="Xóa bản ghi"
            className="pt-btn pt-btn-danger pt-btn-block"
            busy={deleting}
            onConfirm={handleDelete}
          />
        )}
        <button type="button" className="pt-btn pt-btn-primary pt-btn-block" onClick={closeModal} disabled={deleting}>
          Đóng chi tiết
        </button>
      </div>
    </div>
  );
}

type CombinedDiaryItem =
  | { kind: "journal"; key: string; date: string; recordedAt: number; entry: PortalJournalEntry }
  | { kind: "spray"; key: string; date: string; recordedAt: number; record: PortalSprayRecord };

export default function DiaryTab({ initialAction }: { initialAction?: PortalAction } = {}) {
  const [formOpen, setFormOpen] = useState<boolean>(() =>
    initialAction === "journal-add" || initialAction === "spray-add",
  );
  const [formInitialActivity, setFormInitialActivity] = useState<string | undefined>(() =>
    initialAction === "spray-add" ? SPRAY_ACTIVITY_NAME : undefined,
  );
  const [selectedJournal, setSelectedJournal] = useState<PortalJournalEntry | null>(null);
  const [selectedSpray, setSelectedSpray] = useState<PortalSprayRecord | null>(null);
  const journal = usePortal<PortalList<PortalJournalEntry>>("journal");
  const spray = usePortal<PortalList<PortalSprayRecord>>("spray");
  const plots = usePortal<PortalPlots>("plots");
  const plotsList = plots.data?.available ? plots.data.data : [];

  const combinedItems = useMemo<CombinedDiaryItem[]>(() => {
    const out: CombinedDiaryItem[] = [];
    for (const entry of journal.data?.data ?? []) {
      const ts = new Date(entry.serverRecordedAt || entry.createdAt || `${entry.entryOn}T00:00:00Z`).getTime();
      out.push({
        kind: "journal",
        key: `j-${entry.id}`,
        date: entry.entryOn,
        recordedAt: Number.isFinite(ts) ? ts : 0,
        entry,
      });
    }
    for (const record of spray.data?.data ?? []) {
      const ts = new Date(record.serverRecordedAt || record.createdAt || `${record.sprayedOn}T00:00:00Z`).getTime();
      out.push({
        kind: "spray",
        key: `s-${record.id}`,
        date: record.sprayedOn,
        recordedAt: Number.isFinite(ts) ? ts : 0,
        record,
      });
    }
    out.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.recordedAt - a.recordedAt;
    });
    return out;
  }, [journal.data, spray.data]);

  const isLoading = (journal.loading && !journal.data) || (spray.loading && !spray.data);
  const combinedError = !journal.data && !spray.data ? (journal.error ?? spray.error) : null;
  const hasLoadedOnce = Boolean(journal.data || spray.data);

  return (
    <div className="pt-stack">
      <section className="pt-reminders-widget pt-diary-widget" aria-label="Nhật ký canh tác">
          <div className="pt-widget-topbar">
            <div className="pt-widget-topbar-info">
              <h2 className="pt-widget-topbar-title">Nhật ký canh tác</h2>
            </div>
            <button
              type="button"
              className="pt-widget-topbar-btn is-primary"
              onClick={() => {
                setFormInitialActivity(undefined);
                setFormOpen(true);
              }}
              title="Ghi công việc chăm sóc hoặc phun thuốc mới"
            >
              Ghi nhật ký
            </button>
          </div>

          <div className="pt-widget-sheet">
            <OfflinePendingDiaryCards kinds={["portal-journal", "portal-spray"]} />
            <StateBlock loading={isLoading} error={combinedError} />

            {hasLoadedOnce && combinedItems.length === 0 && (
              <EmptyState icon="empty">
                Chưa có nhật ký nào. Bấm “Ghi nhật ký” để lưu công việc chăm sóc hoặc phun thuốc đầu tiên.
              </EmptyState>
            )}

            {combinedItems.length > 0 && (
              <ul className="pt-widget-list pt-diary-widget-list" role="list">
                {combinedItems.map((item) => {
                  if (item.kind === "journal") {
                    const entry = item.entry;
                    return (
                      <li key={item.key}>
                        <div
                          role="button"
                          tabIndex={0}
                          className="pt-widget-item pt-diary-widget-item"
                          onClick={() => setSelectedJournal(entry)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedJournal(entry);
                            }
                          }}
                          title="Bấm để xem chi tiết nhật ký"
                        >
                          <img
                            src="/note.png?v=2"
                            alt=""
                            width={20}
                            height={20}
                            loading="lazy"
                            decoding="async"
                            className="pt-widget-note-icon"
                            aria-hidden="true"
                          />
                          <span className="pt-widget-item-text">
                            {entry.activity}
                            {entry.plotCode ? ` - ${entry.plotCode}` : ""}
                          </span>
                          <span className="pt-diary-item-date" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {formatDate(entry.entryOn)}
                            {(entry.lateDeclarationDays ?? 0) > 0 ? ` (chậm ${entry.lateDeclarationDays}n)` : ""}
                          </span>
                          <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                        </div>
                      </li>
                    );
                  }

                  const record = item.record;
                  const safeIso =
                    record.isolationEndsOn ??
                    (record.isolationDays > 0 ? addIsoDays(record.sprayedOn, record.isolationDays) : null);
                  const remPhi = safeIso ? daysUntil(safeIso) : null;
                  const inPhi = remPhi !== null && remPhi > 0;

                  return (
                    <li key={item.key}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="pt-widget-item pt-diary-widget-item"
                        onClick={() => setSelectedSpray(record)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedSpray(record);
                          }
                        }}
                        title="Bấm để xem chi tiết lần phun thuốc"
                      >
                        <img
                          src="/note.png?v=2"
                          alt=""
                          width={20}
                          height={20}
                          loading="lazy"
                          decoding="async"
                          className="pt-widget-note-icon"
                          aria-hidden="true"
                        />
                        <span className="pt-widget-item-text">
                          Phun thuốc: {record.pesticide}
                          {record.plotCode ? ` - ${record.plotCode}` : ""}
                        </span>
                        <span className="pt-diary-item-date" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatDate(record.sprayedOn)}
                          {inPhi
                            ? ` (cách ly ${remPhi}n)`
                            : (record.lateDeclarationDays ?? 0) > 0
                              ? ` (chậm ${record.lateDeclarationDays}n)`
                              : ""}
                        </span>
                        <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

      {formOpen && (
        <UnifiedDiaryForm
          plotsList={plotsList}
          initialActivity={formInitialActivity}
          onDone={() => setFormOpen(false)}
          onClose={() => setFormOpen(false)}
        />
      )}

      {selectedJournal && (
        <Sheet title="Chi tiết nhật ký canh tác" className="pt-diary-sheet" onClose={() => setSelectedJournal(null)}>
          <JournalDetailModal
            entry={selectedJournal}
            onClose={() => setSelectedJournal(null)}
            onDeleted={() => setSelectedJournal(null)}
          />
        </Sheet>
      )}

      {selectedSpray && (
        <Sheet title="Chi tiết lần phun thuốc" className="pt-diary-sheet" onClose={() => setSelectedSpray(null)}>
          <SprayDetailModal
            record={selectedSpray}
            onClose={() => setSelectedSpray(null)}
            onDeleted={() => setSelectedSpray(null)}
          />
        </Sheet>
      )}
    </div>
  );
}
