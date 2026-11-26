import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { assertHouseholdInScope, isStaffInCuneCoopScope, villageScope } from "../../common/crud/village-scope";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, camelRows } from "../../common/sql/rows";
import { hasPublicTable } from "../../common/sql/schema-cache";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned } from "../../portal/common/portal-context";
import { assertExists } from "../shared/state";
import type { CreateStampAllocationDto } from "./stamps.dto";

function extractShortHouseholdCode(code: string, id: number): string {
  const match = code.match(/(H\d+)$/i);
  if (match) return match[1].toUpperCase();
  const clean = code.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase();
  return clean || `H${id}`;
}

function buildDisambiguatedHouseholdCode(code: string, id: number, baseShort: string): string {
  const zonePart = code
    .replace(/[-_\s]*H\d+$/i, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (zonePart) {
    return `${zonePart.slice(-8)}-${baseShort}`;
  }
  return `ID${id}-${baseShort}`;
}

@Injectable()
export class StampsService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "stamps",
      label: "Đợt cấp phát tem",
      table: "farmer_stamp_allocations",
      fields: `t.id, t.allocation_code, t.household_id, h.name AS household_name, h.code AS household_code,
      t.plot_id,
      (SELECT fs.plot_code FROM farmer_stamps fs WHERE fs.allocation_id = t.id AND fs.plot_code IS NOT NULL LIMIT 1) AS plot_code,
      t.allocated_on, t.season, t.max_quota_stamps, t.quantity_allocated,
      (SELECT count(*)::int FROM farmer_stamps fs WHERE fs.allocation_id = t.id AND fs.status = 'activated') AS activated_count,
      t.from_serial, t.to_serial, t.status, t.notes, t.created_at`,
      from: `farmer_stamp_allocations t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.allocated_on DESC, t.id DESC",
      search: ["t.allocation_code", "h.name", "h.code", "t.from_serial", "t.to_serial"],
      filters: { status: "t.status", householdId: "t.household_id" },
      scope: villageScope("h.village_id"),
    });
  }

  private async querySummary(user: AuthUser): Promise<{
    activeAllocations: number;
    issuedStamps: number;
    activatedStamps: number;
  }> {
    const params: unknown[] = [];
    const conditions: string[] = ["t.status <> 'revoked'"];
    const scoped = this.config.scope?.(user, params);
    if (scoped) conditions.push(scoped);
    const { rows } = await this.db.query<{
      active_allocations: number;
      issued_stamps: number;
      activated_stamps: number;
    }>(
      `SELECT COUNT(*)::int AS active_allocations,
              COALESCE(SUM(t.quantity_allocated), 0)::int AS issued_stamps,
              COALESCE(SUM(fs_agg.act_cnt), 0)::int AS activated_stamps
         FROM farmer_stamp_allocations t
         JOIN households h ON h.id = t.household_id
         LEFT JOIN (
           SELECT allocation_id, COUNT(*)::int AS act_cnt
             FROM farmer_stamps
            WHERE status = 'activated'
            GROUP BY allocation_id
         ) fs_agg ON fs_agg.allocation_id = t.id
        WHERE ${conditions.join(" AND ")}`,
      params,
    );
    const row = rows[0];
    return {
      activeAllocations: Number(row?.active_allocations ?? 0),
      issuedStamps: Number(row?.issued_stamps ?? 0),
      activatedStamps: Number(row?.activated_stamps ?? 0),
    };
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const [res, summary] = await Promise.all([
      super.list(user, query),
      this.querySummary(user),
    ]);
    return { ...res, summary };
  }

  async allocate(dto: CreateStampAllocationDto, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền cấp phát tem ngoài phạm vi quản lý.");
    }
    const currentYear = new Date().getFullYear();
    let seasonYear = currentYear;
    if (dto.season !== undefined && dto.season !== null && dto.season.trim() !== "") {
      const m = /^Vụ\s+(20\d{2})$/i.exec(dto.season.trim());
      if (!m) {
        throw badRequest("Mùa vụ phải theo định dạng chuẩn 'Vụ YYYY' (ví dụ: Vụ 2026).");
      }
      seasonYear = Number(m[1]);
    }
    const season = `Vụ ${seasonYear}`;

    await assertHouseholdInScope(this.db, { householdId: dto.householdId }, user);
    const hhRes = await this.db.query<{
      id: number;
      code: string;
      name: string;
      area_ha: string;
      status: string;
    }>("SELECT id, code, name, area_ha, status FROM households WHERE id = $1", [dto.householdId]);
    if (hhRes.rowCount === 0) throw badRequest("Hộ nông dân không tồn tại.");
    const household = hhRes.rows[0];
    if (household.status === "violation" || household.status === "pending") {
      throw badRequest("Hộ đang chờ duyệt hoặc đang có vi phạm chưa khắc phục, không thể cấp phát tem.");
    }

    const [plotCode, hasPlots] = await Promise.all([
      dto.plotCode ? assertPlotOwned(this.db, household.id, dto.plotCode) : Promise.resolve(null),
      hasPublicTable(this.db, "plots"),
    ]);
    let plotRow: { id: number; status: string; area_ha: number } | undefined;
    if (plotCode && hasPlots) {
      const plotRes = await this.db.query<{ id: number; status: string; area_ha: number }>(
        "SELECT id, status, area_ha::float8 AS area_ha FROM plots WHERE household_id = $1 AND upper(code) = upper($2) LIMIT 1",
        [household.id, plotCode],
      );
      plotRow = plotRes.rows[0];
      if (plotRow && plotRow.status !== "approved") {
        throw badRequest("Thửa đất chưa được phê duyệt hoặc đang có vi phạm, không thể cấp phát tem.");
      }
    }

    const baseShort = extractShortHouseholdCode(household.code, household.id);

    const client = await this.db.pool.connect();
    let allocId: number;
    let fromSerial: string;
    let toSerial: string;
    try {
      await client.query("BEGIN");
      // Khóa tư vấn giao dịch theo hậu tố mã hộ để hai vùng khác nhau cùng có hộ -H01 không tranh chấp UNIQUE
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`stamp_alloc:${baseShort}`]);

      const lockedHh = await client.query<{ status: string; area_ha: number }>(
        "SELECT status, area_ha::float8 AS area_ha FROM households WHERE id = $1 FOR UPDATE",
        [household.id],
      );
      const liveHh = lockedHh.rows[0];
      if (!liveHh || liveHh.status === "violation" || liveHh.status === "pending") {
        throw badRequest("Hộ đang chờ duyệt hoặc đang có vi phạm chưa khắc phục, không thể cấp phát tem.");
      }

      if (plotRow) {
        const livePlot = await client.query<{ status: string; area_ha: number }>(
          "SELECT status, area_ha::float8 AS area_ha FROM plots WHERE id = $1 FOR UPDATE",
          [plotRow.id],
        );
        if (!livePlot.rows[0] || livePlot.rows[0].status !== "approved") {
          throw badRequest("Thửa đất chưa được phê duyệt hoặc đang có vi phạm, không thể cấp phát tem.");
        }
        plotRow.area_ha = Number(livePlot.rows[0].area_ha ?? plotRow.area_ha);
      }

      const year = currentYear;

      const hhAreaHa = Number(liveHh.area_ha ?? 0) > 0 ? Number(liveHh.area_ha) : Number(plotRow?.area_ha ?? 0);
      if (hhAreaHa <= 0) {
        throw badRequest("Diện tích canh tác của hộ phải lớn hơn 0 ha để tính hạn mức cấp phát tem.");
      }
      const maxHouseholdQuota = Math.floor(hhAreaHa * 2800);
      const plotAreaQuota =
        plotRow && Number(plotRow.area_ha) > 0 ? Math.floor(Number(plotRow.area_ha) * 2800) : maxHouseholdQuota;
      const areaCeiling = Math.min(maxHouseholdQuota, plotAreaQuota);
      const maxQuota =
        dto.maxQuotaStamps !== undefined && dto.maxQuotaStamps > 0
          ? Math.min(dto.maxQuotaStamps, areaCeiling)
          : areaCeiling;

      const existingHhRes = await client.query<{ allocated_sum: number }>(
        `SELECT COALESCE(SUM(quantity_allocated), 0)::int AS allocated_sum
         FROM farmer_stamp_allocations
         WHERE household_id = $1 AND upper(btrim(season)) = upper($2) AND status <> 'revoked'`,
        [household.id, season],
      );
      const existingHhAllocated = Number(existingHhRes.rows[0]?.allocated_sum ?? 0);
      if (existingHhAllocated + dto.quantity > maxHouseholdQuota) {
        throw badRequest(
          `Tổng số lượng tem cấp phát trong ${season} (${existingHhAllocated + dto.quantity}) vượt hạn mức diện tích của hộ (${maxHouseholdQuota} tem).`,
        );
      }

      let existingTargetAllocated = existingHhAllocated;
      if (plotRow && plotCode) {
        const existingPlotRes = await client.query<{ allocated_sum: number }>(
          `SELECT COALESCE(SUM(fsa.quantity_allocated), 0)::int AS allocated_sum
           FROM farmer_stamp_allocations fsa
           WHERE fsa.household_id = $1
             AND upper(btrim(fsa.season)) = upper($2)
             AND fsa.status <> 'revoked'
             AND (
               fsa.plot_id = $3
               OR (fsa.plot_id IS NULL AND EXISTS (
                 SELECT 1 FROM farmer_stamps fs
                 WHERE fs.allocation_id = fsa.id AND upper(fs.plot_code) = upper($4)
               ))
             )`,
          [household.id, season, plotRow.id, plotCode],
        );
        existingTargetAllocated = Number(existingPlotRes.rows[0]?.allocated_sum ?? 0);
      }

      if (existingTargetAllocated + dto.quantity > maxQuota) {
        throw badRequest(
          `Số lượng tem cấp phát vượt hạn mức cho phép trong ${season} (đã cấp ${existingTargetAllocated}/${maxQuota} tem).`,
        );
      }

      // Kiểm tra xem hậu tố ngắn (ví dụ H01) đã được hộ khác ở vùng/thôn khác sử dụng chưa
      const prefixCheck = await client.query<{ owns_base: boolean; foreign_uses_base: boolean }>(
        `SELECT
           EXISTS (
             SELECT 1 FROM farmer_stamp_allocations
             WHERE household_id = $1 AND (from_serial LIKE $2 OR allocation_code LIKE $3)
           ) AS owns_base,
           (
             EXISTS (
               SELECT 1 FROM farmer_stamp_allocations
               WHERE household_id <> $1 AND (from_serial LIKE $2 OR allocation_code LIKE $3)
             )
             OR EXISTS (
               SELECT 1 FROM farmer_stamps
               WHERE household_id <> $1 AND serial_code LIKE $2
             )
           ) AS foreign_uses_base`,
        [household.id, `KB-${baseShort}-%`, `CPT-%-${baseShort}-%`],
      );

      let shortCode = baseShort;
      if (!prefixCheck.rows[0]?.owns_base && prefixCheck.rows[0]?.foreign_uses_base) {
        const candidate = buildDisambiguatedHouseholdCode(household.code, household.id, baseShort);
        const candClash = await client.query<{ clashed: boolean }>(
          `SELECT (
             EXISTS (
               SELECT 1 FROM farmer_stamp_allocations
               WHERE household_id <> $1 AND (from_serial LIKE $2 OR allocation_code LIKE $3)
             )
             OR EXISTS (
               SELECT 1 FROM farmer_stamps
               WHERE household_id <> $1 AND serial_code LIKE $2
             )
           ) AS clashed`,
          [household.id, `KB-${candidate}-%`, `CPT-%-${candidate}-%`],
        );
        shortCode = candClash.rows[0]?.clashed ? `ID${household.id}-${baseShort}` : candidate;
      }

      if (shortCode !== baseShort) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`stamp_alloc:${shortCode}`]);
      }
      const serialPrefix = `KB-${shortCode}-`;
      const allocPrefix = `CPT-${year}-${shortCode}-`;

      const seqRes = await client.query<{ max_seq: number }>(
        `SELECT GREATEST(
           COALESCE((SELECT MAX((substring(serial_code FROM '([0-9]+)$'))::int) FROM farmer_stamps WHERE serial_code LIKE $1), 0),
           COALESCE((SELECT MAX((substring(to_serial FROM '([0-9]+)$'))::int) FROM farmer_stamp_allocations WHERE to_serial LIKE $1), 0)
         )::int AS max_seq`,
        [`${serialPrefix}%`],
      );
      const startSeq = (seqRes.rows[0]?.max_seq ?? 0) + 1;
      const endSeq = startSeq + dto.quantity - 1;
      fromSerial = `${serialPrefix}${String(startSeq).padStart(6, "0")}`;
      toSerial = `${serialPrefix}${String(endSeq).padStart(6, "0")}`;

      const batchRes = await client.query<{ max_batch: number }>(
        `SELECT GREATEST(
           (SELECT count(*)::int FROM farmer_stamp_allocations WHERE household_id = $1),
           COALESCE((
             SELECT MAX((substring(allocation_code FROM '([0-9]+)$'))::int)
             FROM farmer_stamp_allocations
             WHERE allocation_code LIKE $2
           ), 0)
         )::int AS max_batch`,
        [household.id, `${allocPrefix}%`],
      );
      const batchNo = String((batchRes.rows[0]?.max_batch ?? 0) + 1).padStart(2, "0");
      const allocationCode = `${allocPrefix}${batchNo}`;

      const insAlloc = await client.query<{ id: number }>(
        `INSERT INTO farmer_stamp_allocations
           (allocation_code, household_id, plot_id, season, max_quota_stamps, quantity_allocated, from_serial, to_serial, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
         RETURNING id`,
        [
          allocationCode,
          household.id,
          plotRow?.id ?? null,
          season,
          maxQuota,
          dto.quantity,
          fromSerial,
          toSerial,
          dto.notes ?? null,
        ],
      );
      allocId = insAlloc.rows[0].id;

      await client.query(
        `INSERT INTO farmer_stamps (allocation_id, household_id, plot_code, serial_code, status)
         SELECT $1, $2, $3, $4 || lpad(seq::text, 6, '0'), 'allocated'
         FROM generate_series($5::int, $6::int) AS seq`,
        [allocId, household.id, plotCode, serialPrefix, startSeq, endSeq],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Cấp phát tem nông hộ",
        object: `${this.config.label} #${allocId}`,
        detail: `${household.name}: ${dto.quantity} tem (${fromSerial} đến ${toSerial})`,
      },
    );
    await this.notifications.notifyHousehold(household.id, {
      kind: "harvest",
      title: `HTX đã cấp ${dto.quantity} tem truy xuất mới`,
      body: `Dải tem từ ${fromSerial} đến ${toSerial}`,
      link: "/portal?tab=harvest",
    });

    return this.findOne(allocId, user);
  }

  async revoke(id: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền thu hồi tem ngoài phạm vi quản lý.");
    }
    const existing = await this.db.query<{ household_id: number }>(
      "SELECT household_id FROM farmer_stamp_allocations WHERE id = $1",
      [id],
    );
    if (existing.rows[0]) {
      await assertHouseholdInScope(this.db, { householdId: existing.rows[0].household_id }, user);
    }

    const { rows } = await this.db.query<{ id: number; allocation_code: string }>(
      `WITH revoked_alloc AS (
         UPDATE farmer_stamp_allocations
         SET status = 'revoked'
         WHERE id = $1 AND status = 'active'
         RETURNING id, allocation_code
       ),
       revoked_stamps AS (
         UPDATE farmer_stamps
         SET status = 'revoked'
         WHERE allocation_id IN (SELECT id FROM revoked_alloc) AND status IN ('allocated', 'activated')
       )
       SELECT id, allocation_code FROM revoked_alloc`,
      [id],
    );
    if (rows.length === 0) {
      await assertExists(
        this.db,
        "farmer_stamp_allocations",
        id,
        "Chỉ thu hồi được đợt cấp phát đang hoạt động.",
      );
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Thu hồi đợt cấp phát tem",
        object: `${this.config.label} #${id}`,
        detail: rows[0].allocation_code,
      },
    );
    if (existing.rows[0]?.household_id) {
      await this.notifications.notifyHousehold(existing.rows[0].household_id, {
        kind: "harvest",
        title: `Đợt tem ${rows[0].allocation_code} đã bị thu hồi`,
        body: "HTX đã thu hồi dải tem này. Vui lòng kiểm tra mục Thu hoạch hoặc liên hệ cán bộ HTX.",
        link: "/portal?tab=stamps",
      });
    }
    return this.findOne(id, user);
  }

  async listStamps(allocationId: number, user?: AuthUser) {
    if (user) {
      await this.findOne(allocationId, user);
    } else {
      const alloc = await this.db.query("SELECT 1 FROM farmer_stamp_allocations WHERE id = $1", [allocationId]);
      if (alloc.rowCount === 0) throw notFound("Không tìm thấy đợt cấp phát tem.");
    }

    const { rows } = await this.db.query(
      `SELECT id, allocation_id, household_id, plot_code, serial_code, qr_token, status,
              activated_at, fruit_weight_kg::float8 AS fruit_weight_kg, grade,
              COALESCE(${attachmentUrlSql("photo_id")}, photo_url) AS photo_url,
              harvest_date, created_at
       FROM farmer_stamps
       WHERE allocation_id = $1
       ORDER BY id ASC
       LIMIT 500`,
      [allocationId],
    );
    return { data: camelRows(rows) };
  }
}
