// Tiện ích nhỏ cho biểu mẫu khu quản trị: chuyển chuỗi nhập ↔ giá trị gửi backend.

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD (dùng làm giá trị mặc định của ô ngày). */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Chuỗi rỗng → null, ngược lại cắt khoảng trắng. */
export const textOrNull = (value: string): string | null => (value.trim() ? value.trim() : null);

/** Chuỗi số (chấp nhận dấu phẩy thập phân) → number, rỗng/không hợp lệ → undefined. */
export function parseNumber(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Giá trị số/null từ backend → chuỗi cho ô nhập. */
export const numberText = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value) ? "" : String(value);

/** "08:30:00" → "08:30" (ô `type="time"` chỉ nhận HH:MM). */
export const timeText = (value: string | null | undefined): string => (value ? value.slice(0, 5) : "");

/** Lấy phần ngày của chuỗi ISO (giá trị ô `type="date"`). */
export const dateText = (value: string | null | undefined): string => (value ? value.slice(0, 10) : "");

export const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Chuỗi YYYY-MM-DD có nằm sau hôm nay không. */
export const isFutureDate = (value: string) => value > todayIso();

/** Số có dạng dễ đọc tiếng Việt: 1234.5 → "1.234,5". */
export const formatVn = (value: number | null | undefined, digits = 0): string =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Phần trăm làm tròn, an toàn khi mẫu số = 0. */
export const percent = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/** Kiểm tra nhanh các trường bắt buộc; trả về map lỗi tiếng Việt theo tên trường. */
export function requireFields<T extends Record<string, string>>(
  values: T,
  labels: Partial<Record<keyof T, string>>,
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const key of Object.keys(labels) as (keyof T)[]) {
    if (!String(values[key] ?? "").trim()) errors[key] = `Vui lòng nhập ${labels[key]}.`;
  }
  return errors;
}

export const hasErrors = (errors: Record<string, string | undefined>) => Object.values(errors).some(Boolean);
