import type { AuthUser } from "../../auth/auth-user";
import { DatabaseService } from "../../database/database.service";
import { badRequest, forbidden } from "../errors/app.exception";

/** Cán bộ Thôn chỉ thấy dữ liệu thuộc thôn của mình. Trả về mệnh đề SQL cho `column`, hoặc null nếu không giới hạn. */
export const villageScope = (column: string) => (user: AuthUser, params: unknown[]) => {
  if (user.role !== "village_officer") return null;
  params.push(user.villageId ?? -1);
  return `${column} = $${params.length}`;
};

/** Kiểm tra hộ tồn tại và (với cán bộ thôn) phải thuộc thôn của mình. */
export async function assertHouseholdInScope(
  db: DatabaseService,
  input: Record<string, unknown>,
  user: AuthUser,
): Promise<void> {
  if (input.householdId === undefined || input.householdId === null) return;
  const { rows } = await db.query<{ village_id: number }>(
    "SELECT village_id FROM households WHERE id = $1",
    [input.householdId],
  );
  if (rows.length === 0) throw badRequest("Hộ nông dân không tồn tại.");
  if (user.role === "village_officer" && rows[0].village_id !== (user.villageId ?? -1)) {
    throw forbidden("Hộ này không thuộc thôn của bạn.");
  }
}
