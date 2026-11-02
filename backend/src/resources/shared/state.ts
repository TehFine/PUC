import { AppException } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

/** Thao tác không hợp lệ với trạng thái hiện tại của bản ghi (ví dụ duyệt hồ sơ đã duyệt). */
export const invalidState = (message: string) => new AppException(409, message, "INVALID_STATE");

/** Sau khi UPDATE có điều kiện trạng thái không khớp dòng nào: phân biệt "không tồn tại" (404) với "sai trạng thái" (409). */
export async function assertExists(db: DatabaseService, table: string, id: number, stateMessage: string): Promise<never> {
  const { rows } = await db.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (rows.length === 0) throw new AppException(404, "Không tìm thấy bản ghi.", "NOT_FOUND");
  throw invalidState(stateMessage);
}

/** Ngày hôm nay theo giờ Việt Nam (dùng trong SQL). */
export const TODAY_VN_SQL = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date";

/** URL ảnh/tệp công khai hoặc đường dẫn tĩnh trong ứng dụng; chặn `javascript:` và các scheme lạ. */
export const SAFE_URL = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/;
