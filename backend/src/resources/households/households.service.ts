import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthUser } from "../../auth/auth-user";
import { can, COOP_STAFF_ROLES, isAdminPrivilegedRole, type Role } from "../../auth/permissions";
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
import { camelRows, publicAttachmentUrlSql } from "../../common/sql/rows";
import { hasPublicTable } from "../../common/sql/schema-cache";
import { hasPlotsTable, syncHouseholdAndVillageStats } from "../../common/sql/stats-sync";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { DeletionRequestsService } from "../deletion-requests/deletion-requests.service";
import { CreateHouseholdDto, IssueHouseholdAccountDto } from "./households.dto";

/** Chỉ quản trị viên và cán bộ HTX (người duyệt hồ sơ) được xem/tìm theo số CCCD đầy đủ. */
const CCCD_FULL_ACCESS: readonly Role[] = COOP_STAFF_ROLES;
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
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly deletionRequests: DeletionRequestsService,
    private readonly notifications: NotificationsService,
  ) {
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
    const out: Record<string, unknown> = { ...input };
    if (out.publicTraceConsent === true) {
      let alreadyConsented = false;
      if (context.method === "PATCH" && context.id !== undefined) {
        const prevConsentRes = await this.db.query<{ public_trace_consent: boolean | null }>(
          "SELECT public_trace_consent FROM households WHERE id = $1 LIMIT 1",
          [context.id],
        );
        alreadyConsented = prevConsentRes.rows[0]?.public_trace_consent === true;
      }
      if (alreadyConsented) {
        delete out.publicTraceConsent;
      } else {
        throw forbidden(
          "Chỉ chính nông hộ đăng nhập Cổng hộ dân mới được tự xác nhận đồng ý hiển thị công khai họ tên và ảnh đại diện trên hồ sơ QR.",
        );
      }
    }
    if (context.method === "PATCH" && context.id !== undefined) {
      await assertHouseholdInScope(this.db, { householdId: context.id }, context.user);
      if (out.status !== undefined && out.status !== "violation") {
        const openViol = await this.db.query<{ id: number }>(
          "SELECT id FROM violations WHERE household_id = $1 AND status = 'open' LIMIT 1",
          [context.id],
        );
        if ((openViol.rowCount ?? 0) > 0) {
          throw badRequest(
            "Hộ nông dân đang có cảnh báo vi phạm mở chưa khắc phục xong, không thể chuyển sang trạng thái đạt chuẩn.",
          );
        }
      }
    }
    if (out.villageId !== undefined && out.villageId !== null) {
      if (context.user.role === "village_officer" && context.user.villageId && Number(out.villageId) !== Number(context.user.villageId)) {
        throw forbidden("Cán bộ thôn chỉ được thao tác với hộ thuộc thôn mình phụ trách.");
      }
      const village = await this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages WHERE id = $1", [
        out.villageId,
      ]);
      if (village.rowCount === 0 || !village.rows[0]) {
        throw new AppException(409, "Thôn được chọn không tồn tại.", "BAD_REQUEST");
      }
      const officerVillageName = await this.resolveOfficerVillageName(context.user);
      if (
        !isStaffInParcelScope(
          context.user,
          { villageId: Number(out.villageId), villageName: village.rows[0].name },
          officerVillageName,
        )
      ) {
        throw forbidden("Bạn không có quyền thao tác với hộ thuộc địa bàn này.");
      }
    }
    return out;
  }

  private async enrichHouseholdsWithDiaryAndPlots<T extends Record<string, unknown>>(
    rows: T[],
  ): Promise<T[]> {
    if (rows.length === 0) return rows;
    const ids = rows
      .map((r) => Number(r.id))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return rows;

    const [hasPlots, hasSignboards, hasMilestones] = await Promise.all([
      hasPlotsTable(this.db),
      hasPublicTable(this.db, "plot_signboard_tokens"),
      hasPublicTable(this.db, "care_milestone_declarations"),
    ]);

    const milestoneCte = hasMilestones
      ? `, m_agg AS (
           SELECT household_id, COUNT(*)::int AS cnt
             FROM care_milestone_declarations
            WHERE household_id = ANY($1::bigint[])
              AND journal_entry_id IS NULL
              AND spray_record_id IS NULL
            GROUP BY household_id
         )`
      : "";
    const milestoneSelect = hasMilestones ? "COALESCE(m_agg.cnt, 0)" : "0";

    const plotCte = hasPlots
      ? `, p_agg AS (
           SELECT household_id, string_agg(code, ', ' ORDER BY code) AS plot_codes
             FROM plots
            WHERE household_id = ANY($1::bigint[])
            GROUP BY household_id
         )`
      : "";
    const sbCte = hasSignboards
      ? `, sb_agg AS (
           SELECT household_id, string_agg(plot_code, ', ' ORDER BY plot_code) AS plot_codes
             FROM plot_signboard_tokens
            WHERE household_id = ANY($1::bigint[])
            GROUP BY household_id
         )`
      : "";
    const plotSelect =
      hasPlots && hasSignboards
        ? "COALESCE(p_agg.plot_codes, sb_agg.plot_codes)"
        : hasPlots
          ? "p_agg.plot_codes"
          : hasSignboards
            ? "sb_agg.plot_codes"
            : "NULL::text";

    const statsRes = await this.db.query<{
      hh_id: number;
      diary_count: number;
      plot_codes: string | null;
    }>(
      `WITH u_ids AS (
         SELECT DISTINCT unnest($1::bigint[]) AS hh_id
       ),
       j_agg AS (
         SELECT household_id, COUNT(*)::int AS cnt
           FROM journal_entries
          WHERE household_id = ANY($1::bigint[])
          GROUP BY household_id
       ),
       s_agg AS (
         SELECT household_id, COUNT(*)::int AS cnt
           FROM spray_records
          WHERE household_id = ANY($1::bigint[])
          GROUP BY household_id
       )
       ${milestoneCte}
       ${plotCte}
       ${sbCte}
       SELECT u_ids.hh_id,
              (COALESCE(j_agg.cnt, 0) + COALESCE(s_agg.cnt, 0) + ${milestoneSelect})::int AS diary_count,
              ${plotSelect} AS plot_codes
         FROM u_ids
         LEFT JOIN j_agg ON j_agg.household_id = u_ids.hh_id
         LEFT JOIN s_agg ON s_agg.household_id = u_ids.hh_id
         ${hasMilestones ? "LEFT JOIN m_agg ON m_agg.household_id = u_ids.hh_id" : ""}
         ${hasPlots ? "LEFT JOIN p_agg ON p_agg.household_id = u_ids.hh_id" : ""}
         ${hasSignboards ? "LEFT JOIN sb_agg ON sb_agg.household_id = u_ids.hh_id" : ""}`,
      [ids],
    );

    const map = new Map<number, { diaryCount: number; plotCodesSummary: string | null }>();
    for (const r of statsRes.rows) {
      map.set(Number(r.hh_id), {
        diaryCount: Number(r.diary_count) || 0,
        plotCodesSummary: r.plot_codes || null,
      });
    }

    return rows.map((row) => {
      const info = map.get(Number(row.id));
      return {
        ...row,
        diaryCount: info?.diaryCount ?? 0,
        plotCodesSummary: info?.plotCodesSummary ?? null,
      };
    });
  }

  private async listWithZoneFilter(
    user: AuthUser,
    query: ListQueryDto & Record<string, unknown>,
    rawZone: string,
  ) {
    const safePage = Math.min(10_000, Math.max(1, Math.trunc(Number(query.page) || 1)));
    const safePageSize = Math.min(500, Math.max(1, Math.trunc(Number(query.pageSize) || 100)));
    const cleanQ = typeof query.q === "string" ? query.q.trim() : undefined;
    const params: unknown[] = [];
    const conditions: string[] = [];

    const scoped = this.config.scope?.(user, params);
    if (scoped) conditions.push(scoped);

    for (const [param, column] of Object.entries(this.config.filters ?? {})) {
      const value = query[param];
      if (value === undefined) continue;
      if (typeof value !== "string") throw badRequest(`Tham số ${param} không hợp lệ.`);
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (trimmed.length > 100) throw badRequest(`Tham số ${param} vượt quá độ dài cho phép.`);
      if (column.endsWith("_id") && !/^[1-9]\d{0,14}$/.test(trimmed)) {
        throw badRequest(`Tham số ${param} phải là mã định danh số nguyên dương.`);
      }
      params.push(trimmed);
      conditions.push(`${column} = $${params.length}`);
    }

    const searchColumns = this.config.searchFor?.(user) ?? this.config.search;
    if (cleanQ && searchColumns?.length) {
      params.push(`%${cleanQ.replace(/[\\%_]/g, "\\$&")}%`);
      const ref = `$${params.length}`;
      conditions.push(`(${searchColumns.map((column) => `${column}::text ILIKE ${ref} ESCAPE '\\'`).join(" OR ")})`);
    }

    const [hasPlots, hasSignboards] = await Promise.all([
      hasPlotsTable(this.db),
      hasPublicTable(this.db, "plot_signboard_tokens"),
    ]);

    const normZone = rawZone.trim().toUpperCase().replace(/Đ/g, "D");
    params.push(normZone);
    const zoneRef = `$${params.length}`;
    params.push(`${normZone.replace(/[\\%_]/g, "\\$&")}-%`);
    const zonePrefixRef = `$${params.length}`;

    const zoneParts: string[] = [
      `replace(upper(btrim(t.code)), 'Đ', 'D') = ${zoneRef}`,
      `replace(upper(btrim(t.code)), 'Đ', 'D') LIKE ${zonePrefixRef} ESCAPE '\\'`,
    ];
    if (hasPlots) {
      zoneParts.push(
        `EXISTS (
           SELECT 1
             FROM plots p_z
            WHERE p_z.household_id = t.id
              AND (
                replace(upper(btrim(COALESCE(p_z.zone_code, ''))), 'Đ', 'D') = ${zoneRef}
                OR replace(upper(btrim(p_z.code)), 'Đ', 'D') LIKE ${zonePrefixRef} ESCAPE '\\'
              )
         )`,
      );
    }
    if (hasSignboards) {
      zoneParts.push(
        `EXISTS (
           SELECT 1
             FROM plot_signboard_tokens sb_z
            WHERE sb_z.household_id = t.id
              AND (
                replace(upper(btrim(COALESCE(sb_z.zone_code, ''))), 'Đ', 'D') = ${zoneRef}
                OR replace(upper(btrim(sb_z.plot_code)), 'Đ', 'D') LIKE ${zonePrefixRef} ESCAPE '\\'
              )
         )`,
      );
    }
    conditions.push(`(${zoneParts.join(" OR ")})`);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.db.query<Record<string, unknown> & { __total_count?: number }>(
      `SELECT ${this.config.fields}, count(*) OVER()::int AS __total_count
         FROM ${this.config.from}
         ${where}
        ORDER BY ${this.config.orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, safePageSize, (safePage - 1) * safePageSize],
    );

    let total = 0;
    if (rows.length > 0) {
      total = Number(rows[0].__total_count ?? 0);
    } else if (safePage > 1) {
      total = (
        await this.db.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM ${this.config.from} ${where}`,
          params,
        )
      ).rows[0].total;
    }

    const data = camelRows(
      rows.map((row) => {
        const { __total_count: _ignored, ...rest } = row;
        void _ignored;
        return rest;
      }),
    );
    return { data, total, page: safePage, pageSize: safePageSize };
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const cleanZone = typeof query?.zone === "string" ? query.zone.trim() : "";
    if (cleanZone.length > 80) {
      throw badRequest("Tham số zone vượt quá độ dài cho phép.");
    }
    const result = cleanZone
      ? await this.listWithZoneFilter(user, query, cleanZone)
      : await super.list(user, query);
    const forceMask = query?.full === "0" || query?.full === false;
    const enriched = await this.enrichHouseholdsWithDiaryAndPlots(
      result.data.map((row) => redact(row, user, forceMask)),
    );
    return { ...result, data: enriched };
  }

  override async findOne(id: number, user: AuthUser) {
    const row = redact(await super.findOne(id, user), user);
    if (!row) return row;
    const [enriched] = await this.enrichHouseholdsWithDiaryAndPlots([row]);
    return enriched ?? row;
  }

  override async create(dto: object, user: AuthUser, ip?: string) {
    const created = await super.create(dto, user, ip);
    const createdId = created && "id" in created ? Number(created.id) : 0;
    const hasPlots = await hasPlotsTable(this.db);
    await syncHouseholdAndVillageStats(this.db, {
      householdIds: createdId > 0 ? [createdId] : [],
      hasPlots,
      resetEmptyHouseholds: false,
    });
    if (hasPlots && createdId > 0) {
      const refreshed = await super.findOne(createdId, user).catch(() => created);
      return redact(refreshed, user);
    }
    return redact(created, user);
  }

  override async update(id: number, dto: object, user: AuthUser, ip?: string) {
    const prev = await this.db.query<{
      village_id: number | string;
      phone: string | null;
      name: string | null;
      status: string | null;
    }>(
      "SELECT village_id, phone, name, status FROM households WHERE id = $1 LIMIT 1",
      [id],
    );
    const oldRow = prev.rows[0];
    const oldVillageId = oldRow?.village_id ? Number(oldRow.village_id) : undefined;
    const oldPhone = oldRow?.phone?.trim() ?? "";
    const oldStatus = oldRow?.status ?? null;
    const updated = await super.update(id, dto, user, ip);
    const hasPlots = await hasPlotsTable(this.db);
    const nextVillageId =
      (dto as { villageId?: number }).villageId !== undefined
        ? Number((dto as { villageId?: number }).villageId)
        : updated && "villageId" in updated && updated.villageId !== null && updated.villageId !== undefined
          ? Number(updated.villageId)
          : oldVillageId;
    if (nextVillageId !== undefined && nextVillageId !== oldVillageId) {
      await this.db.query("UPDATE users SET village_id = $2 WHERE household_id = $1", [id, nextVillageId]);
      await this.syncHouseholdPlotsVillage(id, nextVillageId, hasPlots);
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
      householdIds: [id],
      forceZeroVillageIds: oldVillageId ? [oldVillageId] : [],
      hasPlots,
      resetEmptyHouseholds: false,
    });

    const nextStatus = typeof (dto as { status?: string }).status === "string" ? (dto as { status: string }).status : null;
    if (nextStatus && nextStatus !== oldStatus) {
      const statusLabels: Record<string, string> = {
        qualified: "Đủ chuẩn xuất khẩu",
        improve: "Cần khắc phục theo hướng dẫn kỹ thuật",
        pending: "Chờ xét duyệt",
        violation: "Đang có vi phạm cần xử lý",
      };
      await this.notifications.notifyHousehold(id, {
        kind: nextStatus === "violation" ? "violation" : "system",
        title: `Trạng thái chứng nhận hộ được cập nhật: ${statusLabels[nextStatus] ?? nextStatus}`,
        body: "HTX Cư Né vừa cập nhật trạng thái hồ sơ canh tác của hộ trên hệ thống.",
        link: "/portal?tab=home",
      });
    }

    const refreshed = await super.findOne(id, user).catch(() => updated);
    return redact(refreshed, user);
  }

  override async remove(id: number, user: AuthUser, ip?: string) {
    return this.deletionRequests.requestDeletion({ targetType: "household", targetId: id }, user, ip);
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
    const touchedHouseholdIds: number[] = [];
    const vacatedVillageIds: number[] = [];

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
        touchedHouseholdIds.push(Number(saved[0].id));
        if (saved[0].inserted) {
          result.created += 1;
        } else {
          result.updated += 1;
          await this.db.query(
            "UPDATE users SET village_id = $2 WHERE household_id = $1 AND village_id IS DISTINCT FROM $2",
            [saved[0].id, saved[0].village_id],
          );
          if (existingRow && Number(existingRow.village_id) !== Number(saved[0].village_id)) {
            if (existingRow.village_id) {
              vacatedVillageIds.push(Number(existingRow.village_id));
            }
            await this.syncHouseholdPlotsVillage(Number(saved[0].id), Number(saved[0].village_id), hasPlots);
          }
        }
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        result.errors.push({ row: rowNo, message: IMPORT_DB_ERRORS[code] ?? "Không lưu được dòng này." });
      }
    }

    if (result.created > 0 || result.updated > 0) {
      await syncHouseholdAndVillageStats(this.db, {
        householdIds: touchedHouseholdIds,
        forceZeroVillageIds: vacatedVillageIds,
        hasPlots,
        resetEmptyHouseholds: false,
      });
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
    const [{ rows: hhRows }, officerVillageName] = await Promise.all([
      this.db.query<{
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
      ),
      this.resolveOfficerVillageName(user),
    ]);
    const hh = hhRows[0];
    if (!hh) throw notFound("Không tìm thấy hồ sơ hộ nông dân này.");
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

    const [{ rows: existingByHh }, { rows: existingByUsername }] = await Promise.all([
      this.db.query<{ id: number; username: string; role: string; status: string }>(
        "SELECT id, username, role, status FROM users WHERE household_id = $1 LIMIT 1",
        [householdId],
      ),
      this.db.query<{
        id: number;
        role: string;
        status: string;
        household_id: number | null;
      }>("SELECT id, role, status, household_id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1", [cleanUsername]),
    ]);
    if (existingByHh[0] && existingByHh[0].role !== "farmer") {
      throw new AppException(409, "Hồ sơ hộ này đang liên kết với tài khoản không phải nông hộ.", "CONFLICT");
    }
    if (
      existingByUsername[0] &&
      existingByUsername[0].id !== existingByHh[0]?.id &&
      (existingByUsername[0].role !== "farmer" ||
        (existingByUsername[0].household_id !== null && existingByUsername[0].household_id !== householdId))
    ) {
      throw new AppException(409, `Tên đăng nhập "${cleanUsername}" đang thuộc về một tài khoản khác.`, "CONFLICT");
    }
    if (
      (existingByHh[0]?.status === "locked" || existingByUsername[0]?.status === "locked") &&
      !isAdminPrivilegedRole(user.role)
    ) {
      throw forbidden("Tài khoản đã bị khóa; chỉ Quản trị viên mới được phép mở khóa và cấp lại mật khẩu.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

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
        await this.db.query(
          "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
          [accountId],
        );
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
        await this.db.query(
          "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
          [accountId],
        );
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
