import { Injectable } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthUser } from "../../auth/auth-user";
import type { Role } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { villageScope } from "../../common/crud/village-scope";
import { DatabaseService } from "../../database/database.service";
import { CreateHouseholdDto } from "./households.dto";

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
      t.plot_count, t.area_ha, t.status, t.created_at, t.updated_at`,
      from: `households t JOIN villages v ON v.id = t.village_id`,
      orderBy: "t.id",
      search: ["t.name", "t.code", "t.cccd", "t.phone"],
      // Vai trò không được xem CCCD cũng không được dò CCCD qua ô tìm kiếm.
      searchFor: (user) => (canSeeCccd(user) ? ["t.name", "t.code", "t.cccd", "t.phone"] : ["t.name", "t.code", "t.phone"]),
      filters: { villageId: "t.village_id", status: "t.status" },
      scope: villageScope("t.village_id"),
    });
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
}
