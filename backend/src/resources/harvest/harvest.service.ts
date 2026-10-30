import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";
import type { GenerateItemsDto } from "./harvest.dto";

const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const camelRows = <T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])) as T);

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

  /** Lấy danh sách tem truy xuất con (quả/thùng) của một lô */
  async getItems(lotId: number) {
    const lot = await this.db.query("SELECT id, code FROM harvest_lots WHERE id = $1", [lotId]);
    if (lot.rowCount === 0) {
      throw new NotFoundException(`Không tìm thấy lô hàng với ID ${lotId}`);
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
  async generateItems(lotId: number, dto: GenerateItemsDto) {
    const lotRes = await this.db.query<{ id: number; code: string }>(
      "SELECT id, code FROM harvest_lots WHERE id = $1",
      [lotId],
    );
    if (lotRes.rowCount === 0) {
      throw new NotFoundException(`Không tìm thấy lô hàng với ID ${lotId}`);
    }
    const lot = lotRes.rows[0];

    const prefix = dto.itemType === "fruit" ? "Q" : "T";
    const padLen = dto.itemType === "fruit" ? 4 : 3;

    // Tìm số thứ tự lớn nhất hiện tại của loại tem này trong lô
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

    return createdItems;
  }
}
