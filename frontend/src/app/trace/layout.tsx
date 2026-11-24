import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tra cứu nguồn gốc sầu riêng QR - Vùng trồng Cư Né, xã Krông Búk",
  description:
    "Tra cứu trực tuyến mã lô hàng, mã vùng trồng sầu riêng PUC và tem QR xuất khẩu của Hợp tác xã Cư Né (HTX Cư Né - HTX Cune) tại xã Krông Búk, tỉnh Đắk Lắk.",
  alternates: {
    canonical: "/trace",
  },
  openGraph: {
    title: "Tra cứu nguồn gốc sầu riêng QR - HTX Cư Né, xã Krông Búk, Đắk Lắk",
    description:
      "Kiểm tra minh bạch hồ sơ vùng trồng sầu riêng Cư Né, lịch sử canh tác VietGAP và phiếu kiểm nghiệm an toàn xuất khẩu.",
    url: "/trace",
    type: "website",
    locale: "vi_VN",
  },
};

export default function TraceLayout({ children }: { children: React.ReactNode }) {
  return children;
}

