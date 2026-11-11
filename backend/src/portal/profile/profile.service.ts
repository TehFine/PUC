import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { notFound } from "../../common/errors/app.exception";
import { camelRow, publicAttachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { UploadsService } from "../../uploads/uploads.service";
import { type ClientContext, householdIdOf } from "../common/portal-context";

/** Hồ sơ tài khoản và hộ. CCCD chỉ trả về dạng che (4 số cuối). Đổi mật khẩu dùng `POST /api/auth/change-password`. */
@Injectable()
export class ProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
  ) {}

  async profile(user: AuthUser) {
    const householdId = householdIdOf(user);
    const account = (
      await this.db.query("SELECT full_name, username, email, last_login_at FROM users WHERE id = $1", [user.id])
    ).rows[0];
    const household = (
      await this.db.query(
        `SELECT h.code, h.name, h.phone, repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) AS cccd_masked,
                v.name AS village_name, v.leader AS village_leader, h.plot_count, h.area_ha, h.status,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url
         FROM households h JOIN villages v ON v.id = h.village_id WHERE h.id = $1`,
        [householdId],
      )
    ).rows[0];
    if (!account || !household) throw notFound("Không tìm thấy hộ của tài khoản này.");
    return { account: camelRow(account), household: camelRow(household) };
  }

  async updateAvatar(avatarId: number | null, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const [validId] = await this.uploads.assertUsable(avatarId ? [avatarId] : [], user, "avatar", householdId);
    const nextAvatarId = validId ?? null;

    const updated = await this.db.query<{ code: string; avatar_url: string | null }>(
      `UPDATE households h
       SET avatar_id = $1
       WHERE h.id = $2
       RETURNING h.code, ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url`,
      [nextAvatarId, householdId],
    );
    if (updated.rowCount === 0) throw notFound("Không tìm thấy hộ của tài khoản này.");

    await this.audit.write(
      { ip: context.ip, user },
      {
        action: nextAvatarId ? "Nông hộ cập nhật ảnh đại diện" : "Nông hộ gỡ ảnh đại diện",
        object: updated.rows[0].code,
        detail: nextAvatarId ? `Ảnh đính kèm #${nextAvatarId}` : "Xóa ảnh đại diện hộ",
      },
    );

    return { avatarUrl: updated.rows[0].avatar_url };
  }
}
