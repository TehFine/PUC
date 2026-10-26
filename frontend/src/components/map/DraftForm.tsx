import type { PlotSource } from "@/types/geo";
import { formatHa } from "@/utils/plot-utils";
import type { DraftState, PlotForm, PreviewState } from "./map-types";

interface DraftFormProps {
  draft: DraftState;
  preview: PreviewState;
  form: PlotForm;
  saving: boolean;
  onChange: (form: PlotForm) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function DraftForm({ draft, preview, form, saving, onChange, onSave, onCancel }: DraftFormProps) {
  return (
    <>
      <div className="plotmap-metrics">
        <div><span>Diện tích vẽ</span><strong>{formatHa(draft.areaHa)}</strong></div>
        <div><span>Chu vi</span><strong>{(preview.perimeterKm * 1000).toFixed(0)} m</strong></div>
      </div>
      <div className="plotmap-form">
        <label className="map-field full">
          <span>Mã thửa</span>
          <input value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} />
        </label>
        <label className="map-field">
          <span>Số tờ</span>
          <input value={form.sheet} onChange={(event) => onChange({ ...form, sheet: event.target.value })} />
        </label>
        <label className="map-field">
          <span>Số thửa</span>
          <input value={form.parcel} onChange={(event) => onChange({ ...form, parcel: event.target.value })} />
        </label>
        <label className="map-field full">
          <span>Chủ hộ</span>
          <input value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })} />
        </label>
        <label className="map-field">
          <span>Thôn</span>
          <input value={form.village} onChange={(event) => onChange({ ...form, village: event.target.value })} />
        </label>
        <label className="map-field">
          <span>Mã vùng</span>
          <input value={form.zone} onChange={(event) => onChange({ ...form, zone: event.target.value })} />
        </label>
        <label className="map-field full">
          <span>Giống</span>
          <input value={form.variety} onChange={(event) => onChange({ ...form, variety: event.target.value })} />
        </label>
        <label className="map-field">
          <span>Năm trồng</span>
          <input
            inputMode="numeric"
            value={form.year}
            onChange={(event) => onChange({ ...form, year: event.target.value.replace(/[^0-9]/g, "") })}
          />
        </label>
        <label className="map-field">
          <span>Nguồn dữ liệu</span>
          <select
            value={form.source}
            onChange={(event) => onChange({ ...form, source: event.target.value as PlotSource })}
          >
            <option value="declared">Hộ khai báo</option>
            <option value="measured">Cán bộ đo</option>
            <option value="cadastral">Địa chính</option>
          </select>
        </label>
      </div>
      <div className="plotmap-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu thửa"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </>
  );
}
