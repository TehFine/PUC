import { Noto_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Chữ tiêu đề serif tương phản cao, kiểu tạp chí (theo bộ ảnh tham chiếu trong uiux/).
 * Hỗ trợ tiếng Việt và có trục độ rộng (wdth) để co hẹp chữ khi cần.
 */
export const display = Noto_Serif_Display({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

/**
 * Font Sans-Serif hiện đại, nét đậm sắc nét (Bold / Extra Bold Sans) theo phong cách ảnh mẫu.
 * Hỗ trợ tiếng Việt đầy đủ, đường nét dứt khoát, cao cấp và tương phản mạnh mẽ.
 */
export const heroSans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
  variable: "--font-hero-sans",
  display: "swap",
});

