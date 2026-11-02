/** Tiện ích chuyển dữ liệu biểu mẫu (chuỗi) sang thân yêu cầu API. */

/** "" → undefined; "12,5" hoặc "12.5" → 12.5; chuỗi không phải số → NaN (để báo lỗi). */
export function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed.replace(",", "."));
}

/** "" → undefined, còn lại cắt khoảng trắng. */
export function toText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** "" → null (xóa giá trị khi sửa), còn lại cắt khoảng trắng. */
export function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Giá trị số/chuỗi có thể null → chuỗi cho ô nhập. */
export const str = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

/** Lấy phần ngày "YYYY-MM-DD" từ chuỗi ngày/ISO cho ô <input type="date">. */
export const dateInput = (value: string | null | undefined): string => (value ? value.slice(0, 10) : "");

/** Ngày hôm nay theo giờ máy người dùng, dạng "YYYY-MM-DD". */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Bỏ các khóa có giá trị undefined (PATCH chỉ gửi trường có giá trị). */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** Định dạng số kiểu Việt Nam, rỗng → "—". */
export function formatVn(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("vi-VN", { maximumFractionDigits });
}
