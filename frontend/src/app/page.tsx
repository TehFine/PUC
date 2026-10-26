import type { Metadata, Viewport } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: { absolute: "HTX Krông Búk – Sầu riêng minh bạch, đạt chuẩn xuất khẩu" },
  description:
    "Hệ thống quản lý mã vùng trồng sầu riêng của HTX Krông Búk, Đắk Lắk: bản đồ thửa đất, nhật ký canh tác, kiểm nghiệm và quy trình chăm sóc đạt chuẩn chất lượng xuất khẩu.",
  openGraph: {
    title: "HTX Krông Búk – Sầu riêng minh bạch từ vườn đến thị trường",
    description: "Tìm hiểu hệ thống quản lý mã vùng trồng, quy trình chăm sóc và tiêu chuẩn xuất khẩu sầu riêng.",
    type: "website",
    locale: "vi_VN",
    images: ["/landing/hero.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171b13",
};

// Trang chủ: khách xem giới thiệu; người đã đăng nhập được chuyển thẳng vào /admin hoặc /portal.
export default function HomePage() {
  return <LandingPage autoEnter />;
}
