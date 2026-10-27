import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import type { Role } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { villageScope } from "../../common/crud/village-scope";
import { DatabaseService } from "../../database/database.service";

/** Chỉ quản trị viên và cán bộ HTX (người duyệt hồ sơ) được xem/tìm theo số CCCD đầy đủ. */
const CCCD_FULL_ACCESS: Role[] = ["admin", "htx_officer"];
const canSeeCccd = (user: AuthUser) => CCCD_FULL_ACCESS.includes(user.role);

/** Che số CCCD, chỉ giữ 4 số cuối: 260123456789 → ********6789. */
const maskCccd = (value: unknown) => {
  const text = typeof value === "string" ? value : "";
  return text.length > 4 ? `${"*".repeat(text.length - 4)}${text.slice(-4)}` : "****";
};

const redact = <T extends Record<string, unknown> | null>(row: T, user: AuthUser): T =>
  !row || canSeeCccd(user) || !("cccd" in row) ? row : { ...row, cccd: maskCccd(row.cccd) };

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
}
