import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { notFound } from "../../common/errors/app.exception";
import { camelRow } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { householdIdOf } from "../common/portal-context";

/** Hồ sơ tài khoản và hộ. CCCD chỉ trả về dạng che (4 số cuối). Đổi mật khẩu dùng `POST /api/auth/change-password`. */
@Injectable()
export class ProfileService {
  constructor(private readonly db: DatabaseService) {}

  async profile(user: AuthUser) {
    const householdId = householdIdOf(user);
    const account = (
      await this.db.query("SELECT full_name, username, email, last_login_at FROM users WHERE id = $1", [user.id])
    ).rows[0];
    const household = (
      await this.db.query(
        `SELECT h.code, h.name, h.phone, repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) AS cccd_masked,
                v.name AS village_name, v.leader AS village_leader, h.plot_count, h.area_ha, h.status
         FROM households h JOIN villages v ON v.id = h.village_id WHERE h.id = $1`,
        [householdId],
      )
    ).rows[0];
    if (!account || !household) throw notFound("Không tìm thấy hộ của tài khoản này.");
    return { account: camelRow(account), household: camelRow(household) };
  }
}
