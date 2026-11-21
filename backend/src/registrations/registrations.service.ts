import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../auth/auth-user";
import { isAdminPrivilegedRole, isManagementRole } from "../auth/permissions";
import { AuditService } from "../audit/audit.service";
import { isStaffInCuneCoopScope, isStaffInParcelScope } from "../common/crud/village-scope";
import { AppException, forbidden, notFound } from "../common/errors/app.exception";
import { DatabaseService } from "../database/database.service";

const OUT_OF_SCOPE_MSG = "Bạn không có quyền xử lý hồ sơ ngoài phạm vi quản lý.";

const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const camelRows = (rows: Record<string, unknown>[]) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])));

const UPPER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER_CHARS = "abcdefghijkmnopqrstuvwxyz";
const DIGIT_CHARS = "23456789";
const ALL_TEMP_CHARS = `${UPPER_CHARS}${LOWER_CHARS}${DIGIT_CHARS}`;

function randomIndex(maxExclusive: number): number {
  const maxUnbiased = Math.floor(256 / maxExclusive) * maxExclusive;
  while (true) {
    const byte = randomBytes(1)[0];
    if (byte < maxUnbiased) {
      return byte % maxExclusive;
    }
  }
}

function randomCharFrom(alphabet: string): string {
  return alphabet[randomIndex(alphabet.length)];
}

function generateTemporaryPassword(length = 10): string {
  const chars: string[] = [
    randomCharFrom(UPPER_CHARS),
    randomCharFrom(LOWER_CHARS),
    randomCharFrom(DIGIT_CHARS),
  ];
  while (chars.length < length) {
    chars.push(randomCharFrom(ALL_TEMP_CHARS));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join("");
}

/** Duyệt tài khoản hộ dân tự đăng ký & duyệt yêu cầu cấp lại mật khẩu. */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private async resolveOfficerVillageName(user?: AuthUser): Promise<string | null> {
    if (!user || user.role !== "village_officer" || !user.villageId) return null;
    const { rows } = await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [user.villageId]);
    return rows[0]?.name ?? null;
  }

  /** Tài khoản chờ duyệt (kèm hộ gợi ý) và danh sách yêu cầu cấp lại mật khẩu đang chờ duyệt. */
  async listPending(user?: AuthUser) {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return { data: [], passwordResets: [], total: 0 };
    }
    const isAdmin = isAdminPrivilegedRole(user?.role);
    const [regRes, resetRes, officerVillageName] = await Promise.all([
      this.db.query<{
        id: number;
        full_name: string;
        phone: string;
        email: string | null;
        note: string | null;
        created_at: unknown;
        village_id: number | null;
        village_name: string | null;
        suggested_household_id: number | null;
        suggested_household_code: string | null;
        suggested_household_name: string | null;
      }>(
        `SELECT u.id, u.full_name, u.username AS phone, u.email, u.register_note AS note, u.created_at,
                u.village_id, v.name AS village_name,
                h.id AS suggested_household_id, h.code AS suggested_household_code, h.name AS suggested_household_name
         FROM users u
         LEFT JOIN villages v ON v.id = u.village_id
         LEFT JOIN households h ON h.phone = u.username
           AND NOT EXISTS (SELECT 1 FROM users x WHERE x.household_id = h.id)
         WHERE u.status = 'pending' AND u.role = 'farmer'
         ORDER BY u.created_at`,
      ),
      this.db.query<{
        id: number;
        user_id: number;
        username: string;
        full_name: string;
        note: string | null;
        created_at: unknown;
        expires_at: unknown;
        account_name: string;
        role: string;
        account_status: string;
        village_id: number | null;
        village_name: string | null;
        household_code: string | null;
        household_name: string | null;
      }>(
        `SELECT r.id, r.user_id, r.username, r.full_name, r.note, r.created_at, r.expires_at,
                u.full_name AS account_name, u.role, u.status AS account_status,
                COALESCE(h.village_id, u.village_id) AS village_id,
                v.name AS village_name,
                h.code AS household_code, h.name AS household_name
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN households h ON h.id = u.household_id
         LEFT JOIN villages v ON v.id = COALESCE(h.village_id, u.village_id)
         WHERE r.status = 'pending'
           AND r.expires_at > now()
           AND ($1::boolean OR (u.role = 'farmer' AND u.status = 'active'))
         ORDER BY r.created_at DESC`,
        [isAdmin],
      ),
      this.resolveOfficerVillageName(user),
    ]);

    const scopedRegs = regRes.rows.filter((row) =>
      isStaffInParcelScope(user, { villageId: row.village_id, villageName: row.village_name }, officerVillageName),
    );
    const scopedResets = resetRes.rows.filter((row) => {
      if (row.role !== "farmer") {
        return isStaffInCuneCoopScope(user, true);
      }
      return isStaffInParcelScope(user, { villageId: row.village_id, villageName: row.village_name }, officerVillageName);
    });

    return {
      data: camelRows(scopedRegs),
      passwordResets: camelRows(scopedResets),
      total: scopedRegs.length + scopedResets.length,
    };
  }

  async listPasswordResets(user?: AuthUser) {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return { data: [], total: 0 };
    }
    const isAdmin = isAdminPrivilegedRole(user?.role);
    const [{ rows }, officerVillageName] = await Promise.all([
      this.db.query<{
        id: number;
        user_id: number;
        username: string;
        full_name: string;
        note: string | null;
        created_at: unknown;
        expires_at: unknown;
        account_name: string;
        role: string;
        account_status: string;
        village_id: number | null;
        village_name: string | null;
        household_code: string | null;
        household_name: string | null;
      }>(
        `SELECT r.id, r.user_id, r.username, r.full_name, r.note, r.created_at, r.expires_at,
                u.full_name AS account_name, u.role, u.status AS account_status,
                COALESCE(h.village_id, u.village_id) AS village_id,
                v.name AS village_name,
                h.code AS household_code, h.name AS household_name
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN households h ON h.id = u.household_id
         LEFT JOIN villages v ON v.id = COALESCE(h.village_id, u.village_id)
         WHERE r.status = 'pending'
           AND r.expires_at > now()
           AND ($1::boolean OR (u.role = 'farmer' AND u.status = 'active'))
         ORDER BY r.created_at DESC`,
        [isAdmin],
      ),
      this.resolveOfficerVillageName(user),
    ]);

    const scoped = rows.filter((row) => {
      if (row.role !== "farmer") {
        return isStaffInCuneCoopScope(user, true);
      }
      return isStaffInParcelScope(user, { villageId: row.village_id, villageName: row.village_name }, officerVillageName);
    });
    return { data: camelRows(scoped), total: scoped.length };
  }

  /** Hộ chưa có tài khoản đăng nhập, để cán bộ chọn khi duyệt. */
  async availableHouseholds(query?: string, user?: AuthUser) {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return { data: [] };
    }
    const term = query?.trim() ? `%${query.trim().replace(/[%_\\]/g, "\\$&")}%` : null;
    const { rows } = await this.db.query<{
      id: number;
      code: string;
      name: string;
      phone: string;
      village_id: number | null;
      village_name: string;
    }>(
      `SELECT h.id, h.code, h.name, h.phone, h.village_id, v.name AS village_name
       FROM households h
       JOIN villages v ON v.id = h.village_id
       WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.household_id = h.id)
         AND ($1::text IS NULL OR h.name ILIKE $1 OR h.code ILIKE $1 OR h.phone ILIKE $1)
       ORDER BY h.name
       LIMIT 50`,
      [term],
    );
    const officerVillageName = await this.resolveOfficerVillageName(user);
    const scoped = user
      ? rows.filter((r) => isStaffInParcelScope(user, { villageId: r.village_id, villageName: r.village_name }, officerVillageName))
      : rows;
    return { data: camelRows(scoped.map(({ village_id: _vid, ...rest }) => rest)) };
  }

  async approve(id: number, householdId: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }
    const household = await this.db.query<{ id: number; village_id: number | null; village_name: string | null }>(
      `SELECT h.id, h.village_id, v.name AS village_name
       FROM households h
       LEFT JOIN villages v ON v.id = h.village_id
       WHERE h.id = $1`,
      [householdId],
    );
    const hh = household.rows[0];
    if (!hh) throw notFound("Không tìm thấy hộ đã chọn.");
    const officerVillageName = await this.resolveOfficerVillageName(user);
    if (!isStaffInParcelScope(user, { villageId: hh.village_id, villageName: hh.village_name }, officerVillageName)) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }
    try {
      // Đồng bộ thôn của tài khoản theo hộ được gắn (không giữ thôn tự khai lúc đăng ký) để phạm vi dữ liệu luôn khớp hồ sơ hộ.
      const { rows } = await this.db.query<{ full_name: string; username: string }>(
        `UPDATE users u
         SET status = 'active', household_id = h.id, village_id = h.village_id
         FROM households h
         WHERE u.id = $1 AND u.status = 'pending' AND u.role = 'farmer' AND h.id = $2
         RETURNING u.full_name, u.username`,
        [id, householdId],
      );
      if (!rows[0]) throw notFound("Không có đăng ký nào đang chờ duyệt với mã này.");
      await this.audit.write({ ip, user }, { action: "Duyệt đăng ký tài khoản", object: rows[0].username, detail: `Gắn vào hộ #${householdId}` });
      return { id, status: "active", householdId };
    } catch (error) {
      const { code, constraint } = error as { code?: string; constraint?: string };
      if (code === "23505") {
        if (constraint === "users_household_unique") {
          throw new AppException(409, "Hộ này đã có tài khoản đăng nhập.", "CONFLICT");
        }
        if (constraint === "users_email_lower_idx") {
          throw new AppException(409, "Email liên kết của đăng ký này đã thuộc về tài khoản khác.", "CONFLICT");
        }
        if (constraint === "users_username_lower_unique" || constraint === "users_username_key") {
          throw new AppException(409, "Số điện thoại đăng ký đã được dùng cho tài khoản khác.", "CONFLICT");
        }
        throw new AppException(409, "Dữ liệu tài khoản trùng với một tài khoản khác.", "CONFLICT");
      }
      if (code === "23503") throw notFound("Không tìm thấy hộ đã chọn.");
      throw error;
    }
  }

  async reject(id: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }
    const targetRes = await this.db.query<{ id: number; village_id: number | null; village_name: string | null }>(
      `SELECT u.id, u.village_id, v.name AS village_name
       FROM users u
       LEFT JOIN villages v ON v.id = u.village_id
       WHERE u.id = $1 AND u.status = 'pending' AND u.role = 'farmer'`,
      [id],
    );
    const target = targetRes.rows[0];
    if (!target) throw notFound("Không có đăng ký nào đang chờ duyệt với mã này.");
    const officerVillageName = await this.resolveOfficerVillageName(user);
    if (!isStaffInParcelScope(user, { villageId: target.village_id, villageName: target.village_name }, officerVillageName)) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }
    const { rows } = await this.db.query<{ username: string }>(
      `DELETE FROM users WHERE id = $1 AND status = 'pending' AND role = 'farmer' RETURNING username`,
      [id],
    );
    if (!rows[0]) throw notFound("Không có đăng ký nào đang chờ duyệt với mã này.");
    await this.audit.write({ ip, user }, { action: "Từ chối đăng ký tài khoản", object: rows[0].username });
    return { ok: true };
  }

  async approvePasswordReset(id: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }
    const officerVillageName = await this.resolveOfficerVillageName(user);
    const temporaryPassword = generateTemporaryPassword(10);
    const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 12);

    const client = await this.db.pool.connect();
    let targetUserId = 0;
    let targetUsername = "";
    let requesterFullName = "";

    try {
      await client.query("BEGIN");

      const reqRes = await client.query<{
        id: number;
        user_id: number;
        username: string;
        full_name: string;
        status: string;
        expires_at: Date;
      }>(
        `SELECT id, user_id, username, full_name, status, expires_at
         FROM password_reset_requests
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      const req = reqRes.rows[0];
      if (!req || req.status !== "pending" || new Date(req.expires_at).getTime() <= Date.now()) {
        throw notFound("Không có yêu cầu cấp lại mật khẩu nào đang chờ duyệt hoặc yêu cầu đã hết hạn 24h.");
      }

      const userRes = await client.query<{
        username: string;
        role: string;
        status: string;
        village_id: number | null;
        household_id: number | null;
        coop_code: string | null;
      }>(
        `SELECT username, role, status, village_id, household_id, coop_code
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [req.user_id],
      );
      const targetUser = userRes.rows[0];
      if (!targetUser) {
        throw notFound("Tài khoản gắn với yêu cầu cấp lại mật khẩu không còn tồn tại.");
      }

      if (isManagementRole(targetUser.role)) {
        throw forbidden(
          "Tài khoản Ban điều hành và Quản trị hệ thống không được phép đặt lại mật khẩu qua yêu cầu công khai.",
        );
      }

      if (!isAdminPrivilegedRole(user.role)) {
        if (targetUser.role !== "farmer") {
          throw forbidden("Chỉ quản trị viên mới được phép duyệt đặt lại mật khẩu cho tài khoản cán bộ hoặc quản trị viên.");
        }
        if (targetUser.status !== "active") {
          throw forbidden("Tài khoản đã bị khóa hoặc chưa kích hoạt; chỉ quản trị viên mới được phép mở khóa.");
        }
      }

      if (targetUser.role === "farmer") {
        const scopeMeta = await client.query<{ village_id: number | null; village_name: string | null }>(
          `SELECT COALESCE(h.village_id, $2::bigint) AS village_id, v.name AS village_name
           FROM (SELECT 1) one
           LEFT JOIN households h ON h.id = $1
           LEFT JOIN villages v ON v.id = COALESCE(h.village_id, $2::bigint)`,
          [targetUser.household_id, targetUser.village_id],
        );
        const sm = scopeMeta.rows[0];
        if (!isStaffInParcelScope(user, { villageId: sm?.village_id ?? null, villageName: sm?.village_name ?? null }, officerVillageName)) {
          throw forbidden(OUT_OF_SCOPE_MSG);
        }
      } else {
        if (!isStaffInCuneCoopScope(user, true)) {
          throw forbidden(OUT_OF_SCOPE_MSG);
        }
        if (targetUser.role !== "enterprise" && targetUser.role !== "inspector") {
          const targetCoop = (targetUser.coop_code || "HTX-CUNE").trim().toUpperCase();
          const actorCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
          if (targetCoop !== actorCoop) {
            throw forbidden(OUT_OF_SCOPE_MSG);
          }
        }
      }

      const canUnlockLocked = isAdminPrivilegedRole(user.role);
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             email = NULL,
             token_version = token_version + 1,
             failed_login_count = 0,
             two_factor_failed_count = 0,
             locked_until = NULL,
             cccd_reset_failed_count = 0,
             cccd_reset_locked_until = NULL,
             status = CASE WHEN $3::boolean AND status = 'locked' THEN 'active' ELSE status END
         WHERE id = $2`,
        [temporaryPasswordHash, req.user_id, canUnlockLocked],
      );
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [req.user_id],
      );
      await client.query(
        `UPDATE password_reset_requests
         SET status = 'approved', new_password_hash = NULL, reviewed_by = $2, reviewed_at = now()
         WHERE id = $1`,
        [id, user.id],
      );

      await client.query("COMMIT");

      targetUserId = Number(req.user_id);
      targetUsername = targetUser.username || req.username;
      requesterFullName = req.full_name;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Duyệt cấp lại mật khẩu",
        object: targetUsername,
        detail: `Yêu cầu #${id} (${requesterFullName}) - Đã cấp mật khẩu tạm thời một lần và gỡ email liên kết`,
      },
    );
    return {
      id,
      userId: targetUserId,
      status: "approved" as const,
      username: targetUsername,
      temporaryPassword,
    };
  }

  async rejectPasswordReset(id: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }
    const targetRes = await this.db.query<{
      role: string;
      status: string;
      coop_code: string | null;
      village_id: number | null;
      village_name: string | null;
    }>(
      `SELECT u.role, u.status, u.coop_code, COALESCE(h.village_id, u.village_id) AS village_id, v.name AS village_name
       FROM password_reset_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN households h ON h.id = u.household_id
       LEFT JOIN villages v ON v.id = COALESCE(h.village_id, u.village_id)
       WHERE r.id = $1 AND r.status = 'pending'`,
      [id],
    );
    const target = targetRes.rows[0];
    if (!target) {
      throw notFound("Không có yêu cầu cấp lại mật khẩu nào đang chờ duyệt với mã này.");
    }
    if (!isAdminPrivilegedRole(user.role) && (target.role !== "farmer" || target.status !== "active")) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }
    const officerVillageName = await this.resolveOfficerVillageName(user);
    if (target.role === "farmer") {
      if (!isStaffInParcelScope(user, { villageId: target.village_id, villageName: target.village_name }, officerVillageName)) {
        throw forbidden(OUT_OF_SCOPE_MSG);
      }
    } else if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden(OUT_OF_SCOPE_MSG);
    }

    const isAdmin = isAdminPrivilegedRole(user.role);
    const { rows } = await this.db.query<{ username: string; full_name: string }>(
      `UPDATE password_reset_requests r
       SET status = 'rejected', reviewed_by = $2, reviewed_at = now()
       FROM users u
       WHERE r.id = $1
         AND r.user_id = u.id
         AND r.status = 'pending'
         AND ($3::boolean OR (u.role = 'farmer' AND u.status = 'active'))
       RETURNING r.username, r.full_name`,
      [id, user.id, isAdmin],
    );
    if (!rows[0]) throw notFound("Không có yêu cầu cấp lại mật khẩu nào đang chờ duyệt với mã này.");
    await this.audit.write(
      { ip, user },
      {
        action: "Từ chối cấp lại mật khẩu",
        object: rows[0].username,
        detail: `Yêu cầu #${id} (${rows[0].full_name})`,
      },
    );
    return { ok: true };
  }
}
