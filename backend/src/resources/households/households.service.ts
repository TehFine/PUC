import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthUser } from "../../auth/auth-user";
import type { Role } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { villageScope } from "../../common/crud/village-scope";
import { AppException, badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { CreateHouseholdDto, IssueHouseholdAccountDto } from "./households.dto";

/** Chỉ quản trị viên và cán bộ HTX (người duyệt hồ sơ) được xem/tìm theo số CCCD đầy đủ. */
const CCCD_FULL_ACCESS: Role[] = ["admin", "htx_officer"];
export const canSeeCccd = (user: AuthUser) => CCCD_FULL_ACCESS.includes(user.role);

/** Che số CCCD, chỉ giữ 4 số cuối: 260123456789 → ********6789. */
export const maskCccd = (value: unknown) => {
  const text = typeof value === "string" ? value : "";
  return text.length > 4 ? `${"*".repeat(text.length - 4)}${text.slice(-4)}` : "****";
};

const redact = <T extends Record<string, unknown> | null>(row: T, user: AuthUser): T =>
  !row || canSeeCccd(user) || !("cccd" in row) ? row : { ...row, cccd: maskCccd(row.cccd) };

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

const IMPORT_DB_ERRORS: Record<string, string> = {
  "23505": "Trùng số CCCD hoặc mã hộ với hộ khác.",
  "23503": "Thôn không tồn tại.",
  "23514": "Dữ liệu vi phạm ràng buộc (kiểm tra CCCD, diện tích, trạng thái).",
};

@Injectable()
export class HouseholdsService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "households",
      label: "Hộ nông dân",
      table: "households",
      fields: `t.id, t.code, t.name, t.cccd, t.phone, t.village_id, v.name AS village_name,
      t.plot_count, t.area_ha, t.status, t.created_at, t.updated_at,
      u.id AS account_id, u.username AS account_username, u.email AS account_email, u.status AS account_status`,
      from: `households t JOIN villages v ON v.id = t.village_id LEFT JOIN users u ON u.household_id = t.id`,
      orderBy: "t.id",
      search: ["t.name", "t.code", "t.cccd", "t.phone"],
      // Vai trò không được xem CCCD cũng không được dò CCCD qua ô tìm kiếm.
      searchFor: (user) => (canSeeCccd(user) ? ["t.name", "t.code", "t.cccd", "t.phone"] : ["t.name", "t.code", "t.phone"]),
      filters: { villageId: "t.village_id", status: "t.status" },
      scope: villageScope("t.village_id"),
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (input.villageId !== undefined && input.villageId !== null) {
      if (context.user.role === "village_officer" && input.villageId !== context.user.villageId) {
        throw forbidden("Cán bộ thôn chỉ được thao tác với hộ thuộc thôn mình phụ trách.");
      }
      const village = await this.db.query("SELECT 1 FROM villages WHERE id = $1", [input.villageId]);
      if (village.rowCount === 0) throw new AppException(409, "Thôn được chọn không tồn tại.", "DB_23503");
    }
    return input;
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const result = await super.list(user, query);
    return { ...result, data: result.data.map((row) => redact(row, user)) };
  }

  override async findOne(id: number, user: AuthUser) {
    return redact(await super.findOne(id, user), user);
  }

  override async create(dto: object, user: AuthUser, ip?: string) {
    return redact(await super.create(dto, user, ip), user);
  }

  override async update(id: number, dto: object, user: AuthUser, ip?: string) {
    return redact(await super.update(id, dto, user, ip), user);
  }

  /**
   * Nhập nhiều hộ một lần: mỗi dòng kiểm tra như khi tạo mới; trùng `code` thì cập nhật hộ đó.
   * Dòng lỗi không làm hỏng các dòng khác.
   */
  async import(rows: Record<string, unknown>[], user: AuthUser, ip?: string): Promise<ImportResult> {
    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    for (const [index, raw] of rows.entries()) {
      const rowNo = index + 1;
      const dto = plainToInstance(CreateHouseholdDto, raw);
      const problems = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      if (problems.length > 0) {
        const message = problems
          .map((problem) => `${problem.property}: ${Object.values(problem.constraints ?? {}).join("; ")}`)
          .join(" | ");
        result.errors.push({ row: rowNo, message });
        continue;
      }

      try {
        const { rows: saved } = await this.db.query<{ inserted: boolean }>(
          `INSERT INTO households (code, name, cccd, phone, village_id, plot_count, area_ha, status)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::int, 0), COALESCE($7::numeric, 0), COALESCE($8::text, 'pending'))
           ON CONFLICT (code) DO UPDATE SET
             name = EXCLUDED.name,
             cccd = EXCLUDED.cccd,
             phone = EXCLUDED.phone,
             village_id = EXCLUDED.village_id,
             plot_count = COALESCE($6::int, households.plot_count),
             area_ha = COALESCE($7::numeric, households.area_ha),
             status = COALESCE($8::text, households.status)
           RETURNING (xmax = 0) AS inserted`,
          [
            dto.code,
            dto.name,
            dto.cccd,
            dto.phone,
            dto.villageId,
            dto.plotCount ?? null,
            dto.areaHa ?? null,
            dto.status ?? null,
          ],
        );
        if (saved[0].inserted) result.created += 1;
        else result.updated += 1;
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        result.errors.push({ row: rowNo, message: IMPORT_DB_ERRORS[code] ?? "Không lưu được dòng này." });
      }
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Nhập danh sách hộ",
        object: this.config.label,
        detail: `Tạo mới: ${result.created}, cập nhật: ${result.updated}, lỗi: ${result.errors.length}`,
      },
    );
    return result;
  }

  /**
   * Ban hành hoặc cấp lại tài khoản đăng nhập cho hộ nông dân sau khi đã thiết lập hồ sơ hộ.
   */
  async issueAccount(householdId: number, dto: IssueHouseholdAccountDto, user: AuthUser, ip?: string) {
    const { rows: hhRows } = await this.db.query<{
      id: number;
      code: string;
      name: string;
      phone: string;
      village_id: number;
    }>("SELECT id, code, name, phone, village_id FROM households WHERE id = $1", [householdId]);
    const hh = hhRows[0];
    if (!hh) throw notFound("Không tìm thấy hồ sơ hộ nông dân này.");

    const cleanUsername = (dto.username?.trim() || hh.phone.trim()).replace(/\s+/g, "");
    if (!/^[0-9A-Za-z._-]{3,64}$/.test(cleanUsername)) {
      throw badRequest("Tên đăng nhập gồm 3–64 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
    }
    // Không tự sinh địa chỉ @gmail.com giả định chưa xác minh chủ sở hữu (chống Google OAuth Pre-Takeover).
    const cleanEmail = dto.email ? dto.email.trim().toLowerCase() : null;
    if (cleanEmail && /(?:^nongho\.[0-9]+@gmail\.com$|\.htxcune@gmail\.com$)/i.test(cleanEmail)) {
      throw badRequest("Không được gắn địa chỉ email giả định tự sinh. Vui lòng nhập email thực tế hoặc để trống.");
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { rows: existingByHh } = await this.db.query<{ id: number; username: string; role: string }>(
      "SELECT id, username, role FROM users WHERE household_id = $1 LIMIT 1",
      [householdId],
    );
    if (existingByHh[0] && existingByHh[0].role !== "farmer") {
      throw new AppException(409, "Hồ sơ hộ này đang liên kết với tài khoản không phải nông hộ.", "CONFLICT");
    }

    const { rows: existingByUsername } = await this.db.query<{
      id: number;
      role: string;
      household_id: number | null;
    }>("SELECT id, role, household_id FROM users WHERE username = $1 LIMIT 1", [cleanUsername]);
    if (
      existingByUsername[0] &&
      existingByUsername[0].id !== existingByHh[0]?.id &&
      (existingByUsername[0].role !== "farmer" ||
        (existingByUsername[0].household_id !== null && existingByUsername[0].household_id !== householdId))
    ) {
      throw new AppException(409, `Tên đăng nhập "${cleanUsername}" đang thuộc về một tài khoản khác.`, "CONFLICT");
    }

    if (cleanEmail) {
      await this.db.query("UPDATE users SET email = NULL WHERE status = 'pending' AND LOWER(email) = $1", [cleanEmail]);
    }

    try {
      let accountId: number;
      let actionLabel: string;

      if (existingByHh[0]) {
        accountId = existingByHh[0].id;
        actionLabel = "Cấp lại tài khoản hộ nông dân";
        const updated = await this.db.query(
          `UPDATE users
           SET full_name = $2,
               username = $3,
               email = $4,
               password_hash = $5,
               village_id = $6,
               role = 'farmer',
               status = 'active',
               failed_login_count = 0,
               locked_until = NULL,
               token_version = token_version + 1
           WHERE id = $1 AND role = 'farmer'`,
          [accountId, hh.name, cleanUsername, cleanEmail, passwordHash, hh.village_id],
        );
        if (updated.rowCount === 0) {
          throw new AppException(409, "Không thể ghi đè tài khoản không thuộc vai trò nông hộ.", "CONFLICT");
        }
        await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
          accountId,
        ]);
      } else {
        actionLabel = "Ban hành tài khoản hộ nông dân";
        const { rows: ins } = await this.db.query<{ id: number }>(
          `INSERT INTO users (full_name, username, email, password_hash, role, status, village_id, household_id)
           VALUES ($1, $2, $3, $4, 'farmer', 'active', $5, $6)
           ON CONFLICT (username) DO UPDATE SET
             full_name = EXCLUDED.full_name,
             email = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             role = 'farmer',
             status = 'active',
             village_id = EXCLUDED.village_id,
             household_id = EXCLUDED.household_id,
             failed_login_count = 0,
             locked_until = NULL,
             token_version = users.token_version + 1
           WHERE users.role = 'farmer'
             AND (users.household_id IS NULL OR users.household_id = EXCLUDED.household_id)
           RETURNING id`,
          [hh.name, cleanUsername, cleanEmail, passwordHash, hh.village_id, householdId],
        );
        if (!ins[0]) {
          throw new AppException(409, `Tên đăng nhập "${cleanUsername}" đang thuộc về một tài khoản khác.`, "CONFLICT");
        }
        accountId = ins[0].id;
        await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
          accountId,
        ]);
      }

      await this.audit.write(
        { ip, user },
        {
          action: actionLabel,
          object: cleanUsername,
          detail: `Hộ ${hh.code} – ${hh.name}`,
        },
      );

      return {
        accountId,
        householdId: hh.id,
        householdCode: hh.code,
        fullName: hh.name,
        username: cleanUsername,
        email: cleanEmail,
        status: "active",
      };
    } catch (error) {
      if (error instanceof AppException) throw error;
      if ((error as { code?: string }).code === "23505") {
        throw new AppException(409, "Tên đăng nhập hoặc email Google này đã được gắn cho tài khoản khác.", "CONFLICT");
      }
      throw error;
    }
  }
}
