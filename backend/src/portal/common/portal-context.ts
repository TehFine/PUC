import type { PoolClient } from "pg";
import type { AuthUser } from "../../auth/auth-user";
import { AppException, badRequest, forbidden } from "../../common/errors/app.exception";
import type { DatabaseService } from "../../database/database.service";

/** Thông tin yêu cầu dùng cho nhật ký thao tác (audit log). */
export interface ClientContext {
  ip?: string;
}

/** Ngày hôm nay theo giờ Việt Nam, dùng trong câu SQL (không phụ thuộc múi giờ của máy chủ CSDL). */
export const TODAY_VN_SQL = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date";

/** Đường dẫn trong cổng hộ dân (dùng cho thông báo / nhắc việc). Khớp với `PortalTabId` của frontend. */
export const PORTAL_TABS = {
  home: "home",
  plots: "plots",
  diary: "diary",
  stamps: "stamps",
  inspection: "inspection",
  learn: "learn",
} as const;

export const conflict = (message: string) => new AppException(409, message, "CONFLICT");

/**
 * Hộ gắn với tài khoản đăng nhập. Mọi truy vấn của cổng hộ dân đều giới hạn theo id này
 * (lấy từ phiên đăng nhập, không bao giờ nhận từ client).
 */
export function householdIdOf(user: AuthUser): number {
  if (user.householdId === null || user.householdId === undefined) {
    throw forbidden("Tài khoản chưa được liên kết với hộ nào. Vui lòng liên hệ cán bộ HTX.");
  }
  return user.householdId;
}

/** Bảng `plots` chỉ có khi CSDL bật PostGIS (migration 002 có thể bị bỏ qua). */
export async function plotsTableExists(db: Pick<DatabaseService, "query">): Promise<boolean> {
  const { rows } = await db.query<{ t: string | null }>("SELECT to_regclass('public.plots')::text AS t");
  return rows[0]?.t !== null && rows[0]?.t !== undefined;
}

/**
 * Kiểm tra mã thửa hộ gửi lên. Khi có dữ liệu thửa (bảng `plots`):
 * - thửa đã gắn với hộ khác → từ chối;
 * - hộ đã có thửa được gắn (`plots.household_id`) → mã thửa phải là một trong các thửa đó.
 * Khi chưa có dữ liệu bản đồ, hoặc hộ chưa được gắn thửa nào, chấp nhận mọi mã không rỗng.
 * Trả về mã thửa đã cắt khoảng trắng.
 */
export async function assertPlotOwned(
  db: Pick<DatabaseService, "query">,
  householdId: number,
  plotCode: string | null | undefined,
): Promise<string> {
  const code = (plotCode ?? "").trim();
  if (!code) throw badRequest("Vui lòng chọn thửa đất.");
  if (!(await plotsTableExists(db))) return code;

  const { rows } = await db.query<{ has_plots: boolean; owned: boolean; foreign_owned: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM plots WHERE household_id = $1) AS has_plots,
       EXISTS (SELECT 1 FROM plots WHERE upper(code) = upper($2) AND household_id = $1) AS owned,
       EXISTS (SELECT 1 FROM plots WHERE upper(code) = upper($2) AND household_id IS NOT NULL AND household_id <> $1) AS foreign_owned`,
    [householdId, code],
  );
  const check = rows[0];
  if (check.foreign_owned || (check.has_plots && !check.owned)) {
    throw badRequest(`Thửa "${code}" không thuộc hộ của bạn.`);
  }
  return code;
}

/** Chạy `fn` trong một giao dịch (BEGIN/COMMIT, tự ROLLBACK khi lỗi). */
export async function withTransaction<T>(db: DatabaseService, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** So sánh số thực có sai số làm tròn (khối lượng lưu 1 chữ số thập phân). */
export const exceedsWithTolerance = (value: number, limit: number) => value - limit > 1e-6;
