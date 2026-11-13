import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import DwellSlideshow, { type DwellSlide } from "@/components/landing/DwellSlideshow";
import "./auth.css";

type Variant = "login" | "register" | "forgot";

interface AsideSpec {
  indexLabel: string;
  subLabel: string;
  kicker: string;
  slides: readonly DwellSlide[];
  spreadSlide: DwellSlide;
  spreadTitle: string;
  spreadProse: string;
  heading: string;
  lead: string;
  points: readonly string[];
}

const ASIDE: Record<Variant, AsideSpec> = {
  login: {
    indexLabel: "01 / Cổng thành viên",
    subLabel: "Nhật ký số + Mã vùng PUC",
    kicker: "Cổng thành viên",
    slides: [
      {
        src: "/landing/real-hero-diary-qr.jpg",
        alt: "Nhà vườn và cán bộ kỹ thuật HTX Cư Né ghi nhật ký mùa vụ và kiểm tra tem QR lô sầu riêng ngay tại vườn",
        objectPosition: "center 38%",
        mobileObjectPosition: "56% 38%",
      },
      {
        src: "/landing/real-map-survey.jpg",
        alt: "Cán bộ kỹ thuật HTX đo đạc tọa độ GPS và đối chiếu bản đồ ranh giới từng thửa vườn sầu riêng tại Krông Búk",
        objectPosition: "center 38%",
        mobileObjectPosition: "54% 38%",
      },
      {
        src: "/landing/lux-hero-plinth.jpg",
        alt: "Sầu riêng tuyển chọn và múi vàng ươm đặt trên bệ đá travertine bên vách nan gỗ sồi ấm áp",
        objectPosition: "center 54%",
        mobileObjectPosition: "54% 56%",
      },
    ],
    spreadSlide: {
      src: "/landing/lux-puc-pedestal-vertical.jpg",
      alt: "Sầu riêng Cư Né định danh trưng bày trên trụ đá travertine nguyên khối giữa hốc kiến trúc nan gỗ sồi",
      objectPosition: "center 46%",
      mobileObjectPosition: "center 46%",
    },
    spreadTitle: "Nhật ký số vùng trồng",
    spreadProse:
      "Ghi chép lịch bón phân, theo dõi thời gian cách ly và đối chiếu mã số vùng trồng minh bạch trước mỗi vụ thu hoạch.",
    heading: "Sầu riêng minh bạch từ vườn đến thị trường",
    lead: "Đăng nhập để ghi nhật ký chăm sóc điện tử, theo dõi ranh giới mã số vùng trồng và đối chiếu hồ sơ kiểm nghiệm trước mỗi vụ xuất khẩu.",
    points: [
      "Ghi nhật ký bón phân, phun thuốc và tưới tiêu ngay trên điện thoại",
      "Tra cứu mã số vùng trồng (PUC) và bản đồ số từng thửa vườn",
      "Theo dõi kết quả kiểm nghiệm an toàn dư lượng trước thu hoạch",
    ],
  },
  register: {
    indexLabel: "02 / Hồ sơ vùng trồng",
    subLabel: "Thẩm định + Cấp mã thửa",
    kicker: "Đăng ký thành viên",
    slides: [
      {
        src: "/landing/real-qr-trace-lot.jpg",
        alt: "Quét mã QR định danh nguồn gốc gắn trên cuống trái sầu riêng tại kho đóng gói liên kết",
        objectPosition: "center 52%",
        mobileObjectPosition: "62% 52%",
      },
      {
        src: "/landing/lux-harvest-atelier.jpg",
        alt: "Cặp trái sầu riêng thu hoạch chuẩn độ già đặt trên bệ đá tự nhiên theo phong cách tối giản",
        objectPosition: "center 56%",
        mobileObjectPosition: "52% 58%",
      },
      {
        src: "/landing/real-puc-orchard-vertical.jpg",
        alt: "Vườn sầu riêng trưởng thành canh tác chuẩn mực trên nền đất đỏ bazan tại xã Cư Né, Đắk Lắk",
        objectPosition: "center 44%",
        mobileObjectPosition: "center 46%",
      },
    ],
    spreadSlide: {
      src: "/landing/lux-branch-vertical.jpg",
      alt: "Cành sầu riêng sai trái nổi bật giữa không gian kiến trúc đá tự nhiên và hệ lam gỗ ấm áp",
      objectPosition: "center 48%",
      mobileObjectPosition: "center 48%",
    },
    spreadTitle: "Chuẩn hồ sơ vùng trồng",
    spreadProse:
      "Mỗi thửa vườn được cán bộ HTX khảo sát tọa độ thực địa, thẩm định giống cây và gắn mã định danh riêng trước khi cấp tài khoản.",
    heading: "Quản trị chặt chẽ chuẩn hồ sơ xuất khẩu",
    lead: "Mọi hồ sơ nông hộ và ranh giới thửa đất đều được Ban Quản trị HTX thẩm định thực địa, thiết lập chuẩn xác trước khi bàn giao tài khoản.",
    points: [
      "Cán bộ HTX và Trưởng thôn khảo sát thực địa, lập hồ sơ thửa đất",
      "Quản trị viên cấp tài khoản gắn trực tiếp với mã vùng trồng định danh",
      "Hộ thành viên nhận bàn giao tài khoản và cập nhật nhật ký mùa vụ",
    ],
  },
  forgot: {
    indexLabel: "03 / Bảo mật tài khoản",
    subLabel: "Xác minh CCCD + Phê duyệt",
    kicker: "Khôi phục tài khoản",
    slides: [
      {
        src: "/landing/real-blossom-care.jpg",
        alt: "Nhà vườn kiểm tra chùm hoa sầu riêng đang nở và ghi chép lịch chăm sóc mùa vụ tại vườn",
        objectPosition: "center 36%",
        mobileObjectPosition: "64% 36%",
      },
      {
        src: "/landing/lux-qr-atelier.jpg",
        alt: "Sầu riêng gắn thẻ truy xuất nguồn gốc QR tối giản đặt trên quầy đá travertine và vách nan gỗ sồi",
        objectPosition: "center 54%",
        mobileObjectPosition: "25% 60%",
      },
      {
        src: "/landing/lux-estate-dawn.jpg",
        alt: "Toàn cảnh đồi sầu riêng Cư Né phân thửa trong sương sớm nhìn từ không gian kiến trúc gỗ đá hiện đại",
        objectPosition: "center 48%",
        mobileObjectPosition: "38% 48%",
      },
    ],
    spreadSlide: {
      src: "/landing/lux-lab-purity-square.jpg",
      alt: "Mẫu múi sầu riêng tinh khiết đặt trên đĩa sứ trắng cạnh lồng kính thẩm định và bệ đá travertine",
      objectPosition: "center 54%",
      mobileObjectPosition: "50% 54%",
    },
    spreadTitle: "Bảo mật quyền truy cập",
    spreadProse:
      "Đặt lại mật khẩu nhanh bằng số CCCD chủ hộ hoặc gửi yêu cầu để cán bộ HTX đối chiếu hồ sơ và phê duyệt an toàn.",
    heading: "Khôi phục mật khẩu nhanh chóng và an toàn",
    lead: "Đặt lại mật khẩu tức thì bằng số Căn cước công dân (CCCD) đã đăng ký với HTX, hoặc gửi yêu cầu để cán bộ phụ trách đối chiếu và phê duyệt.",
    points: [
      "Xác minh số điện thoại cùng 12 chữ số CCCD chủ hộ để đổi ngay",
      "Hoặc gửi yêu cầu trực tuyến để cán bộ HTX xác nhận và cấp duyệt",
      "Mật khẩu mới được mã hóa an toàn, tự động thu hồi phiên cũ",
    ],
  },
};

interface AuthShellProps {
  variant: Variant;
  title: string;
  subtitle?: string;
  /** Mở rộng khung biểu mẫu (dùng cho quy trình cấp tài khoản hoặc biểu mẫu nhiều cột). */
  wide?: boolean;
  /** Ẩn nút chuyển đổi luồng trên thanh điều hướng (ví dụ ở màn hình xác nhận hoàn tất). */
  hideSwitch?: boolean;
  children: ReactNode;
}

/**
 * Khung giao diện xác thực theo Lưới Kiến Trúc Thụy Sĩ Tối Giản (Swiss Architectural Grid),
 * đồng bộ 100% ngôn ngữ thị giác, tỷ lệ khoảng lề và bảng màu với Landing Page HTX Cư Né.
 */
export default function AuthShell({
  variant,
  title,
  subtitle,
  wide = false,
  hideSwitch = false,
  children,
}: AuthShellProps) {
  const aside = ASIDE[variant];
  const { spreadSlide } = aside;
  const other =
    variant === "login"
      ? { href: "/register", label: "Cấp tài khoản" }
      : { href: "/login", label: "Đăng nhập" };

  return (
    <div className="auth-root">
      {/* ─── Thanh điều hướng kiến trúc đầu trang (Đồng bộ Landing Page) ─── */}
      <header className="auth-topbar">
        <div className="auth-topbar-inner">
          <div className="auth-brand-group">
            <Link href="/" className="auth-brand" aria-label="HTX Cư Né – về trang giới thiệu">
              HTX Cư Né
            </Link>
            <span className="auth-brand-sep" aria-hidden="true" />
            <span className="auth-brand-meta">Cổng thành viên · Đắk Lắk</span>
          </div>

          <nav className="auth-topbar-actions" aria-label="Điều hướng nhanh">
            <Link href="/" className="auth-top-link">
              Trang giới thiệu
            </Link>
            <Link href="/trace" className="auth-top-link is-trace">
              Tra cứu QR
            </Link>
            {!hideSwitch && (
              <>
                <span className="auth-top-sep" aria-hidden="true" />
                <Link
                  href={other.href}
                  className={`auth-top-cta${variant !== "login" ? " is-solid" : ""}`}
                >
                  {other.label}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ─── Lưới chia đôi kiến trúc (Cách cạnh màn hình --au-edge-x) ─── */}
      <main className="auth-stage">
        <div className="auth-grid">
          <aside className="auth-aside" aria-label="Thông tin hệ thống vùng trồng HTX Cư Né">
            <div className="auth-media">
              <DwellSlideshow
                slides={aside.slides}
                sizes="(max-width: 960px) 100vw, 52vw"
                priorityFirst
              />
            </div>

            <div className="auth-aside-sheet">
              <span className="auth-aside-index">{aside.indexLabel}</span>
              <h2 className="auth-aside-heading">{aside.heading}</h2>
              <p className="auth-aside-lead">{aside.lead}</p>
              <ul className="auth-points">
                {aside.points.map((point, index) => (
                  <li key={point}>
                    <span className="auth-point-num" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Khung tạp chí chia đôi dọc (├) ở cuối trang di động đồng bộ mẫu tham chiếu */}
            <div className="auth-mob-spread">
              <div className="auth-mob-spread-photo">
                <Image
                  src={spreadSlide.src}
                  alt={spreadSlide.alt}
                  fill
                  loading="lazy"
                  sizes="(max-width: 960px) 46vw, 1px"
                  style={{
                    objectFit: "cover",
                    objectPosition:
                      spreadSlide.mobileObjectPosition ??
                      spreadSlide.objectPosition ??
                      "center 50%",
                  }}
                />
              </div>
              <div className="auth-mob-spread-col">
                <div className="auth-mob-spread-top">
                  <h2 className="auth-mob-spread-title">{aside.spreadTitle}</h2>
                  <p className="auth-mob-spread-sub">{aside.subLabel}</p>
                </div>
                <div className="auth-mob-spread-bot">
                  <p className="auth-mob-spread-prose">{aside.spreadProse}</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="auth-main">
            <div className={`auth-panel${wide ? " is-wide" : ""}`}>
              <header className="auth-head">
                <span className="auth-kicker">{aside.kicker}</span>
                <h1 className="auth-title">{title}</h1>
                {subtitle && <p className="auth-sub">{subtitle}</p>}
              </header>
              {children}
            </div>
          </section>
        </div>
      </main>

      {/* ─── Chân trang tối giản màu nền đá #f3f2ee đồng bộ Landing Page ─── */}
      <footer className="auth-foot">
        <div className="auth-foot-inner">
          <p className="auth-foot-copy">
            © 2026 HTX Nông nghiệp Cư Né · Krông Búk, Đắk Lắk
          </p>
          <nav className="auth-foot-links" aria-label="Liên kết chân trang">
            <Link href="/" className="auth-foot-link">
              Trang giới thiệu
            </Link>
            <span className="auth-foot-dot" aria-hidden="true" />
            <Link href="/trace" className="auth-foot-link">
              Tra cứu QR
            </Link>
            <span className="auth-foot-dot" aria-hidden="true" />
            <a href="tel:0366663778" className="auth-foot-link">
              Hỗ trợ: 0366 663 778
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
