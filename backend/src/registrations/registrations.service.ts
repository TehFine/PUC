import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { AuditService } from "../audit/audit.service";
import { AppException, notFound } from "../common/errors/app.exception";
import { DatabaseService } from "../database/database.service";

const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const camelRows = (rows: Record<string, unknown>[]) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])));

/** Duyệt tài khoản hộ dân tự đăng ký: gắn tài khoản chờ duyệt vào một hộ rồi kích hoạt, hoặc từ chối. */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Tài khoản chờ duyệt, kèm hộ gợi ý (hộ chưa có tài khoản và trùng số điện thoại). */
  async listPending() {
    const { rows } = await this.db.query(
      `SELECT u.id, u.full_name, u.username AS phone, u.register_note AS note, u.created_at,
              u.village_id, v.name AS village_name,
              h.id AS suggested_household_id, h.code AS suggested_household_code, h.name AS suggested_household_name
       FROM users u
       LEFT JOIN villages v ON v.id = u.village_id
       LEFT JOIN households h ON h.phone = u.username
         AND NOT EXISTS (SELECT 1 FROM users x WHERE x.household_id = h.id)
       WHERE u.status = 'pending' AND u.role = 'farmer'
       ORDER BY u.created_at`,
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
}
