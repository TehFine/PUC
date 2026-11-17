import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { can } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { generateQrToken } from "../../common/crypto/qr-token";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned, plotsTableExists } from "../../portal/common/portal-context";
import type {
  CreateFieldAuditPassDto,
  GenerateItemsDto,
  NotifyHarvestPlanDto,
  UpdateEndorsementConfigDto,
  UpdateGrowingZoneStatusDto,
  UpsertContributionDto,
  UpsertPlotQuotaDto,
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

const CUNE_ADMIN_LOCATION = "Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk";
const EAKHAL_ADMIN_LOCATION = "Xã Ea Khăl, Huyện Ea H'Leo, Tỉnh Đắk Lắk";

function normGeoText(val: string): string {
  return val
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ADMIN_LEVEL_PREFIX_RE = /^(?:xa|phuong|thi tran|huyen|quan|thi xa|thanh pho|tp\.?|tinh)\s+/;

function matchesJurisdiction(assignedRaw: string, adminLocations: string[]): boolean {
  const target = normGeoText(assignedRaw);
  if (!target) return false;
  if (target === "*" || target === "toan quoc") return true;

  const targetHasPrefix = ADMIN_LEVEL_PREFIX_RE.test(target);
  const targetStripped = target.replace(ADMIN_LEVEL_PREFIX_RE, "").trim();

  for (const loc of adminLocations) {
    const segments = loc
      .split(",")
      .map((s) => normGeoText(s))
      .filter(Boolean);
    for (const seg of segments) {
      if (seg === target) return true;
      if (!targetHasPrefix) {
        const segStripped = seg.replace(ADMIN_LEVEL_PREFIX_RE, "").trim();
        if (segStripped === targetStripped) return true;
      }
    }
  }
  return false;
}

function resolveParcelAdminLocation(villageName?: string | null, zoneOrPlotCode?: string | null): string {
  const v = (villageName || "").trim();
  const z = (zoneOrPlotCode || "").trim();
  if (/ea\s*kh[aă]l|ea\s*k'?s[oô]/i.test(v) || /^66-PUC-SR0001-/i.test(z)) {
    return EAKHAL_ADMIN_LOCATION;
  }
  return CUNE_ADMIN_LOCATION;
}

function normVillageKey(val?: string | null): string {
  return (val || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isStaffInParcelScope(
  user: AuthUser | undefined,
  row: {
    villageId?: number | null;
    villageName?: string | null;
    zoneCode?: string | null;
    plotCode?: string | null;
  },
  officerVillageName?: string | null,
): boolean {
  if (!user) return true;
  if (user.role === "enterprise") return false;
  if (user.role === "htx_officer" || user.role === "admin") {
    const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
    if (userCoop !== "HTX-CUNE") return false;
  }
  const locations = [resolveParcelAdminLocation(row.villageName, row.zoneCode || row.plotCode)];
  if (user.role === "village_officer") {
    const hasVillage = user.villageId !== null && user.villageId !== undefined;
    const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
    if (!hasVillage && !hasCommune) return false;
    if (hasVillage) {
      if (row.villageId !== null && row.villageId !== undefined) {
        if (Number(row.villageId) !== Number(user.villageId)) return false;
      } else {
        const expectedVillage = normVillageKey(officerVillageName);
        const actualVillage = normVillageKey(row.villageName);
        if (!expectedVillage || !actualVillage || expectedVillage !== actualVillage) {
          return false;
        }
      }
    }
    if (hasCommune && !matchesJurisdiction(user.assignedCommune!, locations)) return false;
    return true;
  }
  if (user.role === "inspector") {
    const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
    if (!matchesJurisdiction(region, locations)) return false;
  }
  if (user.assignedCommune && user.assignedCommune.trim()) {
    if (!matchesJurisdiction(user.assignedCommune, locations)) return false;
  }
  return true;
}

function isStaffInCuneCoopScope(user: AuthUser | undefined, allowEaKhal = false): boolean {
  if (!user) return true;
  if (user.role === "enterprise") return false;
  if (user.role === "htx_officer" || user.role === "admin") {
    const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
    if (userCoop !== "HTX-CUNE") return false;
  }
  const allowedLocations = allowEaKhal ? [CUNE_ADMIN_LOCATION, EAKHAL_ADMIN_LOCATION] : [CUNE_ADMIN_LOCATION];
  if (user.role === "inspector") {
    const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
    if (!matchesJurisdiction(region, allowedLocations)) return false;
  }
  if (user.role === "village_officer") {
    const hasVillage = user.villageId !== null && user.villageId !== undefined;
    const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
    if (!hasVillage && !hasCommune) return false;
  }
  if (user.assignedCommune && user.assignedCommune.trim()) {
    if (!matchesJurisdiction(user.assignedCommune, allowedLocations)) return false;
  }
  return true;
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
        if (user.role === "inspector") {
          const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
          if (!matchesJurisdiction(region, [CUNE_ADMIN_LOCATION])) return "1 = 0";
          if (user.assignedCommune && !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])) return "1 = 0";
          return null;
        }
        if (user.role === "village_officer") {
          const hasVillage = user.villageId !== null && user.villageId !== undefined;
          const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
          if (!hasVillage && !hasCommune) return "1 = 0";
          if (hasCommune && !matchesJurisdiction(user.assignedCommune!, [CUNE_ADMIN_LOCATION])) return "1 = 0";
          if (hasVillage) {
            params.push(Number(user.villageId));
            return `EXISTS (
              SELECT 1 FROM harvest_contributions hc
              JOIN households h ON h.id = hc.household_id
              WHERE hc.lot_id = t.id AND h.village_id = $${params.length}
            )`;
          }
          return null;
        }
        if (user.role === "htx_officer" || user.role === "admin") {
          if (user.assignedCommune && !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])) {
            return "1 = 0";
          }
          params.push((user.coopCode || "HTX-CUNE").trim().toUpperCase());
          return `upper(COALESCE(t.coop_code, 'HTX-CUNE')) = $${params.length}`;
        }
        return null;
      },
    });
  }

  private async resolveOfficerVillageName(user?: AuthUser): Promise<string | null> {
    if (!user || user.role !== "village_officer" || user.villageId === null || user.villageId === undefined) {
      return null;
    }
    const { rows } = await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [user.villageId]);
    return rows[0]?.name ?? null;
  }

  private async assertLotRowInScope(
    row: { id?: number; coop_code?: string | null; enterprise_id?: number | null },
    user?: AuthUser,
    notFoundMsg = "Không tìm thấy lô hàng.",
    queryable: { query: typeof DatabaseService.prototype.query } = this.db,
  ) {
    if (!user) return;
    if (user.role === "enterprise") {
      if (!user.enterpriseId || Number(row.enterprise_id) !== Number(user.enterpriseId)) {
        throw notFound(notFoundMsg);
      }
      return;
    }
    if (user.role === "inspector") {
      const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
      if (!matchesJurisdiction(region, [CUNE_ADMIN_LOCATION])) {
        throw notFound(notFoundMsg);
      }
      if (user.assignedCommune && !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])) {
        throw notFound(notFoundMsg);
      }
      return;
    }
    if (user.role === "village_officer") {
      const hasVillage = user.villageId !== null && user.villageId !== undefined;
      const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
      if (!hasVillage && !hasCommune) {
        throw notFound(notFoundMsg);
      }
      if (hasCommune && !matchesJurisdiction(user.assignedCommune!, [CUNE_ADMIN_LOCATION])) {
        throw notFound(notFoundMsg);
      }
      if (hasVillage) {
        if (!row.id) {
          throw notFound(notFoundMsg);
        }
        const contribCheck = await queryable.query(
          `SELECT 1
           FROM harvest_contributions hc
           JOIN households h ON h.id = hc.household_id
           WHERE hc.lot_id = $1 AND h.village_id = $2
           LIMIT 1`,
          [row.id, Number(user.villageId)],
        );
        if ((contribCheck.rowCount ?? 0) === 0) {
          throw notFound(notFoundMsg);
        }
      }
      return;
    }
    if (user.role === "htx_officer" || user.role === "admin") {
      if (user.assignedCommune && !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])) {
        throw notFound(notFoundMsg);
      }
      const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
      const lotCoop = (row.coop_code || "HTX-CUNE").trim().toUpperCase();
      if (userCoop !== lotCoop) {
        throw notFound(notFoundMsg);
      }
    }
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, false)) {
      throw forbidden("Bạn không có quyền tạo hoặc cập nhật lô thu hoạch ngoài phạm vi đơn vị.");
    }
    let existing:
      | {
          id: number;
          code: string;
          status: string;
          weight_tons: number;
          harvested_on: string;
          enterprise_id: number | null;
          contract_id: number | null;
          grade_a_pct: number | null;
          grade_b_pct: number | null;
          grade_c_pct: number | null;
          coop_code: string | null;
        }
      | undefined;

    if (context.method === "PATCH" && context.id !== undefined) {
      const curRes = await this.db.query<{
        id: number;
        code: string;
        status: string;
        weight_tons: number;
        harvested_on: string;
        enterprise_id: number | null;
        contract_id: number | null;
        grade_a_pct: number | null;
        grade_b_pct: number | null;
        grade_c_pct: number | null;
        coop_code: string | null;
      }>(
        `SELECT id, code, status, weight_tons::float8 AS weight_tons, harvested_on::text AS harvested_on,
                enterprise_id, contract_id,
                grade_a_pct::float8 AS grade_a_pct,
                grade_b_pct::float8 AS grade_b_pct,
                grade_c_pct::float8 AS grade_c_pct,
                coop_code
         FROM harvest_lots
         WHERE id = $1`,
        [context.id],
      );
      existing = curRes.rows[0];
      if (existing) {
        await this.assertLotRowInScope(existing, context.user, `Không tìm thấy lô hàng với ID ${context.id}`);
        if (existing.status === "exported" || existing.status === "delivered") {
          if (input.code !== undefined && String(input.code).trim() !== String(existing.code).trim()) {
            throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không được thay đổi mã lô.");
          }
          if (
            input.weightTons !== undefined &&
            Math.abs(Number(input.weightTons) - Number(existing.weight_tons ?? 0)) > 1e-6
          ) {
            throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không được thay đổi khối lượng lô.");
          }
          if (
            input.harvestedOn !== undefined &&
            String(input.harvestedOn).slice(0, 10) !== String(existing.harvested_on).slice(0, 10)
          ) {
            throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không được thay đổi ngày thu hoạch.");
          }
          const curEnt = existing.enterprise_id !== null ? Number(existing.enterprise_id) : null;
          const nextEnt =
            input.enterpriseId !== undefined
              ? input.enterpriseId !== null
                ? Number(input.enterpriseId)
                : null
              : curEnt;
          if (input.enterpriseId !== undefined && nextEnt !== curEnt) {
            throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không được thay đổi doanh nghiệp liên kết.");
          }
          const curCon = existing.contract_id !== null ? Number(existing.contract_id) : null;
          const nextCon =
            input.contractId !== undefined
              ? input.contractId !== null
                ? Number(input.contractId)
                : null
              : curCon;
          if (input.contractId !== undefined && nextCon !== curCon) {
            throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không được thay đổi hợp đồng liên kết.");
          }
          if (
            input.status !== undefined &&
            (input.status === "sampling" ||
              input.status === "in_transit" ||
              (existing.status === "exported" && input.status === "delivered"))
          ) {
            throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không được hạ trạng thái quay lại khâu trước.");
          }
        }
      }
    }

    const effA =
      input.gradeAPct !== undefined && input.gradeAPct !== null
        ? Number(input.gradeAPct)
        : Number(existing?.grade_a_pct ?? 0);
    const effB =
      input.gradeBPct !== undefined && input.gradeBPct !== null
        ? Number(input.gradeBPct)
        : Number(existing?.grade_b_pct ?? 0);
    const effC =
      input.gradeCPct !== undefined && input.gradeCPct !== null
        ? Number(input.gradeCPct)
        : Number(existing?.grade_c_pct ?? 0);
    if (effA + effB + effC > 100.0001) {
      throw badRequest("Tổng tỷ lệ phân hạng (A, B, C) không được vượt quá 100%.");
    }
    if (input.enterpriseId !== undefined && input.enterpriseId !== null) {
      const ent = await this.db.query("SELECT 1 FROM enterprises WHERE id = $1", [input.enterpriseId]);
      if (ent.rowCount === 0) throw badRequest("Doanh nghiệp liên kết không tồn tại.");
    }

    const effectiveEnterpriseId =
      input.enterpriseId !== undefined
        ? input.enterpriseId !== null
          ? Number(input.enterpriseId)
          : null
        : existing?.enterprise_id !== null && existing?.enterprise_id !== undefined
          ? Number(existing.enterprise_id)
          : null;
    const effectiveContractId =
      input.contractId !== undefined
        ? input.contractId !== null
          ? Number(input.contractId)
          : null
        : existing?.contract_id !== null && existing?.contract_id !== undefined
          ? Number(existing.contract_id)
          : null;

    if (effectiveContractId !== null) {
      const con = await this.db.query<{ id: number; enterprise_id: number | null }>(
        "SELECT id, enterprise_id FROM contracts WHERE id = $1",
        [effectiveContractId],
      );
      if (con.rowCount === 0 || !con.rows[0]) {
        if (input.contractId !== undefined) {
          throw badRequest("Hợp đồng liên kết không tồn tại.");
        }
      } else {
        const conEntId = con.rows[0].enterprise_id !== null ? Number(con.rows[0].enterprise_id) : null;
        if (effectiveEnterpriseId !== null && conEntId !== null && conEntId !== effectiveEnterpriseId) {
          throw badRequest("Hợp đồng bao tiêu không thuộc doanh nghiệp liên kết đã chọn.");
        }
        if (effectiveEnterpriseId === null && conEntId !== null) {
          if (input.enterpriseId === null) {
            throw badRequest("Hợp đồng bao tiêu không thuộc doanh nghiệp liên kết đã chọn.");
          }
          input.enterpriseId = conEntId;
        }
      }
    }
    if (context.method === "POST") {
      input.qrToken = generateQrToken(14);
      input.coopCode = (context.user.coopCode || "HTX-CUNE").trim().toUpperCase();
    }
    return input;
  }

  protected override async guardDelete(id: number, user: AuthUser) {
    const curRes = await this.db.query<{
      id: number;
      status: string;
      coop_code: string | null;
      enterprise_id: number | null;
      items_count: number;
    }>(
      `SELECT id, status, coop_code, enterprise_id,
              (SELECT COUNT(*)::int FROM harvest_items WHERE lot_id = harvest_lots.id) AS items_count
       FROM harvest_lots
       WHERE id = $1`,
      [id],
    );
    const existing = curRes.rows[0];
    if (!existing) return;
    await this.assertLotRowInScope(existing, user, `Không tìm thấy lô hàng với ID ${id}`);
    if (existing.status !== "sampling" || Number(existing.items_count) > 0) {
      throw badRequest("Lô hàng đã phát hành tem hoặc đã xuất kho, không thể xóa.");
    }
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
    await this.assertLotRowInScope(lot.rows[0], user, `Không tìm thấy lô hàng với ID ${lotId}`);

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
    const prefix = dto.itemType === "fruit" ? "Q" : "T";
    const padLen = dto.itemType === "fruit" ? 4 : 3;
    const pucCode = await this.resolveLotPrimaryPucCode(lotId);

    const createdItems: unknown[] = [];
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const lotRes = await client.query<{
        id: number;
        code: string;
        status: string;
        coop_code: string | null;
        enterprise_id: number | null;
      }>(
        "SELECT id, code, status, coop_code, enterprise_id FROM harvest_lots WHERE id = $1 FOR UPDATE",
        [lotId],
      );
      if (lotRes.rowCount === 0 || !lotRes.rows[0]) {
        throw notFound(`Không tìm thấy lô hàng với ID ${lotId}`);
      }
      const lot = lotRes.rows[0];
      await this.assertLotRowInScope(lot, user, `Không tìm thấy lô hàng với ID ${lotId}`, client);
      if (lot.status === "revoked") {
        throw badRequest("Lô hàng đã bị thu hồi, không thể phát hành thêm tem truy xuất.");
      }

      const maxRes = await client.query<{ serial_code: string }>(
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

  async listContributions(lotId: number, user?: AuthUser) {
    const lot = await this.db.query<{ id: number; coop_code: string | null; enterprise_id: number | null }>(
      "SELECT id, coop_code, enterprise_id FROM harvest_lots WHERE id = $1",
      [lotId],
    );
    if (lot.rowCount === 0 || !lot.rows[0]) throw notFound("Không tìm thấy lô hàng.");
    await this.assertLotRowInScope(lot.rows[0], user, "Không tìm thấy lô hàng.");

    const hasPlots = await plotsTableExists(this.db);
    const params: unknown[] = [lotId];
    let villageWhere = "";
    if (user?.role === "village_officer") {
      params.push(user.villageId ?? -1);
      villageWhere = `AND h.village_id = $${params.length}`;
    }

    const sql = hasPlots
      ? `SELECT hc.id, hc.lot_id, hc.household_id, NULLIF(hc.plot_code, '') AS plot_code,
                p.zone_code, p.variety, p.status AS plot_status,
                h.code AS household_code, h.name AS household_name,
                v.name AS village_name, h.phone, hc.weight_kg::float8 AS weight_kg, hc.created_at
         FROM harvest_contributions hc
         JOIN households h ON h.id = hc.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p ON hc.plot_code <> '' AND upper(p.code) = upper(hc.plot_code) AND p.household_id = hc.household_id
         WHERE hc.lot_id = $1 ${villageWhere}
         ORDER BY hc.weight_kg DESC, hc.id ASC`
      : `SELECT hc.id, hc.lot_id, hc.household_id, NULLIF(hc.plot_code, '') AS plot_code,
                NULL::text AS zone_code, NULL::text AS variety, NULL::text AS plot_status,
                h.code AS household_code, h.name AS household_name,
                v.name AS village_name, h.phone, hc.weight_kg::float8 AS weight_kg, hc.created_at
         FROM harvest_contributions hc
         JOIN households h ON h.id = hc.household_id
         JOIN villages v ON v.id = h.village_id
         WHERE hc.lot_id = $1 ${villageWhere}
         ORDER BY hc.weight_kg DESC, hc.id ASC`;

    const { rows } = await this.db.query(sql, params);
    return { data: camelRows(rows) };
  }

  async upsertContribution(lotId: number, dto: UpsertContributionDto, user: AuthUser, ip?: string) {
    const hasPlots = await plotsTableExists(this.db);
    let preCheckedPlotCode = "";
    if (dto.plotCode && dto.plotCode.trim()) {
      preCheckedPlotCode = (await assertPlotOwned(this.db, dto.householdId, dto.plotCode)).trim().toUpperCase();
    }

    let savedId = 0;
    let resolvedPlotCode = preCheckedPlotCode;
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      const lot = await client.query<{
        id: number;
        harvested_on: string;
        status: string;
        coop_code: string | null;
        enterprise_id: number | null;
        created_at: Date | string;
      }>(
        `SELECT id, harvested_on::text AS harvested_on, status, coop_code, enterprise_id, created_at
         FROM harvest_lots
         WHERE id = $1
         FOR UPDATE`,
        [lotId],
      );
      if (lot.rowCount === 0 || !lot.rows[0]) throw notFound("Không tìm thấy lô hàng.");
      const lotRow = lot.rows[0];
      await this.assertLotRowInScope(lotRow, user, "Không tìm thấy lô hàng.", client);
      if (lotRow.status === "revoked") {
        throw badRequest("Lô hàng đã thu hồi, không thể thay đổi danh sách đóng góp.");
      }
      const lotHarvestedOn = String(lotRow.harvested_on).slice(0, 10);
      const seasonYear = Number(lotHarvestedOn.slice(0, 4)) || new Date().getFullYear();

      const household = await client.query<{ id: number; status: string; village_id: number }>(
        "SELECT id, status, village_id FROM households WHERE id = $1",
        [dto.householdId],
      );
      if (household.rowCount === 0 || !household.rows[0]) throw badRequest("Hộ nông dân không tồn tại.");
      const hhRow = household.rows[0];
      if (user.role === "village_officer" && Number(hhRow.village_id) !== Number(user.villageId ?? -1)) {
        throw forbidden("Hộ nông dân không thuộc thôn hoặc buôn quản lý của bạn.");
      }
      if (hhRow.status === "violation" || hhRow.status === "pending") {
        throw badRequest("Hộ nông dân đang chờ duyệt hoặc đang có vi phạm chưa khắc phục, không được đưa vào lô thu hoạch.");
      }

      if (resolvedPlotCode) {
        if (hasPlots) {
          const pRow = await client.query<{ status: string }>(
            "SELECT status FROM plots WHERE household_id = $1 AND upper(code) = upper($2) LIMIT 1",
            [dto.householdId, resolvedPlotCode],
          );
          if (pRow.rows[0] && (pRow.rows[0].status === "violation" || pRow.rows[0].status === "pending")) {
            throw badRequest(
              `Thửa "${resolvedPlotCode}" đang chờ duyệt hoặc đang có vi phạm, không được đưa vào lô thu hoạch.`,
            );
          }
        }
      } else if (hasPlots) {
        const autoPlot = await client.query<{ code: string; status: string }>(
          `SELECT code, status FROM plots
           WHERE household_id = $1 AND code IS NOT NULL AND btrim(code) <> ''
           ORDER BY (status = 'approved') DESC, id ASC
           LIMIT 1`,
          [dto.householdId],
        );
        if (autoPlot.rows[0]) {
          if (autoPlot.rows[0].status === "violation" || autoPlot.rows[0].status === "pending") {
            throw badRequest(
              `Thửa "${autoPlot.rows[0].code}" của hộ đang chờ duyệt hoặc đang có vi phạm, không được đưa vào lô thu hoạch.`,
            );
          }
          resolvedPlotCode = autoPlot.rows[0].code.trim().toUpperCase();
        }
      }

      // Dự phòng khi CSDL không có bảng plots hoặc hộ chưa có dòng trong plots: dò từ hạn ngạch thửa và biển QR đầu vườn
      if (!resolvedPlotCode) {
        const fallbackPlot = await client.query<{ plot_code: string }>(
          `SELECT plot_code FROM (
             SELECT plot_code,
                    CASE WHEN season_year = $2 THEN 0 ELSE 1 END AS prio,
                    season_year AS sort_year,
                    id AS sort_id
             FROM plot_season_quotas
             WHERE household_id = $1 AND plot_code IS NOT NULL AND btrim(plot_code) <> ''
             UNION ALL
             SELECT plot_code, 2 AS prio, 0 AS sort_year, 0 AS sort_id
             FROM plot_signboard_tokens
             WHERE household_id = $1 AND plot_code IS NOT NULL AND btrim(plot_code) <> ''
           ) fb
           ORDER BY prio ASC, sort_year DESC, sort_id ASC, plot_code ASC
           LIMIT 1`,
          [dto.householdId, seasonYear],
        );
        if (fallbackPlot.rows[0]?.plot_code) {
          resolvedPlotCode = fallbackPlot.rows[0].plot_code.trim().toUpperCase();
        }
      }

      // Kiểm tra phiếu kiểm nghiệm đã xác thực gần nhất ở cấp hộ và thửa (luôn chạy ngay cả khi resolvedPlotCode === '')
      const labFail = resolvedPlotCode
        ? await client.query<{
            code: string;
            result: string;
            yellow_o_positive: boolean;
            cd_mg_kg: number;
          }>(
            `SELECT code, result, yellow_o_positive, cd_mg_kg::float8 AS cd_mg_kg
             FROM lab_tests
             WHERE household_id = $1
               AND record_status = 'verified'
               AND (
                 plot_code IS NULL
                 OR btrim(plot_code) = ''
                 OR upper(btrim(plot_code)) = upper($2)
               )
             ORDER BY sampled_on DESC, id DESC
             LIMIT 1`,
            [dto.householdId, resolvedPlotCode],
          )
        : await client.query<{
            code: string;
            result: string;
            yellow_o_positive: boolean;
            cd_mg_kg: number;
          }>(
            `SELECT code, result, yellow_o_positive, cd_mg_kg
             FROM (
               SELECT DISTINCT ON (COALESCE(upper(NULLIF(btrim(plot_code), '')), ''))
                      code, result, yellow_o_positive, cd_mg_kg::float8 AS cd_mg_kg, sampled_on, id
               FROM lab_tests
               WHERE household_id = $1
                 AND record_status = 'verified'
               ORDER BY COALESCE(upper(NULLIF(btrim(plot_code), '')), ''), sampled_on DESC, id DESC
             ) latest_per_plot
             WHERE result = 'fail'
                OR yellow_o_positive = true
                OR COALESCE(cd_mg_kg, 0) > 0.05
             ORDER BY sampled_on DESC, id DESC
             LIMIT 1`,
            [dto.householdId],
          );
      if (
        labFail.rows[0] &&
        (labFail.rows[0].result === "fail" ||
          labFail.rows[0].yellow_o_positive === true ||
          Number(labFail.rows[0].cd_mg_kg ?? 0) > 0.05)
      ) {
        throw badRequest(
          `Mẫu kiểm nghiệm gần nhất (${labFail.rows[0].code}) không đạt chuẩn an toàn (Cadimi hoặc Vàng O), hệ thống chặn đưa vào lô thu hoạch.`,
        );
      }

      // 1. Khóa cứng tự động theo thời gian cách ly thuốc BVTV (PHI Lock) trên hộ & thửa nguồn (kể cả khi resolvedPlotCode === '')
      const phiConflict = await client.query<{
        pesticide_name: string;
        safe_from: string;
        pesticide_status: string;
      }>(
        `SELECT p.name AS pesticide_name,
                to_char(s.sprayed_on + s.isolation_days, 'DD/MM/YYYY') AS safe_from,
                p.status AS pesticide_status
         FROM spray_records s
         JOIN pesticides p ON p.id = s.pesticide_id
         WHERE s.household_id = $1
           AND (
             $2 = ''
             OR s.plot_code IS NULL
             OR btrim(s.plot_code) = ''
             OR upper(btrim(s.plot_code)) = upper($2)
           )
           AND s.sprayed_on <= $3::date
           AND (
             (s.isolation_days > 0 AND (s.sprayed_on + s.isolation_days) > $3::date)
             OR (p.status = 'banned' AND s.sprayed_on >= ($3::date - 60))
           )
         ORDER BY (s.sprayed_on + s.isolation_days) DESC, s.id DESC
         LIMIT 1`,
        [dto.householdId, resolvedPlotCode, lotHarvestedOn],
      );
      if (phiConflict.rows[0]) {
        const hit = phiConflict.rows[0];
        const parcelLabel = resolvedPlotCode ? `Thửa "${resolvedPlotCode}"` : `Hộ #${dto.householdId}`;
        if (hit.pesticide_status === "banned") {
          throw badRequest(
            `Khóa an toàn PHI: ${parcelLabel} có ghi nhận sử dụng hoạt chất cấm (${hit.pesticide_name}), hệ thống tự động chặn đưa vào lô thu hoạch xuất khẩu.`,
          );
        }
        throw badRequest(
          `Khóa an toàn PHI: ${parcelLabel} đang trong thời gian cách ly thuốc BVTV (${hit.pesticide_name}), chỉ được phép thu hoạch từ ngày ${hit.safe_from}.`,
        );
      }

      // 2. Khóa cứng cân đối hạn ngạch sản lượng đầu vụ (Mass-Balance Quota Lock) chống trộn hàng ngoài vùng
      if (resolvedPlotCode) {
        const quotaRes = await client.query<{ max_quota_kg: number }>(
          `SELECT max_quota_kg::float8 AS max_quota_kg
           FROM plot_season_quotas
           WHERE season_year = $1 AND upper(plot_code) = upper($2)
           ORDER BY id ASC
           LIMIT 1
           FOR UPDATE`,
          [seasonYear, resolvedPlotCode],
        );
        if (quotaRes.rows[0]) {
          const maxQuotaKg = Number(quotaRes.rows[0].max_quota_kg);
          const usedRes = await client.query<{ used_kg: number }>(
            `SELECT COALESCE(SUM(hc.weight_kg), 0)::float8 AS used_kg
             FROM harvest_contributions hc
             JOIN harvest_lots hl ON hl.id = hc.lot_id
             WHERE EXTRACT(YEAR FROM hl.harvested_on)::int = $1
               AND hl.status <> 'revoked'
               AND (
                 upper(btrim(hc.plot_code)) = upper($2)
                 OR (btrim(hc.plot_code) = '' AND hc.household_id = $4)
               )
               AND NOT (hc.lot_id = $3 AND hc.household_id = $4 AND upper(btrim(hc.plot_code)) = upper($2))`,
            [seasonYear, resolvedPlotCode, lotId, dto.householdId],
          );
          const usedOtherLotsKg = Number(usedRes.rows[0]?.used_kg ?? 0);
          if (usedOtherLotsKg + dto.weightKg - maxQuotaKg > 1e-6) {
            const remainingKg = Math.max(0, Number((maxQuotaKg - usedOtherLotsKg).toFixed(1)));
            throw badRequest(
              `Vượt hạn ngạch sản lượng thẩm định đầu vụ của thửa "${resolvedPlotCode}" năm ${seasonYear} ` +
                `(Trần tối đa: ${maxQuotaKg.toLocaleString("vi-VN")} kg, đã xuất các lô khác: ${usedOtherLotsKg.toLocaleString("vi-VN")} kg, ` +
                `còn lại: ${remainingKg.toLocaleString("vi-VN")} kg). Hệ thống khóa tự động chống trộn hàng ngoài vùng!`,
            );
          }
        }
      }

      if (lotRow.status === "delivered" || lotRow.status === "exported") {
        const sealedContribution = await client.query<{ id: number }>(
          `SELECT id FROM harvest_contributions
           WHERE lot_id = $1
             AND household_id = $2
             AND upper(plot_code) = upper($3)
             AND (created_at <= now() - interval '24 hours' OR created_at <= $4::timestamptz + interval '1 second')
           LIMIT 1`,
          [lotId, dto.householdId, resolvedPlotCode, new Date(lotRow.created_at).toISOString()],
        );
        if ((sealedContribution.rowCount ?? 0) > 0) {
          throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không thể sửa đổi đóng góp đã niêm phong.");
        }
      }

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO harvest_contributions (lot_id, household_id, plot_code, weight_kg)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lot_id, household_id, plot_code) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
         RETURNING id`,
        [lotId, dto.householdId, resolvedPlotCode, dto.weightKg],
      );
      savedId = rows[0].id;

      await client.query(
        `UPDATE harvest_lots
         SET household_count = (SELECT count(DISTINCT household_id)::int FROM harvest_contributions WHERE lot_id = $1)
         WHERE id = $1`,
        [lotId],
      );

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
      [savedId],
    );
    return camelRow(saved.rows[0]);
  }

  async removeContribution(lotId: number, contributionId: number, user: AuthUser, ip?: string) {
    const lotRes = await this.db.query<{
      id: number;
      status: string;
      coop_code: string | null;
      enterprise_id: number | null;
      created_at: Date | string;
    }>("SELECT id, status, coop_code, enterprise_id, created_at FROM harvest_lots WHERE id = $1", [lotId]);
    if (lotRes.rowCount === 0 || !lotRes.rows[0]) throw notFound("Không tìm thấy lô hàng.");
    await this.assertLotRowInScope(lotRes.rows[0], user, "Không tìm thấy lô hàng.");
    if (lotRes.rows[0].status === "revoked") {
      throw badRequest("Lô hàng đã thu hồi, không thể xóa đóng góp.");
    }
    if (lotRes.rows[0].status === "delivered" || lotRes.rows[0].status === "exported") {
      const sealedCheck = await this.db.query<{ sealed: boolean }>(
        `SELECT (created_at <= now() - interval '24 hours' OR created_at <= $3::timestamptz + interval '1 second') AS sealed
         FROM harvest_contributions
         WHERE id = $1 AND lot_id = $2`,
        [contributionId, lotId, new Date(lotRes.rows[0].created_at).toISOString()],
      );
      if (sealedCheck.rows[0]?.sealed) {
        throw badRequest("Lô hàng đã giao hoặc đã xuất khẩu, không thể xóa đóng góp đã niêm phong.");
      }
    }

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

  /** Lấy danh sách thửa đất nhẹ của một hộ để chọn khi gom lô (4a: Lô và Thửa nguồn). */
  async listHouseholdPlots(householdId: number, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, true)) {
      return { data: [] };
    }
    const hhRes = await this.db.query<{
      id: number;
      code: string;
      village_id: number;
      village_name: string | null;
      area_ha: number;
    }>(
      `SELECT h.id, h.code, h.village_id, v.name AS village_name, h.area_ha::float8 AS area_ha
       FROM households h
       LEFT JOIN villages v ON v.id = h.village_id
       WHERE h.id = $1`,
      [householdId],
    );
    if (hhRes.rowCount === 0 || !hhRes.rows[0]) throw notFound("Không tìm thấy hộ nông dân.");
    const officerVillageName = await this.resolveOfficerVillageName(user);
    if (
      !isStaffInParcelScope(
        user,
        {
          villageId: hhRes.rows[0].village_id,
          villageName: hhRes.rows[0].village_name,
        },
        officerVillageName,
      )
    ) {
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
   * (4a) Truy vết sự cố hai chiều Lô và Thửa nguồn:
   * - Truyền `plotCode`: biết ngay thửa đất (ví dụ mẫu Cd không đạt) đã đóng góp vào những lô thu hoạch nào.
   * - Truyền `lotCode`: truy ngược từ một lô hàng (hoặc mã thùng/token QR) về toàn bộ các thửa nguồn và hộ nông dân.
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
    if (user.role !== "enterprise" && !isStaffInCuneCoopScope(user, true)) {
      throw notFound("Không tìm thấy dữ liệu truy vết trong phạm vi quản lý.");
    }

    const hasPlots = await plotsTableExists(this.db);
    const villageFilter = user.role === "village_officer" ? (user.villageId ?? -1) : null;
    const officerVillageName = await this.resolveOfficerVillageName(user);
    const canReadLabTests = can(user.role, "testing", "read");
    const canSeeDraftLabTests = canReadLabTests && can(user.role, "testing", "update");

    if (cleanPlot) {
      let plotInfo: Record<string, unknown> | null = null;
      let ownerHouseholdId: number | null = null;

      if (hasPlots) {
        const pRes = await this.db.query(
          `SELECT p.code AS plot_code, p.zone_code, p.variety, p.area_ha::float8 AS area_ha, p.status AS plot_status,
                  h.id AS household_id, h.code AS household_code, h.name AS household_name,
                  v.id AS village_id, COALESCE(v.name, p.village) AS village_name, h.status AS household_status
           FROM plots p
           LEFT JOIN households h ON h.id = p.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE upper(p.code) = upper($1)
           LIMIT 1`,
          [cleanPlot],
        );
        if (pRes.rows[0]) {
          if (
            user.role !== "enterprise" &&
            !isStaffInParcelScope(
              user,
              {
                villageId: pRes.rows[0].village_id ? Number(pRes.rows[0].village_id) : null,
                villageName: pRes.rows[0].village_name,
                zoneCode: pRes.rows[0].zone_code,
                plotCode: pRes.rows[0].plot_code,
              },
              officerVillageName,
            )
          ) {
            throw notFound(`Không tìm thấy thửa "${cleanPlot}" trong phạm vi quản lý.`);
          }
          ownerHouseholdId = pRes.rows[0].household_id ? Number(pRes.rows[0].household_id) : null;
          plotInfo = camelRow(pRes.rows[0]);
        }
      }

      if (!plotInfo) {
        const sbRes = await this.db.query(
          `SELECT pst.plot_code, pst.zone_code, pst.variety, pst.area_ha::float8 AS area_ha,
                  'approved'::text AS plot_status,
                  h.id AS household_id, h.code AS household_code, h.name AS household_name,
                  v.id AS village_id, COALESCE(v.name, pst.village_name) AS village_name, h.status AS household_status
           FROM plot_signboard_tokens pst
           LEFT JOIN households h ON h.id = pst.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE upper(pst.plot_code) = upper($1)
           LIMIT 1`,
          [cleanPlot],
        );
        if (sbRes.rows[0]) {
          if (
            user.role !== "enterprise" &&
            !isStaffInParcelScope(
              user,
              {
                villageId: sbRes.rows[0].village_id ? Number(sbRes.rows[0].village_id) : null,
                villageName: sbRes.rows[0].village_name,
                zoneCode: sbRes.rows[0].zone_code,
                plotCode: sbRes.rows[0].plot_code,
              },
              officerVillageName,
            )
          ) {
            throw notFound(`Không tìm thấy thửa "${cleanPlot}" trong phạm vi quản lý.`);
          }
          ownerHouseholdId = sbRes.rows[0].household_id ? Number(sbRes.rows[0].household_id) : null;
          plotInfo = camelRow(sbRes.rows[0]);
        }
      }

      let labRows: Record<string, unknown>[] = [];
      if (canReadLabTests) {
        const labParams: unknown[] = [cleanPlot];
        let labScopeSql = canSeeDraftLabTests ? "" : "AND lt.record_status = 'verified'";
        if (villageFilter !== null) {
          labParams.push(villageFilter);
          labScopeSql += ` AND h.village_id = $${labParams.length}`;
        }
        if (user.role === "enterprise") {
          labParams.push(user.enterpriseId ?? -1);
          labScopeSql += ` AND EXISTS (
            SELECT 1 FROM harvest_contributions hc
            JOIN harvest_lots hl ON hl.id = hc.lot_id
            WHERE hc.household_id = lt.household_id AND hl.enterprise_id = $${labParams.length}
          )`;
        }
        const labsRes = await this.db.query(
          `SELECT lt.code, lt.plot_code, lt.sampled_on, lt.cd_mg_kg::float8 AS cd_mg_kg,
                  lt.yellow_o_positive, lt.residue_mg_kg::float8 AS residue_mg_kg,
                  lt.chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg, lt.result, lt.lab, lt.record_status,
                  h.id AS household_id, h.code AS household_code, h.name AS household_name,
                  v.id AS village_id, v.name AS village_name
           FROM lab_tests lt
           JOIN households h ON h.id = lt.household_id
           JOIN villages v ON v.id = h.village_id
           WHERE upper(lt.plot_code) = upper($1) ${labScopeSql}
           ORDER BY lt.sampled_on DESC, lt.id DESC
           LIMIT 10`,
          labParams,
        );
        labRows = labsRes.rows;

        if (!plotInfo && labRows[0]) {
          const firstLab = labRows[0] as {
            village_id: number;
            village_name: string | null;
            plot_code: string;
            household_id: number;
            household_code: string;
            household_name: string;
          };
          if (
            user.role !== "enterprise" &&
            !isStaffInParcelScope(
              user,
              {
                villageId: Number(firstLab.village_id),
                villageName: firstLab.village_name,
                plotCode: firstLab.plot_code,
              },
              officerVillageName,
            )
          ) {
            throw notFound(`Không tìm thấy thửa "${cleanPlot}" trong phạm vi quản lý.`);
          }
          ownerHouseholdId = Number(firstLab.household_id);
          plotInfo = {
            plotCode: firstLab.plot_code,
            zoneCode: null,
            variety: null,
            areaHa: null,
            plotStatus: "approved",
            householdId: firstLab.household_id,
            householdCode: firstLab.household_code,
            householdName: firstLab.household_name,
            villageName: firstLab.village_name,
          };
        }
      }

      const lotParams: unknown[] = [cleanPlot, ownerHouseholdId];
      let lotScopeSql = "";
      if (villageFilter !== null) {
        lotParams.push(villageFilter);
        lotScopeSql += ` AND h.village_id = $${lotParams.length}`;
      }
      if (user.role === "enterprise") {
        lotParams.push(user.enterpriseId ?? -1);
        lotScopeSql += ` AND hl.enterprise_id = $${lotParams.length}`;
      } else if (user.role === "htx_officer" || user.role === "admin") {
        lotParams.push((user.coopCode || "HTX-CUNE").trim().toUpperCase());
        lotScopeSql += ` AND upper(COALESCE(hl.coop_code, 'HTX-CUNE')) = $${lotParams.length}`;
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
         ) ${lotScopeSql}
         ORDER BY hl.harvested_on DESC, hl.id DESC`,
        lotParams,
      );

      return {
        direction: "plot_to_lots",
        queryCode: cleanPlot,
        plotInfo,
        labTests: canReadLabTests ? camelRows(labRows) : [],
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
              hl.coop_code, hl.enterprise_id,
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
    await this.assertLotRowInScope(lotRow, user, `Không tìm thấy lô hàng hoặc mã thùng "${cleanLot}".`);
    const resolvedLotId = Number(lotRow.id);

    const srcParams: unknown[] = [resolvedLotId];
    let srcVillageSql = "";
    if (villageFilter !== null) {
      srcParams.push(villageFilter);
      srcVillageSql = `AND h.village_id = $${srcParams.length}`;
    }
    const srcLabStatusSql = canSeeDraftLabTests ? "" : "AND lt.record_status = 'verified'";
    const srcLabJoinOn = canReadLabTests ? "true" : "false";

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
         LEFT JOIN plots p_exact ON hc.plot_code <> '' AND upper(p_exact.code) = upper(hc.plot_code) AND p_exact.household_id = hc.household_id
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
             ${srcLabStatusSql}
           ORDER BY lt.sampled_on DESC, lt.id DESC
           LIMIT 1
         ) lt_last ON ${srcLabJoinOn}
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
             ${srcLabStatusSql}
           ORDER BY lt.sampled_on DESC, lt.id DESC
           LIMIT 1
         ) lt_last ON ${srcLabJoinOn}
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
  async listGrowingZones(user?: AuthUser) {
    if (user && user.role !== "enterprise" && !isStaffInCuneCoopScope(user, true)) {
      return { data: [] };
    }
    const { rows } = await this.db.query<{
      code: string;
      name: string;
      commune: string;
      district: string;
      province: string;
      status: string;
      status_note: string | null;
      valid_until: string | null;
      updated_at: string;
    }>(
      `SELECT code, name, commune, district, province, status, status_note, valid_until, updated_at
       FROM growing_zones
       ORDER BY code ASC`,
    );
    const filtered = rows.filter((r) => {
      if (!user || user.role === "enterprise") return true;
      const loc = `${r.commune || ""}, ${r.district || ""}, ${r.province || ""}`;
      if (user.role === "inspector") {
        const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
        if (!matchesJurisdiction(region, [loc])) return false;
      }
      if (user.assignedCommune && user.assignedCommune.trim()) {
        if (!matchesJurisdiction(user.assignedCommune, [loc])) return false;
      }
      return true;
    });
    return { data: camelRows(filtered) };
  }

  async updateGrowingZoneStatus(code: string, dto: UpdateGrowingZoneStatusDto, user: AuthUser, ip?: string) {
    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length > 60) throw badRequest("Mã số vùng trồng không hợp lệ.");
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền cập nhật trạng thái mã số vùng trồng ngoài phạm vi đơn vị.");
    }

    const existingZone = await this.db.query<{ commune: string; district: string; province: string }>(
      "SELECT commune, district, province FROM growing_zones WHERE upper(code) = upper($1) LIMIT 1",
      [cleanCode],
    );
    const zoneLoc = existingZone.rows[0]
      ? `${existingZone.rows[0].commune}, ${existingZone.rows[0].district}, ${existingZone.rows[0].province}`
      : resolveParcelAdminLocation(null, cleanCode);
    if (user.role === "inspector" && !matchesJurisdiction((user.assignedRegion || "Tỉnh Đắk Lắk").trim(), [zoneLoc])) {
      throw forbidden("Mã số vùng trồng không thuộc địa bàn quản lý của bạn.");
    }
    if (user.assignedCommune && user.assignedCommune.trim() && !matchesJurisdiction(user.assignedCommune, [zoneLoc])) {
      throw forbidden("Mã số vùng trồng không thuộc xã quản lý của bạn.");
    }

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
    if (!isStaffInCuneCoopScope(user, true)) {
      return { data: [], total: 0, page: 1, pageSize: 500 };
    }
    const hasPlots =
      (await this.db.query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg")).rows[0]?.reg !== null;

    const villageFilter =
      user.role === "village_officer" && user.villageId !== null && user.villageId !== undefined
        ? Number(user.villageId)
        : null;
    const params: unknown[] = villageFilter !== null ? [villageFilter] : [];
    const whereScope = villageFilter !== null ? "WHERE h.village_id = $1" : "";

    const baseUnitsSql = hasPlots
      ? `SELECT h.id AS household_id,
                h.name AS household_name,
                h.code AS household_code,
                h.village_id,
                v.name AS village_name,
                COALESCE(p.code, h.code) AS plot_code,
                p.zone_code,
                COALESCE(p.variety, 'Đô Na') AS variety,
                COALESCE(p.area_ha, h.area_ha, 0)::float8 AS area_ha
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p ON p.household_id = h.id
         ${whereScope}`
      : `SELECT h.id AS household_id,
                h.name AS household_name,
                h.code AS household_code,
                h.village_id,
                v.name AS village_name,
                h.code AS plot_code,
                NULL::text AS zone_code,
                'Đô Na'::text AS variety,
                COALESCE(h.area_ha, 0)::float8 AS area_ha
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
         ${whereScope}`;

    const { rows } = await this.db.query<{
      household_id: number;
      household_name: string;
      household_code: string;
      village_id: number | null;
      village_name: string | null;
      plot_code: string;
      zone_code: string | null;
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
              u.village_id,
              u.village_name,
              u.plot_code,
              u.zone_code,
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
           AND (
             strpos(COALESCE(n.link, ''), 'plot=' || u.plot_code) > 0
             OR strpos(COALESCE(n.title, ''), u.plot_code) > 0
           )
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT 1
       ) n_last ON true
       ORDER BY (j_stats.journal_count > 0) DESC, u.household_name ASC, u.plot_code ASC`,
      params,
    );

    const officerVillageName = await this.resolveOfficerVillageName(user);
    const scopedRows = rows.filter((r) =>
      isStaffInParcelScope(
        user,
        {
          villageId: r.village_id,
          villageName: r.village_name,
          zoneCode: r.zone_code,
          plotCode: r.plot_code,
        },
        officerVillageName,
      ),
    );

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const computed = scopedRows.map((r) => {
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

    const qNorm = (query.q || "").trim().slice(0, 100).toLowerCase();
    const statusFilter = (query.status || "").trim().slice(0, 40);

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
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền gửi thông báo lịch thu hoạch ngoài phạm vi đơn vị.");
    }
    const hhRes = await this.db.query<{
      id: number;
      name: string;
      code: string;
      village_id: number;
      village_name: string | null;
    }>(
      `SELECT h.id, h.name, h.code, h.village_id, v.name AS village_name
       FROM households h
       LEFT JOIN villages v ON v.id = h.village_id
       WHERE h.id = $1`,
      [dto.householdId],
    );
    if (hhRes.rowCount === 0 || !hhRes.rows[0]) {
      throw notFound("Không tìm thấy hộ nông dân.");
    }
    const hh = hhRes.rows[0];

    let plotCode = dto.plotCode.trim();
    if (plotCode.toUpperCase() !== hh.code.trim().toUpperCase()) {
      const owned = await assertPlotOwned(this.db, dto.householdId, plotCode);
      plotCode = (owned || plotCode).trim();
    }
    const officerVillageName = await this.resolveOfficerVillageName(user);
    if (
      !isStaffInParcelScope(
        user,
        {
          villageId: hh.village_id,
          villageName: hh.village_name,
          plotCode,
        },
        officerVillageName,
      )
    ) {
      throw forbidden("Hộ nông dân hoặc thửa đất không thuộc địa bàn quản lý của bạn.");
    }

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

    const title = `Thông báo lịch thu hoạch dự kiến - Thửa ${plotCode}`;
    const body = `HTX dự kiến thu hoạch thửa ${plotCode} vào ngày ${formattedDate} (tính toán từ nhật ký chăm sóc và thời gian cách ly PHI)${yieldPart}${notePart}.`;
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
  async listTraceAccessLogs(
    params: { lotCode?: string; q?: string; scopeGranted?: string; limit?: number },
    user?: AuthUser,
  ) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (user) {
      if (user.role === "enterprise") {
        if (!user.enterpriseId) return { data: [] };
        values.push(user.enterpriseId);
        conditions.push(
          `EXISTS (
             SELECT 1 FROM harvest_lots hl
             WHERE upper(hl.code) = upper(COALESCE(trace_detail_access_logs.lot_code, ''))
               AND hl.enterprise_id = $${values.length}
           )`,
        );
      } else {
        if (!isStaffInCuneCoopScope(user, true)) {
          return { data: [] };
        }
        if (user.role === "village_officer") {
          if (user.villageId !== null && user.villageId !== undefined) {
            values.push(Number(user.villageId));
            conditions.push(
              `EXISTS (
                 SELECT 1
                 FROM harvest_lots hl
                 JOIN harvest_contributions hc ON hc.lot_id = hl.id
                 JOIN households h ON h.id = hc.household_id
                 WHERE upper(hl.code) = upper(COALESCE(trace_detail_access_logs.lot_code, ''))
                   AND h.village_id = $${values.length}
               )`,
            );
          }
          if (
            user.assignedCommune &&
            user.assignedCommune.trim() &&
            !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])
          ) {
            conditions.push(
              `EXISTS (
                 SELECT 1
                 FROM harvest_lots hl
                 JOIN harvest_contributions hc ON hc.lot_id = hl.id
                 JOIN households h ON h.id = hc.household_id
                 JOIN villages v ON v.id = h.village_id
                 WHERE upper(hl.code) = upper(COALESCE(trace_detail_access_logs.lot_code, ''))
                   AND (v.name ~* 'ea\\s*kh[aă]l|ea\\s*k''?s[oô]' OR hc.plot_code ~* '^66-PUC-SR0001-')
               )`,
            );
          }
        } else if (
          user.assignedCommune &&
          user.assignedCommune.trim() &&
          !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])
        ) {
          return { data: [] };
        }
      }
    }

    if (params.lotCode && params.lotCode.trim()) {
      values.push(params.lotCode.trim().slice(0, 100).toUpperCase());
      conditions.push(`(upper(COALESCE(lot_code, '')) = $${values.length} OR upper(scanned_code) = $${values.length})`);
    }
    if (params.scopeGranted === "true" || params.scopeGranted === "false") {
      values.push(params.scopeGranted === "true");
      conditions.push(`scope_granted = $${values.length}`);
    }
    if (params.q && params.q.trim()) {
      values.push(`%${params.q.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`);
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

  /** Danh sách hạn ngạch sản lượng đầu vụ từng thửa và mức sử dụng thực tế (Mass-Balance). */
  async listPlotQuotas(params: { seasonYear?: number; q?: string }, user: AuthUser) {
    const seasonYear =
      params.seasonYear && Number.isFinite(params.seasonYear) ? Number(params.seasonYear) : new Date().getFullYear();
    if (!isStaffInCuneCoopScope(user, true)) {
      return {
        seasonYear,
        summary: {
          plotCount: 0,
          totalMaxQuotaKg: 0,
          totalUsedKg: 0,
          totalRemainingKg: 0,
          utilizationPct: 0,
        },
        data: [],
      };
    }

    const values: unknown[] = [seasonYear];
    const extraWhere: string[] = [];
    if (user.role === "village_officer" && user.villageId !== null && user.villageId !== undefined) {
      values.push(Number(user.villageId));
      extraWhere.push(`AND h.village_id = $${values.length}`);
    }
    if (params.q && params.q.trim()) {
      values.push(`%${params.q.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`);
      const ref = `$${values.length}`;
      extraWhere.push(`AND (psq.plot_code ILIKE ${ref} OR psq.zone_code ILIKE ${ref} OR h.name ILIKE ${ref} OR h.code ILIKE ${ref})`);
    }

    const { rows } = await this.db.query<{
      id: number;
      season_year: number;
      household_id: number;
      household_code: string;
      household_name: string;
      village_id: number | null;
      village_name: string | null;
      plot_code: string;
      zone_code: string | null;
      area_ha: number;
      tree_count: number;
      max_quota_kg: number;
      used_kg: number;
      remaining_kg: number;
      utilization_pct: number;
      assessed_by: string | null;
      assessed_on: string | null;
      note: string | null;
      plot_qr_token: string | null;
    }>(
      `SELECT psq.id,
              psq.season_year,
              psq.household_id,
              h.code AS household_code,
              h.name AS household_name,
              h.village_id,
              v.name AS village_name,
              psq.plot_code,
              psq.zone_code,
              psq.area_ha::float8 AS area_ha,
              psq.tree_count,
              psq.max_quota_kg::float8 AS max_quota_kg,
              COALESCE(used.used_kg, 0)::float8 AS used_kg,
              GREATEST(0, psq.max_quota_kg - COALESCE(used.used_kg, 0))::float8 AS remaining_kg,
              CASE
                WHEN psq.max_quota_kg > 0
                  THEN ROUND(((COALESCE(used.used_kg, 0) / psq.max_quota_kg) * 100)::numeric, 1)::float8
                ELSE 0
              END AS utilization_pct,
              psq.assessed_by,
              psq.assessed_on::text AS assessed_on,
              psq.note,
              pst.qr_token AS plot_qr_token
       FROM plot_season_quotas psq
       JOIN households h ON h.id = psq.household_id
       LEFT JOIN villages v ON v.id = h.village_id
       LEFT JOIN plot_signboard_tokens pst
         ON upper(pst.plot_code) = upper(psq.plot_code)
        AND (pst.household_id IS NULL OR pst.household_id = psq.household_id)
       LEFT JOIN (
         SELECT upper(COALESCE(NULLIF(btrim(hc.plot_code), ''), psq_fb.plot_code)) AS plot_upper,
                SUM(hc.weight_kg) AS used_kg
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         LEFT JOIN LATERAL (
           SELECT plot_code
           FROM plot_season_quotas q2
           WHERE q2.season_year = $1 AND q2.household_id = hc.household_id
           ORDER BY q2.id ASC
           LIMIT 1
         ) psq_fb ON btrim(hc.plot_code) = ''
         WHERE EXTRACT(YEAR FROM hl.harvested_on)::int = $1
           AND hl.status <> 'revoked'
           AND COALESCE(NULLIF(btrim(hc.plot_code), ''), psq_fb.plot_code) IS NOT NULL
         GROUP BY upper(COALESCE(NULLIF(btrim(hc.plot_code), ''), psq_fb.plot_code))
       ) used ON used.plot_upper = upper(psq.plot_code)
       WHERE psq.season_year = $1
       ${extraWhere.join("\n       ")}
       ORDER BY psq.zone_code ASC, psq.plot_code ASC`,
      values,
    );

    const officerVillageName = await this.resolveOfficerVillageName(user);
    const scopedRows = rows.filter((r) =>
      isStaffInParcelScope(
        user,
        {
          villageId: r.village_id,
          villageName: r.village_name,
          zoneCode: r.zone_code,
          plotCode: r.plot_code,
        },
        officerVillageName,
      ),
    );

    const mapped = camelRows<{
      maxQuotaKg: number;
      usedKg: number;
      remainingKg: number;
    }>(scopedRows);
    const totalMaxQuotaKg = Number(mapped.reduce((s, r) => s + Number(r.maxQuotaKg || 0), 0).toFixed(1));
    const totalUsedKg = Number(mapped.reduce((s, r) => s + Number(r.usedKg || 0), 0).toFixed(1));
    const totalRemainingKg = Number(Math.max(0, totalMaxQuotaKg - totalUsedKg).toFixed(1));

    return {
      seasonYear,
      summary: {
        plotCount: mapped.length,
        totalMaxQuotaKg,
        totalUsedKg,
        totalRemainingKg,
        utilizationPct: totalMaxQuotaKg > 0 ? Number(((totalUsedKg / totalMaxQuotaKg) * 100).toFixed(1)) : 0,
      },
      data: mapped,
    };
  }

  /** Cập nhật hoặc thêm mới hạn ngạch sản lượng thẩm định đầu vụ cho một thửa đất. */
  async upsertPlotQuota(dto: UpsertPlotQuotaDto, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền thẩm định hạn ngạch sản lượng ngoài phạm vi đơn vị.");
    }
    const hhRes = await this.db.query<{
      id: number;
      name: string;
      village_id: number;
      village_name: string | null;
    }>(
      `SELECT h.id, h.name, h.village_id, v.name AS village_name
       FROM households h
       LEFT JOIN villages v ON v.id = h.village_id
       WHERE h.id = $1`,
      [dto.householdId],
    );
    if (!hhRes.rows[0]) throw badRequest("Hộ nông dân không tồn tại.");

    const ownedPlot = await assertPlotOwned(this.db, dto.householdId, dto.plotCode);
    const cleanPlotCode = (ownedPlot || dto.plotCode).trim().toUpperCase();
    const zoneCode = dto.zoneCode && dto.zoneCode.trim() ? dto.zoneCode.trim().toUpperCase() : "VN-DLOR-0086";

    const officerVillageName = await this.resolveOfficerVillageName(user);
    if (
      !isStaffInParcelScope(
        user,
        {
          villageId: hhRes.rows[0].village_id,
          villageName: hhRes.rows[0].village_name,
          zoneCode,
          plotCode: cleanPlotCode,
        },
        officerVillageName,
      )
    ) {
      throw forbidden("Thửa đất không thuộc địa bàn quản lý của bạn.");
    }

    const [conflictQuota, conflictSignboard] = await Promise.all([
      this.db.query(
        "SELECT 1 FROM plot_season_quotas WHERE upper(plot_code) = upper($1) AND household_id <> $2 LIMIT 1",
        [cleanPlotCode, dto.householdId],
      ),
      this.db.query(
        "SELECT 1 FROM plot_signboard_tokens WHERE upper(plot_code) = upper($1) AND household_id IS NOT NULL AND household_id <> $2 LIMIT 1",
        [cleanPlotCode, dto.householdId],
      ),
    ]);
    if (conflictQuota.rowCount || conflictSignboard.rowCount) {
      throw badRequest(
        `Mã thửa "${cleanPlotCode}" đã gắn với hộ nông dân khác, không thể ghi đè hạn ngạch hoặc bảng định danh.`,
      );
    }

    const assessedBy =
      dto.assessedBy && dto.assessedBy.trim() ? dto.assessedBy.trim() : `Tổ Giám sát Kỹ thuật UBND Xã (${user.fullName})`;
    const assessedOn = dto.assessedOn && dto.assessedOn.trim() ? dto.assessedOn.trim() : todayVn();

    const { rows } = await this.db.query(
      `INSERT INTO plot_season_quotas
         (season_year, household_id, plot_code, zone_code, area_ha, tree_count, max_quota_kg, assessed_by, assessed_on, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10)
       ON CONFLICT (season_year, plot_code) DO UPDATE
         SET zone_code = EXCLUDED.zone_code,
             area_ha = EXCLUDED.area_ha,
             tree_count = EXCLUDED.tree_count,
             max_quota_kg = EXCLUDED.max_quota_kg,
             assessed_by = EXCLUDED.assessed_by,
             assessed_on = EXCLUDED.assessed_on,
             note = EXCLUDED.note,
             updated_at = now()
         WHERE plot_season_quotas.household_id = EXCLUDED.household_id
       RETURNING id, season_year, household_id, plot_code, zone_code, area_ha::float8 AS area_ha,
                 tree_count, max_quota_kg::float8 AS max_quota_kg, assessed_by, assessed_on::text AS assessed_on, note`,
      [
        dto.seasonYear,
        dto.householdId,
        cleanPlotCode,
        zoneCode,
        dto.areaHa,
        dto.treeCount,
        dto.maxQuotaKg,
        assessedBy,
        assessedOn,
        dto.note ?? null,
      ],
    );
    if (!rows[0]) {
      throw badRequest(
        `Mã thửa "${cleanPlotCode}" đã gắn với hộ nông dân khác, không thể ghi đè hạn ngạch.`,
      );
    }

    // Đảm bảo thửa này cũng có token QR định danh bảng đầu vườn trong `plot_signboard_tokens`
    await this.db.query(
      `INSERT INTO plot_signboard_tokens (plot_code, household_id, zone_code, area_ha, tree_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (plot_code) DO UPDATE
         SET household_id = EXCLUDED.household_id,
             zone_code = EXCLUDED.zone_code,
             area_ha = EXCLUDED.area_ha,
             tree_count = EXCLUDED.tree_count
         WHERE plot_signboard_tokens.household_id IS NULL
            OR plot_signboard_tokens.household_id = EXCLUDED.household_id`,
      [cleanPlotCode, dto.householdId, zoneCode, dto.areaHa, dto.treeCount],
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Thẩm định hạn ngạch sản lượng thửa",
        object: `Thửa ${cleanPlotCode} (Vụ ${dto.seasonYear})`,
        detail: `${hhRes.rows[0].name} - Trần: ${dto.maxQuotaKg} kg (${dto.areaHa} ha, ${dto.treeCount} cây)`,
      },
    );

    return camelRow(rows[0]);
  }

  /** Danh sách Bảng QR Định Danh Thửa Đất phục vụ in bảng gắn đầu vườn cho xã / HTX. */
  async listPlotSignboards(params: { q?: string }, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, true)) {
      return { data: [] };
    }
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (user.role === "village_officer" && user.villageId !== null && user.villageId !== undefined) {
      values.push(Number(user.villageId));
      conditions.push(`h.village_id = $${values.length}`);
    }
    if (params.q && params.q.trim()) {
      values.push(`%${params.q.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`);
      const ref = `$${values.length}`;
      conditions.push(`(pst.plot_code ILIKE ${ref} OR pst.zone_code ILIKE ${ref} OR COALESCE(h.name, '') ILIKE ${ref})`);
    }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.db.query<{
      plot_code: string;
      qr_token: string;
      household_id: number | null;
      household_code: string | null;
      household_name: string;
      village_id: number | null;
      village_name: string;
      zone_code: string | null;
      variety: string | null;
      planted_year: number | null;
      area_ha: number | null;
      tree_count: number | null;
      max_quota_kg: number | null;
      center_lat: number | null;
      center_lng: number | null;
      geometry_json: string | null;
    }>(
      `SELECT pst.plot_code,
              pst.qr_token,
              pst.household_id,
              h.code AS household_code,
              COALESCE(h.name, 'Hộ thành viên HTX Cư Né') AS household_name,
              h.village_id,
              COALESCE(pst.village_name, v.name, 'Xã Cư Né') AS village_name,
              pst.zone_code,
              pst.variety,
              pst.planted_year,
              pst.area_ha::float8 AS area_ha,
              COALESCE(psq.tree_count, pst.tree_count) AS tree_count,
              psq.max_quota_kg::float8 AS max_quota_kg,
              pst.center_lat::float8 AS center_lat,
              pst.center_lng::float8 AS center_lng,
              pst.geometry_json
       FROM plot_signboard_tokens pst
       LEFT JOIN households h ON h.id = pst.household_id
       LEFT JOIN villages v ON v.id = h.village_id
       LEFT JOIN plot_season_quotas psq
         ON psq.season_year = EXTRACT(YEAR FROM now())::int
        AND upper(psq.plot_code) = upper(pst.plot_code)
        AND (pst.household_id IS NULL OR psq.household_id = pst.household_id)
       ${whereSql}
       ORDER BY pst.zone_code ASC, pst.plot_code ASC`,
      values,
    );

    const officerVillageName = await this.resolveOfficerVillageName(user);
    const scoped = rows.filter((r) =>
      isStaffInParcelScope(
        user,
        {
          villageId: r.village_id,
          villageName: r.village_name,
          zoneCode: r.zone_code,
          plotCode: r.plot_code,
        },
        officerVillageName,
      ),
    );
    return { data: camelRows(scoped) };
  }

  /** Danh sách Thẻ Đoàn Thẩm định Thực địa (Field Audit Passes) - ẩn mã bí mật pass_token. */
  async listFieldAuditPasses(user?: AuthUser) {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return { data: [] };
    }
    const { rows } = await this.db.query<{
      id: number;
      code: string;
      pass_token: string | null;
      delegation_name: string;
      organization: string | null;
      allowed_zone_code: string | null;
      default_lang: string;
      expires_at: string;
      status: string;
      issued_by_name: string | null;
      access_count: number;
      last_accessed_at: string | null;
      note: string | null;
      created_at: string;
      is_valid_now: boolean;
    }>(
      `SELECT id, code, pass_token, delegation_name, organization, allowed_zone_code,
              default_lang, expires_at, status, issued_by_name, access_count, last_accessed_at, note, created_at,
              (status = 'active' AND expires_at > now()) AS is_valid_now
       FROM field_audit_passes
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
    );

    const scoped = rows.filter((r) => {
      if (!user) return true;
      if (
        user.assignedCommune &&
        user.assignedCommune.trim() &&
        !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])
      ) {
        if (!r.allowed_zone_code) return false;
        const zoneLoc = resolveParcelAdminLocation(null, r.allowed_zone_code);
        return matchesJurisdiction(user.assignedCommune, [zoneLoc]);
      }
      return true;
    });

    const maskedData = scoped.map((r) => {
      const rawToken = typeof r.pass_token === "string" ? r.pass_token : "";
      const passTokenMasked =
        rawToken.length >= 8 ? `${rawToken.slice(0, 4)}********${rawToken.slice(-3)}` : rawToken ? "********" : null;
      const { pass_token: _secret, ...safeRow } = r;
      return {
        ...camelRow(safeRow),
        passTokenMasked,
      };
    });

    return { data: maskedData };
  }

  /** Cấp mới Thẻ Đoàn Thẩm định Thực địa có thời hạn (24h - 336h) cho đoàn đối tác / đoàn tỉnh. */
  async createFieldAuditPass(dto: CreateFieldAuditPassDto, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền cấp thẻ đoàn thẩm định ngoài phạm vi đơn vị.");
    }
    const durationHours = dto.durationHours && dto.durationHours > 0 ? dto.durationHours : 48;
    const passToken = generateQrToken(24);
    const year = new Date().getFullYear();
    const randSuffix = generateQrToken(4).toUpperCase();
    const code = `AUDIT-${year}-${randSuffix}`;
    const zoneCode = dto.allowedZoneCode && dto.allowedZoneCode.trim() ? dto.allowedZoneCode.trim().toUpperCase() : null;
    const defaultLang = dto.defaultLang ?? "zh";

    if (user.assignedCommune && user.assignedCommune.trim()) {
      if (!zoneCode && !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])) {
        throw forbidden("Tài khoản cấp xã chỉ được cấp thẻ giới hạn trong mã vùng trồng thuộc xã quản lý.");
      }
      if (zoneCode) {
        const zoneLoc = resolveParcelAdminLocation(null, zoneCode);
        if (!matchesJurisdiction(user.assignedCommune, [zoneLoc])) {
          throw forbidden("Mã vùng trồng không thuộc xã quản lý của bạn.");
        }
      }
    }

    const { rows } = await this.db.query(
      `INSERT INTO field_audit_passes
         (code, pass_token, delegation_name, organization, allowed_zone_code, default_lang, expires_at, status, issued_by_user_id, issued_by_name, note)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7::int || ' hours')::interval, 'active', $8, $9, $10)
       RETURNING id, code, pass_token, delegation_name, organization, allowed_zone_code,
                 default_lang, expires_at, status, issued_by_name, access_count, last_accessed_at, note, created_at,
                 true AS is_valid_now`,
      [
        code,
        passToken,
        dto.delegationName.trim(),
        dto.organization?.trim() || null,
        zoneCode,
        defaultLang,
        durationHours,
        user.id,
        user.fullName,
        dto.note?.trim() || null,
      ],
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Cấp thẻ Đoàn thẩm định thực địa",
        object: code,
        detail: `${dto.delegationName.trim()} - Hiệu lực ${durationHours}h (${zoneCode || "Toàn xã"})`,
      },
    );

    return camelRow(rows[0]);
  }

  /** Thu hồi từ xa Thẻ Đoàn Thẩm định Thực địa. */
  async revokeFieldAuditPass(id: number, user: AuthUser, ip?: string) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền thu hồi thẻ đoàn thẩm định ngoài phạm vi đơn vị.");
    }
    if (
      user.assignedCommune &&
      user.assignedCommune.trim() &&
      !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])
    ) {
      const checkRes = await this.db.query<{ allowed_zone_code: string | null }>(
        "SELECT allowed_zone_code FROM field_audit_passes WHERE id = $1",
        [id],
      );
      if (!checkRes.rows[0]) throw notFound("Không tìm thấy thẻ thẩm định thực địa.");
      const zoneCode = checkRes.rows[0].allowed_zone_code;
      if (!zoneCode || !matchesJurisdiction(user.assignedCommune, [resolveParcelAdminLocation(null, zoneCode)])) {
        throw forbidden("Bạn không có quyền thu hồi thẻ thẩm định thuộc địa bàn khác.");
      }
    }

    const { rows } = await this.db.query<{ id: number; code: string; delegation_name: string }>(
      `UPDATE field_audit_passes
       SET status = 'revoked'
       WHERE id = $1
       RETURNING id, code, delegation_name`,
      [id],
    );
    if (!rows[0]) throw notFound("Không tìm thấy thẻ thẩm định thực địa.");

    await this.audit.write(
      { ip, user },
      {
        action: "Thu hồi thẻ Đoàn thẩm định thực địa",
        object: rows[0].code,
        detail: rows[0].delegation_name,
      },
    );

    return { ok: true, id: rows[0].id, code: rows[0].code, status: "revoked" };
  }

  /** Đọc cấu hình Bảo chứng Chính quyền Tỉnh và UBND Xã cho mô hình điểm cấp xã. */
  async getEndorsementConfig(user?: AuthUser) {
    if (user && user.role !== "enterprise" && !isStaffInCuneCoopScope(user, false)) {
      throw forbidden("Bạn không có quyền truy cập cấu hình bảo chứng ngoài phạm vi đơn vị.");
    }
    const { rows } = await this.db.query(
      `SELECT program_title, directive_no, commune_authority, provincial_authority,
              official_portal_url, official_domain, inspection_unit, updated_at
       FROM commune_endorsement_config
       WHERE id = 1`,
    );
    if (!rows[0]) {
      return {
        programTitle: "Mô hình điểm Truy xuất nguồn gốc Sầu riêng cấp Xã theo chỉ đạo của Tỉnh Đắk Lắk",
        directiveNo: "Đề án Chuyển đổi số Nông nghiệp & Chuẩn hóa Mã số Vùng trồng Xuất khẩu Tỉnh Đắk Lắk",
        communeAuthority: "Ủy ban Nhân dân Xã Cư Né - Huyện Krông Búk",
        provincialAuthority: "Ủy ban Nhân dân Tỉnh Đắk Lắk - Sở Nông nghiệp và Môi trường",
        officialPortalUrl: "https://daklak.gov.vn",
        officialDomain: "truyxuat.cune-krongbuk.gov.vn",
        inspectionUnit: "Tổ Giám sát Cộng đồng Xã Cư Né & Ban Kỹ thuật HTX Nông nghiệp Cư Né",
      };
    }
    return camelRow(rows[0]);
  }

  /** Cập nhật cấu hình Bảo chứng Chính quyền Tỉnh và UBND Xã (chỉ Quản trị viên / Cán bộ HTX trong phạm vi). */
  async updateEndorsementConfig(dto: UpdateEndorsementConfigDto, user: AuthUser, ip?: string) {
    if ((user.role !== "admin" && user.role !== "htx_officer") || !isStaffInCuneCoopScope(user, false)) {
      throw forbidden("Chỉ Quản trị viên hoặc Ban quản trị thuộc đơn vị mới được phép cập nhật thông tin bảo chứng chính thức.");
    }
    if (!/^https:\/\/[^\s<>"'`]+$/i.test(dto.officialPortalUrl.trim())) {
      throw badRequest("Đường dẫn Cổng thông tin chính thức của Tỉnh/Xã phải bắt đầu bằng https:// hợp lệ.");
    }

    const { rows } = await this.db.query(
      `INSERT INTO commune_endorsement_config
         (id, program_title, directive_no, commune_authority, provincial_authority, official_portal_url, official_domain, inspection_unit, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE
         SET program_title = EXCLUDED.program_title,
             directive_no = EXCLUDED.directive_no,
             commune_authority = EXCLUDED.commune_authority,
             provincial_authority = EXCLUDED.provincial_authority,
             official_portal_url = EXCLUDED.official_portal_url,
             official_domain = EXCLUDED.official_domain,
             inspection_unit = EXCLUDED.inspection_unit,
             updated_at = now()
       RETURNING program_title, directive_no, commune_authority, provincial_authority,
                 official_portal_url, official_domain, inspection_unit, updated_at`,
      [
        dto.programTitle.trim(),
        dto.directiveNo.trim(),
        dto.communeAuthority.trim(),
        dto.provincialAuthority.trim(),
        dto.officialPortalUrl.trim(),
        dto.officialDomain.trim(),
        dto.inspectionUnit.trim(),
      ],
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Cập nhật cấu hình bảo chứng Tỉnh & Xã",
        object: "Bảo chứng mô hình điểm cấp xã",
        detail: `${dto.officialDomain.trim()} -> ${dto.officialPortalUrl.trim()}`,
      },
    );

    return camelRow(rows[0]);
  }
}
