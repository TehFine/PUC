import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { display } from "@/components/landing/fonts";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import NetworkStatus from "@/components/ui/NetworkStatus";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HTX Krông Búk – Quản lý vùng trồng sầu riêng",
    template: "%s – HTX Krông Búk",
  },
  description:
    "Hệ thống quản lý mã vùng trồng sầu riêng của Hợp tác xã Krông Búk, Đắk Lắk",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef1eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} ${display.variable} font-sans antialiased`}>
        <NetworkStatus />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
