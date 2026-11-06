import { Controller, Get, Ip, Module, Param, Query, Res, Injectable } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { AuditService } from "../../audit/audit.service";
import { badRequest } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { canSeeCccd, maskCccd } from "../households/households.service";

export const REPORT_TYPES = [
  "households",
  "journal",
  "spray",
  "lab-tests",
  "violations",
  "harvest",
  "training-registrations",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXPORT_ROWS = 10_000;
const EXPORT_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 30;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r\n|]/.test(text) || /^\s+[=+\-@|]/.test(text) ? `'${text}` : text;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export interface ReportFilter {
  from?: string;
  to?: string;
  villageId?: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async exportCsv(type: string, rawQuery: Record<string, unknown>, user: AuthUser, ip?: string): Promise<{ filename: string; csv: string }> {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw badRequest("Loại báo cáo không hợp lệ.");
    }
    const filter = this.parseFilter(rawQuery, user);
    const csv = await this.buildReport(type as ReportType, filter, user);

    await this.audit.write(
      { ip, user },
      { action: "Xuất báo cáo", object: `Báo cáo ${type}`, detail: JSON.stringify(filter) },
    );

    return { filename: `${type}.csv`, csv };
  }

  private parseFilter(raw: Record<string, unknown>, user: AuthUser): ReportFilter {
    const filter: ReportFilter = {};
    if (raw.from !== undefined && raw.from !== "") {
      if (typeof raw.from !== "string" || !ISO_DATE_RE.test(raw.from)) {
        throw badRequest("Tham số from phải có dạng YYYY-MM-DD.");
      }
      filter.from = raw.from;
    }
    if (raw.to !== undefined && raw.to !== "") {
      if (typeof raw.to !== "string" || !ISO_DATE_RE.test(raw.to)) {
        throw badRequest("Tham số to phải có dạng YYYY-MM-DD.");
      }
      filter.to = raw.to;
    }
    if (user.role === "village_officer") {
      filter.villageId = user.villageId ?? -1;
    } else if (raw.villageId !== undefined && raw.villageId !== "") {
      const id = Number(raw.villageId);
      if (!Number.isInteger(id) || id <= 0) throw badRequest("Tham số villageId không hợp lệ.");
      filter.villageId = id;
    }
    return filter;
  }

  private async buildReport(type: ReportType, filter: ReportFilter, user: AuthUser): Promise<string> {
    switch (type) {
      case "households": {
        const params: unknown[] = [];
        const conds: string[] = [];
        if (filter.villageId) {
          params.push(filter.villageId);
          conds.push(`h.village_id = $${params.length}`);
        }
        const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
        const { rows } = await this.db.query(
          `SELECT h.code, h.name, h.cccd, h.phone, v.name AS village_name,
                  h.plot_count, h.area_ha, h.status
           FROM households h
           JOIN villages v ON v.id = h.village_id
           ${where}
           ORDER BY h.id
           LIMIT ${MAX_EXPORT_ROWS}`,
          params,
        );
        const fullCccd = canSeeCccd(user);
        return toCsv(
          ["Mã hộ", "Tên chủ hộ", "CCCD", "Điện thoại", "Thôn", "Số thửa", "Diện tích (ha)", "Trạng thái"],
          rows.map((r) => [
            r.code,
            r.name,
            fullCccd ? r.cccd : maskCccd(r.cccd),
            r.phone,
            r.village_name,
            r.plot_count,
            r.area_ha,
            r.status,
          ]),
        );
      }

      case "journal": {
        const { where, params } = this.dateVillageWhere("j.entry_on", "h.village_id", filter);
        const { rows } = await this.db.query(
          `SELECT j.entry_on, h.code AS household_code, h.name AS household_name,
                  v.name AS village_name, j.plot_code, j.activity, j.detail, j.recorder
           FROM journal_entries j
           JOIN households h ON h.id = j.household_id
           JOIN villages v ON v.id = h.village_id
           ${where}
           ORDER BY j.entry_on DESC, j.id DESC
           LIMIT ${MAX_EXPORT_ROWS}`,
          params,
        );
        return toCsv(
          ["Ngày ghi", "Mã hộ", "Hộ nông dân", "Thôn", "Mã thửa", "Hoạt động", "Chi tiết", "Người ghi"],
          rows.map((r) => [
            r.entry_on,
            r.household_code,
            r.household_name,
            r.village_name,
            r.plot_code,
            r.activity,
            r.detail,
            r.recorder,
          ]),
        );
      }

      case "spray": {
        const { where, params } = this.dateVillageWhere("s.sprayed_on", "h.village_id", filter);
        const { rows } = await this.db.query(
          `SELECT s.sprayed_on, h.code AS household_code, h.name AS household_name,
                  v.name AS village_name, s.plot_code, p.name AS pesticide_name,
                  p.active_ingredient, s.dose, s.area_ha, s.isolation_days, s.mrl_status
           FROM spray_records s
           JOIN households h ON h.id = s.household_id
           JOIN villages v ON v.id = h.village_id
           JOIN pesticides p ON p.id = s.pesticide_id
           ${where}
           ORDER BY s.sprayed_on DESC, s.id DESC
           LIMIT ${MAX_EXPORT_ROWS}`,
          params,
        );
        return toCsv(
          [
            "Ngày phun",
            "Mã hộ",
            "Hộ nông dân",
            "Thôn",
            "Mã thửa",
            "Tên thuốc BVTV",
            "Hoạt chất",
            "Liều lượng",
            "Diện tích (ha)",
            "Cách ly (ngày)",
            "Kết quả MRL",
          ],
          rows.map((r) => [
            r.sprayed_on,
            r.household_code,
            r.household_name,
            r.village_name,
            r.plot_code,
            r.pesticide_name,
            r.active_ingredient,
            r.dose,
            r.area_ha,
            r.isolation_days,
            r.mrl_status,
          ]),
        );
      }

      case "lab-tests": {
        const { where, params } = this.dateVillageWhere("lt.sampled_on", "h.village_id", filter);
        const { rows } = await this.db.query(
          `SELECT lt.code, lt.sampled_on, h.code AS household_code, h.name AS household_name,
                  v.name AS village_name, lt.plot_code, lt.cd_mg_kg, lt.yellow_o_positive,
                  lt.residue_mg_kg, lt.chlorpyrifos_mg_kg, lt.result, lt.lab
           FROM lab_tests lt
           JOIN households h ON h.id = lt.household_id
           JOIN villages v ON v.id = h.village_id
           ${where}
           ORDER BY lt.sampled_on DESC, lt.id DESC
           LIMIT ${MAX_EXPORT_ROWS}`,
          params,
        );
        return toCsv(
          [
            "Mã mẫu",
            "Ngày lấy mẫu",
            "Mã hộ",
            "Hộ nông dân",
            "Thôn",
            "Mã thửa",
            "Cadimi (mg/kg)",
            "Vàng O",
            "Dư lượng (mg/kg)",
            "Chlorpyrifos (mg/kg)",
            "Kết quả",
            "Đơn vị kiểm nghiệm",
          ],
          rows.map((r) => [
            r.code,
            r.sampled_on,
            r.household_code,
            r.household_name,
            r.village_name,
            r.plot_code,
            r.cd_mg_kg,
            r.yellow_o_positive ? "Dương tính" : "Âm tính",
            r.residue_mg_kg,
            r.chlorpyrifos_mg_kg ?? "KPH",
            r.result,
            r.lab,
          ]),
        );
      }

      case "violations": {
        const { where, params } = this.dateVillageWhere("vl.detected_on", "h.village_id", filter);
        const { rows } = await this.db.query(
          `SELECT vl.id, vl.detected_on, vl.severity, vl.title, vl.household_label,
                  vl.plot_code, vl.status, vl.farmer_response, vl.resolved_on, vl.resolution_notes
           FROM violations vl
           LEFT JOIN households h ON h.id = vl.household_id
           ${where}
           ORDER BY vl.detected_on DESC, vl.id DESC
           LIMIT ${MAX_EXPORT_ROWS}`,
          params,
        );
        return toCsv(
          [
            "Mã",
            "Ngày phát hiện",
            "Mức độ",
            "Tiêu đề",
            "Hộ nông dân",
            "Mã thửa",
            "Trạng thái",
            "Phản hồi hộ dân",
            "Ngày đóng",
            "Ghi chú xử lý",
          ],
          rows.map((r) => [
            r.id,
            r.detected_on,
            r.severity,
            r.title,
            r.household_label,
            r.plot_code,
            r.status,
            r.farmer_response,
            r.resolved_on,
            r.resolution_notes,
          ]),
        );
      }

      case "harvest": {
        const { where, params } = this.dateVillageWhere("hl.harvested_on", null, filter);
        const { rows } = await this.db.query(
          `SELECT hl.code, hl.harvested_on, hl.weight_tons, hl.household_count,
                  hl.buyer, hl.market, hl.packhouse_code, hl.status
           FROM harvest_lots hl
           ${where}
           ORDER BY hl.harvested_on DESC, hl.id DESC
           LIMIT ${MAX_EXPORT_ROWS}`,
          params,
        );
        return toCsv(
          [
            "Mã lô",
            "Ngày thu hoạch",
            "Khối lượng (tấn)",
            "Số hộ đóng góp",
            "Đơn vị thu mua",
            "Thị trường",
            "Mã nhà đóng gói",
            "Trạng thái",
          ],
          rows.map((r) => [
            r.code,
            r.harvested_on,
            r.weight_tons,
            r.household_count,
            r.buyer,
            r.market,
            r.packhouse_code,
            r.status,
          ]),
        );
      }

      case "training-registrations": {
        const { where, params } = this.dateVillageWhere("tc.held_on", "h.village_id", filter);
        const { rows } = await this.db.query(
          `SELECT tc.title, tc.held_on, h.code AS household_code, h.name AS household_name,
                  h.phone, v.name AS village_name, tr.status, tr.registered_at
           FROM training_registrations tr
           JOIN training_courses tc ON tc.id = tr.course_id
           JOIN households h ON h.id = tr.household_id
           JOIN villages v ON v.id = h.village_id
           ${where}
           ORDER BY tc.held_on DESC NULLS LAST, tr.id ASC
           LIMIT ${MAX_EXPORT_ROWS}`,
          params,
        );
        return toCsv(
          ["Khóa tập huấn", "Ngày tổ chức", "Mã hộ", "Hộ nông dân", "Điện thoại", "Thôn", "Trạng thái", "Thời gian đăng ký"],
          rows.map((r) => [
            r.title,
            r.held_on,
            r.household_code,
            r.household_name,
            r.phone,
            r.village_name,
            r.status,
            r.registered_at,
          ]),
        );
      }
    }
  }

  private dateVillageWhere(dateCol: string, villageCol: string | null, filter: ReportFilter) {
    const params: unknown[] = [];
    const conds: string[] = [];
    if (filter.from) {
      params.push(filter.from);
      conds.push(`${dateCol} >= $${params.length}::date`);
    }
    if (filter.to) {
      params.push(filter.to);
      conds.push(`${dateCol} <= $${params.length}::date`);
    }
    if (villageCol && filter.villageId) {
      params.push(filter.villageId);
      conds.push(`${villageCol} = $${params.length}`);
    }
    return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
  }
}

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(":type")
  @Throttle({ default: { limit: EXPORT_LIMIT, ttl: 60_000 } })
  @Authorize("reports", "read")
  async exportReport(
    @Param("type") type: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    const { filename, csv } = await this.reports.exportCsv(type, query, user, ip);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(csv);
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
