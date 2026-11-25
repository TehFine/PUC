import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { notFound } from "../../common/errors/app.exception";
import { camelRow, publicAttachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UploadsService } from "../../uploads/uploads.service";
import { type ClientContext, householdIdOf } from "../common/portal-context";

/** Hồ sơ tài khoản và hộ. CCCD chỉ trả về dạng che (2 số cuối). Đổi mật khẩu dùng `POST /api/auth/change-password`. */
@Injectable()
export class ProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) { }

  async profile(user: AuthUser) {
    const householdId = householdIdOf(user);
    const [accountRes, hhRes] = await Promise.all([
      this.db.query("SELECT full_name, username, email, last_login_at FROM users WHERE id = $1", [user.id]),
      this.db.query(
        `SELECT h.code, h.name, h.phone,
                CASE WHEN h.cccd IS NULL OR btrim(h.cccd) = '' THEN NULL ELSE '**********' || right(btrim(h.cccd), 2) END AS cccd_masked,
                v.name AS village_name, v.leader AS village_leader, h.plot_count, h.area_ha, h.status,
                h.public_trace_consent,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url
         FROM households h JOIN villages v ON v.id = h.village_id WHERE h.id = $1`,
        [householdId],
      ),
    ]);
    const account = accountRes.rows[0];
    const household = hhRes.rows[0];
    if (!account || !household) throw notFound("Không tìm thấy hộ của tài khoản này.");
    return { account: camelRow(account), household: camelRow(household) };
  }

  async updateAvatar(avatarId: number | null, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const [validId] = await this.uploads.assertUsable(avatarId ? [avatarId] : [], user, "avatar", householdId);
    const nextAvatarId = validId ?? null;

    const updated = await this.db.query<{ code: string; name: string; avatar_url: string | null }>(
      `UPDATE households h
       SET avatar_id = $1
       WHERE h.id = $2
       RETURNING h.code, h.name, ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url`,
      [nextAvatarId, householdId],
    );
    if (updated.rowCount === 0) throw notFound("Không tìm thấy hộ của tài khoản này.");
    const hhRow = updated.rows[0];

    await this.audit.write(
      { ip: context.ip, user },
      {
        action: nextAvatarId ? "Nông hộ cập nhật ảnh đại diện" : "Nông hộ gỡ ảnh đại diện",
        object: hhRow.code,
        detail: nextAvatarId ? `Ảnh đính kèm #${nextAvatarId}` : "Xóa ảnh đại diện hộ",
      },
    );

    await this.notifications.notifyOversightForHousehold(householdId, {
      kind: "system",
      title: nextAvatarId
        ? `Hộ ${hhRow.name} vừa cập nhật ảnh đại diện`
        : `Hộ ${hhRow.name} đã gỡ ảnh đại diện`,
      body: `Mã hộ ${hhRow.code}`,
      link: `/admin?section=households&householdId=${householdId}`,
    });

    return { avatarUrl: hhRow.avatar_url };
  }

  async updateTraceConsent(publicTraceConsent: boolean, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const updated = await this.db.query<{ code: string; name: string; public_trace_consent: boolean }>(
      `UPDATE households
       SET public_trace_consent = $1
       WHERE id = $2
       RETURNING code, name, public_trace_consent`,
      [publicTraceConsent, householdId],
    );
    if (updated.rowCount === 0) throw notFound("Không tìm thấy hộ của tài khoản này.");
    const hhRow = updated.rows[0];

    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Cập nhật quyền hiển thị tên trên QR công khai",
        object: hhRow.code,
        detail: publicTraceConsent
          ? "Đồng ý hiển thị tên hộ trên trang quét QR công khai"
          : "Ẩn tên hộ trên trang quét QR công khai (chỉ hiện tên HTX)",
      },
    );

    await this.notifications.notifyOversightForHousehold(householdId, {
      kind: "system",
      title: `Hộ ${hhRow.name} cập nhật hiển thị QR công khai`,
      body: publicTraceConsent
        ? `Đồng ý hiển thị tên hộ (${hhRow.code}) trên hồ sơ QR công khai.`
        : `Ẩn tên hộ (${hhRow.code}) trên hồ sơ QR công khai.`,
      link: `/admin?section=households&householdId=${householdId}`,
    });

    return { publicTraceConsent: hhRow.public_trace_consent };
  }
}
