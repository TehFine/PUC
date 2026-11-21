import { Bai_Jamjuree } from "next/font/google";

/**
 * Toàn hệ thống đồng bộ thống nhất phông chữ Bai Jamjuree hỗ trợ đầy đủ tiếng Việt.
 */
export const display = Bai_Jamjuree({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
  preload: false,
});

export const heroSans = Bai_Jamjuree({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-hero-sans",
  display: "swap",
  preload: false,
});
