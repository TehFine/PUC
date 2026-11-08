import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Quản trị vùng trồng",
  description: "Khu vực làm việc của cán bộ HTX Cư Né: quản lý hộ dân, thửa đất, mã vùng trồng và hồ sơ.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
