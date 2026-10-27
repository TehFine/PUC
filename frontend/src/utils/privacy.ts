/**
 * Che bớt thông tin cá nhân trước khi hiển thị ở những nơi công khai hơn (vd. popup bản đồ).
 * Giữ họ + chữ cái đầu của phần còn lại: "Nguyễn Văn An" → "Nguyễn V. A."
 */
export function maskPersonName(name: string | null | undefined): string {
  const parts = (name ?? "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  const [family, ...rest] = parts;
  return [family, ...rest.map((part) => `${part.charAt(0).toLocaleUpperCase("vi-VN")}.`)].join(" ");
}
