import { Noto_Serif_Display } from "next/font/google";

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
