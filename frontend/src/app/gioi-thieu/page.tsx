import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Giới thiệu hệ thống",
  description: "Giới thiệu hệ thống quản lý mã vùng trồng sầu riêng của HTX Krông Búk, Đắk Lắk.",
  alternates: { canonical: "/" },
};

// Cùng nội dung với trang chủ nhưng không tự chuyển người đã đăng nhập vào hệ thống,
// để biểu tượng hệ thống trong khu vực làm việc luôn dẫn về được trang giới thiệu.
export default function IntroPage() {
  return <LandingPage />;
}
