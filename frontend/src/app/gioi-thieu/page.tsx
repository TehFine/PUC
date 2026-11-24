import type { Metadata } from "next";
import { headers } from "next/headers";
import LandingPage from "@/components/landing/LandingPage";
import { buildHomeStructuredDataJson } from "@/lib/seo";
import { fetchServerPublicOverview } from "@/lib/server-public";

export const metadata: Metadata = {
  title: "Giới thiệu vùng trồng sầu riêng Cư Né, Krông Búk",
  description:
    "Giới thiệu Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né (HTX Cư Né - HTX Cune) và hệ thống quản lý mã vùng trồng sầu riêng tại xã Krông Búk, tỉnh Đắk Lắk.",
  alternates: { canonical: "/" },
};

// Cùng nội dung với trang chủ nhưng không tự chuyển người đã đăng nhập vào hệ thống,
// để biểu tượng hệ thống trong khu vực làm việc luôn dẫn về được trang giới thiệu.
export default async function IntroPage() {
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
      <LandingPage initialOverview={initialOverview} />
    </>
  );
}
