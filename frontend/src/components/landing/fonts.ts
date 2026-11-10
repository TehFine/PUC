import { Noto_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Chữ tiêu đề serif tương phản cao, kiểu tạp chí (chỉ dùng trên trang giới thiệu, tắt preload toàn cục
 * để các trang làm việc /portal và /admin không tải thêm font serif vào RAM trên máy cấu hình yếu).
 */
export const display = Noto_Serif_Display({
  subsets: ["latin", "vietnamese"],
  weight: "variable",
  style: ["normal"],
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
  preload: false,
});

/**
 * Font Sans-Serif hiện đại, nét đậm sắc nét (Bold / Extra Bold Sans) theo phong cách ảnh mẫu.
 * Hỗ trợ tiếng Việt đầy đủ, đường nét dứt khoát, cao cấp và tương phản mạnh mẽ.
 */
export const heroSans = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: "variable",
  variable: "--font-hero-sans",
  display: "swap",
});

