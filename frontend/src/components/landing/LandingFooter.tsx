"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ArrowRight } from "@/components/ui/PublicIcon";
import { homePathFor } from "@/lib/routes";
import { isSafeTraceCode, safeDecodeURIComponent } from "@/utils/url-safety";

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
      const tokenPathMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/.exec(trimmed);
      if (tokenPathMatch?.[1] && isSafeTraceCode(tokenPathMatch[1])) {
        router.push(`/t/${encodeURIComponent(tokenPathMatch[1])}`);
        return;
      }
      if (
        /^[A-Za-z0-9]{12,24}$/.test(trimmed) &&
        /[a-z]/.test(trimmed) &&
        /[A-Z0-9]/.test(trimmed) &&
        isSafeTraceCode(trimmed)
      ) {
        router.push(`/t/${encodeURIComponent(trimmed)}`);
        return;
      }
      const candidate = safeDecodeURIComponent(trimmed).trim();
      if (isSafeTraceCode(candidate)) {
        router.push(`/trace/${encodeURIComponent(candidate)}`);
        return;
      }
      router.push("/trace");
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
              <ArrowRight size={15} aria-hidden="true" />
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
                <Link href="/#phap-ly" className="sw-ft-link">
                  <span>Giấy chứng nhận ĐKHTX</span>
                </Link>
              ) : (
                <a href="#phap-ly" className="sw-ft-link">
                  <span>Giấy chứng nhận ĐKHTX</span>
                </a>
              )}
            </li>
            <li>
              {fromTrace ? (
                <Link href="/#tap-huan" className="sw-ft-link">
                  <span>Tập huấn và Bản tin</span>
                </Link>
              ) : (
                <a href="#tap-huan" className="sw-ft-link">
                  <span>Tập huấn và Bản tin</span>
                </a>
              )}
            </li>
            <li>
              {fromTrace ? (
                <Link href="/#tra-cuu" className="sw-ft-link">
                  <span>Thuốc BVTV và Khuyến cáo</span>
                </Link>
              ) : (
                <a href="#tra-cuu" className="sw-ft-link">
                  <span>Thuốc BVTV và Khuyến cáo</span>
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
            HTX Kinh doanh - Dịch vụ Tổng hợp Cư Né (Mã số ĐKHTX: 4007E00008) vận hành nền tảng quản lý vùng trồng số hóa tại thủ phủ sầu riêng Krông Búk, tỉnh Đắk Lắk. Chúng tôi lấy sự minh bạch từ gốc làm nền tảng phát triển bền vững, chuẩn hóa từng khâu canh tác theo VietGAP và Nghị định thư GACC nhằm nâng tầm giá trị trái sầu riêng Tây Nguyên.
          </p>
        </div>
      </div>
    </footer>
  );
}
