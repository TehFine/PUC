"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/routes";

export default function LandingFooter({ fromTrace = false }: { fromTrace?: boolean }) {
  const router = useRouter();
  const { status, session } = useAuth();
  const [query, setQuery] = useState("");

  const authenticated = status === "authenticated";
  const workspaceHref = homePathFor(session?.user.role);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/trace/${encodeURIComponent(trimmed)}`);
      return;
    }
    if (fromTrace) {
      const topInput = document.querySelector<HTMLInputElement>(".sw-trace-input");
      if (topInput) {
        topInput.scrollIntoView({ behavior: "smooth", block: "center" });
        topInput.focus({ preventScroll: true });
      }
      return;
    }
    router.push("/trace");
  };

  return (
    <footer className="sw-ft" aria-label="Thông tin liên hệ và điều hướng HTX Nông nghiệp Cư Né">
      <div className="sw-ft-inner">
        {/* Cột 1: Ô tra cứu mã nhanh + bản quyền tối giản */}
        <div className="sw-ft-col sw-ft-col-lead">
          <form onSubmit={handleSubmit} className="sw-ft-form" role="search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập mã lô hoặc mã tem QR..."
              aria-label="Nhập mã lô hoặc mã tem QR để tra cứu nguồn gốc"
              className="sw-ft-input"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="sw-ft-submit"
              aria-label="Tra cứu nguồn gốc"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </form>

          <p className="sw-ft-copy">
            © 2026 Bản quyền thuộc HTX Nông nghiệp Cư Né
          </p>
        </div>

        {/* Cột 2: Danh mục điều hướng */}
        <div className="sw-ft-col">
          <h3 className="sw-ft-heading">Danh mục</h3>
          <ul className="sw-ft-nav">
            <li>
              <Link href={authenticated ? workspaceHref : "/login"} className="sw-ft-link">
                <span>{authenticated ? "Vào hệ thống" : "Đăng nhập hệ thống"}</span>
              </Link>
            </li>
            <li>
              <Link href="/register" className="sw-ft-link">
                <span>Đăng ký thành viên</span>
              </Link>
            </li>
            <li>
              {fromTrace ? (
                <Link href="/" className="sw-ft-link">
                  <span>Trang giới thiệu</span>
                </Link>
              ) : (
                <Link href="/trace" className="sw-ft-link">
                  <span>Tra cứu nguồn gốc QR</span>
                </Link>
              )}
            </li>
            <li>
              {fromTrace ? (
                <Link href="/#he-thong" className="sw-ft-link">
                  <span>Chuỗi canh tác</span>
                </Link>
              ) : (
                <a href="#he-thong" className="sw-ft-link">
                  <span>Chuỗi canh tác</span>
                </a>
              )}
            </li>
            <li>
              {fromTrace ? (
                <Link href="/#tap-huan" className="sw-ft-link">
                  <span>Tập huấn &amp; Bản tin</span>
                </Link>
              ) : (
                <a href="#tap-huan" className="sw-ft-link">
                  <span>Tập huấn &amp; Bản tin</span>
                </a>
              )}
            </li>
            <li>
              {fromTrace ? (
                <Link href="/#tra-cuu" className="sw-ft-link">
                  <span>Thuốc BVTV &amp; Khuyến cáo</span>
                </Link>
              ) : (
                <a href="#tra-cuu" className="sw-ft-link">
                  <span>Thuốc BVTV &amp; Khuyến cáo</span>
                </a>
              )}
            </li>
          </ul>
        </div>

        {/* Cột 3: Liên kết vùng trồng + nút hành động đóng khung */}
        <div className="sw-ft-col">
          <h3 className="sw-ft-heading">Liên kết vùng trồng</h3>
          <p className="sw-ft-prose">
            Dành cho các nhà vườn canh tác sầu riêng tại xã Cư Né và huyện Krông Búk mong muốn tham gia mã số vùng trồng xuất khẩu chính ngạch. Hộ thành viên được hỗ trợ đo đạc bản đồ số thửa vườn, hướng dẫn ghi nhật ký điện tử, tập huấn VietGAP định kỳ và kiểm nghiệm an toàn dư lượng trước mỗi vụ thu hoạch.
          </p>
          <Link href={authenticated ? workspaceHref : "/register"} className="sw-ft-cta">
            {authenticated ? "Mở cổng hộ thành viên" : "Đăng ký hộ thành viên"}
          </Link>
        </div>

        {/* Cột 4: Đôi nét giới thiệu về HTX */}
        <div className="sw-ft-col">
          <h3 className="sw-ft-heading">Về HTX Cư Né</h3>
          <p className="sw-ft-prose">
            HTX Nông nghiệp Cư Né vận hành nền tảng quản lý vùng trồng số hóa tại thủ phủ sầu riêng Krông Búk, tỉnh Đắk Lắk. Chúng tôi tin rằng sự minh bạch từ gốc là nền tảng của nông nghiệp bền vững — chuẩn hóa từng khâu canh tác theo VietGAP và Nghị định thư GACC nhằm nâng tầm giá trị trái sầu riêng Tây Nguyên.
          </p>
        </div>
      </div>
    </footer>
  );
}
