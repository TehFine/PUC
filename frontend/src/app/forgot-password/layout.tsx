import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Quên mật khẩu",
  description: "Khôi phục mật khẩu bằng số Căn cước công dân (CCCD) 12 số hoặc gửi yêu cầu cán bộ HTX Cư Né phê duyệt.",
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

