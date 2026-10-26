import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập bằng số điện thoại để ghi nhật ký vườn và xem mã vùng trồng của HTX Krông Búk.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
