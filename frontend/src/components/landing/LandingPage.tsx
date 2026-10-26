import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import AutoEnter from "./AutoEnter";
import BannedList from "./BannedList";
import Catalog from "./Catalog";
import { CODE_PARTS, CODE_STEPS, EXPORT_CHECKLIST, STANDARDS } from "./data";
import Faq from "./Faq";
import { display } from "./fonts";
import HeroDash from "./HeroDash";
import Nav from "./Nav";
import Season from "./Season";
import Showcase from "./Showcase";
import Stages from "./Stages";
import "./landing.css";

interface SectionImage {
  src: string;
  alt: string;
  caption?: string;
}

function Section({
  id,
  tone = "white",
  eyebrow,
  title,
  intro,
  image,
  imageStyle = "cut",
  children,
}: {
  id: string;
  tone?: "white" | "beige" | "mist";
  eyebrow: string;
  title: string;
  intro?: string;
  image?: SectionImage;
  imageStyle?: "cut" | "scoop";
  children: ReactNode;
}) {
  return (
    <section id={id} className={`lp-section is-${tone}`} aria-labelledby={`${id}-title`}>
      <div className="lp-wrap">
        <header className={`lp-section-head ${image ? "has-image" : ""}`}>
          <div className="lp-section-text">
            <span className="lp-pill">{eyebrow}</span>
            <h2 id={`${id}-title`}>{title}</h2>
            {intro && <p className="lp-intro">{intro}</p>}
          </div>
          {image && (
            <figure className={imageStyle === "scoop" ? "lp-photo-scoop lp-section-photo" : "lp-clip lp-section-photo"}>
              <Image src={image.src} alt={image.alt} fill sizes="(max-width: 900px) 100vw, 380px" />
              {imageStyle === "scoop" ? <ScoopBadge /> : <Arrow />}
            </figure>
          )}
        </header>
        {children}
      </div>
    </section>
  );
}

/** Mũi tên nằm ở góc cắt chéo của thẻ ảnh/thẻ nội dung. */
function Arrow() {
  return (
    <svg className="lp-clip-arrow" viewBox="0 0 40 16" aria-hidden="true">
      <path d="M1 8h38M32 1.5 39 8l-7 6.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Nút tròn mũi tên chéo ↗ nằm ở góc lõm phía trên bên phải của thẻ/ảnh. */
function ScoopBadge() {
  return (
    <span className="lp-scoop-badge" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17L17 7M7 7h10v10" />
      </svg>
    </span>
  );
}

/* Biểu tượng nét mảnh một màu (kế thừa currentColor), vẽ theo hình khối đơn giản để không giống emoji */
function IconSun() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 6.5v2.5M5.4 10.4l1.8 1.8M18.6 10.4l-1.8 1.8M2.5 14.5H5M19 14.5h2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLeaf() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14ZM5 19l9-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDrop() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5c3.5 4.5 5.5 7.3 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3.2 2-6 5.5-10.5ZM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSprout() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20v-8M12 12c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6ZM12 15c0-2.5-2-4.5-6-4.5 0 2.5 2 4.5 6 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Trang giới thiệu công khai (phong cách sáng, chữ serif tạp chí, nền trời – đồng cỏ, điểm nhấn vàng chanh theo bộ ảnh trong uiux/).
 * `autoEnter` (trang chủ `/`): người đã đăng nhập được chuyển thẳng vào khu vực làm việc.
 */
export default function LandingPage({ autoEnter = false }: { autoEnter?: boolean }) {
  return (
    <div className={`lp ${display.variable}`} id="top">
      {autoEnter && <AutoEnter />}
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
        <defs>
          <clipPath id="lp-funnel-clip" clipPathUnits="objectBoundingBox">
            <path d="M0,0.06 Q0.5,-0.04 1,0.06 V0.4 C1,0.62 0.64,0.84 0.5,1 C0.36,0.84 0,0.62 0,0.4 Z" />
          </clipPath>
          {/* Đường cắt góc trên bên phải lõm mượt (scoop) kèm bán kính bo ngoài và trong */}
          <clipPath id="lp-scoop-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0.06,0 L 0.74,0 C 0.78,0 0.80,0.03 0.80,0.07 L 0.80,0.19 C 0.80,0.23 0.83,0.26 0.87,0.26 L 0.94,0.26 C 0.98,0.26 1,0.29 1,0.33 L 1,0.94 C 1,0.98 0.98,1 0.94,1 L 0.06,1 C 0.02,1 0,0.98 0,0.94 L 0,0.06 C 0,0.02 0.02,0 0.06,0 Z" />
          </clipPath>
        </defs>
      </svg>
      <Nav />

      <main>
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero-copy">
            <h1 id="hero-title">
              Sầu riêng <em>minh bạch</em> từ vườn đến thị trường
            </h1>
            <p className="lp-hero-lead">
              Tại HTX Krông Búk, Đắk Lắk, bà con ghi nhật ký chăm sóc vườn, theo dõi mã vùng trồng và kết quả kiểm nghiệm ngay trên điện thoại, để sầu riêng đạt chuẩn trước khi xuất khẩu.
            </p>
            <div className="lp-hero-cta">
              <Link href="/register" className="lp-btn lp-btn-solid">
                Đăng ký tài khoản hộ dân
              </Link>
              <a href="#quy-trinh" className="lp-btn lp-btn-ghost">
                Xem quy trình chăm sóc
              </a>
            </div>
          </div>

          <div className="lp-stage">
            <HeroDash />
            <div className="lp-funnel">
              <Image src="/landing/durian-landscape-real.jpg" alt="Vườn sầu riêng trên đất đỏ bazan và triền đồi Krông Búk, Đắk Lắk" fill priority sizes="(max-width: 1100px) 100vw, 1100px" />
            </div>
            <a href="#gioi-thieu" className="lp-orb" aria-label="Khám phá hệ thống">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14m-5.5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </section>

        <section id="gioi-thieu" className="lp-about" aria-labelledby="about-title">
          <div className="lp-wrap lp-about-copy">
            <span className="lp-pill lp-pill-green">Về hệ thống</span>
            <h2 id="about-title">
              Chăm sóc vườn <em>có ghi chép</em>, giữ trọn uy tín trái sầu riêng
            </h2>
            <p className="lp-intro">
              Từ ranh giới thửa đất, từng lần bón phân, phun thuốc đến kết quả kiểm nghiệm, mọi thứ đều được ghi lại để biết mỗi trái sầu riêng đến từ khu vườn nào.
            </p>
          </div>

          <div className="lp-about-photo">
            <figure className="lp-tree">
              <Image src="/landing/durian-tree.jpg" alt="Trái sầu riêng treo trên cành trong vườn" fill sizes="280px" />
            </figure>
            <span className="lp-tile lp-tile-left" aria-hidden="true">
              <IconSun />
            </span>
            <span className="lp-tile lp-tile-right" aria-hidden="true">
              <IconDrop />
            </span>
          </div>

          <div className="lp-arc">
            <p className="lp-statement">
              Gieo mầm minh bạch
              <span className="lp-bubble blue" aria-hidden="true">
                <IconSprout />
              </span>
              từ ghi chép nhỏ nâng tầm
              <span className="lp-bubble green" aria-hidden="true">
                <IconLeaf />
              </span>
              trái sầu riêng Việt trên thị trường quốc tế
            </p>
          </div>
        </section>

        <Section
          id="he-thong"
          tone="beige"
          eyebrow="Hệ thống quản lý"
          title="Một nơi để quản lý toàn bộ vùng trồng"
          intro="Từ bản đồ thửa đất, nhật ký phun thuốc đến kết quả kiểm nghiệm, mọi thông tin đều được ghi lại, kiểm tra chéo và lưu giữ trong cùng một nơi."
        >
          <Showcase />
        </Section>

        <Section
          id="ma-vung"
          eyebrow="Mã vùng trồng"
          title="Mã vùng trồng là “căn cước” của khu vườn"
          intro="Nước nhập khẩu muốn biết từng lô sầu riêng được trồng ở vườn nào. Mã vùng trồng nối liền ranh giới đất, chủ vườn, giống cây và nhật ký chăm sóc lại với nhau."
        >
          <div className="lp-code-grid">
            <div className="lp-code-card lp-glass">
              <p className="lp-label">
                Mã hộ được ghép từ 4 phần
              </p>
              <div className="lp-code-parts" role="img" aria-label="Ví dụ mã KB-VT-001-H001">
                {CODE_PARTS.map((item, index) => (
                  <div key={item.part}>
                    <b>
                      {item.part}
                      {index < CODE_PARTS.length - 1 && <span aria-hidden="true">–</span>}
                    </b>
                    <strong>{item.label}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>
              <p className="lp-code-note">
                Mã này nối thửa đất, nhật ký, kết quả kiểm nghiệm và lô thu hoạch về đúng hộ. Mã vùng trồng chính thức do cơ quan nhà nước cấp; hệ thống giúp hộ chuẩn bị đủ hồ sơ để được cấp.
              </p>
            </div>
            <figure className="lp-photo lp-photo-scoop">
              <Image src="/landing/traceability.jpg" alt="Trái sầu riêng dán tem QR để biết nguồn gốc, đặt trên thùng gỗ" fill sizes="(max-width: 900px) 100vw, 44vw" />
              <figcaption>Tem QR gắn lô hàng với mã vùng trồng. Ảnh minh họa.</figcaption>
              <ScoopBadge />
            </figure>
          </div>

          <ol className="lp-timeline">
            {CODE_STEPS.map((step, index) => (
              <li key={step.title} className="lp-glass">
                <b>{String(index + 1).padStart(2, "0")}</b>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="quy-trinh"
          tone="mist"
          eyebrow="Quy trình chăm sóc"
          title="Chăm sóc vườn theo từng giai đoạn"
          intro="Chọn một giai đoạn để xem việc cần làm và những thông tin cần ghi vào nhật ký. Ghi chép đầy đủ là điều kiện đầu tiên của mọi tiêu chuẩn xuất khẩu."
          image={{ src: "/landing/durian-flower.jpg", alt: "Hoa sầu riêng nở trên cành" }}
          imageStyle="cut"
        >
          <Stages />
          <Season />
        </Section>

        <Section
          id="tieu-chuan"
          tone="beige"
          eyebrow="Tiêu chuẩn xuất khẩu"
          title="Điều cần đạt trước khi hàng rời vườn"
          intro="Những yêu cầu chính của nước nhập khẩu mà bà con cần nắm. Mỗi mục đều liên quan đến việc ghi chép và kiểm nghiệm trong hệ thống."
          image={{ src: "/landing/durian-open.jpg", alt: "Trái sầu riêng bổ ra với cơm vàng" }}
          imageStyle="scoop"
        >
          <ul className="lp-standards">
            {STANDARDS.map((item) => (
              <li key={item.title} className="lp-glass">
                <p className="lp-label">
                  {item.tag}
                </p>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>

          <div className="lp-export-grid">
            <BannedList />
            <div className="lp-checklist lp-glass">
              <p className="lp-label">
                Danh sách kiểm tra trước khi xuất
              </p>
              <ul className="lp-checks">
                {EXPORT_CHECKLIST.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <aside className="lp-notice" aria-labelledby="notice-title">
            <span className="lp-notice-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 11v5.5M12 7.5v.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="lp-notice-body">
              <strong id="notice-title">Lưu ý quan trọng</strong>
              <p>
                Nội dung mang tính hướng dẫn chung, không thay thế văn bản pháp luật. Quy định của từng thị trường thay đổi theo thời gian; hãy hỏi lại hướng dẫn mới nhất của cơ quan bảo vệ thực vật và đơn vị nhập khẩu.
              </p>
            </div>
          </aside>
        </Section>

        <Section
          id="tra-cuu"
          eyebrow="Tra cứu"
          title="Danh mục thuốc, giống và lịch tập huấn"
          intro="Dữ liệu được lấy trực tiếp từ hệ thống nên luôn trùng với danh mục mà cán bộ HTX đang áp dụng."
        >
          <Catalog />
        </Section>

        <Section id="hoi-dap" tone="mist" eyebrow="Hỏi đáp" title="Những câu hỏi thường gặp">
          <Faq />
        </Section>

        <section className="lp-cta" aria-labelledby="cta-title">
          <div className="lp-wrap lp-cta-box">
            <div className="lp-cta-copy">
              <span className="lp-pill lp-pill-green">Bắt đầu cùng HTX</span>
              <h2 id="cta-title">Sẵn sàng đưa vườn của bạn vào hệ thống?</h2>
              <p>Hộ dân đăng ký tài khoản bằng số điện thoại; cán bộ HTX sẽ duyệt và gắn tài khoản với hộ của bạn. Đã có tài khoản, đăng nhập để ghi nhật ký và theo dõi hồ sơ.</p>
              <div className="lp-cta-actions">
                <Link href="/register" className="lp-btn lp-btn-solid">
                  Đăng ký
                </Link>
                <Link href="/login" className="lp-btn lp-btn-ghost">
                  Đăng nhập
                </Link>
              </div>
            </div>
            <figure className="lp-clip lp-cta-photo">
              <Image src="/landing/harvest.jpg" alt="Bà con nông dân thu hoạch sầu riêng trong vườn" fill sizes="(max-width: 900px) 100vw, 520px" />
              <Arrow />
            </figure>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div className="lp-footer-brand">
            <a href="#top" className="lp-logo" aria-label="HTX Krông Búk – về đầu trang">
              <Image className="lp-logo-mark" src="/logo.png" alt="" width={40} height={40} />
              <strong>Krông Búk</strong>
            </a>
            <p>Ghi nhật ký vườn, quản lý mã vùng trồng và kết quả kiểm nghiệm, giúp sầu riêng Đắk Lắk minh bạch từ vườn đến thị trường.</p>
            <div className="lp-footer-actions">
              <Link href="/login" className="lp-footer-btn">
                Đăng nhập
              </Link>
              <Link href="/register" className="lp-footer-btn is-solid">
                Đăng ký
              </Link>
            </div>
            <small>© HTX Krông Búk, Đắk Lắk</small>
          </div>

          <nav className="lp-footer-col" aria-label="Hệ thống">
            <h2>Hệ thống</h2>
            <a href="#gioi-thieu">Giới thiệu</a>
            <a href="#he-thong">Các chức năng quản lý</a>
            <a href="#ma-vung">Mã vùng trồng</a>
            <a href="#tra-cuu">Tra cứu danh mục</a>
          </nav>

          <nav className="lp-footer-col" aria-label="Kiến thức">
            <h2>Kiến thức</h2>
            <a href="#quy-trinh">Quy trình chăm sóc</a>
            <a href="#tieu-chuan">Tiêu chuẩn xuất khẩu</a>
            <a href="#hoi-dap">Hỏi đáp</a>
          </nav>

          <nav className="lp-footer-col" aria-label="Tài khoản">
            <h2>Tài khoản</h2>
            <Link href="/login">Đăng nhập</Link>
            <Link href="/register">Đăng ký hộ dân</Link>
          </nav>
        </div>

        <p className="lp-wrap lp-footer-note">
          Ảnh và giao diện trên trang là minh họa. Số liệu tổng hợp lấy từ hệ thống; không hiển thị thông tin cá nhân của từng hộ.
        </p>

        <div className="lp-footer-mark" aria-hidden="true">
          <span>Krông Búk</span>
        </div>

        <a href="#top" className="lp-totop">
          Về đầu trang
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </a>
      </footer>
    </div>
  );
}
