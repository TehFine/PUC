/** Bảng màu biểu đồ (recharts) dùng chung cho khu quản trị, cùng tông với trang giới thiệu. */
export const CHART_COLORS = {
  ok: "#5fae5b",
  deep: "#2f8f6f",
  warn: "#e0b020",
  bad: "#e0674a",
  info: "#5aa9d6",
  ink: "#14372f",
} as const;

export const AXIS_TICK = { fill: "#5f6d66", fontSize: 11 };

export const GRID_STROKE = "rgba(20, 55, 47, 0.1)";

export const LEGEND_STYLE = { fontSize: 12, color: "#2c5a4b", paddingTop: 6 };

export const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid rgba(20, 55, 47, 0.12)",
  borderRadius: 14,
  color: "#14372f",
  fontSize: 12,
  boxShadow: "0 12px 30px rgba(20, 55, 47, 0.14)",
};
