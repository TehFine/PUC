/**
 * Đối chiếu bằng chứng khắc phục cho vi phạm loại "chưa cập nhật nhật ký canh tác".
 *
 * Vi phạm loại này được nhận diện theo tiêu đề có chữ "nhật ký" — cùng quy ước với nhắc việc ở
 * `portal/overview` và việc tự ghi phản hồi khi hộ ghi nhật ký (`portal/journal`).
 * Bằng chứng khắc phục: hộ có bản ghi nhật ký (đúng thửa vi phạm, nếu vi phạm gắn thửa)
 * với ngày ghi từ ngày phát hiện vi phạm trở về sau.
 */

/** Biểu thức SQL: vi phạm thuộc loại "chưa cập nhật nhật ký". `alias` là bí danh bảng violations. */
export const isJournalViolationSql = (alias: string) => `(${alias}.title ILIKE '%nhật ký%')`;

/** Biểu thức SQL: ngày ghi nhật ký gần nhất của hộ cho đúng thửa vi phạm (NULL nếu chưa có). */
export const lastJournalOnSql = (alias: string) =>
  `(SELECT max(je.entry_on) FROM journal_entries je
    WHERE je.household_id = ${alias}.household_id
      AND (${alias}.plot_code IS NULL OR je.plot_code = ${alias}.plot_code))`;

/** Đã có nhật ký mới kể từ ngày phát hiện chưa (ngày dạng 'YYYY-MM-DD' nên so sánh chuỗi được). */
export function hasJournalSince(lastJournalOn: string | null | undefined, detectedOn: string): boolean {
  return !!lastJournalOn && lastJournalOn >= detectedOn;
}

