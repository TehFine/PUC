import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { heroSans } from "@/components/landing/fonts";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import NetworkStatus from "@/components/ui/NetworkStatus";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} ${heroSans.variable} font-sans antialiased`}>
        <NetworkStatus />
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
