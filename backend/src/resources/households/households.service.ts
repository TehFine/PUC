import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthUser } from "../../auth/auth-user";
import { can, type Role } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import {
  assertHouseholdInScope,
  isStaffInCuneCoopScope,
  isStaffInParcelScope,
  villageScope,
} from "../../common/crud/village-scope";
import { AppException, badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { publicAttachmentUrlSql } from "../../common/sql/rows";
import { hasPlotsTable, syncHouseholdAndVillageStats } from "../../common/sql/stats-sync";
import { DatabaseService } from "../../database/database.service";
import { CreateHouseholdDto, IssueHouseholdAccountDto } from "./households.dto";

/** Chỉ quản trị viên và cán bộ HTX (người duyệt hồ sơ) được xem/tìm theo số CCCD đầy đủ. */
const CCCD_FULL_ACCESS: Role[] = ["admin", "htx_officer"];
export const canSeeCccd = (user: AuthUser) => CCCD_FULL_ACCESS.includes(user.role);
const canSeeAccountCredentials = (user: AuthUser) =>
  can(user.role, "registrations", "read") || can(user.role, "accounts", "read");

/** Che số CCCD, chỉ giữ 2 số cuối: 260123456789 -> **********89. */
export const maskCccd = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 2 ? `${"*".repeat(Math.max(0, text.length - 2))}${text.slice(-2)}` : "**";
};

const redact = <T extends Record<string, unknown> | null>(row: T, user: AuthUser, forceMask = false): T => {
  if (!row) return row;
  const out: Record<string, unknown> = { ...row };
  if ((forceMask || !canSeeCccd(user)) && "cccd" in out) {
    out.cccd = maskCccd(out.cccd);
  }
  if (!canSeeAccountCredentials(user)) {
    if ("accountId" in out) out.accountId = null;
    if ("accountUsername" in out) out.accountUsername = null;
    if ("accountEmail" in out) out.accountEmail = null;
  }
  return out as T;
};

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
      t.plot_count, t.area_ha, t.status, t.public_trace_consent, ${publicAttachmentUrlSql("t.avatar_id")} AS avatar_url, t.created_at, t.updated_at,
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

  private async resolveOfficerVillageName(user: AuthUser): Promise<string | null> {
    if (user.role !== "village_officer" || !user.villageId) return null;
    const { rows } = await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [user.villageId]);
    return rows[0]?.name ?? null;
  }

  private async syncHouseholdPlotsVillage(householdId: number, villageId: number, hasPlots?: boolean): Promise<void> {
    const vRes = await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [villageId]);
    const villageName = vRes.rows[0]?.name;
    if (!villageName) return;
    const plotsAvailable = hasPlots ?? (await hasPlotsTable(this.db));
    if (plotsAvailable) {
      await this.db.query("UPDATE plots SET village = $2, updated_at = now() WHERE household_id = $1", [
        householdId,
        villageName,
      ]);
    }
    await this.db
      .query("UPDATE plot_signboard_tokens SET village_name = $2 WHERE household_id = $1", [householdId, villageName])
      .catch(() => undefined);
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền thao tác hồ sơ hộ nông dân ngoài phạm vi quản lý.");
    }
    if (context.method === "PATCH" && context.id !== undefined) {
      await assertHouseholdInScope(this.db, { householdId: context.id }, context.user);
    }
    if (input.villageId !== undefined && input.villageId !== null) {
      if (context.user.role === "village_officer" && context.user.villageId && Number(input.villageId) !== Number(context.user.villageId)) {
        throw forbidden("Cán bộ thôn chỉ được thao tác với hộ thuộc thôn mình phụ trách.");
      }
      const village = await this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages WHERE id = $1", [
        input.villageId,
      ]);
      if (village.rowCount === 0 || !village.rows[0]) {
        throw new AppException(409, "Thôn được chọn không tồn tại.", "DB_23503");
      }
      const officerVillageName = await this.resolveOfficerVillageName(context.user);
      if (
        !isStaffInParcelScope(
          context.user,
          { villageId: Number(input.villageId), villageName: village.rows[0].name },
          officerVillageName,
        )
      ) {
        throw forbidden("Bạn không có quyền thao tác với hộ thuộc địa bàn này.");
      }
    }
    return input;
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const result = await super.list(user, query);
    const forceMask = query?.full === "0" || query?.full === false;
    return { ...result, data: result.data.map((row) => redact(row, user, forceMask)) };
  }

  override async findOne(id: number, user: AuthUser) {
    return redact(await super.findOne(id, user), user);
  }

  override async create(dto: object, user: AuthUser, ip?: string) {
    const created = await super.create(dto, user, ip);
    await syncHouseholdAndVillageStats(this.db);
    return redact(created, user);
  }

  override async update(id: number, dto: object, user: AuthUser, ip?: string) {
    const prev = await this.db.query<{ village_id: number | string; phone: string | null; name: string | null }>(
      "SELECT village_id, phone, name FROM households WHERE id = $1 LIMIT 1",
      [id],
    );
    const oldRow = prev.rows[0];
    const oldVillageId = oldRow?.village_id ? Number(oldRow.village_id) : undefined;
    const oldPhone = oldRow?.phone?.trim() ?? "";
    const updated = await super.update(id, dto, user, ip);
    const nextVillageId =
      (dto as { villageId?: number }).villageId !== undefined
        ? Number((dto as { villageId?: number }).villageId)
        : updated && "villageId" in updated && updated.villageId !== null && updated.villageId !== undefined
          ? Number(updated.villageId)
          : oldVillageId;
    if (nextVillageId !== undefined && nextVillageId !== oldVillageId) {
      await this.db.query("UPDATE users SET village_id = $2 WHERE household_id = $1", [id, nextVillageId]);
      await this.syncHouseholdPlotsVillage(id, nextVillageId);
    }

    const nextName =
      typeof (dto as { name?: string }).name === "string" ? (dto as { name: string }).name.trim() : undefined;
    if (nextName) {
      await this.db.query("UPDATE users SET full_name = $2 WHERE household_id = $1 AND role = 'farmer'", [
        id,
        nextName,
      ]);
    }

    const rawNextPhone =
      typeof (dto as { phone?: string }).phone === "string"
        ? (dto as { phone: string }).phone.trim().replace(/\s+/g, "")
        : undefined;
    if (rawNextPhone && /^[0-9A-Za-z._-]{3,64}$/.test(rawNextPhone) && rawNextPhone.toLowerCase() !== oldPhone.toLowerCase()) {
      await this.db.query(
        `UPDATE users u
         SET username = $2
         WHERE u.household_id = $1
           AND u.role = 'farmer'
           AND lower(u.username) = lower($3)
           AND NOT EXISTS (
             SELECT 1 FROM users other
             WHERE lower(other.username) = lower($2) AND other.id <> u.id
           )`,
        [id, rawNextPhone, oldPhone],
      );
    }

    await syncHouseholdAndVillageStats(this.db, {
      forceZeroVillageIds: oldVillageId ? [oldVillageId] : [],
    });
    return redact(updated, user);
  }

  protected override async guardDelete(id: number, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền xóa hộ nông dân ngoài phạm vi quản lý.");
    }
    const existing = await this.db.query("SELECT id FROM households WHERE id = $1", [id]);
    if ((existing.rowCount ?? 0) === 0) {
      return;
    }
    await assertHouseholdInScope(this.db, { householdId: id }, user);
    const hasPlots = await hasPlotsTable(this.db);
    const plotsCheckSql = hasPlots ? "OR EXISTS (SELECT 1 FROM plots WHERE household_id = $1)" : "";
    const historyCheck = await this.db.query<{ has_history: boolean }>(
      `SELECT (
         EXISTS (SELECT 1 FROM lab_tests WHERE household_id = $1)
         OR EXISTS (SELECT 1 FROM spray_records WHERE household_id = $1)
         OR EXISTS (SELECT 1 FROM journal_entries WHERE household_id = $1)
         OR EXISTS (SELECT 1 FROM farmer_stamps WHERE household_id = $1)
         OR EXISTS (SELECT 1 FROM farmer_stamp_allocations WHERE household_id = $1)
         OR EXISTS (SELECT 1 FROM harvest_contributions WHERE household_id = $1)
         OR EXISTS (SELECT 1 FROM violations WHERE household_id = $1)
         ${plotsCheckSql}
       ) AS has_history`,
      [id],
    );
    if (historyCheck.rows[0]?.has_history) {
      throw badRequest("Hộ dân đã có lịch sử canh tác, kiểm nghiệm hoặc tem truy xuất nên không thể xóa.");
    }
  }

  override async remove(id: number, user: AuthUser, ip?: string) {
    const prev = await this.db.query<{ village_id: number | string }>(
      "SELECT village_id FROM households WHERE id = $1 LIMIT 1",
      [id],
    );
    const oldVillageId = prev.rows[0]?.village_id ? Number(prev.rows[0].village_id) : undefined;
    const hasPlots = await hasPlotsTable(this.db);
    const linkedUsersRes = await this.db.query<{ id: number | string }>(
      "SELECT id FROM users WHERE household_id = $1",
      [id],
    );
    const linkedUserIds = linkedUsersRes.rows.map((r) => Number(r.id));

    const result = await super.remove(id, user, ip);

    if (linkedUserIds.length > 0) {
      await this.db.query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ANY($1::bigint[]) AND revoked_at IS NULL",
        [linkedUserIds],
      );
      await this.db.query(
        "UPDATE users SET status = 'locked', token_version = token_version + 1, household_id = NULL WHERE id = ANY($1::bigint[])",
        [linkedUserIds],
      );
    }
    await syncHouseholdAndVillageStats(this.db, {
      forceZeroVillageIds: oldVillageId ? [oldVillageId] : [],
      hasPlots,
    });
    return result;
  }

  /**
   * Nhập nhiều hộ một lần: mỗi dòng kiểm tra như khi tạo mới; trùng `code` thì cập nhật hộ đó.
   * Dòng lỗi không làm hỏng các dòng khác.
   */
  async import(rows: Record<string, unknown>[], user: AuthUser, ip?: string): Promise<ImportResult> {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền nhập danh sách hộ ngoài phạm vi quản lý.");
    }
    const result: ImportResult = { created: 0, updated: 0, errors: [] };
    const [villagesRes, hasPlots, officerVillageName] = await Promise.all([
      this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages"),
      hasPlotsTable(this.db),
      this.resolveOfficerVillageName(user),
    ]);
    const villageNameById = new Map<number, string>(villagesRes.rows.map((v) => [Number(v.id), v.name]));

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

      if (user.role === "village_officer" && user.villageId && Number(dto.villageId) !== Number(user.villageId)) {
        result.errors.push({ row: rowNo, message: "Cán bộ thôn chỉ được nhập hộ thuộc thôn mình phụ trách." });
        continue;
      }

      const targetVillageName = villageNameById.get(Number(dto.villageId)) ?? null;
      if (
        targetVillageName !== null &&
        !isStaffInParcelScope(user, { villageId: Number(dto.villageId), villageName: targetVillageName }, officerVillageName)
      ) {
        result.errors.push({ row: rowNo, message: "Thôn của hộ không thuộc phạm vi quản lý của bạn." });
        continue;
      }

      try {
        const existingRes = await this.db.query<{ id: number; village_id: number; village_name: string | null }>(
          `SELECT h.id, h.village_id, v.name AS village_name
           FROM households h
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE h.code = $1
           LIMIT 1`,
          [dto.code],
        );
        const existingRow = existingRes.rows[0];
        if (
          existingRow &&
          !isStaffInParcelScope(
            user,
            { villageId: existingRow.village_id, villageName: existingRow.village_name },
            officerVillageName,
          )
        ) {
          result.errors.push({ row: rowNo, message: "Mã hộ đang thuộc địa bàn khác, không được phép ghi đè." });
          continue;
        }

        const scopedVillageId = user.role === "village_officer" && user.villageId ? Number(user.villageId) : null;
        const { rows: saved } = await this.db.query<{ id: number; village_id: number; inserted: boolean }>(
          `INSERT INTO households (code, name, cccd, phone, village_id, plot_count, area_ha, status)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::int, 0), COALESCE($7::numeric, 0), COALESCE($8::text, 'pending'))
           ON CONFLICT (code) DO UPDATE SET
             name = EXCLUDED.name,
             cccd = EXCLUDED.cccd,
             phone = EXCLUDED.phone,
             village_id = EXCLUDED.village_id,
             plot_count = COALESCE($6::int, households.plot_count),
             area_ha = COALESCE($7::numeric, households.area_ha),
             status = CASE
               WHEN households.status = 'violation' THEN 'violation'
               ELSE COALESCE($8::text, households.status)
             END
           WHERE ($9::bigint IS NULL OR households.village_id = $9::bigint)
           RETURNING id, village_id, (xmax = 0) AS inserted`,
          [
            dto.code,
            dto.name,
            dto.cccd,
            dto.phone,
            dto.villageId,
            dto.plotCount ?? null,
            dto.areaHa ?? null,
            dto.status ?? null,
            scopedVillageId,
          ],
        );
        if (!saved[0]) {
          result.errors.push({ row: rowNo, message: "Mã hộ đang thuộc thôn khác, không được phép ghi đè." });
          continue;
        }
        if (saved[0].inserted) {
          result.created += 1;
        } else {
          result.updated += 1;
          await this.db.query(
            "UPDATE users SET village_id = $2 WHERE household_id = $1 AND village_id IS DISTINCT FROM $2",
            [saved[0].id, saved[0].village_id],
          );
          if (existingRow && Number(existingRow.village_id) !== Number(saved[0].village_id)) {
            await this.syncHouseholdPlotsVillage(Number(saved[0].id), Number(saved[0].village_id), hasPlots);
          }
        }
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        result.errors.push({ row: rowNo, message: IMPORT_DB_ERRORS[code] ?? "Không lưu được dòng này." });
      }
    }

    if (result.created > 0 || result.updated > 0) {
      await syncHouseholdAndVillageStats(this.db);
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
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền cấp tài khoản ngoài phạm vi quản lý.");
    }
    const { rows: hhRows } = await this.db.query<{
      id: number;
      code: string;
      name: string;
      phone: string;
      village_id: number;
      village_name: string | null;
    }>(
      `SELECT h.id, h.code, h.name, h.phone, h.village_id, v.name AS village_name
       FROM households h
       LEFT JOIN villages v ON v.id = h.village_id
       WHERE h.id = $1`,
      [householdId],
    );
    const hh = hhRows[0];
    if (!hh) throw notFound("Không tìm thấy hồ sơ hộ nông dân này.");
    const officerVillageName = await this.resolveOfficerVillageName(user);
    if (!isStaffInParcelScope(user, { villageId: hh.village_id, villageName: hh.village_name }, officerVillageName)) {
      throw forbidden("Hộ nông dân này không thuộc phạm vi quản lý của bạn.");
    }

    const cleanUsername = (dto.username?.trim() || hh.phone.trim()).replace(/\s+/g, "");
    if (!/^[0-9A-Za-z._-]{3,64}$/.test(cleanUsername)) {
      throw badRequest("Tên đăng nhập gồm 3-64 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
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
    }>("SELECT id, role, household_id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1", [cleanUsername]);
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
