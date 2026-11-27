"use client";

import { type FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api-client";
import { homePathFor, INTRO_PATH } from "@/lib/routes";

const HTX_HEAD_PHONE_DISPLAY = "0982 576 648";
const HTX_HEAD_PHONE_TEL = "0982576648";

export default function LandingFooter({ fromTrace = false }: { fromTrace?: boolean }) {
  const { status, session } = useAuth();
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerNote, setPartnerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const authenticated = status === "authenticated";
  const workspaceHref = homePathFor(session?.user.role);

  const handleInquirySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanEmail = partnerEmail.trim();
    const cleanNote = partnerNote.trim();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      toast.error("Vui lòng nhập địa chỉ email hợp lệ của đối tác hoặc cơ quan");
      return;
    }

    if (cleanNote.length < 5) {
      noteInputRef.current?.focus();
      toast.info("Vui lòng nhập tên đơn vị và nội dung liên hệ làm việc");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/public/partner-inquiries", {
        email: cleanEmail,
        message: cleanNote,
      });
      setPartnerEmail("");
      setPartnerNote("");
      toast.success("Đã gửi thông tin liên hệ tới Ban quản trị HTX Cư Né");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="sw-ft" aria-label="Thông tin liên hệ và điều hướng HTX Nông nghiệp Cư Né">
      <div className="sw-ft-inner">
        {/* Cột 1: Hộp gửi email hợp tác đối tác / cơ quan và liên hệ trực tiếp Trưởng HTX */}
        <div className="sw-ft-col sw-ft-col-lead">
          <h3 className="sw-ft-heading">Hợp tác và liên hệ làm việc</h3>

          <form
            onSubmit={(e) => void handleInquirySubmit(e)}
            className="sw-ft-partner-box"
            autoComplete="off"
          >
            <div className="sw-ft-form">
              <input
                type="email"
                inputMode="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                placeholder="Email đối tác, doanh nghiệp hoặc cơ quan..."
                aria-label="Địa chỉ email của đối tác, doanh nghiệp hoặc cơ quan"
                className="sw-ft-input"
                autoComplete="off"
                spellCheck={false}
                maxLength={160}
              />
            </div>

            <div className="sw-ft-form sw-ft-form-message">
              <input
                ref={noteInputRef}
                type="text"
                value={partnerNote}
                onChange={(e) => setPartnerNote(e.target.value)}
                placeholder="Đơn vị và nội dung đề xuất hợp tác, công tác..."
                aria-label="Tên đơn vị và nội dung đề xuất hợp tác hoặc làm việc"
                className="sw-ft-input"
                autoComplete="off"
                maxLength={1000}
              />
              <button
                type="submit"
                className="sw-ft-send-btn"
                disabled={submitting}
              >
                {submitting ? "Đang gửi" : "Gửi tin"}
              </button>
            </div>
          </form>

          <div className="sw-ft-head-contact">
            <div className="sw-ft-head-meta">
              <span className="sw-ft-head-role">Trưởng Hợp tác xã Cư Né</span>
              <a href={`tel:${HTX_HEAD_PHONE_TEL}`} className="sw-ft-head-phone">
                {HTX_HEAD_PHONE_DISPLAY}
              </a>
            </div>
            <a
              href={`tel:${HTX_HEAD_PHONE_TEL}`}
              className="sw-ft-call-btn"
              aria-label={`Gọi ngay Trưởng Hợp tác xã Cư Né số ${HTX_HEAD_PHONE_DISPLAY}`}
            >
              Gọi ngay
            </a>
          </div>
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
                <Link href={INTRO_PATH} className="sw-ft-link">
                  <span>Trang giới thiệu</span>
                </Link>
              ) : (
                <Link href="/trace" className="sw-ft-link">
                  <span>Tra cứu mã</span>
                </Link>
              )}
            </li>
            <li>
              {fromTrace ? (
                <Link href={`${INTRO_PATH}#he-thong`} className="sw-ft-link">
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
                <Link href={`${INTRO_PATH}#phap-ly`} className="sw-ft-link">
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
                <Link href={`${INTRO_PATH}#tap-huan`} className="sw-ft-link">
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
                <Link href={`${INTRO_PATH}#tra-cuu`} className="sw-ft-link">
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
            Dành cho các nhà vườn canh tác sầu riêng tại xã Krông Búk mong muốn tham gia mã số vùng trồng xuất khẩu chính ngạch. Hộ thành viên được hỗ trợ đo đạc bản đồ số thửa vườn, hướng dẫn ghi nhật ký điện tử, tập huấn VietGAP định kỳ và kiểm nghiệm an toàn dư lượng trước mỗi vụ thu hoạch.
          </p>
          <Link href={authenticated ? workspaceHref : "/register"} className="sw-ft-cta">
            {authenticated
              ? session?.user.role === "farmer"
                ? "Mở cổng hộ thành viên"
                : "Về khu quản trị"
              : "Đăng ký hộ thành viên"}
          </Link>
        </div>

        {/* Cột 4: Đôi nét giới thiệu về HTX */}
        <div className="sw-ft-col">
          <h3 className="sw-ft-heading">Về HTX Cư Né</h3>
          <p className="sw-ft-prose">
            Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né (HTX Cư Né, tên giao dịch HTX Cune, mã số ĐKHTX: 4007E00008, trụ sở tại Km 67, Thôn Ea Plai, xã Krông Búk) vận hành nền tảng quản lý vùng trồng sầu riêng số hóa tại xã Krông Búk, tỉnh Đắk Lắk. Chúng tôi chuẩn hóa từng khâu canh tác theo VietGAP và Nghị định thư GACC nhằm nâng tầm giá trị trái sầu riêng Cư Né và vùng nguyên liệu xã Krông Búk.
          </p>
        </div>
      </div>

      <div className="sw-ft-colophon">
        <p className="sw-ft-colophon-copy">
          © 2026 Bản quyền thuộc HTX Nông nghiệp Cư Né - Xã Krông Búk, Đắk Lắk
        </p>
        <p className="sw-ft-colophon-credit">
          <span>Thiết kế và phát triển: Đặng Văn Thế</span>
          <span className="sw-ft-colophon-sep" aria-hidden="true" />
          <a href="tel:0366663778" className="sw-ft-colophon-tel">
            0366 663 778
          </a>
        </p>
      </div>
    </footer>
  );
}
