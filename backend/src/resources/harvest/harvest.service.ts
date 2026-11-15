import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { generateQrToken } from "../../common/crypto/qr-token";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned, plotsTableExists } from "../../portal/common/portal-context";
import type {
  GenerateItemsDto,
  NotifyHarvestPlanDto,
  UpdateGrowingZoneStatusDto,
  UpsertContributionDto,
} from "./harvest.dto";

function addDaysIso(isoDate: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function formatVnDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function resolveMilestoneOffsetDays(stage: string | null, variety: string | null): number {
  const v = (variety || "").toLowerCase();
  const isRi6 = v.includes("ri6") || v.includes("ri 6");
  const isMusang = v.includes("musang");

  if (stage === "bagging") return isRi6 ? 45 : isMusang ? 50 : 55;
  if (stage === "thinning") return isRi6 ? 75 : isMusang ? 80 : 90;
  if (stage === "pollination") return isRi6 ? 100 : isMusang ? 105 : 120;
  if (stage === "flowering") return isRi6 ? 130 : isMusang ? 135 : 150;
  return 30;
}

@Injectable()
export class HarvestService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "harvest",
      label: "Lô thu hoạch",
      table: "harvest_lots",
      fields: `t.id, t.code, t.variety, t.harvested_on, t.packed_on, t.exported_on,
      t.weight_tons, t.household_count, t.buyer, t.market,
      t.qr_code, t.qr_token, t.coop_code, t.status, t.revoked_reason, t.enterprise_id, e.name AS enterprise_name, t.contract_id, c.code AS contract_code,
      t.packhouse_code, COALESCE(t.packhouse_name, e.name) AS packhouse_name,
      COALESCE(t.packhouse_address, e.address) AS packhouse_address,
      t.phytosanitary_cert_no, t.phytosanitary_issued_on,
      t.grade_a_pct, t.grade_b_pct, t.grade_c_pct, t.avg_brix, t.treatment_method,
      t.transporter, t.vehicle_plate, t.temperature_c, t.departed_at, t.estimated_arrival`,
      from: `harvest_lots t
             LEFT JOIN enterprises e ON e.id = t.enterprise_id
             LEFT JOIN contracts c ON c.id = t.contract_id`,
      orderBy: "t.harvested_on DESC, t.id DESC",
      search: ["t.code", "t.buyer", "t.market", "e.name"],
      filters: { status: "t.status", market: "t.market", enterpriseId: "t.enterprise_id" },
      scope: (user, params) => {
        if (user.role === "enterprise") {
          if (!user.enterpriseId) return "1 = 0";
          params.push(user.enterpriseId);
          return `t.enterprise_id = $${params.length}`;
        }
        if (user.role === "htx_officer" || user.role === "admin") {
          params.push((user.coopCode || "HTX-CUNE").trim().toUpperCase());
          return `upper(COALESCE(t.coop_code, 'HTX-CUNE')) = $${params.length}`;
        }
        return null;
      },
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
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
    if (context.method === "POST") {
      input.qrToken = generateQrToken(14);
    }
    return input;
  }

  private async resolveLotPrimaryPucCode(lotId: number): Promise<string> {
    if (!(await plotsTableExists(this.db))) return "VN-DLOR-0086";
    const res = await this.db.query<{ zone_code: string | null }>(
      `SELECT p.zone_code
       FROM harvest_contributions hc
       JOIN plots p
         ON (hc.plot_code <> '' AND upper(p.code) = upper(hc.plot_code))
         OR (hc.plot_code = '' AND p.household_id = hc.household_id)
       WHERE hc.lot_id = $1 AND p.zone_code IS NOT NULL AND btrim(p.zone_code) <> ''
       ORDER BY (p.status = 'approved') DESC, hc.weight_kg DESC, p.id ASC
       LIMIT 1`,
      [lotId],
    );
    return res.rows[0]?.zone_code?.trim() || "VN-DLOR-0086";
  }

  /** Lấy danh sách tem truy xuất con (quả/thùng) của một lô kèm token ngẫu nhiên chống giả (kiểm tra phạm vi sở hữu lô). */
  async getItems(lotId: number, user?: AuthUser) {
    const lot = await this.db.query<{ id: number; code: string; enterprise_id: number | null; coop_code: string }>(
      "SELECT id, code, enterprise_id, coop_code FROM harvest_lots WHERE id = $1",
      [lotId],
    );
    if (lot.rowCount === 0 || !lot.rows[0]) {
      throw notFound(`Không tìm thấy lô hàng với ID ${lotId}`);
    }
    const row = lot.rows[0];
    if (user?.role === "enterprise") {
      if (!user.enterpriseId || Number(row.enterprise_id) !== Number(user.enterpriseId)) {
        throw notFound(`Không tìm thấy lô hàng với ID ${lotId}`);
      }
    } else if (user && (user.role === "htx_officer" || user.role === "admin")) {
      const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
      if ((row.coop_code || "HTX-CUNE").trim().toUpperCase() !== userCoop) {
        throw notFound(`Không tìm thấy lô hàng với ID ${lotId}`);
      }
    }

    const [pucCode, res] = await Promise.all([
      this.resolveLotPrimaryPucCode(lotId),
      this.db.query(
        `SELECT id, lot_id, item_type, serial_code, qr_token, weight_kg, grade, printed_at, status, created_at
         FROM harvest_items
         WHERE lot_id = $1
         ORDER BY item_type DESC, id ASC`,
        [lotId],
      ),
    ]);
    return camelRows(res.rows).map((row) => ({ ...row, pucCode }));
  }

  /** Tự động sinh hàng loạt dải tem truy xuất nguồn gốc con (quả hoặc thùng) kèm qr_token ngẫu nhiên */
  async generateItems(lotId: number, dto: GenerateItemsDto, user: AuthUser, ip?: string) {
    const lotRes = await this.db.query<{ id: number; code: string }>(
      "SELECT id, code FROM harvest_lots WHERE id = $1",
      [lotId],
    );
    if (lotRes.rowCount === 0) {
      throw notFound(`Không tìm thấy lô hàng với ID ${lotId}`);
    }
    const lot = lotRes.rows[0];
    const pucCode = await this.resolveLotPrimaryPucCode(lotId);

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
        const qrToken = generateQrToken(14);
        const weight = dto.weightKg ?? (dto.itemType === "fruit" ? 3.5 : 18.0);
        const grade = dto.grade ?? "A";

        const insRes = await client.query(
          `INSERT INTO harvest_items (lot_id, item_type, serial_code, qr_token, weight_kg, grade, printed_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, now(), 'active')
           ON CONFLICT (serial_code) DO NOTHING
           RETURNING id, lot_id, item_type, serial_code, qr_token, weight_kg, grade, printed_at, status, created_at`,
          [lotId, dto.itemType, serialCode, qrToken, weight, grade],
        );
        if (insRes.rowCount && insRes.rows[0]) {
          createdItems.push({ ...camelRows(insRes.rows)[0], pucCode });
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

    const hasPlots = await plotsTableExists(this.db);
    const sql = hasPlots
      ? `SELECT hc.id, hc.lot_id, hc.household_id, NULLIF(hc.plot_code, '') AS plot_code,
                p.zone_code, p.variety, p.status AS plot_status,
                h.code AS household_code, h.name AS household_name,
                v.name AS village_name, h.phone, hc.weight_kg::float8 AS weight_kg, hc.created_at
         FROM harvest_contributions hc
         JOIN households h ON h.id = hc.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p ON hc.plot_code <> '' AND upper(p.code) = upper(hc.plot_code)
         WHERE hc.lot_id = $1
         ORDER BY hc.weight_kg DESC, hc.id ASC`
      : `SELECT hc.id, hc.lot_id, hc.household_id, NULLIF(hc.plot_code, '') AS plot_code,
                NULL::text AS zone_code, NULL::text AS variety, NULL::text AS plot_status,
                h.code AS household_code, h.name AS household_name,
                v.name AS village_name, h.phone, hc.weight_kg::float8 AS weight_kg, hc.created_at
         FROM harvest_contributions hc
         JOIN households h ON h.id = hc.household_id
         JOIN villages v ON v.id = h.village_id
         WHERE hc.lot_id = $1
         ORDER BY hc.weight_kg DESC, hc.id ASC`;

    const { rows } = await this.db.query(sql, [lotId]);
    return { data: camelRows(rows) };
  }

  async upsertContribution(lotId: number, dto: UpsertContributionDto, user: AuthUser, ip?: string) {
    const lot = await this.db.query("SELECT 1 FROM harvest_lots WHERE id = $1", [lotId]);
    if (lot.rowCount === 0) throw notFound("Không tìm thấy lô hàng.");

    const household = await this.db.query("SELECT 1 FROM households WHERE id = $1", [dto.householdId]);
    if (household.rowCount === 0) throw badRequest("Hộ nông dân không tồn tại.");

    const hasPlots = await plotsTableExists(this.db);
    let resolvedPlotCode = "";
    if (dto.plotCode && dto.plotCode.trim()) {
      resolvedPlotCode = await assertPlotOwned(this.db, dto.householdId, dto.plotCode);
    } else if (hasPlots) {
      const autoPlot = await this.db.query<{ code: string }>(
        `SELECT code FROM plots
         WHERE household_id = $1 AND code IS NOT NULL AND btrim(code) <> ''
         ORDER BY (status = 'approved') DESC, id ASC
         LIMIT 1`,
        [dto.householdId],
      );
      resolvedPlotCode = autoPlot.rows[0]?.code?.trim() || "";
    }

    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO harvest_contributions (lot_id, household_id, plot_code, weight_kg)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lot_id, household_id, plot_code) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
       RETURNING id`,
      [lotId, dto.householdId, resolvedPlotCode, dto.weightKg],
    );

    await this.db.query(
      `UPDATE harvest_lots
       SET household_count = (SELECT count(DISTINCT household_id)::int FROM harvest_contributions WHERE lot_id = $1)
       WHERE id = $1`,
      [lotId],
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Ghi đóng góp lô thu hoạch",
        object: `${this.config.label} #${lotId}`,
        detail: `Hộ #${dto.householdId}${resolvedPlotCode ? ` (thửa ${resolvedPlotCode})` : ""}: ${dto.weightKg} kg`,
      },
    );

    const saved = await this.db.query(
      `SELECT hc.id, hc.lot_id, hc.household_id, NULLIF(hc.plot_code, '') AS plot_code,
              h.code AS household_code, h.name AS household_name,
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
       SET household_count = (SELECT count(DISTINCT household_id)::int FROM harvest_contributions WHERE lot_id = $1)
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

  /** Lấy danh sách thửa đất nhẹ của một hộ để chọn khi gom lô (4a: Lô ↔ Thửa nguồn). */
  async listHouseholdPlots(householdId: number, user: AuthUser) {
    const hhRes = await this.db.query<{ id: number; code: string; village_id: number; area_ha: number }>(
      "SELECT id, code, village_id, area_ha::float8 AS area_ha FROM households WHERE id = $1",
      [householdId],
    );
    if (hhRes.rowCount === 0) throw notFound("Không tìm thấy hộ nông dân.");
    if (user.role === "village_officer" && hhRes.rows[0].village_id !== user.villageId) {
      return { data: [] };
    }

    if (await plotsTableExists(this.db)) {
      const { rows } = await this.db.query(
        `SELECT code AS plot_code, zone_code, variety, area_ha::float8 AS area_ha, status
         FROM plots
         WHERE household_id = $1
         ORDER BY (status = 'approved') DESC, id ASC`,
        [householdId],
      );
      if (rows.length > 0) return { data: camelRows(rows) };
    }

    const fallback = await this.db.query(
      `SELECT DISTINCT plot_code, NULL::text AS zone_code, NULL::text AS variety, NULL::float8 AS area_ha, 'approved'::text AS status
       FROM (
         SELECT plot_code FROM journal_entries WHERE household_id = $1 AND plot_code IS NOT NULL AND btrim(plot_code) <> ''
         UNION
         SELECT plot_code FROM spray_records WHERE household_id = $1 AND plot_code IS NOT NULL AND btrim(plot_code) <> ''
         UNION
         SELECT plot_code FROM lab_tests WHERE household_id = $1 AND plot_code IS NOT NULL AND btrim(plot_code) <> ''
       ) s
       ORDER BY plot_code ASC`,
      [householdId],
    );
    return { data: camelRows(fallback.rows) };
  }

  /**
   * (4a) Truy vết sự cố hai chiều Lô ↔ Thửa nguồn:
   * - Truyền `plotCode`: biết ngay thửa đất (ví dụ mẫu Cd không đạt) đã đóng góp vào những lô thu hoạch nào.
   * - Truyền `lotCode`: truy ngược từ một lô hàng (hoặc mã thùng/token QR) về toàn bộ các thửa nguồn & hộ nông dân.
   */
  async traceIncident(query: { plotCode?: string; lotCode?: string }, user: AuthUser) {
    const cleanPlot = (query.plotCode || "").trim();
    const cleanLot = (query.lotCode || "").trim();
    if (!cleanPlot && !cleanLot) {
      throw badRequest("Vui lòng nhập mã thửa nguồn (plotCode) hoặc mã lô hàng (lotCode) để truy vết.");
    }
    if ((cleanPlot && cleanPlot.length > 80) || (cleanLot && cleanLot.length > 80)) {
      throw badRequest("Mã tra cứu vượt quá độ dài cho phép.");
    }

    const hasPlots = await plotsTableExists(this.db);
    const villageFilter = user.role === "village_officer" ? (user.villageId ?? -1) : null;

    if (cleanPlot) {
      let plotInfo: Record<string, unknown> | null = null;
      let ownerHouseholdId: number | null = null;

      if (hasPlots) {
        const pRes = await this.db.query(
          `SELECT p.code AS plot_code, p.zone_code, p.variety, p.area_ha::float8 AS area_ha, p.status AS plot_status,
                  h.id AS household_id, h.code AS household_code, h.name AS household_name,
                  v.id AS village_id, v.name AS village_name, h.status AS household_status
           FROM plots p
           LEFT JOIN households h ON h.id = p.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE upper(p.code) = upper($1)
           LIMIT 1`,
          [cleanPlot],
        );
        if (pRes.rows[0]) {
          if (villageFilter !== null && Number(pRes.rows[0].village_id) !== villageFilter) {
            throw notFound(`Không tìm thấy thửa "${cleanPlot}" trong phạm vi quản lý.`);
          }
          ownerHouseholdId = pRes.rows[0].household_id ? Number(pRes.rows[0].household_id) : null;
          plotInfo = camelRow(pRes.rows[0]);
        }
      }

      const labParams: unknown[] = [cleanPlot];
      let labVillageSql = "";
      if (villageFilter !== null) {
        labParams.push(villageFilter);
        labVillageSql = `AND h.village_id = $${labParams.length}`;
      }
      const labsRes = await this.db.query(
        `SELECT lt.code, lt.plot_code, lt.sampled_on, lt.cd_mg_kg::float8 AS cd_mg_kg,
                lt.yellow_o_positive, lt.residue_mg_kg::float8 AS residue_mg_kg,
                lt.chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg, lt.result, lt.lab, lt.record_status,
                h.id AS household_id, h.code AS household_code, h.name AS household_name, v.name AS village_name
         FROM lab_tests lt
         JOIN households h ON h.id = lt.household_id
         JOIN villages v ON v.id = h.village_id
         WHERE upper(lt.plot_code) = upper($1) ${labVillageSql}
         ORDER BY lt.sampled_on DESC, lt.id DESC
         LIMIT 10`,
        labParams,
      );

      if (!plotInfo && labsRes.rows[0]) {
        ownerHouseholdId = Number(labsRes.rows[0].household_id);
        plotInfo = {
          plotCode: labsRes.rows[0].plot_code,
          zoneCode: null,
          variety: null,
          areaHa: null,
          plotStatus: "approved",
          householdId: labsRes.rows[0].household_id,
          householdCode: labsRes.rows[0].household_code,
          householdName: labsRes.rows[0].household_name,
          villageName: labsRes.rows[0].village_name,
        };
      }

      const lotParams: unknown[] = [cleanPlot, ownerHouseholdId];
      let lotVillageSql = "";
      if (villageFilter !== null) {
        lotParams.push(villageFilter);
        lotVillageSql = `AND h.village_id = $${lotParams.length}`;
      }

      const affectedRes = await this.db.query(
        `SELECT hl.id AS lot_id, hl.code AS lot_code, hl.qr_token, hl.variety,
                hl.harvested_on, hl.packed_on, hl.exported_on,
                hl.weight_tons::float8 AS weight_tons, hl.market, hl.status,
                COALESCE(hl.packhouse_code, 'VN-DLPH-0089') AS packhouse_code,
                COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                hc.weight_kg::float8 AS contributed_kg,
                NULLIF(hc.plot_code, '') AS recorded_plot_code,
                h.code AS household_code, h.name AS household_name, v.name AS village_name,
                (SELECT count(*)::int FROM harvest_items hi WHERE hi.lot_id = hl.id AND hi.item_type = 'box') AS box_count,
                (SELECT count(*)::int FROM harvest_items hi WHERE hi.lot_id = hl.id AND hi.item_type = 'fruit') AS fruit_stamp_count
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         JOIN households h ON h.id = hc.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN enterprises e ON e.id = hl.enterprise_id
         WHERE (
           upper(hc.plot_code) = upper($1)
           OR (hc.plot_code = '' AND $2::bigint IS NOT NULL AND hc.household_id = $2)
         ) ${lotVillageSql}
         ORDER BY hl.harvested_on DESC, hl.id DESC`,
        lotParams,
      );

      return {
        direction: "plot_to_lots",
        queryCode: cleanPlot,
        plotInfo,
        labTests: camelRows(labsRes.rows),
        affectedLots: camelRows(affectedRes.rows),
      };
    }

    // Chiều ngược: Lô hàng / Thùng / Token QR -> Danh sách thửa nguồn & hộ nông dân
    let targetLotId: number | null = null;
    const itemLookup = await this.db.query<{ lot_id: number }>(
      `SELECT lot_id FROM harvest_items
       WHERE qr_token = $1 OR upper(serial_code) = upper($1)
       LIMIT 1`,
      [cleanLot],
    );
    if (itemLookup.rows[0]) {
      targetLotId = Number(itemLookup.rows[0].lot_id);
    }

    const lotLookup = await this.db.query(
      `SELECT hl.id, hl.code, hl.qr_token, hl.variety, hl.harvested_on, hl.packed_on, hl.exported_on,
              hl.weight_tons::float8 AS weight_tons, hl.household_count, hl.market, hl.status, hl.revoked_reason,
              COALESCE(hl.packhouse_code, 'VN-DLPH-0089') AS packhouse_code,
              COALESCE(hl.packhouse_name, e.name) AS packhouse_name
       FROM harvest_lots hl
       LEFT JOIN enterprises e ON e.id = hl.enterprise_id
       WHERE ${targetLotId ? "hl.id = $1" : "hl.qr_token = $1 OR upper(hl.code) = upper($1) OR upper(COALESCE(hl.qr_code, '')) = upper($1)"}
       LIMIT 1`,
      [targetLotId ?? cleanLot],
    );

    if (lotLookup.rowCount === 0 || !lotLookup.rows[0]) {
      throw notFound(`Không tìm thấy lô hàng hoặc mã thùng "${cleanLot}".`);
    }
    const lotRow = lotLookup.rows[0];
    const resolvedLotId = Number(lotRow.id);

    const srcParams: unknown[] = [resolvedLotId];
    let srcVillageSql = "";
    if (villageFilter !== null) {
      srcParams.push(villageFilter);
      srcVillageSql = `AND h.village_id = $${srcParams.length}`;
    }

    const srcSql = hasPlots
      ? `SELECT hc.id AS contribution_id, hc.household_id,
                COALESCE(NULLIF(hc.plot_code, ''), p_auto.code) AS plot_code,
                COALESCE(p_exact.zone_code, p_auto.zone_code) AS zone_code,
                COALESCE(p_exact.variety, p_auto.variety) AS variety,
                COALESCE(p_exact.area_ha, p_auto.area_ha, h.area_ha)::float8 AS area_ha,
                COALESCE(p_exact.status, p_auto.status, 'approved') AS plot_status,
                hc.weight_kg::float8 AS weight_kg,
                h.code AS household_code, h.name AS household_name, h.phone, h.status AS household_status,
                v.name AS village_name,
                lt_last.code AS latest_lab_code, lt_last.sampled_on AS latest_lab_on,
                lt_last.cd_mg_kg::float8 AS latest_cd_mg_kg, lt_last.yellow_o_positive AS latest_yellow_o,
                lt_last.residue_mg_kg::float8 AS latest_residue_mg_kg, lt_last.result AS latest_lab_result
         FROM harvest_contributions hc
         JOIN households h ON h.id = hc.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p_exact ON hc.plot_code <> '' AND upper(p_exact.code) = upper(hc.plot_code)
         LEFT JOIN LATERAL (
           SELECT code, zone_code, variety, area_ha, status
           FROM plots p2
           WHERE p2.household_id = hc.household_id
           ORDER BY (p2.status = 'approved') DESC, p2.id ASC
           LIMIT 1
         ) p_auto ON hc.plot_code = ''
         LEFT JOIN LATERAL (
           SELECT lt.code, lt.sampled_on, lt.cd_mg_kg, lt.yellow_o_positive, lt.residue_mg_kg, lt.result
           FROM lab_tests lt
           WHERE lt.household_id = hc.household_id
             AND (hc.plot_code = '' OR upper(lt.plot_code) = upper(hc.plot_code))
           ORDER BY lt.sampled_on DESC, lt.id DESC
           LIMIT 1
         ) lt_last ON true
         WHERE hc.lot_id = $1 ${srcVillageSql}
         ORDER BY hc.weight_kg DESC, hc.id ASC`
      : `SELECT hc.id AS contribution_id, hc.household_id,
                NULLIF(hc.plot_code, '') AS plot_code,
                NULL::text AS zone_code, NULL::text AS variety,
                h.area_ha::float8 AS area_ha, 'approved'::text AS plot_status,
                hc.weight_kg::float8 AS weight_kg,
                h.code AS household_code, h.name AS household_name, h.phone, h.status AS household_status,
                v.name AS village_name,
                lt_last.code AS latest_lab_code, lt_last.sampled_on AS latest_lab_on,
                lt_last.cd_mg_kg::float8 AS latest_cd_mg_kg, lt_last.yellow_o_positive AS latest_yellow_o,
                lt_last.residue_mg_kg::float8 AS latest_residue_mg_kg, lt_last.result AS latest_lab_result
         FROM harvest_contributions hc
         JOIN households h ON h.id = hc.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN LATERAL (
           SELECT lt.code, lt.sampled_on, lt.cd_mg_kg, lt.yellow_o_positive, lt.residue_mg_kg, lt.result
           FROM lab_tests lt
           WHERE lt.household_id = hc.household_id
             AND (hc.plot_code = '' OR upper(lt.plot_code) = upper(hc.plot_code))
           ORDER BY lt.sampled_on DESC, lt.id DESC
           LIMIT 1
         ) lt_last ON true
         WHERE hc.lot_id = $1 ${srcVillageSql}
         ORDER BY hc.weight_kg DESC, hc.id ASC`;

    const sourcesRes = await this.db.query(srcSql, srcParams);

    const sourceParcels = camelRows(sourcesRes.rows);
    return {
      direction: "lot_to_plots",
      queryCode: cleanLot,
      lotInfo: camelRow(lotRow),
      sourceParcels,
      sourceContributions: sourceParcels,
    };
  }

  /** Danh sách và cập nhật trạng thái thời gian thực của Mã số vùng trồng (PUC - 4c). */
  async listGrowingZones() {
    const { rows } = await this.db.query(
      `SELECT code, name, commune, district, province, status, status_note, valid_until, updated_at
       FROM growing_zones
       ORDER BY code ASC`,
    );
    return { data: camelRows(rows) };
  }

  async updateGrowingZoneStatus(code: string, dto: UpdateGrowingZoneStatusDto, user: AuthUser, ip?: string) {
    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length > 60) throw badRequest("Mã số vùng trồng không hợp lệ.");

    const updated = await this.db.query(
      `INSERT INTO growing_zones (code, name, status, status_note)
       VALUES ($1, 'Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né', $2, $3)
       ON CONFLICT (code) DO UPDATE
       SET status = EXCLUDED.status,
           status_note = EXCLUDED.status_note,
           updated_at = now()
       RETURNING code, name, commune, district, province, status, status_note, valid_until, updated_at`,
      [cleanCode, dto.status, dto.statusNote ?? null],
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Cập nhật trạng thái mã vùng trồng",
        object: `PUC ${cleanCode}`,
        detail: `Trạng thái: ${dto.status}${dto.statusNote ? ` - ${dto.statusNote}` : ""}`,
      },
    );

    return camelRow(updated.rows[0]);
  }

  /**
   * Tính toán dự kiến ngày thu hoạch của từng thửa/hộ dựa trên nhật ký chăm sóc (ra hoa, thụ phấn,
   * tỉa quả, bao trái…) kết hợp kiểm tra thời gian cách ly thuốc BVTV (PHI) và trạng thái gửi thông báo.
   */
  async listHarvestPlan(user: AuthUser, query: { q?: string; status?: string } = {}) {
    const hasPlots =
      (await this.db.query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg")).rows[0]?.reg !== null;

    const villageFilter = user.role === "village_officer" ? (user.villageId ?? -1) : null;
    const params: unknown[] = villageFilter !== null ? [villageFilter] : [];
    const whereScope = villageFilter !== null ? "WHERE h.village_id = $1" : "";

    const baseUnitsSql = hasPlots
      ? `SELECT h.id AS household_id,
                h.name AS household_name,
                h.code AS household_code,
                v.name AS village_name,
                COALESCE(p.code, h.code) AS plot_code,
                COALESCE(p.variety, 'Đô Na') AS variety,
                COALESCE(p.area_ha, h.area_ha, 0)::float8 AS area_ha
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p ON p.household_id = h.id
         ${whereScope}`
      : `SELECT h.id AS household_id,
                h.name AS household_name,
                h.code AS household_code,
                v.name AS village_name,
                h.code AS plot_code,
                'Đô Na'::text AS variety,
                COALESCE(h.area_ha, 0)::float8 AS area_ha
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
         ${whereScope}`;

    const { rows } = await this.db.query<{
      household_id: number;
      household_name: string;
      household_code: string;
      village_name: string | null;
      plot_code: string;
      variety: string | null;
      area_ha: number;
      has_account: boolean;
      journal_count: number;
      last_journal_on: string | null;
      last_activity: string | null;
      milestone_stage: string | null;
      milestone_activity: string | null;
      milestone_on: string | null;
      phi_safe_on: string | null;
      last_pesticide: string | null;
      notified_at: string | null;
      notified_body: string | null;
    }>(
      `WITH units AS (${baseUnitsSql})
       SELECT u.household_id,
              u.household_name,
              u.household_code,
              u.village_name,
              u.plot_code,
              u.variety,
              u.area_ha,
              EXISTS (
                SELECT 1 FROM users usr
                WHERE usr.household_id = u.household_id AND usr.status = 'active'
              ) AS has_account,
              COALESCE(j_stats.journal_count, 0)::int AS journal_count,
              j_stats.last_journal_on::text AS last_journal_on,
              j_stats.last_activity,
              j_mile.stage AS milestone_stage,
              j_mile.activity AS milestone_activity,
              j_mile.entry_on::text AS milestone_on,
              s_stats.phi_safe_on::text AS phi_safe_on,
              s_stats.last_pesticide,
              n_last.created_at::text AS notified_at,
              n_last.body AS notified_body
       FROM units u
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS journal_count,
                MAX(je.entry_on) AS last_journal_on,
                (ARRAY_AGG(je.activity ORDER BY je.entry_on DESC, je.id DESC))[1] AS last_activity
         FROM journal_entries je
         WHERE je.household_id = u.household_id
           AND (je.plot_code IS NULL OR je.plot_code = '' OR upper(je.plot_code) = upper(u.plot_code))
       ) j_stats ON true
       LEFT JOIN LATERAL (
         SELECT CASE
                  WHEN lower(je.activity) LIKE '%bao trái%' THEN 'bagging'
                  WHEN lower(je.activity) LIKE '%tỉa quả%' OR lower(je.activity) LIKE '%đậu trái%' THEN 'thinning'
                  WHEN lower(je.activity) LIKE '%thụ phấn%' OR lower(je.activity) LIKE '%xổ nhụy%' THEN 'pollination'
                  WHEN lower(je.activity) LIKE '%ra hoa%' OR lower(je.activity) LIKE '%mắt cua%' THEN 'flowering'
                  ELSE NULL
                END AS stage,
                je.activity,
                je.entry_on
         FROM journal_entries je
         WHERE je.household_id = u.household_id
           AND (je.plot_code IS NULL OR je.plot_code = '' OR upper(je.plot_code) = upper(u.plot_code))
           AND je.entry_on >= current_date - 240
           AND (
             lower(je.activity) LIKE '%bao trái%'
             OR lower(je.activity) LIKE '%tỉa quả%'
             OR lower(je.activity) LIKE '%đậu trái%'
             OR lower(je.activity) LIKE '%thụ phấn%'
             OR lower(je.activity) LIKE '%xổ nhụy%'
             OR lower(je.activity) LIKE '%ra hoa%'
             OR lower(je.activity) LIKE '%mắt cua%'
           )
         ORDER BY CASE
                    WHEN lower(je.activity) LIKE '%bao trái%' THEN 1
                    WHEN lower(je.activity) LIKE '%tỉa quả%' OR lower(je.activity) LIKE '%đậu trái%' THEN 2
                    WHEN lower(je.activity) LIKE '%thụ phấn%' OR lower(je.activity) LIKE '%xổ nhụy%' THEN 3
                    ELSE 4
                  END ASC,
                  je.entry_on DESC,
                  je.id DESC
         LIMIT 1
       ) j_mile ON true
       LEFT JOIN LATERAL (
         SELECT MAX(sr.sprayed_on + sr.isolation_days) AS phi_safe_on,
                (ARRAY_AGG(pes.name ORDER BY (sr.sprayed_on + sr.isolation_days) DESC, sr.id DESC))[1] AS last_pesticide
         FROM spray_records sr
         JOIN pesticides pes ON pes.id = sr.pesticide_id
         WHERE sr.household_id = u.household_id
           AND sr.isolation_days > 0
           AND (sr.plot_code IS NULL OR sr.plot_code = '' OR upper(sr.plot_code) = upper(u.plot_code))
       ) s_stats ON true
       LEFT JOIN LATERAL (
         SELECT n.created_at, n.body
         FROM notifications n
         JOIN users usr ON usr.id = n.user_id
         WHERE usr.household_id = u.household_id
           AND n.kind = 'harvest'
           AND (n.link LIKE '%plot=' || u.plot_code || '%' OR n.title LIKE '%' || u.plot_code || '%')
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT 1
       ) n_last ON true
       ORDER BY (j_stats.journal_count > 0) DESC, u.household_name ASC, u.plot_code ASC`,
      params,
    );

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const computed = rows.map((r) => {
      let computedHarvestOn: string | null = null;
      let calculationBasis = "Chưa có nhật ký chăm sóc";
      let phiAdjusted = false;

      if (r.milestone_stage && r.milestone_on) {
        const offsetDays = resolveMilestoneOffsetDays(r.milestone_stage, r.variety);
        computedHarvestOn = addDaysIso(r.milestone_on, offsetDays);
        calculationBasis = `${r.milestone_activity} (${formatVnDate(r.milestone_on)}) + ${offsetDays} ngày`;
      } else if (r.journal_count > 0 && r.last_journal_on) {
        const candidate = addDaysIso(r.last_journal_on, 30);
        computedHarvestOn = candidate < today ? addDaysIso(today, 14) : candidate;
        calculationBasis = `${r.last_activity || "Nhật ký chăm sóc"} (${formatVnDate(r.last_journal_on)}) - ${r.journal_count} lượt ghi`;
      }

      if (computedHarvestOn && r.phi_safe_on && r.phi_safe_on > computedHarvestOn) {
        computedHarvestOn = r.phi_safe_on;
        phiAdjusted = true;
        calculationBasis += ` - Lùi sau cách ly PHI (${formatVnDate(r.phi_safe_on)})`;
      }

      const inIsolation = Boolean(r.phi_safe_on && r.phi_safe_on > today);
      const estimatedYieldKg = Math.max(500, Math.round((Number(r.area_ha) || 0.5) * 12_000));
      const planStatus: "notified" | "ready" | "missing_journal" = r.notified_at
        ? "notified"
        : computedHarvestOn
          ? "ready"
          : "missing_journal";

      return {
        id: `${r.household_id}-${r.plot_code}`,
        householdId: r.household_id,
        householdName: r.household_name,
        householdCode: r.household_code,
        villageName: r.village_name,
        plotCode: r.plot_code,
        variety: r.variety || "Đô Na",
        areaHa: Number(r.area_ha || 0),
        hasAccount: Boolean(r.has_account),
        journalCount: Number(r.journal_count || 0),
        lastJournalOn: r.last_journal_on,
        lastActivity: r.last_activity,
        milestoneActivity: r.milestone_activity,
        milestoneOn: r.milestone_on,
        phiSafeOn: r.phi_safe_on,
        lastPesticide: r.last_pesticide,
        inIsolation,
        phiAdjusted,
        computedHarvestOn,
        estimatedYieldKg,
        calculationBasis,
        planStatus,
        notifiedAt: r.notified_at,
        notifiedBody: r.notified_body,
      };
    });

    const qNorm = (query.q || "").trim().toLowerCase();
    const statusFilter = (query.status || "").trim();

    const filtered = computed.filter((item) => {
      if (statusFilter && item.planStatus !== statusFilter) return false;
      if (!qNorm) return true;
      const hay = `${item.householdName} ${item.householdCode} ${item.villageName || ""} ${item.plotCode} ${item.variety}`.toLowerCase();
      return hay.includes(qNorm);
    });

    return {
      data: filtered,
      total: filtered.length,
      page: 1,
      pageSize: 500,
    };
  }

  /** Gửi thông báo lịch thu hoạch dự kiến từ HTX đến tài khoản hộ dân. */
  async notifyHarvestPlan(dto: NotifyHarvestPlanDto, user: AuthUser, ip?: string) {
    const plotCode = dto.plotCode.trim();
    const hhRes = await this.db.query<{ id: number; name: string; code: string }>(
      "SELECT id, name, code FROM households WHERE id = $1",
      [dto.householdId],
    );
    if (hhRes.rowCount === 0) {
      throw notFound("Không tìm thấy hộ nông dân.");
    }
    const hh = hhRes.rows[0];

    // Kiểm tra an toàn thời gian cách ly thuốc BVTV (PHI) trước ngày dự kiến thu hoạch
    const phiRes = await this.db.query<{ pesticide_name: string; safe_on: string }>(
      `SELECT p.name AS pesticide_name, (sr.sprayed_on + sr.isolation_days)::text AS safe_on
       FROM spray_records sr
       JOIN pesticides p ON p.id = sr.pesticide_id
       WHERE sr.household_id = $1
         AND sr.isolation_days > 0
         AND (sr.plot_code IS NULL OR sr.plot_code = '' OR upper(sr.plot_code) = upper($2))
         AND sr.sprayed_on <= $3::date
         AND (sr.sprayed_on + sr.isolation_days) > $3::date
       ORDER BY (sr.sprayed_on + sr.isolation_days) DESC
       LIMIT 1`,
      [dto.householdId, plotCode, dto.harvestDate],
    );
    if (phiRes.rowCount && phiRes.rows[0]) {
      const { pesticide_name, safe_on } = phiRes.rows[0];
      throw badRequest(
        `Ngày thu hoạch ${formatVnDate(dto.harvestDate)} nằm trong thời gian cách ly thuốc "${pesticide_name}". Vui lòng chọn từ ngày ${formatVnDate(safe_on)} trở đi.`,
      );
    }

    const formattedDate = formatVnDate(dto.harvestDate);
    const yieldPart =
      dto.estimatedYieldKg && dto.estimatedYieldKg > 0
        ? ` - Sản lượng dự kiến ~${Math.round(dto.estimatedYieldKg).toLocaleString("vi-VN")} kg`
        : "";
    const notePart = dto.note && dto.note.trim() ? ` - Ghi chú: ${dto.note.trim()}` : "";

    const title = `Thông báo lịch thu hoạch dự kiến – Thửa ${plotCode}`;
    const body = `HTX dự kiến thu hoạch thửa ${plotCode} vào ngày ${formattedDate} (tính toán từ nhật ký chăm sóc & thời gian cách ly PHI)${yieldPart}${notePart}.`;
    const link = `/portal?tab=stamps&plot=${encodeURIComponent(plotCode)}`;

    await this.notifications.notifyHousehold(dto.householdId, {
      kind: "harvest",
      title,
      body,
      link,
    });

    await this.audit.write(
      { ip, user },
      {
        action: "Thông báo lịch thu hoạch",
        object: `${hh.name} (${plotCode})`,
        detail: `Ngày dự kiến ${formattedDate}${yieldPart}`,
      },
    );

    return {
      ok: true,
      householdId: dto.householdId,
      plotCode,
      harvestDate: dto.harvestDate,
      title,
      body,
    };
  }

  /** Nhật ký minh bạch mọi lượt truy cập dữ liệu chi tiết QR (ai xem, vai trò, lô nào, thời điểm, kết quả phạm vi). */
  async listTraceAccessLogs(params: { lotCode?: string; q?: string; scopeGranted?: string; limit?: number }) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.lotCode && params.lotCode.trim()) {
      values.push(params.lotCode.trim().toUpperCase());
      conditions.push(`(upper(COALESCE(lot_code, '')) = $${values.length} OR upper(scanned_code) = $${values.length})`);
    }
    if (params.scopeGranted === "true" || params.scopeGranted === "false") {
      values.push(params.scopeGranted === "true");
      conditions.push(`scope_granted = $${values.length}`);
    }
    if (params.q && params.q.trim()) {
      values.push(`%${params.q.trim().replace(/[\\%_]/g, "\\$&")}%`);
      const ref = `$${values.length}`;
      conditions.push(`(full_name ILIKE ${ref} OR username ILIKE ${ref} OR COALESCE(lot_code, '') ILIKE ${ref} OR scanned_code ILIKE ${ref})`);
    }

    const safeLimit = Math.min(200, Math.max(10, Number(params.limit || 60)));
    values.push(safeLimit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await this.db.query(
      `SELECT id, viewed_at, user_id, username, full_name, user_role, viewer_tier,
              scanned_code, lot_code, scope_granted, scope_reason, ip
       FROM trace_detail_access_logs
       ${where}
       ORDER BY viewed_at DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );
    return { data: camelRows(rows) };
  }
}
