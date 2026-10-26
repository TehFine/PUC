"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/routes";

/**
 * Chỉ gắn ở trang chủ `/`: người đã đăng nhập từ trước được đưa thẳng vào khu vực làm việc của mình.
 * Muốn xem lại trang giới thiệu thì bấm biểu tượng hệ thống (dẫn tới `/gioi-thieu`, không chuyển hướng).
 */
export default function AutoEnter() {
  const router = useRouter();
  const { status, session } = useAuth();
  const target = status === "authenticated" ? homePathFor(session?.user.role) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (!target) return null;
  return (
    <div className="lp-entering" role="status">
      Đang vào hệ thống…
    </div>
  );
}
