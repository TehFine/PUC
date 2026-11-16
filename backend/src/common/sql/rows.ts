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
  `CASE
     WHEN ${column} IS NULL THEN NULL
     ELSE (
       SELECT CASE
         WHEN a_single.mime_type = 'video/webm' THEN '/api/uploads/' || a_single.id || '/video.webm'
         WHEN a_single.mime_type LIKE 'video/%' THEN '/api/uploads/' || a_single.id || '/video.mp4'
         ELSE '/api/uploads/' || a_single.id
       END
       FROM attachments a_single
       WHERE a_single.id = ${column}
     )
   END`;

/**
 * Mảng JSON các đường dẫn tải tệp đính kèm riêng tư theo đúng thứ tự tải lên.
 * Nếu cột mảng rỗng (bản ghi cũ), tự động lùi về cột đơn `fallbackColumn`.
 * Với tệp video, gắn hậu tố `/video.mp4` hoặc `/video.webm` để giao diện nhận diện tức thì không tải nhầm qua thẻ `<img>`.
 */
export const attachmentUrlsSql = (idsColumn: string, fallbackColumn: string) =>
  `COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN a_item.mime_type = 'video/webm' THEN '/api/uploads/' || a_item.id || '/video.webm'
          WHEN a_item.mime_type LIKE 'video/%' THEN '/api/uploads/' || a_item.id || '/video.mp4'
          ELSE '/api/uploads/' || a_item.id
        END
        ORDER BY u_item.ord
      )
      FROM unnest(
        CASE
          WHEN cardinality(${idsColumn}) > 0 THEN ${idsColumn}
          WHEN ${fallbackColumn} IS NOT NULL THEN ARRAY[${fallbackColumn}]
          ELSE ARRAY[]::bigint[]
        END
      ) WITH ORDINALITY AS u_item(att_id, ord)
      JOIN attachments a_item ON a_item.id = u_item.att_id
    ),
    '[]'::jsonb
  )`;

/** Đường dẫn tải tệp công khai qua token ngẫu nhiên 20 ký tự (chống dò quét ID tuần tự). */
export const publicAttachmentUrlSql = (column: string) =>
  `CASE
     WHEN ${column} IS NULL THEN NULL
     ELSE (
       SELECT CASE
         WHEN a_pub.mime_type = 'video/webm' THEN '/api/public/files/' || a_pub.public_token || '/video.webm'
         WHEN a_pub.mime_type LIKE 'video/%' THEN '/api/public/files/' || a_pub.public_token || '/video.mp4'
         ELSE '/api/public/files/' || a_pub.public_token
       END
       FROM attachments a_pub
       WHERE a_pub.id = ${column}
     )
   END`;

/** Mảng JSON đường dẫn tải tệp công khai qua `public_token` theo đúng thứ tự tải lên. */
export const publicAttachmentUrlsSql = (idsColumn: string, fallbackColumn: string) =>
  `COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN a_pub.mime_type = 'video/webm' THEN '/api/public/files/' || a_pub.public_token || '/video.webm'
          WHEN a_pub.mime_type LIKE 'video/%' THEN '/api/public/files/' || a_pub.public_token || '/video.mp4'
          ELSE '/api/public/files/' || a_pub.public_token
        END
        ORDER BY u_pub.ord
      )
      FROM unnest(
        CASE
          WHEN cardinality(${idsColumn}) > 0 THEN ${idsColumn}
          WHEN ${fallbackColumn} IS NOT NULL THEN ARRAY[${fallbackColumn}]
          ELSE ARRAY[]::bigint[]
        END
      ) WITH ORDINALITY AS u_pub(att_id, ord)
      JOIN attachments a_pub ON a_pub.id = u_pub.att_id
    ),
    '[]'::jsonb
  )`;
