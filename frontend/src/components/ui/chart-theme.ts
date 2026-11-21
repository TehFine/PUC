/** Bảng màu biểu đồ (recharts) dùng chung cho khu quản trị, cùng tông với trang giới thiệu. */
export const CHART_COLORS = {
  ok: "#5fae5b",
  deep: "#2f8f6f",
  warn: "#e0b020",
  bad: "#e0674a",
  info: "#5aa9d6",
  ink: "#14372f",
} as const;

const CHART_FONT_FAMILY = 'var(--font-body-stack), "Bai Jamjuree", Arial, Helvetica, sans-serif';

export const AXIS_TICK = { fill: "#5f6d66", fontSize: 11, fontFamily: CHART_FONT_FAMILY };

export const GRID_STROKE = "rgba(20, 55, 47, 0.1)";

export const LEGEND_STYLE = { fontSize: 12, color: "#2c5a4b", paddingTop: 6, fontFamily: CHART_FONT_FAMILY };

export const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid rgba(20, 55, 47, 0.12)",
  borderRadius: 6,
  color: "#14372f",
  fontSize: 12,
  fontFamily: CHART_FONT_FAMILY,
  boxShadow: "0 8px 20px rgba(20, 55, 47, 0.12)",
};
