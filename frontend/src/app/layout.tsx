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

const baiJamjuree = Bai_Jamjuree({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-bai-jamjuree",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HTX Cư Né - Quản lý vùng trồng sầu riêng",
    template: "%s - HTX Cư Né",
  },
  description:
    "Hệ thống quản lý mã vùng trồng sầu riêng của Hợp tác xã Cư Né, Đắk Lắk",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HTX Cư Né",
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
