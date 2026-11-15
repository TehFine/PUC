import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../audit/audit.service";
import { AppException, forbidden, notFound } from "../common/errors/app.exception";
import { DatabaseService } from "../database/database.service";

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

  /** Tài khoản chờ duyệt (kèm hộ gợi ý) và danh sách yêu cầu cấp lại mật khẩu đang chờ duyệt. */
  async listPending(user?: AuthUser) {
    const isAdmin = user?.role === "admin";
    const [regRes, resetRes] = await Promise.all([
      this.db.query(
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
      this.db.query(
        `SELECT r.id, r.user_id, r.username, r.full_name, r.note, r.created_at, r.expires_at,
                u.full_name AS account_name, u.role, u.status AS account_status,
                v.name AS village_name,
                h.code AS household_code, h.name AS household_name
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN households h ON h.id = u.household_id
         LEFT JOIN villages v ON v.id = COALESCE(u.village_id, h.village_id)
         WHERE r.status = 'pending'
           AND r.expires_at > now()
           AND ($1::boolean OR (u.role = 'farmer' AND u.status = 'active'))
         ORDER BY r.created_at DESC`,
        [isAdmin],
      ),
    ]);
    return {
      data: camelRows(regRes.rows),
      passwordResets: camelRows(resetRes.rows),
      total: regRes.rows.length + resetRes.rows.length,
    };
  }

  async listPasswordResets(user?: AuthUser) {
    const isAdmin = user?.role === "admin";
    const { rows } = await this.db.query(
      `SELECT r.id, r.user_id, r.username, r.full_name, r.note, r.created_at, r.expires_at,
              u.full_name AS account_name, u.role, u.status AS account_status,
              v.name AS village_name,
              h.code AS household_code, h.name AS household_name
       FROM password_reset_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN households h ON h.id = u.household_id
       LEFT JOIN villages v ON v.id = COALESCE(u.village_id, h.village_id)
       WHERE r.status = 'pending'
         AND r.expires_at > now()
         AND ($1::boolean OR (u.role = 'farmer' AND u.status = 'active'))
       ORDER BY r.created_at DESC`,
      [isAdmin],
    );
    return { data: camelRows(rows), total: rows.length };
  }

  /** Hộ chưa có tài khoản đăng nhập, để cán bộ chọn khi duyệt. */
  async availableHouseholds(query?: string) {
    const term = query?.trim() ? `%${query.trim().replace(/[%_\\]/g, "\\$&")}%` : null;
    const { rows } = await this.db.query(
      `SELECT h.id, h.code, h.name, h.phone, v.name AS village_name
       FROM households h
       JOIN villages v ON v.id = h.village_id
       WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.household_id = h.id)
         AND ($1::text IS NULL OR h.name ILIKE $1 OR h.code ILIKE $1 OR h.phone ILIKE $1)
       ORDER BY h.name
       LIMIT 50`,
      [term],
    );
    return { data: camelRows(rows) };
  }

  async approve(id: number, householdId: number, user: AuthUser, ip?: string) {
    try {
      const { rows } = await this.db.query<{ full_name: string; username: string }>(
        `UPDATE users SET status = 'active', household_id = $2
         WHERE id = $1 AND status = 'pending' AND role = 'farmer'
         RETURNING full_name, username`,
        [id, householdId],
      );
      if (!rows[0]) throw notFound("Không có đăng ký nào đang chờ duyệt với mã này.");
      await this.audit.write({ ip, user }, { action: "Duyệt đăng ký tài khoản", object: rows[0].username, detail: `Gắn vào hộ #${householdId}` });
      return { id, status: "active", householdId };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") throw new AppException(409, "Hộ này đã có tài khoản đăng nhập.", "CONFLICT");
      if (code === "23503") throw notFound("Không tìm thấy hộ đã chọn.");
      throw error;
    }
  }

  async reject(id: number, user: AuthUser, ip?: string) {
    const { rows } = await this.db.query<{ username: string }>(
      `DELETE FROM users WHERE id = $1 AND status = 'pending' AND role = 'farmer' RETURNING username`,
      [id],
    );
    if (!rows[0]) throw notFound("Không có đăng ký nào đang chờ duyệt với mã này.");
    await this.audit.write({ ip, user }, { action: "Từ chối đăng ký tài khoản", object: rows[0].username });
    return { ok: true };
  }

  async approvePasswordReset(id: number, user: AuthUser, ip?: string) {
    const temporaryPassword = generateTemporaryPassword(10);
    const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 10);

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
      }>(
        `SELECT username, role, status
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [req.user_id],
      );
      const targetUser = userRes.rows[0];
      if (!targetUser) {
        throw notFound("Tài khoản gắn với yêu cầu cấp lại mật khẩu không còn tồn tại.");
      }

      if (user.role !== "admin") {
        if (targetUser.role !== "farmer") {
          throw forbidden("Chỉ quản trị viên mới được phép duyệt đặt lại mật khẩu cho tài khoản cán bộ hoặc quản trị viên.");
        }
        if (targetUser.status !== "active") {
          throw forbidden("Tài khoản đã bị khóa hoặc chưa kích hoạt; chỉ quản trị viên mới được phép mở khóa.");
        }
      }

      const canUnlockLocked = user.role === "admin";
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             email = NULL,
             token_version = token_version + 1,
             failed_login_count = 0,
             locked_until = NULL,
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
    const isAdmin = user.role === "admin";
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
