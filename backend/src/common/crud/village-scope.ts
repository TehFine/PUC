import type { AuthUser } from "../../auth/auth-user";
import { DatabaseService } from "../../database/database.service";
import { forbidden } from "../errors/app.exception";

/** Cán bộ Thôn chỉ thấy dữ liệu thuộc thôn của mình. Trả về mệnh đề SQL cho `column`, hoặc null nếu không giới hạn. */
export const villageScope = (column: string) => (user: AuthUser, params: unknown[]) => {
  if (user.role !== "village_officer") return null;
  params.push(user.villageId ?? -1);
  return `${column} = $${params.length}`;
};

/** Cán bộ Thôn chỉ được ghi dữ liệu cho hộ thuộc thôn của mình. */
export async function assertHouseholdInScope(
  db: DatabaseService,
  input: Record<string, unknown>,
  user: AuthUser,
): Promise<void> {
  if (user.role !== "village_officer" || input.householdId === undefined) return;
  const { rows } = await db.query("SELECT 1 FROM households WHERE id = $1 AND village_id = $2", [
    input.householdId,
    user.villageId ?? -1,
  ]);
  if (rows.length === 0) throw forbidden("Hộ này không thuộc thôn của bạn.");
}
