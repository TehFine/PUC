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
    <AuthShell
      variant="register"
      title="Cấp tài khoản"
      subtitle="Tài khoản do HTX Cư Né cấp trực tiếp."
      wide
    >
      <div>
        <ol className="auth-timeline">
          <li>
            <span className="auth-timeline-rail" aria-hidden="true">
              <span className="auth-timeline-dot" />
            </span>
            <div className="auth-timeline-body">
              <strong className="auth-timeline-title">Lập hồ sơ hộ</strong>
              <p className="auth-timeline-desc">
                Gửi CCCD, số điện thoại và thông tin thửa đất cho Trưởng thôn hoặc cán bộ HTX.
              </p>
            </div>
          </li>
          <li>
            <span className="auth-timeline-rail" aria-hidden="true">
              <span className="auth-timeline-dot" />
            </span>
            <div className="auth-timeline-body">
              <strong className="auth-timeline-title">Nhận tài khoản</strong>
              <p className="auth-timeline-desc">
                HTX cấp tài khoản theo số điện thoại kèm mật khẩu ban đầu.
              </p>
            </div>
          </li>
          <li>
            <span className="auth-timeline-rail" aria-hidden="true">
              <span className="auth-timeline-dot" />
            </span>
            <div className="auth-timeline-body">
              <strong className="auth-timeline-title">Đăng nhập sử dụng</strong>
              <p className="auth-timeline-desc">
                Vào hệ thống, đổi mật khẩu riêng và ghi nhật ký vườn.
              </p>
            </div>
          </li>
        </ol>

        <div className="auth-contact-line">
          <span>Liên hệ HTX Cư Né</span>
          <a href="tel:0366663778">0366 663 778</a>
        </div>

        <Link href="/login" className="auth-submit is-link">
          Đã có tài khoản? Đăng nhập
        </Link>

        <p className="auth-switch-hint">
          <span>Quên mật khẩu?</span>
          <Link href="/forgot-password" className="auth-switch-btn">
            Lấy lại mật khẩu
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
