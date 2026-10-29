import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { QrCode } from "lucide-react";
import AuthSlides from "./AuthSlides";
import "./auth.css";

type Variant = "login" | "register";

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/** Nội dung cột giới thiệu bên trái cho từng màn hình, dùng lời lẽ giản dị như trang giới thiệu. */
const ASIDE = {
  login: {
    photo: "/landing/durian-landscape-real.jpg",
    alt: "Vườn sầu riêng trên đất đỏ bazan và triền đồi Krông Búk, Đắk Lắk",
    heading: (
      <>
        <span className="auth-title-bright">
          Sầu riêng <em>minh bạch</em>
        </span>{" "}
        <span className="auth-title-mute">
          từ vườn đến thị trường
        </span>
      </>
    ),
    lead: "Đăng nhập để ghi nhật ký chăm sóc, xem mã vùng trồng và kết quả kiểm nghiệm ngay trên điện thoại.",
    points: ["Ghi nhật ký bón phân, phun thuốc chỉ vài thao tác", "Xem mã vùng trồng và ranh giới từng thửa đất", "Theo dõi kết quả kiểm nghiệm trước khi xuất khẩu"],
    numbered: false,
  },
  register: {
    photo: "/landing/harvest.jpg",
    alt: "Bà con nông dân thu hoạch sầu riêng trong vườn",
    heading: (
      <>
        Cùng HTX đưa sầu riêng <em>đạt chuẩn</em> xuất khẩu
      </>
    ),
    lead: "Đăng ký một lần, cán bộ HTX sẽ gắn tài khoản vào đúng hộ của bạn để bắt đầu ghi nhật ký vườn.",
    points: ["Điền thông tin đăng ký, chỉ mất vài phút", "Cán bộ HTX đối chiếu hồ sơ và duyệt tài khoản", "Đăng nhập bằng số điện thoại, bắt đầu ghi nhật ký"],
    numbered: true,
  },
} as const;

interface AuthShellProps {
  variant: Variant;
  title: string;
  subtitle?: string;
  /** Mở rộng khung biểu mẫu (dùng cho đăng ký có nhiều ô). */
  wide?: boolean;
  /** Ẩn liên kết chuyển qua lại giữa đăng nhập và đăng ký (ví dụ ở màn hình đã gửi đăng ký). */
  hideSwitch?: boolean;
  children: ReactNode;
}

/** Khung chia đôi màn hình dùng chung cho đăng nhập và đăng ký: bên trái giới thiệu, bên phải biểu mẫu. */
export default function AuthShell({ variant, title, subtitle, wide = false, hideSwitch = false, children }: AuthShellProps) {
  const aside = ASIDE[variant];
  const other = variant === "login" ? { href: "/register", text: "Chưa có tài khoản?", action: "Đăng ký" } : { href: "/login", text: "Đã có tài khoản?", action: "Đăng nhập" };

  return (
    <main className="auth">
      <AuthSlides start={variant === "login" ? 0 : 1} />
      <aside className="auth-aside">
        <Image className="auth-aside-photo" src={aside.photo} alt={aside.alt} fill priority sizes="(max-width: 900px) 100vw, 55vw" />

        <Link href="/" className="auth-brand" aria-label="HTX Krông Búk – về trang giới thiệu">
          <span className="auth-brand-mark">
            <Image src="/logo.png" alt="" width={36} height={36} priority />
          </span>
          <span className="auth-brand-text">
            <strong>Krông Búk</strong>
            <span>Hợp tác xã sầu riêng · Đắk Lắk</span>
          </span>
        </Link>

        <div className="auth-aside-body">
          <h2>{aside.heading}</h2>
          <p className="auth-aside-lead">{aside.lead}</p>
          <ul className="auth-points">
            {aside.points.map((point, index) => (
              <li key={point}>
                <b>{aside.numbered ? index + 1 : CHECK}</b>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-aside-foot">© HTX Krông Búk, Đắk Lắk · Ảnh minh họa</p>
      </aside>

      <section className="auth-main">
        <div className="auth-top">
          <Link href="/" className="auth-back">
            <span className="auth-arrow" aria-hidden="true">
              ←
            </span>
            Trang chủ
          </Link>
          <div className="auth-top-actions">
            <Link
              id="auth-qr-trace"
              href="/trace/LH-2024-038"
              target="_blank"
              className="auth-qr-link"
              title="Quét mã QR để xem trang truy xuất nguồn gốc sản phẩm"
            >
              <QrCode size={15} strokeWidth={2.2} />
              <span>Quét QR</span>
            </Link>
            {!hideSwitch && (
              <Link href={other.href} className="auth-alt">
                <span>
                  {other.text} <strong>{other.action}</strong>
                </span>
                <span className="auth-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            )}
          </div>
        </div>

        <div className={`auth-panel${wide ? " is-wide" : ""}`}>
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-sub">{subtitle}</p>}
          {children}
        </div>
      </section>
    </main>
  );
}
