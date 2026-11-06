import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, camelRows } from "../../common/sql/rows";
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
    });
  }

  async allocate(dto: CreateStampAllocationDto, user: AuthUser, ip?: string) {
    const hhRes = await this.db.query<{ id: number; code: string; name: string; area_ha: string }>(
      "SELECT id, code, name, area_ha FROM households WHERE id = $1",
      [dto.householdId],
    );
    if (hhRes.rowCount === 0) throw badRequest("Hộ nông dân không tồn tại.");
    const household = hhRes.rows[0];
    const plotCode = dto.plotCode ? await assertPlotOwned(this.db, household.id, dto.plotCode) : null;
    const shortCode = extractShortHouseholdCode(household.code, household.id);
    const serialPrefix = `KB-${shortCode}-`;

    const client = await this.db.pool.connect();
    let allocId: number;
    let fromSerial: string;
    let toSerial: string;
    try {
      await client.query("BEGIN");
      // Khóa dòng hộ nông dân để hai yêu cầu cấp phát đồng thời cho cùng hộ không sinh trùng số thứ tự.
      await client.query("SELECT id FROM households WHERE id = $1 FOR UPDATE", [household.id]);

      const seqRes = await client.query<{ max_seq: number }>(
        `SELECT GREATEST(
           COALESCE((SELECT MAX((substring(serial_code FROM '([0-9]+)$'))::int) FROM farmer_stamps WHERE household_id = $1 OR serial_code LIKE $2), 0),
           COALESCE((SELECT MAX((substring(to_serial FROM '([0-9]+)$'))::int) FROM farmer_stamp_allocations WHERE household_id = $1 OR to_serial LIKE $2), 0)
         )::int AS max_seq`,
        [household.id, `${serialPrefix}%`],
      );
      const startSeq = (seqRes.rows[0]?.max_seq ?? 0) + 1;
      const endSeq = startSeq + dto.quantity - 1;
      fromSerial = `${serialPrefix}${String(startSeq).padStart(6, "0")}`;
      toSerial = `${serialPrefix}${String(endSeq).padStart(6, "0")}`;

      const countRes = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM farmer_stamp_allocations WHERE household_id = $1",
        [household.id],
      );
      const batchNo = String((countRes.rows[0]?.n ?? 0) + 1).padStart(2, "0");
      const year = new Date().getFullYear();
      const allocationCode = `CPT-${year}-${shortCode}-${batchNo}`;
      const season = dto.season?.trim() || `Vụ ${year}`;
      const maxQuota =
        dto.maxQuotaStamps ?? Math.max(dto.quantity, Math.round(Number(household.area_ha || 1) * 2800));

      const insAlloc = await client.query<{ id: number }>(
        `INSERT INTO farmer_stamp_allocations
           (allocation_code, household_id, season, max_quota_stamps, quantity_allocated, from_serial, to_serial, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
         RETURNING id`,
        [
          allocationCode,
          household.id,
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
        detail: `${household.name}: ${dto.quantity} tem (${fromSerial} → ${toSerial})`,
      },
    );
    await this.notifications.notifyHousehold(household.id, {
      kind: "harvest",
      title: `HTX đã cấp ${dto.quantity} tem truy xuất mới`,
      body: `Dải tem: ${fromSerial} → ${toSerial}`,
      link: "/portal?tab=harvest",
    });

    return this.findOne(allocId, user);
  }

  async revoke(id: number, user: AuthUser, ip?: string) {
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
         WHERE allocation_id IN (SELECT id FROM revoked_alloc) AND status = 'allocated'
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
    return this.findOne(id, user);
  }

  async listStamps(allocationId: number) {
    const alloc = await this.db.query("SELECT 1 FROM farmer_stamp_allocations WHERE id = $1", [allocationId]);
    if (alloc.rowCount === 0) throw notFound("Không tìm thấy đợt cấp phát tem.");

    const { rows } = await this.db.query(
      `SELECT id, allocation_id, household_id, plot_code, serial_code, status,
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
