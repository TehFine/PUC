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
      subtitle="Tài khoản hộ dân do HTX Cư Né trực tiếp lập và bàn giao."
      wide
    >
      <div>
        <ol className="auth-steps">
          <li>
            <b>1</b>
            <span>
              <strong>Lập hồ sơ hộ:</strong> Gửi CCCD, số điện thoại và thông tin thửa đất cho Trưởng thôn hoặc cán bộ HTX.
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              <strong>Nhận tài khoản:</strong> HTX cấp tài khoản theo số điện thoại kèm mật khẩu ban đầu.
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>Đăng nhập sử dụng:</strong> Vào hệ thống, đổi mật khẩu riêng và ghi nhật ký vườn.
            </span>
          </li>
        </ol>

        <div className="auth-contact-card">
          <strong className="auth-contact-title">Liên hệ cấp tài khoản</strong>
          <div className="auth-contact-hotline">
            <span>Hotline HTX</span>
            <a href="tel:0366663778" className="auth-hotline-pill">
              0366 663 778
            </a>
          </div>
          <p className="auth-contact-note">
            Văn phòng HTX Cư Né hoặc gặp Trưởng thôn.
          </p>
        </div>

        <Link href="/login" className="auth-submit is-link">
          <span>Đã có tài khoản? Đăng nhập</span>
          <span className="auth-arrow" aria-hidden="true">
            →
          </span>
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
