"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { homePathFor } from "@/lib/routes";

export default function RegisterPage() {
  const router = useRouter();
  const { status, session } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(homePathFor(session?.user.role));
    }
  }, [status, session, router]);

  return (
    <AuthShell variant="register" title="Cấp tài khoản" wide>
      <div>
        <ol className="auth-timeline">
          <li>
            <span className="auth-timeline-num" aria-hidden="true">
              01
            </span>
            <div className="auth-timeline-body">
              <strong className="auth-timeline-title">Lập hồ sơ nông hộ &amp; thửa vườn</strong>
              <p className="auth-timeline-desc">
                Cung cấp CCCD, số điện thoại và thông tin ranh giới thửa đất cho Trưởng thôn hoặc cán bộ kỹ thuật HTX.
              </p>
            </div>
          </li>
          <li>
            <span className="auth-timeline-num" aria-hidden="true">
              02
            </span>
            <div className="auth-timeline-body">
              <strong className="auth-timeline-title">Thẩm định &amp; bàn giao tài khoản</strong>
              <p className="auth-timeline-desc">
                HTX gắn hộ vào đúng mã số vùng trồng (PUC) và cấp tài khoản theo số điện thoại kèm mật khẩu khởi tạo.
              </p>
            </div>
          </li>
          <li>
            <span className="auth-timeline-num" aria-hidden="true">
              03
            </span>
            <div className="auth-timeline-body">
              <strong className="auth-timeline-title">Tuân thủ quy trình chuẩn 2026–2027 &amp; ghi nhật ký</strong>
              <p className="auth-timeline-desc">
                Áp dụng đúng khuyến nghị quy trình chăm sóc sầu riêng 2026–2027 của HTX và cập nhật nhật ký đầy đủ để được đảm bảo thu mua đúng giá, giá cao.{" "}
                <Link href="/#quy-trinh" className="auth-switch-btn" style={{ marginLeft: 0 }}>
                  Xem quy trình 2026–2027 →
                </Link>
              </p>
            </div>
          </li>
        </ol>

        <div
          style={{
            marginTop: 16,
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 6,
            background: "#f8faf8",
            border: "1px solid #d7e2d7",
            fontSize: 13,
            lineHeight: 1.55,
            color: "#1f2937",
          }}
        >
          <strong style={{ display: "block", marginBottom: 4, color: "#14532d" }}>
            Quy định tài khoản Đối tác thu mua và Cơ quan quản lý
          </strong>
          Hệ thống không mở tự đăng ký cho tài khoản Doanh nghiệp, Cơ sở đóng gói và Cơ quan quản lý nhà nước. Tài khoản xem dữ liệu chi tiết được Ban quản trị HTX Cư Né cấp trực tiếp theo đúng phạm vi quản lý (mã doanh nghiệp, xã phụ trách hoặc địa bàn được giao) kèm bảo mật xác thực 2 lớp (OTP).
        </div>

        <div className="auth-contact-line">
          <span>Liên hệ Văn phòng HTX Cư Né</span>
          <a href="tel:0366663778">0366 663 778</a>
        </div>

        <Link href="/login" className="auth-submit is-link">
          <span>Đã có tài khoản? Đăng nhập</span>
        </Link>

        <p className="auth-switch-hint">
          <span>Quên mật khẩu tài khoản?</span>
          <Link href="/forgot-password" className="auth-switch-btn">
            Khôi phục mật khẩu
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
