"use client";

import { FormEvent, useState } from "react";
import { ChevronRight } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import { useResource } from "@/hooks/use-resource";
import { ApiError, api } from "@/lib/api-client";
import { JOURNAL_ACTIVITIES, PESTICIDE_STATUS, todayIso } from "@/lib/portal-labels";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSaving(true);
    setError(null);
    try {
      const finalDetail = [detail.trim(), gpsLocation].filter(Boolean).join(" · ");
      await api.post("/portal/journal", { entryOn, plotCode: plotCode.trim(), activity, detail: finalDetail || undefined });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <Field label="Ngày thực hiện" htmlFor="pj-date">
        <input id="pj-date" type="date" max={todayIso()} value={entryOn} onChange={(e) => setEntryOn(e.target.value)} required />
      </Field>
      <Field label="Thửa đất" htmlFor="pj-plot">
        {plotCodes.length > 0 ? (
          <select id="pj-plot" value={plotCode} onChange={(e) => setPlotCode(e.target.value)}>
            {plotCodes.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        ) : (
          <input id="pj-plot" placeholder="Ví dụ: TH1-001" value={plotCode} onChange={(e) => setPlotCode(e.target.value)} required />
        )}
      </Field>
      <Field label="Công việc" htmlFor="pj-activity">
        <select id="pj-activity" value={activity} onChange={(e) => setActivity(e.target.value)}>
          {JOURNAL_ACTIVITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </Field>
      <Field label="Ghi chú & Vật tư sử dụng" htmlFor="pj-detail">
        <textarea id="pj-detail" rows={3} maxLength={500} placeholder="Ví dụ: Bón phân hữu cơ vi sinh 5 kg/gốc, tưới nước ẩm đều..." value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>

      <div style={{ marginBottom: 14 }}>
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
            width={18}
            height={18}
            className="pt-gps-icon"
            aria-hidden="true"
          />
          <span>
            {locating
              ? "Đang định vị…"
              : gpsLocation
              ? `Đã định vị: ${gpsLocation.replace("GPS: ", "").split(" (")[0]}`
              : "Định vị vườn"}
          </span>
        </button>
      </div>

      {error && <p className="pt-form-error" role="alert">{error}</p>}
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose}>
          Hủy
        </button>
        <button type="submit" className="pt-btn pt-btn-primary" disabled={saving || !plotCode.trim()}>
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
        <input id="ps-date" type="date" max={todayIso()} value={sprayedOn} onChange={(e) => setSprayedOn(e.target.value)} required />
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
  tone: "green" | "gold" | "red";
  tag: string;
  nodeType: "active" | "warn" | "danger";
}

const VIETGAP_RULES: VietgapRule[] = [
  {
    id: "frequency",
    kicker: "QUY TẮC 1 · ĐỊNH KỲ",
    title: "Ghi nhật ký 7 ngày/lần",
    desc: "Cập nhật đều đặn các việc tưới tiêu, bón phân, tỉa cành, bao trái phục vụ kiểm tra vùng trồng.",
    tone: "green",
    tag: "≥ 7 ngày",
    nodeType: "active",
  },
  {
    id: "phi",
    kicker: "QUY TẮC 2 · CÁCH LY",
    title: "Cách ly trước thu hoạch",
    desc: "Ngưng dùng phân thuốc trước ngày thu hoạch đúng thời hạn (PHI) để không vượt tồn dư cho phép.",
    tone: "gold",
    tag: "Chuẩn PHI",
    nodeType: "warn",
  },
  {
    id: "banned",
    kicker: "QUY TẮC 3 · AN TOÀN",
    title: "Cấm thuốc ngoài danh mục",
    desc: "Tuyệt đối không dùng chất nhuộm màu (Vàng O), hoạt chất cấm Chlorpyrifos hoặc thuốc chưa cấp phép.",
    tone: "red",
    tag: "Tuyệt đối cấm",
    nodeType: "danger",
  },
];

function JournalDetailModal({ entry, onClose }: { entry: PortalJournalEntry; onClose: () => void }) {
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
          <span className="pt-detail-cell-label">Thời gian cách ly (PHI)</span>
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
              {active.data?.data && (
                <span className="pt-widget-topbar-count">
                  {active.data.data.length} ghi chép
                </span>
              )}
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
                        width={22}
                        height={22}
                        className="pt-widget-note-icon"
                        aria-hidden="true"
                      />
                      <div className="pt-diary-item-content">
                        <div className="pt-diary-item-top">
                          <strong className="pt-diary-item-title">{entry.activity}</strong>
                          <span className="pt-diary-item-date">{formatDate(entry.entryOn)}</span>
                        </div>
                        <div className="pt-diary-item-sub">
                          <span className="pt-diary-spec-item">Thửa {entry.plotCode}</span>
                          <span className="pt-diary-dot">·</span>
                          <span className="pt-diary-spec-item">{entry.recorder}</span>
                        </div>
                        {entry.detail && (
                          <div className="pt-diary-item-detail-line">
                            {entry.detail}
                          </div>
                        )}
                      </div>
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
                        width={22}
                        height={22}
                        className="pt-widget-note-icon"
                        aria-hidden="true"
                      />
                      <div className="pt-diary-item-content">
                        <div className="pt-diary-item-top">
                          <strong className="pt-diary-item-title">{record.pesticide}</strong>
                          <span className="pt-diary-item-date">{formatDate(record.sprayedOn)}</span>
                        </div>
                        <div className="pt-diary-item-specs">
                          <span className="pt-diary-spec-item">{record.dose}</span>
                          <span className="pt-diary-dot">·</span>
                          <span className="pt-diary-spec-item">Diện tích {record.areaHa} ha</span>
                        </div>
                        <div className="pt-diary-item-badges">
                          {record.mrlStatus === "pass" ? (
                            <Pill tone="green">Đạt MRL</Pill>
                          ) : (
                            <Pill tone="red">Không đạt MRL</Pill>
                          )}
                          {record.pesticideStatus === "banned" && (
                            <Pill tone={PESTICIDE_STATUS.banned.tone}>Thuốc cấm</Pill>
                          )}
                          <span className="pt-pill pt-pill-gold">
                            Cách ly {record.isolationDays} ngày
                          </span>
                          {record.source && (
                            <span className="pt-diary-source-tag" title={record.source}>
                              {record.source}
                            </span>
                          )}
                        </div>
                      </div>
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
          <div className="pt-timeline pt-vietgap-timeline" role="list">
            {VIETGAP_RULES.map((rule, idx, arr) => {
              const isFirst = idx === 0;
              const isLast = idx === arr.length - 1;
              const nodeClass =
                rule.nodeType === "active"
                  ? "is-active"
                  : rule.nodeType === "warn"
                  ? "is-warn"
                  : "is-danger";

              return (
                <div
                  key={rule.id}
                  className={`pt-timeline-item ${isFirst ? "is-first" : ""} ${isLast ? "is-last" : ""}`}
                >
                  <div className="pt-timeline-track" aria-hidden="true">
                    <div className={`pt-timeline-node ${nodeClass}`} />
                  </div>
                  <div className="pt-timeline-content">
                    <div className="pt-vietgap-header-line">
                      <span className="pt-timeline-kicker">{rule.kicker}</span>
                      <Pill tone={rule.tone}>{rule.tag}</Pill>
                    </div>
                    <h3 className="pt-timeline-title">{rule.title}</h3>
                    <p className="pt-timeline-desc">{rule.desc}</p>
                  </div>
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
