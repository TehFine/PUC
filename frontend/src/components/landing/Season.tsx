import { SEASON } from "./data";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Lịch mùa vụ tham khảo (Tây Nguyên): mỗi thanh trải theo tháng bằng grid-column. */
export default function Season() {
  return (
    <div className="lp-season lp-glass">
      <p className="lp-label">
        LỊCH MÙA VỤ THAM KHẢO · TÂY NGUYÊN
      </p>
      <div className="lp-season-scroll">
        <div className="lp-season-grid" role="img" aria-label="Lịch mùa vụ sầu riêng theo tháng">
          {MONTHS.map((month) => (
            <span key={month} className="lp-season-month" style={{ gridColumn: month, gridRow: 1 }}>
              T{month}
            </span>
          ))}
          {SEASON.map((bar, row) => (
            <span
              key={`${bar.label}-${bar.start}`}
              className={`lp-season-bar ${bar.tone}`}
              style={{ gridColumn: `${bar.start} / ${bar.end + 1}`, gridRow: row + 2 }}
            >
              {bar.label}
            </span>
          ))}
        </div>
      </div>
      {/* Bản gọn cho điện thoại: mỗi giai đoạn một dòng, thanh 12 tháng bên dưới */}
      <div className="lp-season-compact">
        <div className="lp-season-ruler" aria-hidden="true">
          {MONTHS.map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
        {SEASON.map((bar) => (
          <div key={`${bar.label}-${bar.start}`} className="lp-season-row">
            <div className="lp-season-row-head">
              <span>{bar.label}</span>
              <em>{bar.start === bar.end ? `T${bar.start}` : `T${bar.start}–T${bar.end}`}</em>
            </div>
            <div className="lp-season-track">
              <i className={bar.tone} style={{ gridColumn: `${bar.start} / ${bar.end + 1}` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="lp-season-note">
        Thời điểm thực tế thay đổi theo giống, độ cao và thời tiết từng năm; hãy hỏi thêm cán bộ kỹ thuật của HTX.
      </p>
    </div>
  );
}
