/** Chuyển khóa snake_case (cột SQL) sang camelCase (JSON trả về client). */
export const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export const camelRow = <T = Record<string, unknown>>(row: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])) as T;

export const camelRows = <T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] =>
  rows.map((row) => camelRow<T>(row));

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export const todayVn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/** Đường dẫn tải tệp đính kèm riêng tư (dùng trong cột SELECT: `attachmentUrlSql('j.photo_id')`). */
export const attachmentUrlSql = (column: string) =>
  `CASE WHEN ${column} IS NULL THEN NULL ELSE '/api/uploads/' || ${column} END`;

/** Đường dẫn tải tệp công khai (ảnh bản tin, danh mục, ảnh đại diện hộ trên trang truy xuất). */
export const publicAttachmentUrlSql = (column: string) =>
  `CASE WHEN ${column} IS NULL THEN NULL ELSE '/api/public/files/' || ${column} END`;
