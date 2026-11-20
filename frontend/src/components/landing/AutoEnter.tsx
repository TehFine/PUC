"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/routes";

export const WORKSPACE_ACTIVE_SESSION_KEY = "puc_in_workspace";

/**
 * Chỉ gắn ở trang chủ `/`: người đã đăng nhập từ trước khi mở mới tab được đưa vào khu làm việc.
 * Nếu người dùng vừa bấm nút Back lùi từ `/admin` hoặc `/portal` ra `/`, giữ nguyên trang chủ `/`
 * để họ xem trang giới thiệu hoặc bấm Back thêm một lần nữa để thoát ra ngoài trình duyệt.
 */
export default function AutoEnter() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [backedOut] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem(WORKSPACE_ACTIVE_SESSION_KEY) === "1") {
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  });

  const target = !backedOut && status === "authenticated" ? homePathFor(session?.user.role) : null;

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
