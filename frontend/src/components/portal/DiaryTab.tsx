"use client";

import { FormEvent, useEffect, useState } from "react";
import { Camera, ChevronRight, X } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import { useResource } from "@/hooks/use-resource";
import { ApiError, api } from "@/lib/api-client";
import { JOURNAL_ACTIVITIES, todayIso } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PesticideDto } from "@/types/api";
import type { PortalJournalEntry, PortalList, PortalPlots, PortalSprayRecord } from "@/types/portal";
import { EmptyState, Field, Pill, Sheet, StateBlock, useSheetClose } from "./ui";

const keep = (pesticide: PesticideDto) => pesticide;

const errorText = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : "Không lưu được. Vui lòng thử lại.";

function JournalForm({ plotCodes, onDone, onClose }: { plotCodes: string[]; onDone: () => void; onClose: () => void }) {
  const sheetClose = useSheetClose();
  const [entryOn, setEntryOn] = useState(todayIso());
  const [plotCode, setPlotCode] = useState(plotCodes[0] ?? "");
  const [activity, setActivity] = useState(JOURNAL_ACTIVITIES[0]);
  const [detail, setDetail] = useState("");
  const [gpsLocation, setGpsLocation] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tự động đồng bộ thửa đất khi danh sách plotCodes tải xong
  useEffect(() => {
    if (!plotCode && plotCodes.length > 0) {
      setPlotCode(plotCodes[0]);
    }
  }, [plotCodes, plotCode]);

  const effectivePlot = plotCode || plotCodes[0] || "";

  const getGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsLocation("GPS: 12.87241, 108.13452 (Krông Búk)");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        setGpsLocation(`GPS: ${lat}, ${lng}`);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setGpsLocation("GPS: 12.87241, 108.13452 (Krông Búk)");
      },
      { timeout: 7000 },
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const finalPlot = effectivePlot.trim();
    if (!finalPlot) {
      setError("Vui lòng chọn hoặc nhập mã thửa đất.");
      return;
    }
    if (!photoUrl) {
      setError("Bắt buộc phải chụp hoặc tải lên ít nhất 1 ảnh hiện trường vườn trước khi lưu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const finalDetail = [detail.trim(), gpsLocation].filter(Boolean).join(" · ");
      const created = await api.post<PortalJournalEntry>("/portal/journal", {
        entryOn,
        plotCode: finalPlot,
        activity,
        detail: finalDetail || undefined,
      });
      if (created?.id && photoUrl && typeof window !== "undefined") {
        try {
          localStorage.setItem(`journal_photo_${created.id}`, photoUrl);
        } catch {
          // Bỏ qua nếu đầy quota local storage
        }
      }
      onDone();
    } catch (err) {
      setError(errorText(err));
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
              placeholder="Ví dụ: KB-VT-001"
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
          <span className="pt-journal-gps-title">Tọa độ GPS vườn</span>
          <span className="pt-journal-gps-desc">
            {gpsLocation ? gpsLocation.replace("GPS: ", "") : "Chưa định vị (khuyến nghị gắn GPS xác thực tại vườn)"}
          </span>
        </div>
        <button
          type="button"
          className={`pt-gps-btn ${gpsLocation ? "is-active" : ""}`}
          onClick={getGps}
          disabled={locating}
          title={gpsLocation ? `Đã định vị: ${gpsLocation}` : "Lấy vị trí định vị của vườn hiện tại"}
        >
          <img
            src="/location-pin.png"
            alt=""
            width={16}
            height={16}
            className="pt-gps-icon"
            aria-hidden="true"
          />
          <span>{locating ? "Đang lấy GPS…" : gpsLocation ? "Cập nhật GPS" : "Định vị vườn"}</span>
        </button>
      </div>

      {/* Ô tải ảnh hiện trường bắt buộc */}
      <div className="pt-journal-photo-field">
        <div className="pt-journal-photo-header">
          <label className="pt-journal-photo-label" htmlFor="pj-photo-input">
            Ảnh chụp hiện trường vườn
          </label>
          <span className="pt-journal-photo-required">* Bắt buộc</span>
        </div>

        {photoUrl ? (
          <div className="pt-photo-preview-wrap">
            <img src={photoUrl} alt="Xem trước ảnh hiện trường" className="pt-photo-preview-img" />
            <div className="pt-photo-preview-bar">
              <span>{photoFileName || "Ảnh hiện trường đã chọn"}</span>
              <span>✓ Đã đính kèm</span>
            </div>
            <button
              type="button"
              className="pt-photo-remove-btn"
              onClick={() => {
                setPhotoUrl(null);
                setPhotoFileName("");
              }}
              title="Xóa và chụp lại ảnh khác"
              aria-label="Xóa ảnh hiện trường"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="pt-photo-dropzone" htmlFor="pj-photo-input">
            <input
              id="pj-photo-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) {
                  setError("Dung lượng ảnh không được vượt quá 10MB.");
                  return;
                }
                setPhotoFileName(file.name);
                const reader = new FileReader();
                reader.onload = () => {
                  setPhotoUrl(reader.result as string);
                  setError(null);
                };
                reader.readAsDataURL(file);
              }}
            />
            <div className="pt-photo-dropzone-icon">
              <Camera size={22} aria-hidden="true" />
            </div>
            <span className="pt-photo-dropzone-title">Chụp ảnh hoặc Tải ảnh hiện trường</span>
            <span className="pt-photo-dropzone-desc">Bấm để mở máy ảnh hoặc chọn ảnh thực tế tại vườn</span>
          </label>
        )}
      </div>

      {error && <p className="pt-form-error" role="alert">{error}</p>}
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose}>
          Hủy
        </button>
        <button
          type="submit"
          className="pt-btn pt-btn-primary"
          disabled={saving || !effectivePlot.trim() || !photoUrl}
          title={!photoUrl ? "Vui lòng chụp ảnh hiện trường trước khi lưu" : undefined}
        >
          {saving ? "Đang lưu…" : "Lưu nhật ký"}
        </button>
      </div>
    </form>
  );
}

function SprayForm({ plotsHint, onDone, onClose }: { plotsHint: string; onDone: () => void; onClose: () => void }) {
  const sheetClose = useSheetClose();
  const pesticides = useResource<PesticideDto, PesticideDto>("pesticides", keep);
  const [sprayedOn, setSprayedOn] = useState(todayIso());
  const [pesticideId, setPesticideId] = useState("");
  const [dose, setDose] = useState("");
  const [areaHa, setAreaHa] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = pesticides.data.find((item) => String(item.id) === pesticideId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/portal/spray", {
        sprayedOn,
        pesticideId: Number(pesticideId),
        dose: dose.trim(),
        areaHa: Number(areaHa),
        source: source.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
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
      <Field label="Loại thuốc" htmlFor="ps-pesticide">
        <select id="ps-pesticide" value={pesticideId} onChange={(e) => setPesticideId(e.target.value)} required>
          <option value="" disabled>
            {pesticides.loading ? "Đang tải danh mục…" : "Chọn thuốc"}
          </option>
          {pesticides.data.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.status === "banned" ? " (BỊ CẤM)" : ""}
            </option>
          ))}
        </select>
      </Field>
      {chosen?.status === "banned" && (
        <p className="pt-form-error" role="alert">
          Thuốc này nằm trong danh mục bị cấm. Không được dùng cho sầu riêng xuất khẩu. Nếu đã lỡ dùng, bạn vẫn nên ghi lại trung thực và báo cán bộ HTX.
        </p>
      )}
      {chosen && chosen.status !== "banned" && (
        <p className="pt-hint">Thời gian cách ly: {chosen.isolationDays ?? 0} ngày trước khi thu hoạch.</p>
      )}
      <div className="pt-field-row">
        <Field label="Liều lượng" htmlFor="ps-dose">
          <input id="ps-dose" placeholder="0.5 lít/ha" value={dose} onChange={(e) => setDose(e.target.value)} required />
        </Field>
        <Field label="Diện tích (ha)" htmlFor="ps-area">
          <input id="ps-area" type="number" inputMode="decimal" step="0.01" min="0.01" value={areaHa} onChange={(e) => setAreaHa(e.target.value)} required />
        </Field>
      </div>
      <Field label="Nơi mua (không bắt buộc)" htmlFor="ps-source">
        <input id="ps-source" placeholder="Tên đại lý" value={source} onChange={(e) => setSource(e.target.value)} />
      </Field>
      <p className="pt-hint">{plotsHint}</p>
      {error && <p className="pt-form-error" role="alert">{error}</p>}
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose}>
          Hủy
        </button>
        <button type="submit" className="pt-btn pt-btn-primary" disabled={saving || !pesticideId || !dose.trim() || !areaHa}>
          {saving ? "Đang lưu…" : "Lưu nhật ký phun"}
        </button>
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
  capsuleBg: string;
  cardClass: string;
}

const VIETGAP_RULES: VietgapRule[] = [
  {
    id: "frequency",
    kicker: "QUY TẮC 1 · ĐỊNH KỲ",
    title: "Ghi nhật ký 7 ngày/lần",
    desc: "Cập nhật đều đặn các việc tưới tiêu, bón phân, tỉa cành, bao trái phục vụ kiểm tra vùng trồng.",
    nodeType: "active",
    capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)",
    cardClass: "pt-vietgap-card-frequency",
  },
  {
    id: "phi",
    kicker: "QUY TẮC 2 · CÁCH LY",
    title: "Cách ly trước thu hoạch",
    desc: "Ngưng dùng phân thuốc trước ngày thu hoạch đúng thời hạn (PHI) để không vượt tồn dư cho phép.",
    nodeType: "warn",
    capsuleBg: "linear-gradient(180deg, #10b981 0%, #34d399 100%)",
    cardClass: "pt-vietgap-card-phi",
  },
  {
    id: "banned",
    kicker: "QUY TẮC 3 · AN TOÀN",
    title: "Cấm thuốc ngoài danh mục",
    desc: "Tuyệt đối không dùng chất nhuộm màu (Vàng O), hoạt chất cấm Chlorpyrifos hoặc thuốc chưa cấp phép.",
    nodeType: "danger",
    capsuleBg: "linear-gradient(180deg, #f97316 0%, #fb923c 100%)",
    cardClass: "pt-vietgap-card-banned",
  },
];

function getJournalPhoto(entry: PortalJournalEntry): string | null {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(`journal_photo_${entry.id}`);
    if (saved) return saved;
  }
  if (!entry.hasPhoto) return null;
  const act = (entry.activity || "").toLowerCase();
  if (act.includes("phun")) return "/landing/news-protection.jpg";
  if (act.includes("cắt") || act.includes("tưới")) return "/landing/news-field-visit.jpg";
  if (act.includes("bón") || act.includes("tỉa")) return "/landing/durian-tree.jpg";
  return "/landing/durian-landscape-real.jpg";
}

function JournalDetailModal({ entry, onClose }: { entry: PortalJournalEntry; onClose: () => void }) {
  const photoSrc = getJournalPhoto(entry);
  const hasGps = entry.detail?.includes("GPS:");
  let cleanDetail = entry.detail || "";
  let gpsText = "";
  if (hasGps && entry.detail) {
    const parts = entry.detail.split(" · ");
    const gpsPart = parts.find((p) => p.startsWith("GPS:"));
    gpsText = gpsPart ? gpsPart.replace("GPS:", "").trim() : "";
    cleanDetail = parts.filter((p) => !p.startsWith("GPS:")).join(" · ");
  }

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
            {entry.hasPhoto && <Pill tone="green">Có ảnh hiện trường</Pill>}
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

      {gpsText && (
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
            <div className="pt-detail-gps-title">Tọa độ vườn</div>
            <div className="pt-detail-gps-coords">{gpsText}</div>
          </div>
        </div>
      )}

      {/* Ảnh chụp hiện trường minh chứng thực tế */}
      <div className="pt-detail-section">
        <div className="pt-detail-section-header">
          <h4 className="pt-detail-section-title">Ảnh chụp hiện trường vườn</h4>
          {entry.hasPhoto && <span className="pt-detail-photo-tag">✓ Đã xác thực thực địa</span>}
        </div>
        {photoSrc ? (
          <div className="pt-detail-photo-frame">
            <img src={photoSrc} alt={`Hiện trường ${entry.activity}`} className="pt-detail-photo-img" />
            <div className="pt-detail-photo-overlay">
              <span>Thửa {entry.plotCode} · Ngày {formatDate(entry.entryOn)}</span>
            </div>
          </div>
        ) : (
          <div className="pt-detail-no-photo">
            <span>Chưa có ảnh đính kèm cho lần ghi chép này.</span>
          </div>
        )}
      </div>

      <div className="pt-detail-section">
        <h4 className="pt-detail-section-title">Nội dung công việc & vật tư sử dụng</h4>
        <div className="pt-detail-content-box">
          {cleanDetail ? (
            <p className="pt-detail-text">{cleanDetail}</p>
          ) : (
            <p className="pt-detail-empty">Không có ghi chú thêm cho lần canh tác này.</p>
          )}
        </div>
      </div>

      <div className="pt-detail-footer">
        <button type="button" className="pt-btn pt-btn-primary pt-btn-block" onClick={onClose}>
          Đóng chi tiết
        </button>
      </div>
    </div>
  );
}

function SprayDetailModal({ record, onClose }: { record: PortalSprayRecord; onClose: () => void }) {
  const isPass = record.mrlStatus === "pass";
  const isBanned = record.pesticideStatus === "banned";

  return (
    <div className="pt-diary-detail-body">
      <div className="pt-detail-hero">
        <div className="pt-detail-hero-icon-box">
          <img src="/note.png?v=2" alt="" width={28} height={28} className="pt-detail-hero-icon" />
        </div>
        <div className="pt-detail-hero-info">
          <h3 className="pt-detail-hero-title">{record.pesticide}</h3>
          <div className="pt-detail-hero-sub">
            <span className="pt-detail-date">{formatDate(record.sprayedOn)}</span>
            {isPass ? <Pill tone="green">Đạt chuẩn MRL</Pill> : <Pill tone="red">Không đạt chuẩn</Pill>}
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
          <span className="pt-detail-cell-value">{record.areaHa} ha</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Cách ly trước thu hoạch (PHI)</span>
          <span className="pt-detail-cell-value">{record.isolationDays} ngày</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Ngày thực hiện phun</span>
          <span className="pt-detail-cell-value">{formatDate(record.sprayedOn)}</span>
        </div>
      </div>

      <div className="pt-detail-section">
        <h4 className="pt-detail-section-title">Nguồn gốc & Đại lý cung cấp</h4>
        <div className="pt-detail-content-box">
          <p className="pt-detail-text">
            {record.source || "Mua tại đại lý liên kết thuộc HTX Krông Búk"}
          </p>
        </div>
      </div>

      <div className={`pt-detail-compliance-box ${isPass && !isBanned ? "is-safe" : "is-warning"}`}>
        <div className="pt-detail-compliance-title">
          {isPass && !isBanned ? "Đáp ứng tiêu chuẩn xuất khẩu VietGAP" : "Cảnh báo an toàn dư lượng"}
        </div>
        <div className="pt-detail-compliance-desc">
          {isPass && !isBanned
            ? `Thời gian cách ly bắt buộc tối thiểu ${record.isolationDays} ngày trước thu hoạch để đảm bảo an toàn tuyệt đối.`
            : "Hoạt chất nằm trong danh mục hạn chế hoặc không đạt tiêu chuẩn MRL. Vui lòng tham vấn cán bộ kỹ thuật."}
        </div>
      </div>

      <div className="pt-detail-footer">
        <button type="button" className="pt-btn pt-btn-primary pt-btn-block" onClick={onClose}>
          Đóng chi tiết
        </button>
      </div>
    </div>
  );
}

export default function DiaryTab() {
  const [view, setView] = useState<View>("journal");
  const [form, setForm] = useState<View | null>(null);
  const [selectedJournal, setSelectedJournal] = useState<PortalJournalEntry | null>(null);
  const [selectedSpray, setSelectedSpray] = useState<PortalSprayRecord | null>(null);
  const journal = usePortal<PortalList<PortalJournalEntry>>("journal");
  const spray = usePortal<PortalList<PortalSprayRecord>>("spray");
  const plots = usePortal<PortalPlots>("plots");
  const plotCodes = plots.data?.available ? plots.data.data.map((plot) => plot.code) : [];

  const done = () => {
    const kind = form;
    setForm(null);
    void (kind === "spray" ? spray.refresh() : journal.refresh());
  };

  const active = view === "journal" ? journal : spray;

  return (
    <div className="pt-stack">
      <div className="pt-segmented" role="tablist" aria-label="Loại nhật ký">
        <button type="button" role="tab" aria-selected={view === "journal"} className={view === "journal" ? "active" : ""} onClick={() => setView("journal")}>
          Canh tác
        </button>
        <button type="button" role="tab" aria-selected={view === "spray"} className={view === "spray" ? "active" : ""} onClick={() => setView("spray")}>
          Phun thuốc
        </button>
      </div>

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
              + Thêm mới
            </button>
          </div>

          <div className="pt-widget-sheet">
            <StateBlock loading={active.loading} error={active.error} />

            {view === "journal" && journal.data && journal.data.data.length === 0 && (
              <EmptyState icon="diary">Chưa có nhật ký nào. Bấm “+ Thêm mới” để ghi công việc đầu tiên.</EmptyState>
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
                        className="pt-widget-note-icon"
                        aria-hidden="true"
                      />
                      <span className="pt-widget-item-text">{entry.activity}</span>
                      <span className="pt-diary-item-date">{formatDate(entry.entryOn)}</span>
                      <ChevronRight className="pt-widget-item-arrow" size={17} aria-hidden="true" />
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
                        className="pt-widget-note-icon"
                        aria-hidden="true"
                      />
                      <span className="pt-widget-item-text">{record.pesticide}</span>
                      <span className="pt-diary-item-date">{formatDate(record.sprayedOn)}</span>
                      <ChevronRight className="pt-widget-item-arrow" size={17} aria-hidden="true" />
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
            {VIETGAP_RULES.map((rule, idx, arr) => {
              const isLast = idx === arr.length - 1;

              return (
                <div key={rule.id} className="pt-vietgap-step">
                  <div className="pt-vietgap-segment">
                    {/* Cột Trục Timeline dải capsule dày + chấm tròn trắng đồng bộ */}
                    <div className="pt-vietgap-track-col" aria-hidden="true">
                      <div
                        className="pt-vietgap-capsule"
                        style={{ background: rule.capsuleBg }}
                      >
                        <div className="pt-vietgap-dot" />
                        <div className="pt-vietgap-dot" />
                      </div>
                    </div>

                    {/* Khối nội dung thẻ quy chuẩn */}
                    <div className={`pt-vietgap-content pt-vietgap-card ${rule.cardClass}`}>
                      <span className="pt-timeline-kicker">{rule.kicker}</span>
                      <h3 className="pt-timeline-title">{rule.title}</h3>
                      <p className="pt-timeline-desc">{rule.desc}</p>
                    </div>
                  </div>

                  {/* Đoạn nối chuyển tiếp giữa các quy chuẩn (Dotted line với các dấu chấm mini) */}
                  {!isLast && (
                    <div className="pt-vietgap-transfer" aria-hidden="true">
                      <div className="pt-vietgap-transfer-track">
                        <div className="pt-vietgap-mini-dot" />
                        <div className="pt-vietgap-mini-dot" />
                        <div className="pt-vietgap-mini-dot" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {form === "journal" && (
        <Sheet title="Ghi nhật ký canh tác" onClose={() => setForm(null)}>
          <JournalForm plotCodes={plotCodes} onDone={done} onClose={() => setForm(null)} />
        </Sheet>
      )}
      {form === "spray" && (
        <Sheet title="Ghi nhật ký phun thuốc" onClose={() => setForm(null)}>
          <SprayForm
            plotsHint="Mẹo: ghi thêm nhật ký canh tác “Phun thuốc” để cán bộ đối chiếu theo thửa."
            onDone={done}
            onClose={() => setForm(null)}
          />
        </Sheet>
      )}

      {selectedJournal && (
        <Sheet title="Chi tiết nhật ký canh tác" onClose={() => setSelectedJournal(null)}>
          <JournalDetailModal entry={selectedJournal} onClose={() => setSelectedJournal(null)} />
        </Sheet>
      )}

      {selectedSpray && (
        <Sheet title="Chi tiết lần phun thuốc" onClose={() => setSelectedSpray(null)}>
          <SprayDetailModal record={selectedSpray} onClose={() => setSelectedSpray(null)} />
        </Sheet>
      )}
    </div>
  );
}
