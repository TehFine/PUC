import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import LandingPage from "@/components/landing/LandingPage";
import { buildHomeStructuredDataJson, CORE_SEO_KEYWORDS } from "@/lib/seo";
import { fetchServerPublicOverview } from "@/lib/server-public";

export const metadata: Metadata = {
  title: {
    absolute: "HTX Cư Né - Sầu riêng Cư Né, Krông Búk, Đắk Lắk chuẩn xuất khẩu",
  },
  description:
    "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né (HTX Cư Né - HTX Cune): vùng trồng sầu riêng Cư Né tại huyện Krông Búk, tỉnh Đắk Lắk. Quản lý bản đồ số thửa vườn, mã số vùng trồng VietGAP, nhật ký canh tác, kiểm nghiệm an toàn và truy xuất nguồn gốc QR xuất khẩu chính ngạch.",
  keywords: CORE_SEO_KEYWORDS,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "HTX Cư Né - Sầu riêng Cư Né, Krông Búk, Đắk Lắk chuẩn xuất khẩu",
    description:
      "Khám phá vùng trồng sầu riêng liên kết Hợp tác xã Cư Né tại huyện Krông Búk, tỉnh Đắk Lắk: mã số vùng trồng định danh, nhật ký mùa vụ điện tử và tem QR xuất khẩu chính ngạch.",
    url: "/",
    type: "website",
    locale: "vi_VN",
    images: [
      {
        url: "/landing/real-hero-cune.jpg",
        width: 1200,
        height: 630,
        alt: "Sầu riêng vùng trồng Hợp tác xã Cư Né tại huyện Krông Búk, tỉnh Đắk Lắk",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

// Trang chủ: khách xem giới thiệu; người đã đăng nhập được chuyển thẳng vào /admin hoặc /portal.
export default async function HomePage() {
  const [headerList, initialOverview] = await Promise.all([
    headers(),
    fetchServerPublicOverview(),
  ]);
  const nonce = headerList.get("x-nonce") ?? undefined;
  const jsonLd = buildHomeStructuredDataJson();

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <LandingPage autoEnter initialOverview={initialOverview} />
    </>
  );
}
