"use client";

import { useState, type ReactNode } from "react";
import {
  House,
  TreePine,
  NotebookPen,
  ClipboardCheck,
  Send,
  BookOpen,
} from "lucide-react";
import { COMMUNE_OUTLINE, COMMUNE_RINGS, COMMUNE_ROAD, COMMUNE_VIEWBOX } from "./commune-data";

type TabId = "map" | "diary" | "lab" | "portal";

const TABS: { id: TabId; label: string; blurb: string; title: string; text: string; points: string[] }[] = [
  {
    id: "map",
    label: "Bản đồ vùng trồng",
    blurb: "Mỗi thửa đất có hồ sơ riêng trên máy, thấy rõ ranh giới và diện tích.",
    title: "Mỗi thửa đất đều có “hồ sơ” riêng trên bản đồ",
    text: "Dùng điện thoại đi đo hoặc vẽ ranh giới thửa đất. Hệ thống tự tính diện tích, báo nếu hai thửa đè lên nhau và so với diện tích ghi trong sổ đất.",
    points: ["Vẽ thửa hoặc dùng định vị (GPS) đo ngay ngoài vườn", "Nhập sẵn bản vẽ ranh đất từ hồ sơ địa chính", "Mỗi màu cho biết thửa đã được duyệt hay chưa", "So diện tích hộ khai với diện tích đo thực tế"],
  },
  {
    id: "diary",
    label: "Nhật ký & phun thuốc",
    blurb: "Ghi mỗi lần chăm sóc; hệ thống tự báo nếu dùng thuốc cấm hoặc chưa đủ ngày cách ly.",
    title: "Ghi lại mỗi lần chăm sóc, hệ thống tự kiểm tra giúp bạn",
    text: "Bạn ghi lại việc bón phân, phun thuốc. Hệ thống tự so với danh sách thuốc được phép, số ngày cách ly và mức thuốc còn sót tối đa mà nước nhập khẩu cho phép.",
    points: ["Cảnh báo ngay khi chọn thuốc bị cấm", "Tự tính thời gian cách ly theo từng loại thuốc", "Nhắc hộ khi quá 7 ngày chưa ghi nhật ký", "Mọi thao tác đều được lưu lại để xem lại khi cần"],
  },
  {
    id: "lab",
    label: "Kiểm nghiệm mẫu",
    blurb: "Kết quả thử mẫu (thuốc còn sót, Cadimi, Vàng O) gắn với từng thửa và lô hàng.",
    title: "Kết quả kiểm nghiệm gắn với từng thửa",
    text: "Sau khi lấy mẫu đi thử, kiểm tra viên nhập kết quả vào hệ thống. Nếu không đạt, hệ thống báo cho cán bộ và nhắc hộ khắc phục.",
    points: ["Thuốc còn sót, Cadimi, Vàng O…", "Tự báo đạt hay không đạt theo mức quy định", "Hộ xem được kết quả của chính vườn mình", "Là cơ sở để lô hàng được phép xuất khẩu"],
  },
  {
    id: "portal",
    label: "Cổng hộ dân",
    blurb: "Giao diện riêng cho hộ dân, dùng ngay trên điện thoại.",
    title: "Giao diện riêng cho hộ dân, dùng ngay trên điện thoại",
    text: "Hộ xem thửa đất, sản lượng, thông báo vi phạm và lịch kiểm tra; tự ghi nhật ký và gửi hồ sơ xin duyệt mà không cần đến văn phòng.",
    points: ["Nhắc nhở và thông báo của HTX", "Ghi nhật ký canh tác, phun thuốc", "Gửi hồ sơ đăng ký, theo dõi trạng thái", "Xem lịch tập huấn, danh mục thuốc, giống"],
  },
];

function Frame({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="lp-frame">
      <div className="lp-frame-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>htx-krongbuk</span>
      </div>
      <div className="lp-frame-body">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/* Thửa minh họa đặt trong ranh xã; trạng thái chỉ để minh họa cách tô màu, không phải dữ liệu thật */
const PLOTS = [
  { d: "M212 96 L240 92 L246 114 L218 120 Z", c: "#5cb47f", id: "TH1-001", selected: true },
  { d: "M196 130 L220 126 L224 148 L200 152 Z", c: "#5cb47f", id: "TH1-002" },
  { d: "M250 128 L268 126 L271 146 L253 149 Z", c: "#7aa7d6", id: "TH3-001" },
  { d: "M186 196 L214 192 L218 214 L190 220 Z", c: "#d8b877", id: "TH2-001" },
  { d: "M232 204 L258 200 L262 224 L236 230 Z", c: "#e26643", id: "TH3-002" },
  { d: "M92 148 L116 146 L118 168 L94 172 Z", c: "#5cb47f", id: "TH4-001" },
  { d: "M98 226 L124 222 L126 246 L100 250 Z", c: "#7aa7d6", id: "TH4-002" },
];

function MapMock() {
  return (
    <Frame caption="Ranh giới xã Krông Búk sau quy hoạch · thửa đất minh họa">
      <div className="lp-mock-map">
        <svg viewBox={COMMUNE_VIEWBOX} role="img" aria-label="Bản đồ xã Krông Búk sau quy hoạch với các thửa đất minh họa theo trạng thái">
          <defs>
            <pattern id="lp-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="rgba(20,55,47,.07)" />
            </pattern>
            <linearGradient id="lp-commune-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f6f9e8" />
              <stop offset="1" stopColor="#d5e7bd" />
            </linearGradient>
            <clipPath id="lp-commune-clip">
              <path d={COMMUNE_OUTLINE} />
            </clipPath>
          </defs>
          <rect x="0" y="0" width="480" height="320" fill="#eceee0" />
          <rect x="0" y="0" width="480" height="320" fill="url(#lp-grid)" />

          <path d={COMMUNE_OUTLINE} transform="translate(5 6)" fill="rgba(20,55,47,.16)" />
          <path d={COMMUNE_OUTLINE} fill="url(#lp-commune-fill)" />
          <g clipPath="url(#lp-commune-clip)" fill="none" stroke="#14372f" strokeOpacity=".13" strokeWidth=".9">
            {COMMUNE_RINGS.map((ring) => (
              <path key={ring} d={ring} />
            ))}
          </g>
          <path d={COMMUNE_OUTLINE} fill="none" stroke="#14372f" strokeWidth="1.7" strokeLinejoin="round" />

          <path d={COMMUNE_ROAD} fill="none" stroke="#14372f" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={COMMUNE_ROAD} fill="none" stroke="#f8f23a" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />

          {PLOTS.map((plot) => (
            <path key={plot.id} d={plot.d} fill={plot.c} fillOpacity={plot.selected ? 0.7 : 0.42} stroke={plot.selected ? "#14372f" : plot.c} strokeWidth={plot.selected ? 2 : 1.1} strokeLinejoin="round" />
          ))}
          <g aria-hidden="true">
            <path d="M229 94 v-14" stroke="#14372f" strokeWidth="1.3" />
            <rect x="209" y="66" width="40" height="14" fill="#14372f" />
            <text x="229" y="76" textAnchor="middle" className="lp-map-tag">
              TH1-001
            </text>
          </g>

          <text x="204" y="36" textAnchor="middle" className="lp-map-label">
            EA K’SÔ
          </text>
          <text x="172" y="121" textAnchor="middle" className="lp-map-label">
            CƯ NÉ
          </text>
          <text x="174" y="226" textAnchor="middle" className="lp-map-label">
            K’TI
          </text>
          <text x="217" y="173" textAnchor="middle" className="lp-map-name">
            Krông Búk
          </text>
          <g aria-hidden="true">
            <rect x="119" y="127" width="34" height="14" fill="#fff" stroke="#14372f" strokeWidth="1.1" />
            <text x="136" y="137.4" textAnchor="middle" className="lp-map-road">
              AH17
            </text>
          </g>
        </svg>
        <div className="lp-mock-card">
          <span className="lp-label">THỬA ĐANG CHỌN</span>
          <strong>TH1-001</strong>
          <dl>
            <div><dt>Diện tích</dt><dd>0,82 ha</dd></div>
            <div><dt>Giống</dt><dd>Ri6</dd></div>
            <div><dt>Trạng thái</dt><dd className="ok">Đã duyệt</dd></div>
          </dl>
        </div>
        <div className="lp-mock-legend">
          <span><i style={{ background: "#5cb47f" }} />Đã duyệt</span>
          <span><i style={{ background: "#d8b877" }} />Cần cải thiện</span>
          <span><i style={{ background: "#e26643" }} />Vi phạm</span>
          <span><i style={{ background: "#7aa7d6" }} />Chờ duyệt</span>
        </div>
      </div>
    </Frame>
  );
}

function DiaryMock() {
  const rows = [
    { date: "25/10", title: "Phun thuốc · Buprofezin 400SC", meta: "0,5 lít/ha · 0,82 ha · cách ly 14 ngày", tone: "ok", badge: "Đạt" },
    { date: "24/10", title: "Bón phân · NPK 16-16-8", meta: "Thửa TH1-001 · Chủ hộ", tone: "plain", badge: "Đã ghi" },
    { date: "22/10", title: "Phun thuốc · Abamectin 1.8EC", meta: "0,3 lít/ha · 1,2 ha · cách ly 7 ngày", tone: "ok", badge: "Đạt" },
    { date: "20/10", title: "Cảnh báo · Carbaryl", meta: "Thuốc nằm trong danh mục bị cấm", tone: "bad", badge: "Thuốc cấm" },
  ];
  return (
    <Frame caption="Minh họa nhật ký canh tác và phun thuốc">
      <ul className="lp-mock-list">
        {rows.map((row) => (
          <li key={row.title}>
            <span className="lp-mock-date">{row.date}</span>
            <div>
              <strong>{row.title}</strong>
              <small>{row.meta}</small>
            </div>
            <em className={`lp-badge ${row.tone}`}>{row.badge}</em>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function LabMock() {
  const metrics = [
    { k: "Cadimi", v: "0,012 mg/kg" },
    { k: "Thuốc còn sót (tổng)", v: "0,021 mg/kg" },
    { k: "Chlorpyrifos", v: "Không phát hiện" },
    { k: "Vàng O", v: "Âm tính" },
  ];
  return (
    <Frame caption="Minh họa kết quả kiểm nghiệm">
      <div className="lp-mock-lab">
        <div className="lp-mock-lab-head">
          <div>
            <span className="lp-label">MẪU KIỂM NGHIỆM</span>
            <strong>Thửa TH1-001</strong>
            <small>Lấy mẫu 20/10 · Trung tâm kiểm nghiệm</small>
          </div>
          <em className="lp-badge ok big">Đạt</em>
        </div>
        <dl className="lp-mock-metrics">
          {metrics.map((metric) => (
            <div key={metric.k}>
              <dt>{metric.k}</dt>
              <dd>{metric.v}</dd>
            </div>
          ))}
        </dl>
        <p className="lp-mock-note">Đủ điều kiện đưa vào lô xuất khẩu và dán tem QR.</p>
      </div>
    </Frame>
  );
}

function PortalMock() {
  return (
    <figure className="lp-phone-wrapper" role="img" aria-label="Minh họa giao diện cổng hộ dân">
      <div className="lp-phone">
        {/* Nút bấm vật lý sườn máy iPhone 14 Pro Max */}
        <span className="lp-phone-btn lp-phone-btn-switch" aria-hidden="true" />
        <span className="lp-phone-btn lp-phone-btn-volup" aria-hidden="true" />
        <span className="lp-phone-btn lp-phone-btn-voldown" aria-hidden="true" />
        <span className="lp-phone-btn lp-phone-btn-power" aria-hidden="true" />

        {/* Màn hình hiển thị tỉ lệ chuẩn 19.5:9 */}
        <div className="lp-phone-screen">
          {/* Thanh trạng thái iOS & Dynamic Island */}
          <div className="lp-phone-status-bar" aria-hidden="true">
            <span className="lp-phone-time">9:41</span>
            <div className="lp-phone-island">
              <span className="lp-phone-camera" />
              <span className="lp-phone-sensor" />
            </div>
            <div className="lp-phone-icons">
              <svg viewBox="0 0 17 12" width="14" height="10" fill="currentColor">
                <rect x="0" y="8" width="2.8" height="4" rx="0.7" />
                <rect x="4.5" y="5.5" width="2.8" height="6.5" rx="0.7" />
                <rect x="9" y="3" width="2.8" height="9" rx="0.7" />
                <rect x="13.5" y="0" width="2.8" height="12" rx="0.7" />
              </svg>
              <svg viewBox="0 0 16 12" width="13" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M1.5 3.5 C5 0.5 11 0.5 14.5 3.5" />
                <path d="M4 6.5 C6.5 4.5 9.5 4.5 12 6.5" />
                <circle cx="8" cy="10" r="1.1" fill="currentColor" />
              </svg>
              <svg viewBox="0 0 24 12" width="19" height="9.5" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="1" y="1" width="19" height="10" rx="3" />
                <rect x="2.5" y="2.5" width="15" height="7" rx="1.8" fill="currentColor" />
                <path d="M22 4.5v3" strokeLinecap="round" strokeWidth="1.5" />
              </svg>
            </div>
          </div>

          {/* Nội dung trang chủ Cổng hộ dân */}
          <div className="lp-phone-content">
            <div className="lp-phone-hero">
              <strong>Nguyễn Văn An</strong>
              <div className="lp-phone-chip-wrap">
                <span className="lp-phone-chip">MÃ HỘ KB-VT-001-H001</span>
              </div>
              <span className="lp-phone-sub">Thôn 1 · Đủ chuẩn xuất khẩu</span>
              <div className="lp-phone-stats">
                <div>
                  <b>3</b>
                  <span>Thửa đất</span>
                </div>
                <div>
                  <b>2,4</b>
                  <span>Hecta</span>
                </div>
                <div>
                  <b>0,6</b>
                  <span>Tấn quả</span>
                </div>
              </div>
            </div>

            <div className="lp-phone-body">
              <div className="lp-phone-section-label">Thông báo & nhắc nhở</div>
              <ul className="lp-phone-notes">
                <li className="warn">
                  <div className="lp-note-text">
                    <strong>Chưa ghi nhật ký canh tác</strong>
                    <p>Đã 8 ngày chưa ghi nhận hoạt động chăm sóc.</p>
                  </div>
                </li>
                <li className="info">
                  <div className="lp-note-text">
                    <strong>Lịch kiểm tra vùng trồng</strong>
                    <p>28/10: Kiểm tra định kỳ vùng trồng Thôn 1.</p>
                  </div>
                </li>
              </ul>

              <div className="lp-phone-section-label">Lô hàng xuất khẩu gần nhất</div>
              <div className="lp-phone-activity-card">
                <div className="lp-act-text">
                  <div className="lp-act-head">
                    <strong>Lô Ri6 #LH-08</strong>
                    <span className="lp-act-badge">Đã nhận</span>
                  </div>
                  <p>24/10 · 1.250 kg · Cấp tem QR HTX</p>
                </div>
              </div>
            </div>

            {/* Thanh dock điều hướng chuẩn icon SVG (không emoji) */}
            <nav className="lp-phone-dock" aria-label="Các chức năng cổng hộ dân">
              <span className="lp-dock-btn active" title="Trang chủ">
                <House size={16} strokeWidth={2.2} />
              </span>
              <span className="lp-dock-btn" title="Thửa đất">
                <TreePine size={16} strokeWidth={1.9} />
              </span>
              <span className="lp-dock-btn" title="Nhật ký">
                <NotebookPen size={16} strokeWidth={1.9} />
              </span>
              <span className="lp-dock-btn" title="Kiểm tra">
                <ClipboardCheck size={16} strokeWidth={1.9} />
              </span>
              <span className="lp-dock-btn" title="Hồ sơ & đề nghị">
                <Send size={15} strokeWidth={1.9} />
              </span>
              <span className="lp-dock-btn" title="Kiến thức canh tác">
                <BookOpen size={16} strokeWidth={1.9} />
              </span>
            </nav>

            {/* Thanh chỉ báo Home Bar dưới đáy iOS */}
            <div className="lp-phone-home-indicator" aria-hidden="true" />
          </div>
        </div>
      </div>
      <figcaption className="lp-phone-caption">Minh họa cổng hộ dân trên điện thoại</figcaption>
    </figure>
  );
}

export default function Showcase() {
  const [tab, setTab] = useState<TabId>("map");
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <>
      <div className="lp-feat-cards" role="tablist" aria-label="Các chức năng của hệ thống">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
            <strong>{item.label}</strong>
            <span>{item.blurb}</span>
          </button>
        ))}
      </div>

      <div className="lp-showcase" role="tabpanel">
        <div className="lp-showcase-copy">
          <h3>{active.title}</h3>
          <p>{active.text}</p>
          <ul className="lp-ticks">
            {active.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div className="lp-showcase-view" key={tab}>
          {tab === "map" && <MapMock />}
          {tab === "diary" && <DiaryMock />}
          {tab === "lab" && <LabMock />}
          {tab === "portal" && <PortalMock />}
        </div>
      </div>
    </>
  );
}
