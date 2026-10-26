"use client";

import { FormEvent, useState } from "react";
import { usePortal } from "@/hooks/use-portal";
import { useResource } from "@/hooks/use-resource";
import { ApiError, api } from "@/lib/api-client";
import { JOURNAL_ACTIVITIES, PESTICIDE_STATUS, todayIso } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PesticideDto } from "@/types/api";
import type { PortalJournalEntry, PortalList, PortalPlots, PortalSprayRecord } from "@/types/portal";
import { Card, EmptyState, Field, Pill, Sheet, StateBlock } from "./ui";

const keep = (pesticide: PesticideDto) => pesticide;

const errorText = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : "Không lưu được. Vui lòng thử lại.";

function JournalForm({ plotCodes, onDone, onClose }: { plotCodes: string[]; onDone: () => void; onClose: () => void }) {
  const [entryOn, setEntryOn] = useState(todayIso());
  const [plotCode, setPlotCode] = useState(plotCodes[0] ?? "");
  const [activity, setActivity] = useState(JOURNAL_ACTIVITIES[0]);
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/portal/journal", { entryOn, plotCode: plotCode.trim(), activity, detail: detail.trim() || undefined });
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
      <Field label="Ghi chú (không bắt buộc)" htmlFor="pj-detail">
        <textarea id="pj-detail" rows={3} maxLength={500} placeholder="Ví dụ: NPK 16-16-8, 200 kg/ha" value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      {error && <p className="pt-form-error" role="alert">{error}</p>}
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={onClose}>
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
        <button type="button" className="pt-btn pt-btn-ghost" onClick={onClose}>
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

export default function DiaryTab() {
  const [view, setView] = useState<View>("journal");
  const [form, setForm] = useState<View | null>(null);
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

      <Card
        title={view === "journal" ? "Nhật ký canh tác" : "Nhật ký phun thuốc"}
        action={
          <button type="button" className="pt-btn pt-btn-primary pt-btn-sm" onClick={() => setForm(view)}>
            + Thêm
          </button>
        }
      >
        <StateBlock loading={active.loading} error={active.error} />

        {view === "journal" && journal.data && journal.data.data.length === 0 && (
          <EmptyState icon="📝">Chưa có nhật ký nào. Bấm “+ Thêm” để ghi công việc đầu tiên.</EmptyState>
        )}
        {view === "journal" && journal.data && journal.data.data.length > 0 && (
          <ul className="pt-list">
            {journal.data.data.map((entry) => (
              <li key={entry.id} className="pt-row">
                <div className="pt-date">{formatDate(entry.entryOn)}</div>
                <div className="pt-row-main">
                  <strong>{entry.activity}</strong>
                  <span>
                    Thửa {entry.plotCode} · {entry.recorder}
                  </span>
                  {entry.detail && <span>{entry.detail}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {view === "spray" && spray.data && spray.data.data.length === 0 && (
          <EmptyState icon="🧪">Chưa có lần phun thuốc nào được ghi.</EmptyState>
        )}
        {view === "spray" && spray.data && spray.data.data.length > 0 && (
          <ul className="pt-list">
            {spray.data.data.map((record) => (
              <li key={record.id} className="pt-row pt-row-wrap">
                <div className="pt-date">{formatDate(record.sprayedOn)}</div>
                <div className="pt-row-main">
                  <strong>{record.pesticide}</strong>
                  <span>
                    {record.dose} · {record.areaHa} ha · cách ly {record.isolationDays} ngày
                  </span>
                  {record.source && <span>{record.source}</span>}
                </div>
                {record.mrlStatus === "pass" ? <Pill tone="green">Đạt</Pill> : <Pill tone="red">Không đạt</Pill>}
                {record.pesticideStatus === "banned" && <Pill tone={PESTICIDE_STATUS.banned.tone}>Thuốc cấm</Pill>}
              </li>
            ))}
          </ul>
        )}
      </Card>

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
    </div>
  );
}
