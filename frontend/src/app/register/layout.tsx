import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Đăng ký tài khoản",
  description: "Hộ dân đăng ký tài khoản để cán bộ HTX Krông Búk duyệt và gắn vào đúng hộ.",
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
