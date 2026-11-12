import { SEASON } from "./data";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function Season() {
  return (
    <div className="sw-grid sw-season-band">
      <div className="sw-cell sw-col-1 sw-between">
        <div>
          <span className="sw-micro">Chu kỳ sinh trưởng</span>
          <h3 className="sw-cell-title sw-mt-8">Lịch mùa vụ Tây Nguyên</h3>
        </div>
        <p className="sw-muted-sm">
          Thời điểm thực tế thay đổi theo giống, độ cao và thời tiết từng năm; bà con đối chiếu thêm cùng cán bộ kỹ thuật HTX.
        </p>
      </div>

      <div className="sw-cell sw-col-2-4 sw-season-matrix-wrap">
        <div className="sw-season-months" aria-hidden="true">
          {MONTHS.map((m) => (
            <span key={m}>T{m}</span>
          ))}
        </div>

        <div className="sw-season-rows" role="list" aria-label="Lịch mùa vụ sầu riêng theo tháng">
          {SEASON.map((bar) => (
            <div key={`${bar.label}-${bar.start}`} className="sw-season-item" role="listitem">
              <div className="sw-season-meta">
                <span className="sw-season-label">{bar.label}</span>
                <span className="sw-season-range">
                  {bar.start === bar.end ? `Tháng ${bar.start}` : `Tháng ${bar.start} – ${bar.end}`}
                </span>
              </div>
              <div className="sw-season-track" aria-hidden="true">
                <span
                  className="sw-season-fill"
                  style={{ gridColumn: `${bar.start} / ${bar.end + 1}` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
