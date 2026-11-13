import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { heroSans } from "@/components/landing/fonts";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import NetworkStatus from "@/components/ui/NetworkStatus";
import SystemAlertBanner from "@/components/ui/SystemAlertBanner";
import { Toaster } from "@/components/ui/Toast";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HTX Cư Né – Quản lý vùng trồng sầu riêng",
    template: "%s – HTX Cư Né",
  },
  description:
    "Hệ thống quản lý mã vùng trồng sầu riêng của Hợp tác xã Cư Né, Đắk Lắk",
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

const PERF_BOOTSTRAP_SCRIPT = `(function(){try{var d=document.documentElement,q=new URLSearchParams(location.search).get("perf");if(q==="lite"||q==="full"){d.dataset.perf=q;return;}var n=navigator,c=n.connection,l=(n.hardwareConcurrency>0&&n.hardwareConcurrency<=4)||(n.deviceMemory>0&&n.deviceMemory<=4)||!!(c&&(c.saveData||c.effectiveType==="2g"||c.effectiveType==="slow-2g"))||(typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches);d.dataset.perf=l?"lite":"full";}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PERF_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${heroSans.variable} font-sans antialiased`}>
        <NetworkStatus />
        <AuthProvider>
          <SystemAlertBanner />
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
