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
      title="Quy trình ban hành tài khoản"
      subtitle="Để đảm bảo quản trị vùng trồng chặt chẽ, hồ sơ hộ và tài khoản đăng nhập do Ban Quản trị HTX Cư Né trực tiếp thiết lập và bàn giao."
      wide
    >
      <div>
        <ol className="auth-steps">
          <li>
            <b>1</b>
            <span>
              <strong>Thiết lập hồ sơ hộ &amp; thửa đất:</strong> Cán bộ HTX và Trưởng thôn tiếp nhận thông tin CCCD, số điện thoại, đo đạc tọa độ thửa đất và lập hồ sơ hộ trên hệ thống quản trị.
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              <strong>Ban hành tài khoản thành viên:</strong> Sau khi hồ sơ hộ hoàn tất, Quản trị viên HTX trực tiếp ban hành tài khoản (theo số điện thoại chủ hộ) kèm phiếu bàn giao mật khẩu khởi tạo.
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>Đăng nhập &amp; Quản lý nhật ký vườn:</strong> Bà con dùng tài khoản được bàn giao để đăng nhập và đổi mật khẩu cá nhân ngay trên Cổng hộ dân.
            </span>
          </li>
        </ol>

        <div className="auth-contact-card">
          <strong className="auth-contact-title">Liên hệ cấp tài khoản hộ thành viên</strong>
          <div className="auth-contact-hotline">
            <span>Hotline kỹ thuật HTX Cư Né</span>
            <a href="tel:0366663778" className="auth-hotline-pill">
              0366 663 778
            </a>
          </div>
          <p className="auth-contact-note">
            Văn phòng HTX tại Xã Cư Né, Krông Búk, Đắk Lắk (hoặc liên hệ trực tiếp Trưởng thôn phụ trách).
          </p>
        </div>

        <Link href="/login" className="auth-submit is-link">
          <span>Đã có tài khoản? Đăng nhập</span>
          <span className="auth-arrow" aria-hidden="true">
            →
          </span>
        </Link>

        <p className="auth-switch-hint">
          <span>Đã được cấp tài khoản nhưng quên mật khẩu?</span>
          <Link href="/forgot-password" className="auth-switch-btn">
            Khôi phục mật khẩu →
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
