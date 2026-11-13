"use client";

import { FormEvent, useState } from "react";
import { RadialPngIcon } from "./RadialIcons";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { invalidatePortal, useCatalog, usePortal } from "@/hooks/use-portal";
import { api, errorMessage } from "@/lib/api-client";
import { daysUntil, JOURNAL_ACTIVITIES, todayIso, toNumber } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PesticideDto } from "@/types/api";
import type {
  CreateJournalBody,
  CreateSprayBody,
  PortalJournalEntry,
  PortalList,
  PortalPlot,
  PortalPlots,
  PortalSprayRecord,
  PortalViolation,
} from "@/types/portal";
import { BusyButton, ConfirmButton, InlineError, PhotoField, StoredPhoto, usePhotoPicker } from "./shared/controls";
import type { PortalAction } from "./PortalSearch";
import { Card, EmptyState, Field, Pill, SectionDivider, SegmentedTabs, Sheet, StateBlock, useSheetClose } from "./ui";

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

function JournalForm({
  plotCodes,
  onDone,
  onClose,
  onSwitchToSpray,
}: {
  plotCodes: string[];
  onDone: () => void;
  onClose: () => void;
  onSwitchToSpray?: () => void;
}) {
  const sheetClose = useSheetClose();
  const [entryOn, setEntryOn] = useState(todayIso());
  const [plotCode, setPlotCode] = useState(plotCodes[0] ?? "");
  const [activity, setActivity] = useState(JOURNAL_ACTIVITIES[0]);
  const [detail, setDetail] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const photo = usePhotoPicker("journal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePlot = plotCode || plotCodes[0] || "";

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const finalPlot = effectivePlot.trim();
    if (!finalPlot) {
      setError("Vui lòng chọn hoặc nhập mã thửa đất.");
      return;
    }
    if (!photo.file) {
      setError("Vui lòng chụp hoặc chọn ảnh hiện trường vườn trước khi lưu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoId = await photo.ensureUploaded();
      if (!photoId) {
        setError("Vui lòng chụp hoặc chọn ảnh hiện trường vườn.");
        setSaving(false);
        return;
      }
      const body: CreateJournalBody = {
        entryOn,
        plotCode: finalPlot,
        activity,
        detail: detail.trim() || undefined,
        photoId,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      };
      await api.post<PortalJournalEntry>("/portal/journal", body);
      invalidatePortal("journal", "spray", "violations", "overview");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Không lưu được nhật ký. Vui lòng thử lại."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <div className="pt-field-row">
        <Field label="Ngày thực hiện" htmlFor="pj-date">
          <input
            id="pj-date"
            type="date"
            className="pt-input-date"
            max={todayIso()}
            value={entryOn}
            onChange={(e) => setEntryOn(e.target.value)}
            required
          />
        </Field>
        <Field label="Thửa đất" htmlFor="pj-plot">
          {plotCodes.length > 0 ? (
            <select
              id="pj-plot"
              value={effectivePlot}
              onChange={(e) => setPlotCode(e.target.value)}
              required
            >
              {plotCodes.map((code) => (
                <option key={code} value={code}>
                  Thửa {code}
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

      <Field label="Công việc canh tác" htmlFor="pj-activity">
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

      {activity === "Phun thuốc BVTV" && onSwitchToSpray && (
        <div
          className="pt-notice"
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 12,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, color: "#166534", lineHeight: 1.45 }}>
            Để hệ thống tự động tính <strong>thời gian cách ly PHI</strong> và hiển thị đúng tên hoạt chất trên mã QR truy xuất, bạn nên ghi tại biểu mẫu <strong>Phun thuốc BVTV</strong> chuyên dụng.
          </span>
          <button
            type="button"
            className="pt-btn pt-btn-sm pt-btn-primary"
            style={{ alignSelf: "flex-start" }}
            onClick={onSwitchToSpray}
          >
            Mở mẫu Phun thuốc BVTV
          </button>
        </div>
      )}

      <Field label="Ghi chú & Vật tư sử dụng" htmlFor="pj-detail">
        <textarea
          id="pj-detail"
          rows={3}
          maxLength={500}
          placeholder="Mô tả công việc (ví dụ: Bón phân hữu cơ vi sinh 5 kg/gốc, tưới ẩm, tỉa cành thông thoáng...)"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </Field>

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

      <PhotoField
        id="pj-photo-input"
        label="Ảnh chụp hiện trường vườn"
        picker={photo}
        required
        title="Chụp ảnh hoặc tải ảnh hiện trường"
        description="Bấm để mở máy ảnh hoặc chọn ảnh thực tế tại vườn (tự động nén nhanh)"
        disabled={saving}
      />

      <InlineError message={error} />
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel="Đang tải ảnh & lưu…"
          disabled={!effectivePlot.trim() || !photo.file}
          title={!photo.file ? "Vui lòng chụp ảnh hiện trường trước khi lưu" : undefined}
        >
          Lưu nhật ký
        </BusyButton>
      </div>
    </form>
  );
}

function SprayForm({
  plotsList,
  onDone,
  onClose,
}: {
  plotsList: PortalPlot[];
  onDone: () => void;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const pesticides = useCatalog<PesticideDto>("pesticides");
  const plotCodes = plotsList.map((p) => p.code);
  const defaultPlotCode = plotCodes[0] ?? "";
  const defaultPlotArea = plotsList[0]?.areaHa ? String(plotsList[0].areaHa) : "";

  const [sprayedOn, setSprayedOn] = useState(todayIso());
  const [plotCode, setPlotCode] = useState<string | null>(null);
  const [pesticideId, setPesticideId] = useState("");
  const [dose, setDose] = useState("");
  const [areaHa, setAreaHa] = useState(defaultPlotArea);
  const [areaTouched, setAreaTouched] = useState(false);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePlot = plotCode ?? defaultPlotCode;
  const chosen = pesticides.rows.find((item) => String(item.id) === pesticideId);

  const handlePlotChange = (nextCode: string) => {
    setPlotCode(nextCode);
    if (!areaTouched) {
      if (!nextCode) {
        const total = plotsList.reduce((sum, p) => sum + Number(p.areaHa || 0), 0);
        if (total > 0) setAreaHa(String(Number(total.toFixed(2))));
      } else {
        const matched = plotsList.find((p) => p.code === nextCode);
        if (matched?.areaHa) setAreaHa(String(matched.areaHa));
      }
    }
  };

  const safeFromIso =
    chosen && (chosen.isolationDays ?? 0) > 0
      ? addIsoDays(sprayedOn, chosen.isolationDays ?? 0)
      : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: CreateSprayBody = {
        sprayedOn,
        pesticideId: Number(pesticideId),
        dose: dose.trim(),
        areaHa: Number(areaHa),
        source: source.trim() || undefined,
        plotCode: effectivePlot.trim() || undefined,
      };
      await api.post("/portal/spray", body);
      invalidatePortal("journal", "spray", "violations", "overview");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Không lưu được nhật ký phun thuốc."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <div className="pt-field-row">
        <Field label="Ngày phun" htmlFor="ps-date">
          <input
            id="ps-date"
            type="date"
            className="pt-input-date"
            max={todayIso()}
            value={sprayedOn}
            onChange={(e) => setSprayedOn(e.target.value)}
            required
          />
        </Field>
        <Field label="Thửa đất" htmlFor="ps-plot">
          {plotCodes.length > 0 ? (
            <select
              id="ps-plot"
              value={effectivePlot}
              onChange={(e) => handlePlotChange(e.target.value)}
            >
              <option value="">Tất cả thửa / Toàn vườn</option>
              {plotsList.map((p) => (
                <option key={p.code} value={p.code}>
                  Thửa {p.code} ({p.areaHa} ha)
                </option>
              ))}
            </select>
          ) : (
            <input
              id="ps-plot"
              placeholder="Mã thửa (không bắt buộc)"
              value={effectivePlot}
              onChange={(e) => setPlotCode(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Loại thuốc" htmlFor="ps-pesticide">
        <select id="ps-pesticide" value={pesticideId} onChange={(e) => setPesticideId(e.target.value)} required>
          <option value="" disabled>
            {pesticides.loading ? "Đang tải danh mục…" : "Chọn thuốc"}
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
      {chosen?.status === "banned" && (
        <p className="pt-form-error" role="alert">
          Thuốc này nằm trong danh mục bị cấm. Không được dùng cho sầu riêng xuất khẩu. Nếu đã lỡ dùng, bạn vẫn nên ghi lại trung thực để cán bộ kỹ thuật HTX kịp thời hỗ trợ xử lý.
        </p>
      )}
      {chosen?.status === "restricted" && (
        <p
          className="pt-hint"
          role="status"
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            color: "#92400e",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          Hoạt chất thuộc diện kiểm soát đặc biệt. Chỉ sử dụng theo hướng dẫn của cán bộ kỹ thuật HTX và tuân thủ nghiêm thời gian cách ly {chosen.isolationDays ?? 0} ngày.
        </p>
      )}
      {chosen && chosen.status !== "banned" && (
        <p className="pt-hint">
          Thời gian cách ly: <strong>{chosen.isolationDays ?? 0} ngày</strong> trước thu hoạch
          {safeFromIso ? ` (được phép thu hái từ ngày ${formatDate(safeFromIso)})` : ""}.
        </p>
      )}
      <div className="pt-field-row">
        <Field label="Liều lượng" htmlFor="ps-dose">
          <input id="ps-dose" placeholder="100ml / bình 20L" value={dose} onChange={(e) => setDose(e.target.value)} required />
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
      <Field label="Nơi mua / Đại lý VTNN (không bắt buộc)" htmlFor="ps-source">
        <input id="ps-source" placeholder="Tên cửa hàng vật tư nông nghiệp" value={source} onChange={(e) => setSource(e.target.value)} />
      </Field>
      <InlineError message={error} />
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel="Đang lưu…"
          disabled={!pesticideId || !dose.trim() || !areaHa}
        >
          Lưu nhật ký phun
        </BusyButton>
      </div>
    </form>
  );
}

type View = "journal" | "spray";

interface VietgapRule {
  id: string;
  kicker: string;
  title: string;
  desc: string;
  nodeType: "active" | "warn" | "danger";
  cardClass: string;
}

const VIETGAP_RULES: VietgapRule[] = [
  {
    id: "frequency",
    kicker: "QUY TẮC 1 · ĐỊNH KỲ",
    title: "Ghi nhật ký 7 ngày/lần",
    desc: "Cập nhật đều đặn các việc tưới tiêu, bón phân, tỉa cành, bao trái phục vụ kiểm tra vùng trồng.",
    nodeType: "active",
    cardClass: "pt-vietgap-card-frequency",
  },
  {
    id: "phi",
    kicker: "QUY TẮC 2 · CÁCH LY",
    title: "Cách ly trước thu hoạch",
    desc: "Ngưng dùng phân thuốc trước ngày thu hoạch đúng thời hạn (PHI) để không vượt tồn dư cho phép.",
    nodeType: "warn",
    cardClass: "pt-vietgap-card-phi",
  },
  {
    id: "banned",
    kicker: "QUY TẮC 3 · AN TOÀN",
    title: "Cấm thuốc ngoài danh mục",
    desc: "Tuyệt đối không dùng chất nhuộm màu (Vàng O), hoạt chất cấm Chlorpyrifos hoặc thuốc chưa cấp phép.",
    nodeType: "danger",
    cardClass: "pt-vietgap-card-banned",
  },
];

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
          <div className="pt-detail-hero-sub">
            <span className="pt-detail-badge-plot">Thửa {entry.plotCode}</span>
            <span className="pt-detail-date">{formatDate(entry.entryOn)}</span>
            {entry.photoUrl && <Pill tone="green">Có ảnh hiện trường</Pill>}
          </div>
        </div>
      </div>

      <div className="pt-detail-grid">
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Thửa canh tác</span>
          <span className="pt-detail-cell-value">Thửa {entry.plotCode}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Ngày thực hiện</span>
          <span className="pt-detail-cell-value">{formatDate(entry.entryOn)}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Người ghi chép</span>
          <span className="pt-detail-cell-value">{entry.recorder || "Chủ hộ"}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Mã ghi nhận</span>
          <span className="pt-detail-cell-value">#NK-{entry.id}</span>
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
            <div className="pt-detail-gps-title">Tọa độ GPS thực địa</div>
            <div className="pt-detail-gps-coords">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </div>
          </div>
        </div>
      )}

      {/* Ảnh chụp hiện trường minh chứng thực tế */}
      <div className="pt-detail-section">
        <div className="pt-detail-section-header">
          <h4 className="pt-detail-section-title">Ảnh chụp hiện trường vườn</h4>
          {entry.photoUrl && <span className="pt-detail-photo-tag">✓ Đã xác thực thực địa</span>}
        </div>
        {entry.photoUrl ? (
          <StoredPhoto
            url={entry.photoUrl}
            alt={`Hiện trường ${entry.activity}`}
            caption={`Thửa ${entry.plotCode} · Ngày ${formatDate(entry.entryOn)}`}
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
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <RadialPngIcon src="/trash.png" size={15} />
                <span>Xóa bản ghi này (trong 24h)</span>
              </span>
            }
            question="Xác nhận xóa bản ghi nhật ký này?"
            confirmLabel="Xóa nhật ký"
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
  const isRestricted = record.pesticideStatus === "restricted";
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
          <div className="pt-detail-hero-sub">
            {record.plotCode && <span className="pt-detail-badge-plot">Thửa {record.plotCode}</span>}
            <span className="pt-detail-date">{formatDate(record.sprayedOn)}</span>
            {isPass ? <Pill tone="green">Đạt chuẩn MRL</Pill> : <Pill tone="red">Không đạt chuẩn</Pill>}
            {inIsolation && <Pill tone="gold">Còn cách ly {remainingPhiDays} ngày</Pill>}
            {isRestricted && <Pill tone="gold">Hạn chế</Pill>}
            {isBanned && <Pill tone="red">Thuốc cấm</Pill>}
          </div>
        </div>
      </div>

      <div className="pt-detail-grid">
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Liều lượng sử dụng</span>
          <span className="pt-detail-cell-value">{record.dose}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Diện tích phun</span>
          <span className="pt-detail-cell-value">
            {record.areaHa} ha{record.plotCode ? ` · Thửa ${record.plotCode}` : " · Toàn vườn"}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Cách ly trước thu hoạch (PHI)</span>
          <span className="pt-detail-cell-value">{record.isolationDays} ngày</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Được phép thu hái từ</span>
          <span className="pt-detail-cell-value">
            {safeDateIso ? formatDate(safeDateIso) : formatDate(record.sprayedOn)}
          </span>
        </div>
      </div>

      <div className="pt-detail-section">
        <h4 className="pt-detail-section-title">Nguồn gốc & Đại lý cung cấp</h4>
        <div className="pt-detail-content-box">
          <p className="pt-detail-text">
            {record.source || "Chưa ghi nhận đại lý cung cấp"}
          </p>
        </div>
      </div>

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
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <RadialPngIcon src="/trash.png" size={15} />
                <span>Xóa bản ghi này (trong 24h)</span>
              </span>
            }
            question="Xác nhận xóa bản ghi phun thuốc nhập nhầm này?"
            confirmLabel="Xóa bản ghi"
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

function ViolationResponseForm({
  violation,
  onDone,
  onClose,
}: {
  violation: PortalViolation;
  onDone: () => void;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const [note, setNote] = useState(violation.farmerResponse ?? "");
  const photo = usePhotoPicker("violation");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanNote = note.trim();
    if (!cleanNote) {
      setError("Vui lòng mô tả biện pháp đã khắc phục.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoId = await photo.ensureUploaded();
      await api.post(`/portal/violations/${violation.id}/response`, {
        note: cleanNote,
        photoId,
      });
      invalidatePortal("violations", "journal", "spray", "overview");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Không gửi được phản hồi khắc phục."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <div className="pt-notice" style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 12 }}>
        <strong style={{ display: "block", color: "#92400e", marginBottom: 4 }}>{violation.title}</strong>
        {violation.description && (
          <p style={{ margin: 0, fontSize: 13, color: "#78350f" }}>{violation.description}</p>
        )}
      </div>

      <Field label="Nội dung báo cáo đã khắc phục" htmlFor="vr-note">
        <textarea
          id="vr-note"
          rows={4}
          maxLength={1000}
          placeholder="Mô tả rõ công việc gia đình đã thực hiện để khắc phục (ví dụ: Đã cập nhật nhật ký canh tác, đã thu gom vỏ bao bì thuốc BVTV về kho chứa...)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
        />
      </Field>

      <PhotoField
        id="vr-photo"
        label="Ảnh minh chứng sau khắc phục (tùy chọn)"
        picker={photo}
        title="Chụp ảnh hoặc tải ảnh minh chứng"
        description="Gửi kèm ảnh thực tế giúp cán bộ kiểm tra xác nhận đóng cảnh báo/vi phạm nhanh hơn"
        disabled={saving}
      />

      <InlineError message={error} />

      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel="Đang gửi báo cáo…"
          disabled={!note.trim()}
        >
          Gửi báo cáo khắc phục
        </BusyButton>
      </div>
    </form>
  );
}

export default function DiaryTab({ initialAction }: { initialAction?: PortalAction } = {}) {
  // Mở sẵn đúng màn hình khi bà con chọn gợi ý từ ô tìm kiếm
  const [view, setView] = useState<View>(() =>
    initialAction === "spray-add" || initialAction === "spray-list" ? "spray" : "journal",
  );
  const [form, setForm] = useState<View | null>(() =>
    initialAction === "journal-add" ? "journal" : initialAction === "spray-add" ? "spray" : null,
  );
  const [selectedJournal, setSelectedJournal] = useState<PortalJournalEntry | null>(null);
  const [selectedSpray, setSelectedSpray] = useState<PortalSprayRecord | null>(null);
  const [respondingViolation, setRespondingViolation] = useState<PortalViolation | null>(null);
  const journal = usePortal<PortalList<PortalJournalEntry>>("journal");
  const spray = usePortal<PortalList<PortalSprayRecord>>("spray");
  const violations = usePortal<PortalList<PortalViolation>>("violations");
  const plots = usePortal<PortalPlots>("plots");
  const plotsList = plots.data?.available ? plots.data.data : [];
  const plotCodes = plotsList.map((plot) => plot.code);
  const violationsList = violations.data?.data ?? [];

  const done = () => {
    setForm(null);
  };

  const active = view === "journal" ? journal : spray;

  return (
    <div className="pt-stack">
      {/* KHỐI CẢNH BÁO & VI PHẠM NHẬT KÝ CANH TÁC */}
      <Card
        title="Vi phạm"
        action={<span className="pt-viol-count">{violationsList.length}</span>}
      >
        <StateBlock loading={violations.loading} error={violations.error} />
        {!violations.loading && violationsList.length === 0 && (
          <EmptyState icon="recyclebin">Hộ của bạn không có cảnh báo hay vi phạm nhật ký nào. Hãy tiếp tục duy trì ghi chép đúng quy chuẩn VietGAP.</EmptyState>
        )}
        {violationsList.length > 0 && (
          <ul className="pt-list">
            {violationsList.map((v) => {
              const isOpen = v.status === "open";
              // Vi phạm "chưa cập nhật nhật ký" mà chưa có nhật ký mới từ ngày phát hiện: hướng hộ đi ghi nhật ký
              // (ghi xong hệ thống tự ghi nhận phản hồi khắc phục), không cho bấm "đã khắc phục" suông.
              const needsJournal =
                isOpen && !!v.isJournalViolation && !(v.lastJournalOn && v.lastJournalOn >= v.detectedOn);

              return (
                <li key={v.id} className="pt-notice pt-viol-item">
                  <div className="pt-viol-main">
                    <strong className="pt-viol-title">{v.title}</strong>
                    <div className="pt-viol-details">
                      {v.description && <p className="pt-viol-desc">{v.description}</p>}
                      <p className="pt-notice-meta pt-viol-meta">
                        Phát hiện: {formatDate(v.detectedOn)}
                        {v.plotCode ? ` · Thửa ${v.plotCode}` : ""}
                      </p>
                    </div>
                  </div>

                  {v.farmerResponse && (
                    <div className="pt-viol-box pt-viol-box-response">
                      <span className="pt-viol-box-label">
                        Phản hồi của hộ{v.farmerResponseAt ? ` · ${formatDate(v.farmerResponseAt)}` : ""}
                      </span>
                      <p>{v.farmerResponse}</p>
                      {v.farmerResponsePhotoUrl && (
                        <div style={{ marginTop: 8 }}>
                          <StoredPhoto
                            url={v.farmerResponsePhotoUrl}
                            alt={`Ảnh khắc phục ${v.title}`}
                            caption="Ảnh minh chứng khắc phục của hộ"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {(v.resolvedOn || v.resolutionNotes) && (
                    <div className="pt-viol-box pt-viol-box-resolved">
                      <strong>
                        Đã xác nhận khắc phục{v.resolvedOn ? ` ngày ${formatDate(v.resolvedOn)}` : ""}
                      </strong>
                      {v.resolutionNotes ? `: ${v.resolutionNotes}` : ""}
                    </div>
                  )}

                  {isOpen && (
                    <div className="pt-viol-foot">
                      <button
                        type="button"
                        className="pt-btn pt-btn-primary pt-btn-sm pt-viol-action"
                        onClick={() => {
                          if (needsJournal) {
                            setView("journal");
                            setForm("journal");
                          } else {
                            setRespondingViolation(v);
                          }
                        }}
                      >
                        {needsJournal ? "Ghi nhật ký" : v.farmerResponse ? "Cập nhật khắc phục" : "Báo đã khắc phục"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <SectionDivider />

      <SegmentedTabs ariaLabel="Loại nhật ký" activeKey={view} className="pt-diary-segmented">
        <button type="button" role="tab" aria-selected={view === "journal"} className={view === "journal" ? "active" : ""} onClick={() => setView("journal")}>
          Canh tác
        </button>
        <button type="button" role="tab" aria-selected={view === "spray"} className={view === "spray" ? "active" : ""} onClick={() => setView("spray")}>
          Phun thuốc
        </button>
      </SegmentedTabs>

      <div className="pt-grid-2">
        <section
          className="pt-reminders-widget pt-diary-widget"
          aria-label={view === "journal" ? "Nhật ký canh tác" : "Nhật ký phun thuốc"}
        >
          <div className="pt-widget-topbar">
            <div className="pt-widget-topbar-info">
              <h2 className="pt-widget-topbar-title">
                {view === "journal" ? "Nhật ký" : "Phun thuốc"}
              </h2>
            </div>
            <button
              type="button"
              className="pt-widget-topbar-btn is-primary"
              onClick={() => setForm(view)}
              title="Thêm ghi chép mới"
            >
              Thêm mới
            </button>
          </div>

          <div className="pt-widget-sheet">
            <StateBlock loading={active.loading} error={active.error} />

            {view === "journal" && journal.data && journal.data.data.length === 0 && (
              <EmptyState icon="empty">Chưa có nhật ký nào. Bấm “Thêm mới” để ghi công việc đầu tiên.</EmptyState>
            )}
            {view === "journal" && journal.data && journal.data.data.length > 0 && (
              <ul className="pt-widget-list pt-diary-widget-list" role="list">
                {journal.data.data.map((entry) => (
                  <li key={entry.id}>
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
                        {entry.plotCode ? ` · ${entry.plotCode}` : ""}
                      </span>
                      <span className="pt-diary-item-date">{formatDate(entry.entryOn)}</span>
                      <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {view === "spray" && spray.data && spray.data.data.length === 0 && (
              <EmptyState icon="spray">Chưa có lần phun thuốc nào được ghi.</EmptyState>
            )}
            {view === "spray" && spray.data && spray.data.data.length > 0 && (
              <ul className="pt-widget-list pt-diary-widget-list" role="list">
                {spray.data.data.map((record) => (
                  <li key={record.id}>
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
                      title="Bấm để xem chi tiết phun thuốc"
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
                        {record.pesticide}
                        {record.plotCode ? ` · ${record.plotCode}` : ""}
                      </span>
                      <span className="pt-diary-item-date">{formatDate(record.sprayedOn)}</span>
                      <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="pt-schedule-section pt-vietgap-section" aria-labelledby="vietgap-heading">
          <div className="pt-schedule-header">
            <h2 id="vietgap-heading" className="pt-schedule-title">
              Quy chuẩn VietGAP
            </h2>
          </div>
          <div className="pt-vietgap-timeline" role="list">
            {VIETGAP_RULES.map((rule) => (
              <div key={rule.id} className="pt-vietgap-step" role="listitem">
                <div className="pt-vietgap-segment">
                  <div className={`pt-vietgap-content pt-vietgap-card ${rule.cardClass}`}>
                    <span className="pt-timeline-kicker">{rule.kicker}</span>
                    <h3 className="pt-timeline-title">{rule.title}</h3>
                    <p className="pt-timeline-desc">{rule.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {form === "journal" && (
        <Sheet title="Ghi nhật ký canh tác" onClose={() => setForm(null)}>
          <JournalForm
            plotCodes={plotCodes}
            onDone={done}
            onClose={() => setForm(null)}
            onSwitchToSpray={() => {
              setView("spray");
              setForm("spray");
            }}
          />
        </Sheet>
      )}
      {form === "spray" && (
        <Sheet title="Ghi nhật ký phun thuốc" onClose={() => setForm(null)}>
          <SprayForm
            plotsList={plotsList}
            onDone={done}
            onClose={() => setForm(null)}
          />
        </Sheet>
      )}

      {selectedJournal && (
        <Sheet title="Chi tiết nhật ký canh tác" onClose={() => setSelectedJournal(null)}>
          <JournalDetailModal
            entry={selectedJournal}
            onClose={() => setSelectedJournal(null)}
            onDeleted={() => setSelectedJournal(null)}
          />
        </Sheet>
      )}

      {selectedSpray && (
        <Sheet title="Chi tiết lần phun thuốc" onClose={() => setSelectedSpray(null)}>
          <SprayDetailModal
            record={selectedSpray}
            onClose={() => setSelectedSpray(null)}
            onDeleted={() => setSelectedSpray(null)}
          />
        </Sheet>
      )}

      {respondingViolation && (
        <Sheet
          title="Báo đã khắc phục vi phạm"
          onClose={() => setRespondingViolation(null)}
        >
          <ViolationResponseForm
            violation={respondingViolation}
            onDone={() => setRespondingViolation(null)}
            onClose={() => setRespondingViolation(null)}
          />
        </Sheet>
      )}
    </div>
  );
}
