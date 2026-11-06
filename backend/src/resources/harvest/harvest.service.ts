import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import type { GenerateItemsDto, UpsertContributionDto } from "./harvest.dto";

@Injectable()
export class HarvestService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "harvest",
      label: "Lô thu hoạch",
      table: "harvest_lots",
      fields: `t.id, t.code, t.harvested_on, t.weight_tons, t.household_count, t.buyer, t.market,
      t.qr_code, t.status, t.enterprise_id, e.name AS enterprise_name, t.contract_id, c.code AS contract_code,
      t.packhouse_code, t.grade_a_pct, t.grade_b_pct, t.grade_c_pct, t.avg_brix, t.treatment_method,
      t.transporter, t.vehicle_plate, t.temperature_c, t.departed_at, t.estimated_arrival`,
      from: `harvest_lots t
             LEFT JOIN enterprises e ON e.id = t.enterprise_id
             LEFT JOIN contracts c ON c.id = t.contract_id`,
      orderBy: "t.harvested_on DESC, t.id DESC",
      search: ["t.code", "t.buyer", "t.market", "e.name"],
      filters: { status: "t.status", market: "t.market", enterpriseId: "t.enterprise_id" },
    });
  }

  protected override async prepare(input: Record<string, unknown>, _context: WriteContext) {
    const a = typeof input.gradeAPct === "number" ? input.gradeAPct : 0;
    const b = typeof input.gradeBPct === "number" ? input.gradeBPct : 0;
    const c = typeof input.gradeCPct === "number" ? input.gradeCPct : 0;
    if (a + b + c > 100.0001) {
      throw badRequest("Tổng tỷ lệ phân hạng (A + B + C) không được vượt quá 100%.");
    }
    if (input.enterpriseId !== undefined && input.enterpriseId !== null) {
      const ent = await this.db.query("SELECT 1 FROM enterprises WHERE id = $1", [input.enterpriseId]);
      if (ent.rowCount === 0) throw badRequest("Doanh nghiệp liên kết không tồn tại.");
    }
    if (input.contractId !== undefined && input.contractId !== null) {
      const con = await this.db.query("SELECT 1 FROM contracts WHERE id = $1", [input.contractId]);
      if (con.rowCount === 0) throw badRequest("Hợp đồng liên kết không tồn tại.");
    }
    return input;
  }

  /** Lấy danh sách tem truy xuất con (quả/thùng) của một lô */
  async getItems(lotId: number) {
    const lot = await this.db.query("SELECT id, code FROM harvest_lots WHERE id = $1", [lotId]);
    if (lot.rowCount === 0) {
      throw notFound(`Không tìm thấy lô hàng với ID ${lotId}`);
    }

    const res = await this.db.query(
      `SELECT id, lot_id, item_type, serial_code, weight_kg, grade, printed_at, status, created_at
       FROM harvest_items
       WHERE lot_id = $1
       ORDER BY item_type DESC, id ASC`,
      [lotId],
    );
    return camelRows(res.rows);
  }

  /** Tự động sinh hàng loạt dải tem truy xuất nguồn gốc con (quả hoặc thùng) */
  async generateItems(lotId: number, dto: GenerateItemsDto, user: AuthUser, ip?: string) {
    const lotRes = await this.db.query<{ id: number; code: string }>(
      "SELECT id, code FROM harvest_lots WHERE id = $1",
      [lotId],
    );
    if (lotRes.rowCount === 0) {
      throw notFound(`Không tìm thấy lô hàng với ID ${lotId}`);
    }
    const lot = lotRes.rows[0];

    const prefix = dto.itemType === "fruit" ? "Q" : "T";
    const padLen = dto.itemType === "fruit" ? 4 : 3;

    const maxRes = await this.db.query<{ serial_code: string }>(
      `SELECT serial_code FROM harvest_items
       WHERE lot_id = $1 AND item_type = $2
       ORDER BY id DESC LIMIT 1`,
      [lotId, dto.itemType],
    );

    let startIdx = 1;
    if (maxRes.rowCount && maxRes.rows[0]) {
      const parts = maxRes.rows[0].serial_code.split(`-${prefix}`);
      if (parts.length > 1) {
        const lastNum = parseInt(parts[1], 10);
        if (!isNaN(lastNum)) startIdx = lastNum + 1;
      }
    }

    const createdItems: unknown[] = [];
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < dto.count; i++) {
        const num = (startIdx + i).toString().padStart(padLen, "0");
        const serialCode = `${lot.code}-${prefix}${num}`;
        const weight = dto.weightKg ?? (dto.itemType === "fruit" ? 3.5 : 18.0);
        const grade = dto.grade ?? "A";

        const insRes = await client.query(
          `INSERT INTO harvest_items (lot_id, item_type, serial_code, weight_kg, grade, printed_at, status)
           VALUES ($1, $2, $3, $4, $5, now(), 'active')
           ON CONFLICT (serial_code) DO NOTHING
           RETURNING id, lot_id, item_type, serial_code, weight_kg, grade, printed_at, status, created_at`,
          [lotId, dto.itemType, serialCode, weight, grade],
        );
        if (insRes.rowCount && insRes.rows[0]) {
          createdItems.push(camelRows(insRes.rows)[0]);
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Sinh tem truy xuất",
        object: `${this.config.label} #${lotId}`,
        detail: `${createdItems.length} tem (${dto.itemType})`,
      },
    );

    return createdItems;
  }

  async listContributions(lotId: number) {
    const lot = await this.db.query("SELECT 1 FROM harvest_lots WHERE id = $1", [lotId]);
    if (lot.rowCount === 0) throw notFound("Không tìm thấy lô hàng.");

    const { rows } = await this.db.query(
      `SELECT hc.id, hc.lot_id, hc.household_id, h.code AS household_code, h.name AS household_name,
              v.name AS village_name, h.phone, hc.weight_kg::float8 AS weight_kg, hc.created_at
       FROM harvest_contributions hc
       JOIN households h ON h.id = hc.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE hc.lot_id = $1
       ORDER BY hc.weight_kg DESC, hc.id ASC`,
      [lotId],
    );
    return { data: camelRows(rows) };
  }

  async upsertContribution(lotId: number, dto: UpsertContributionDto, user: AuthUser, ip?: string) {
    const lot = await this.db.query("SELECT 1 FROM harvest_lots WHERE id = $1", [lotId]);
    if (lot.rowCount === 0) throw notFound("Không tìm thấy lô hàng.");

    const household = await this.db.query("SELECT 1 FROM households WHERE id = $1", [dto.householdId]);
    if (household.rowCount === 0) throw badRequest("Hộ nông dân không tồn tại.");

    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO harvest_contributions (lot_id, household_id, weight_kg)
       VALUES ($1, $2, $3)
       ON CONFLICT (lot_id, household_id) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
       RETURNING id`,
      [lotId, dto.householdId, dto.weightKg],
    );

    await this.db.query(
      `UPDATE harvest_lots
       SET household_count = (SELECT count(*)::int FROM harvest_contributions WHERE lot_id = $1)
       WHERE id = $1`,
      [lotId],
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Ghi đóng góp lô thu hoạch",
        object: `${this.config.label} #${lotId}`,
        detail: `Hộ #${dto.householdId}: ${dto.weightKg} kg`,
      },
    );

    const saved = await this.db.query(
      `SELECT hc.id, hc.lot_id, hc.household_id, h.code AS household_code, h.name AS household_name,
              v.name AS village_name, h.phone, hc.weight_kg::float8 AS weight_kg, hc.created_at
       FROM harvest_contributions hc
       JOIN households h ON h.id = hc.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE hc.id = $1`,
      [rows[0].id],
    );
    return camelRow(saved.rows[0]);
  }

  async removeContribution(lotId: number, contributionId: number, user: AuthUser, ip?: string) {
    const deleted = await this.db.query(
      "DELETE FROM harvest_contributions WHERE id = $1 AND lot_id = $2 RETURNING id",
      [contributionId, lotId],
    );
    if (deleted.rowCount === 0) throw notFound("Không tìm thấy đóng góp này.");

    await this.db.query(
      `UPDATE harvest_lots
       SET household_count = (SELECT count(*)::int FROM harvest_contributions WHERE lot_id = $1)
       WHERE id = $1`,
      [lotId],
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Xóa đóng góp lô thu hoạch",
        object: `${this.config.label} #${lotId}`,
        detail: `Đóng góp #${contributionId}`,
      },
    );
    return { ok: true };
  }
}
