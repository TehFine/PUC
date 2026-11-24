import type { Metadata, Viewport } from "next";
import { Bai_Jamjuree } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import NetworkStatus from "@/components/ui/NetworkStatus";
import SystemAlertBanner from "@/components/ui/SystemAlertBanner";
import { Toaster } from "@/components/ui/Toast";
import { KeyboardScrollGuard } from "@/lib/keyboard-scroll";
import { PERF_BOOTSTRAP_SCRIPT } from "@/lib/perf-bootstrap";
import { COOP_BRAND, CORE_SEO_KEYWORDS, SITE_URL } from "@/lib/seo";

const baiJamjuree = Bai_Jamjuree({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-bai-jamjuree",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: COOP_BRAND.shortName,
  title: {
    default: "HTX Cư Né - Sầu riêng Cư Né, Krông Búk, Đắk Lắk chuẩn xuất khẩu",
    template: "%s - HTX Cư Né",
  },
  description:
    "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né (HTX Cư Né - HTX Cune): vùng trồng sầu riêng Cư Né tại xã Krông Búk, tỉnh Đắk Lắk. Quản lý mã số vùng trồng VietGAP, nhật ký canh tác và truy xuất nguồn gốc QR xuất khẩu chính ngạch.",
  keywords: CORE_SEO_KEYWORDS,
  authors: [{ name: COOP_BRAND.legalName, url: SITE_URL }],
  creator: COOP_BRAND.legalName,
  publisher: COOP_BRAND.legalName,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/newlogo.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: COOP_BRAND.shortName,
  },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: SITE_URL,
    siteName: COOP_BRAND.shortName,
    title: "HTX Cư Né - Sầu riêng Cư Né, Krông Búk, Đắk Lắk chuẩn xuất khẩu",
    description:
      "Vùng trồng sầu riêng liên kết Hợp tác xã Cư Né tại xã Krông Búk, tỉnh Đắk Lắk: chuẩn hóa mã số vùng trồng, nhật ký canh tác, kiểm nghiệm an toàn và truy xuất nguồn gốc QR xuất khẩu chính ngạch.",
    images: [
      {
        url: "/landing/real-hero-cune.jpg",
        width: 1200,
        height: 630,
        alt: "Vùng trồng sầu riêng Hợp tác xã Cư Né tại xã Krông Búk, tỉnh Đắk Lắk",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HTX Cư Né - Sầu riêng Cư Né, Krông Búk, Đắk Lắk",
    description:
      "Hệ thống quản lý vùng trồng, nhật ký canh tác và truy xuất nguồn gốc QR sầu riêng xuất khẩu của Hợp tác xã Cư Né (Krông Búk, Đắk Lắk).",
    images: ["/landing/real-hero-cune.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Đọc nonce CSP theo từng request (do src/proxy.ts cấp) để Next.js dựng động và khớp đồng thời cả nonce lẫn mã băm SHA-256.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="vi" className={baiJamjuree.variable} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PERF_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={`${baiJamjuree.variable} ${baiJamjuree.className} font-sans antialiased`}>
        <NetworkStatus />
        <KeyboardScrollGuard />
        <AuthProvider>
          <SystemAlertBanner />
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
