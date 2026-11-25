import { Controller, Get, Ip, Module, Param, Query, Res, Injectable } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { isCoopStaffRole } from "../../auth/permissions";
import { AuditService } from "../../audit/audit.service";
import { isStaffInCuneCoopScope, isStaffInParcelScope, villageScope } from "../../common/crud/village-scope";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { hasPublicColumn, hasPublicTable } from "../../common/sql/schema-cache";
import { RateLimitTier } from "../../common/throttler/rate-limit.policy";
import { DatabaseService } from "../../database/database.service";

function maskReportCccd(value: unknown): string {
  if (value === null || value === undefined) return "";
  const clean = String(value).trim();
  if (!clean) return "";
  return `**********${clean.slice(-2)}`;
}

export const REPORT_TYPES = [
  "household-logbook",
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
const PREVIEW_EXPORT_ROWS = 50;
const MAX_EVIDENCE_PHOTOS = 120;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  if (!raw) return "";
  const cleaned = raw.replace(/\r\n/g, "\n").replace(/[\r\u0000]/g, "");
  if (!cleaned) return "";
  const needsPrefix =
    /^\s*[=+\-@\t\r\n|]/.test(raw) || /(?:^|\n)\s*[=+\-@\t|]/.test(cleaned);
  const safe = needsPrefix ? `'${cleaned}` : cleaned;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const REPORT_LABELS_VN: Record<ReportType, string> = {
  "household-logbook": "Sổ nhật ký canh tác hộ dân",
  households: "Báo cáo hộ nông dân",
  journal: "Báo cáo nhật ký canh tác",
  spray: "Báo cáo nhật ký phun thuốc",
  "lab-tests": "Báo cáo kiểm nghiệm",
  violations: "Báo cáo vi phạm",
  harvest: "Báo cáo thu hoạch",
  "training-registrations": "Báo cáo tập huấn",
};

function describeReportFilter(filter: ReportFilter, householdCode?: string | null): string {
  const parts: string[] = [];
  if (householdCode) {
    parts.push(`Hộ ${householdCode}`);
  }
  if (filter.from && filter.to) {
    parts.push(`Từ ${filter.from} đến ${filter.to}`);
  } else if (filter.from) {
    parts.push(`Từ ngày ${filter.from}`);
  } else if (filter.to) {
    parts.push(`Đến ngày ${filter.to}`);
  }
  if (filter.villageId !== undefined) {
    parts.push("Lọc theo địa bàn thôn");
  }
  if (filter.includePhotos && filter.householdId) {
    parts.push(filter.includeInvoices ? "Kèm ảnh thực địa và hóa đơn vật tư" : "Kèm phụ lục ảnh thực địa");
  }
  return parts.length > 0 ? parts.join(", ") : "Toàn bộ phạm vi quản lý";
}

const HOUSEHOLD_STATUS_VN: Record<string, string> = {
  qualified: "Đạt chuẩn",
  improve: "Cần cải thiện",
  pending: "Chờ duyệt",
  violation: "Vi phạm",
  warning: "Cảnh báo",
  revoked: "Thu hồi",
};

const PLOT_STATUS_VN: Record<string, string> = {
  approved: "Đủ điều kiện",
  improve: "Cần cải thiện",
  violation: "Vi phạm",
  pending: "Chờ duyệt",
};

const MRL_STATUS_VN: Record<string, string> = {
  pass: "Đạt",
  exceeded: "Vượt ngưỡng",
  warning: "Cảnh báo",
  fail: "Vượt ngưỡng",
};

const LAB_RESULT_VN: Record<string, string> = {
  pass: "Đạt",
  warning: "Cảnh báo",
  fail: "Không đạt",
};

const VIOLATION_SEVERITY_VN: Record<string, string> = {
  critical: "Nghiêm trọng",
  warning: "Cảnh báo",
  high: "Nghiêm trọng",
  medium: "Trung bình",
  low: "Nhẹ",
};

const VIOLATION_STATUS_VN: Record<string, string> = {
  open: "Đang mở",
  resolved: "Đã khắc phục",
};

const HARVEST_STATUS_VN: Record<string, string> = {
  exported: "Đã xuất khẩu",
  delivered: "Đã giao hàng",
  in_transit: "Đang vận chuyển",
  sampling: "Đang lấy mẫu",
  harvested: "Đã thu hoạch",
  inspecting: "Đang kiểm định",
  allocated: "Đã cấp mã",
};

const TRAINING_REG_STATUS_VN: Record<string, string> = {
  registered: "Đã đăng ký",
  attended: "Có mặt",
  absent: "Vắng mặt",
  cancelled: "Đã hủy",
};

const COMPLIANCE_STATUS_VN: Record<string, string> = {
  compliant: "Tuân thủ quy trình",
  warning: "Cần lưu ý",
  violation: "Sai lệch quy trình",
};

function formatDateVn(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function toIsoDateStr(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s;
}

function parseBoolParam(value: unknown): boolean {
  return value === "1" || value === "true" || value === true;
}

function extractUniqueAttachmentIds(primaryId: unknown, arrayIds: unknown): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const pushOne = (raw: unknown) => {
    if (raw === null || raw === undefined || raw === "") return;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  pushOne(primaryId);
  if (Array.isArray(arrayIds)) {
    for (const item of arrayIds) pushOne(item);
  }
  return out;
}

function formatVerificationLabel(status: unknown, verifiedByName?: unknown): string {
  if (String(status) === "verified") {
    const verifier = typeof verifiedByName === "string" ? verifiedByName.trim() : "";
    return verifier ? `HTX đã xác minh (${verifier})` : "HTX đã xác minh";
  }
  return "Nông hộ tự khai báo";
}

function formatShortVerificationLabel(status: unknown): string {
  return String(status) === "verified" ? "HTX đã xác minh" : "Tự khai báo";
}

function formatGpsStatusLabel(gpsVerified: unknown): string {
  return gpsVerified === true ? "Đã khớp tọa độ GPS tại vườn" : "Chưa gắn tọa độ GPS";
}

function summarizeMediaCounts(
  ids: number[],
  mimeMap: Map<number, string>,
  gpsVerified?: boolean,
): { imageIds: number[]; videoCount: number; summaryText: string } {
  const imageIds: number[] = [];
  let videoCount = 0;
  for (const id of ids) {
    const mime = mimeMap.get(id) ?? "";
    if (mime.startsWith("image/")) {
      imageIds.push(id);
    } else if (mime.startsWith("video/")) {
      videoCount += 1;
    }
  }
  const parts: string[] = [];
  if (imageIds.length > 0) parts.push(`${imageIds.length} ảnh thực địa`);
  if (videoCount > 0) parts.push(`${videoCount} video`);
  if (gpsVerified) parts.push("GPS tại vườn");
  return {
    imageIds,
    videoCount,
    summaryText: parts.length > 0 ? parts.join(", ") : "Chưa đính kèm",
  };
}

export interface ReportHouseholdPlotItem {
  plotCode: string;
  areaHa: number;
  variety: string | null;
  plantedYear: number | null;
  zoneCode: string | null;
  statusLabel: string;
}

export interface ReportHouseholdMeta {
  id: number;
  code: string;
  name: string;
  cccd: string;
  phone: string;
  villageId: number | null;
  villageName: string;
  plotCount: number;
  areaHa: number;
  status: string;
  statusLabel: string;
  pucCode: string;
  zoneName: string;
  zoneAddress: string;
  gaccCode: string | null;
  coopLegalName: string;
  coopAddress: string;
  tracePath: string;
  plots: ReportHouseholdPlotItem[];
}

export interface ReportEvidencePhotoItem {
  refCode: string;
  attachmentId: number;
  url: string;
  mimeType: string;
  category: "field" | "violation_fix" | "invoice";
  categoryLabel: string;
  date: string;
  plotCode: string;
  activityTitle: string;
  detailSummary: string;
  gpsStatusLabel: string;
  verificationLabel: string;
  recorder: string;
}

export interface ReportSummaryStats {
  totalRecords: number;
  verifiedCount: number;
  selfDeclaredCount: number;
  gpsVerifiedCount: number;
  fieldPhotoCount: number;
  videoCount: number;
  invoicePhotoCount: number;
}

export interface ReportDataPayload {
  type: ReportType;
  filename: string;
  headers: string[];
  rows: string[][];
  total: number;
  mode: "summary" | "household_detail";
  householdMeta: ReportHouseholdMeta | null;
  evidencePhotos: ReportEvidencePhotoItem[];
  truncatedPhotoCount: number;
  summaryStats?: ReportSummaryStats;
}

export interface ReportFilter {
  from?: string;
  to?: string;
  villageId?: number;
  householdId?: number;
  includePhotos?: boolean;
  includeInvoices?: boolean;
}

interface InternalBuildResult {
  headers: string[];
  rows: unknown[][];
  evidencePhotos: ReportEvidencePhotoItem[];
  truncatedPhotoCount: number;
  summaryStats?: ReportSummaryStats;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getReportData(
    type: string,
    rawQuery: Record<string, unknown>,
    user: AuthUser,
    ip?: string,
    recordAudit = true,
  ): Promise<ReportDataPayload> {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw badRequest("Loại báo cáo không hợp lệ.");
    }
    const wantUnmaskedAudit = parseBoolParam(rawQuery.audit);
    if (wantUnmaskedAudit && !isCoopStaffRole(user.role)) {
      throw forbidden("Chỉ Quản trị viên hoặc Cán bộ HTX mới có quyền xuất báo cáo kiểm toán đầy đủ CCCD.");
    }
    const wantIncludeInvoices = parseBoolParam(rawQuery.includeInvoices);
    if (wantIncludeInvoices && !isCoopStaffRole(user.role)) {
      throw forbidden("Chỉ Cán bộ hoặc Ban điều hành HTX mới được xuất phụ lục hóa đơn vật tư nội bộ.");
    }

    const filter = this.parseFilter(rawQuery, user);
    const isPreview = parseBoolParam(rawQuery.preview);
    const effectiveUnmaskedAudit = wantUnmaskedAudit && !isPreview;
    let householdMeta: ReportHouseholdMeta | null = null;
    if (filter.householdId !== undefined) {
      householdMeta = await this.loadHouseholdMetaAndAssertScope(
        filter.householdId,
        user,
        effectiveUnmaskedAudit && isCoopStaffRole(user.role),
      );
    }

    const isExplicitExport = recordAudit || wantUnmaskedAudit || parseBoolParam(rawQuery.export);
    const isFullExport = isExplicitExport && !isPreview;
    const rowLimit = isFullExport ? MAX_EXPORT_ROWS : PREVIEW_EXPORT_ROWS;

    // Chỉ tải và biên soạn phụ lục ảnh thực địa khi xuất/xem chi tiết của 1 hộ cụ thể để tránh phình dung lượng báo cáo toàn vùng
    const effectiveFilter: ReportFilter = {
      ...filter,
      includePhotos: Boolean(filter.householdId && filter.includePhotos && !isPreview),
      includeInvoices: Boolean(
        filter.householdId && filter.includePhotos && filter.includeInvoices && !isPreview,
      ),
    };

    const built = await this.buildReportTable(
      type as ReportType,
      effectiveFilter,
      user,
      effectiveUnmaskedAudit,
      rowLimit,
    );

    const reportLabel = REPORT_LABELS_VN[type as ReportType] ?? "Báo cáo tổng hợp";
    const filterSummary = describeReportFilter(filter, householdMeta?.code);

    if (effectiveUnmaskedAudit) {
      await this.audit.write(
        { ip, user },
        {
          action: "Xuất báo cáo kiểm toán",
          object: reportLabel,
          detail: `Bản kiểm toán đầy đủ (${filterSummary})`,
        },
      );
    } else if (isFullExport) {
      await this.audit.write(
        { ip, user },
        { action: "Xuất báo cáo", object: reportLabel, detail: filterSummary },
      );
    } else if (!isPreview) {
      await this.audit.write(
        { ip, user },
        { action: "Xem trước báo cáo", object: reportLabel, detail: filterSummary },
      );
    }

    const total = built.rows.length;
    const exposedRows = isFullExport ? built.rows : built.rows.slice(0, PREVIEW_EXPORT_ROWS);
    const stringRows = exposedRows.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
    );

    const safeFilenameSuffix = householdMeta ? `-${householdMeta.code.toLowerCase()}` : "";

    return {
      type: type as ReportType,
      filename: `${type}${safeFilenameSuffix}.csv`,
      headers: built.headers,
      rows: stringRows,
      total,
      mode: householdMeta ? "household_detail" : "summary",
      householdMeta,
      evidencePhotos: built.evidencePhotos,
      truncatedPhotoCount: built.truncatedPhotoCount,
      summaryStats: built.summaryStats,
    };
  }

  async exportCsv(
    type: string,
    rawQuery: Record<string, unknown>,
    user: AuthUser,
    ip?: string,
  ): Promise<{ filename: string; csv: string }> {
    const data = await this.getReportData(type, rawQuery, user, ip, true);
    return {
      filename: data.filename,
      csv: toCsv(data.headers, data.rows),
    };
  }

  private parseDateOnlyFilter(raw: Record<string, unknown>): Pick<ReportFilter, "from" | "to"> {
    const filter: Pick<ReportFilter, "from" | "to"> = {};
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
    if (filter.from && filter.to && filter.from > filter.to) {
      throw badRequest("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
    }
    return filter;
  }

  private parseFilter(raw: Record<string, unknown>, user: AuthUser): ReportFilter {
    const filter: ReportFilter = {
      ...this.parseDateOnlyFilter(raw),
    };
    if (user.role === "village_officer") {
      if (user.villageId !== null && user.villageId !== undefined) {
        filter.villageId = user.villageId;
      }
    } else if (raw.villageId !== undefined && raw.villageId !== "") {
      const id = Number(raw.villageId);
      if (!Number.isInteger(id) || id <= 0) throw badRequest("Tham số villageId không hợp lệ.");
      filter.villageId = id;
    }
    if (raw.householdId !== undefined && raw.householdId !== "") {
      const hhId = Number(raw.householdId);
      if (!Number.isInteger(hhId) || hhId <= 0) {
        throw badRequest("Tham số householdId không hợp lệ.");
      }
      filter.householdId = hhId;
    }
    filter.includePhotos = parseBoolParam(raw.includePhotos);
    filter.includeInvoices = parseBoolParam(raw.includeInvoices);
    return filter;
  }

  private async loadHouseholdMetaAndAssertScope(
    householdId: number,
    user: AuthUser,
    allowUnmaskedCccd: boolean,
  ): Promise<ReportHouseholdMeta> {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Tài khoản không thuộc phạm vi quản lý báo cáo.");
    }
    const meta = await this.fetchHouseholdMetaById(householdId, allowUnmaskedCccd);
    if (!meta) {
      throw notFound("Không tìm thấy hộ nông dân.");
    }

    let officerVillageName: string | null = null;
    if (user.role === "village_officer" && user.villageId) {
      const vr = await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [
        user.villageId,
      ]);
      officerVillageName = vr.rows[0]?.name ?? null;
    }
    if (
      !isStaffInParcelScope(
        user,
        {
          villageId: meta.villageId,
          villageName: meta.villageName,
          zoneCode: meta.pucCode,
        },
        officerVillageName,
      )
    ) {
      throw forbidden("Hộ nông dân này không thuộc phạm vi quản lý của bạn.");
    }
    return meta;
  }

  private async fetchHouseholdMetaById(
    householdId: number,
    allowUnmaskedCccd: boolean,
  ): Promise<ReportHouseholdMeta | null> {
    const [hasPlots, hasSignboards, hasZones, hasZoneGacc, hasEndorsement] = await Promise.all([
      hasPublicTable(this.db, "plots"),
      hasPublicTable(this.db, "plot_signboard_tokens"),
      hasPublicTable(this.db, "growing_zones"),
      hasPublicColumn(this.db, "growing_zones", "gacc_code"),
      hasPublicTable(this.db, "commune_endorsement_config"),
    ]);

    const hhRes = await this.db.query<{
      id: number;
      code: string;
      name: string;
      cccd: string | null;
      phone: string | null;
      village_id: number | null;
      village_name: string | null;
      plot_count: number;
      area_ha: number;
      status: string;
    }>(
      `SELECT h.id, h.code, h.name, h.cccd, h.phone, h.village_id,
              COALESCE(v.name, 'Chưa phân thôn') AS village_name,
              h.plot_count, h.area_ha::float8 AS area_ha, h.status
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
        WHERE h.id = $1`,
      [householdId],
    );
    if (hhRes.rows.length === 0) return null;
    const hh = hhRes.rows[0];

    type PlotMetaRow = {
      code: string;
      area_ha: number;
      variety: string | null;
      planted_year: number | null;
      zone_code: string | null;
      status: string;
    };

    const [plotsRes, tokenRes, coopRes] = await Promise.all([
      hasPlots
        ? this.db.query<PlotMetaRow>(
            `SELECT p.code, p.area_ha::float8 AS area_ha, p.variety, p.planted_year, p.zone_code, p.status
               FROM plots p
              WHERE p.household_id = $1
              ORDER BY p.code ASC`,
            [householdId],
          )
        : hasSignboards
          ? this.db.query<PlotMetaRow>(
              `SELECT pst.plot_code AS code, pst.area_ha::float8 AS area_ha, pst.variety,
                      pst.planted_year, pst.zone_code, 'approved'::text AS status
                 FROM plot_signboard_tokens pst
                WHERE pst.household_id = $1
                ORDER BY pst.plot_code ASC`,
              [householdId],
            )
          : Promise.resolve({ rows: [] as PlotMetaRow[] }),
      hasSignboards
        ? this.db.query<{ qr_token: string; zone_code: string | null }>(
            `SELECT qr_token, zone_code
               FROM plot_signboard_tokens
              WHERE household_id = $1
              ORDER BY plot_code ASC
              LIMIT 1`,
            [householdId],
          )
        : Promise.resolve({ rows: [] as Array<{ qr_token: string; zone_code: string | null }> }),
      hasEndorsement
        ? this.db.query<{ coop_legal_name: string | null; coop_address: string | null }>(
            `SELECT coop_legal_name, coop_address
               FROM commune_endorsement_config
              ORDER BY id ASC
              LIMIT 1`,
          )
        : Promise.resolve({ rows: [] as Array<{ coop_legal_name: string | null; coop_address: string | null }> }),
    ]);

    const plots: ReportHouseholdPlotItem[] = plotsRes.rows.map((p) => ({
      plotCode: p.code,
      areaHa: Number(p.area_ha ?? 0),
      variety: p.variety ?? null,
      plantedYear: p.planted_year ?? null,
      zoneCode: p.zone_code ?? null,
      statusLabel: PLOT_STATUS_VN[String(p.status)] ?? String(p.status || "Đủ điều kiện"),
    }));

    const codeDerivedZone = hh.code.replace(/-(?:H|T)\d+$/i, "");
    const validDerivedZone =
      codeDerivedZone &&
      codeDerivedZone !== hh.code &&
      /^(?:VN-|66-PUC-)/i.test(codeDerivedZone)
        ? codeDerivedZone
        : null;

    const inferredPucCode =
      plots.find((p) => p.zoneCode && p.zoneCode.trim())?.zoneCode?.trim() ||
      tokenRes.rows[0]?.zone_code?.trim() ||
      validDerivedZone ||
      (/^66-PUC-SR0001-/i.test(hh.code) ? "66-PUC-SR0001-00728" : "VN-DLOR-0086");

    let zoneName = "Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né";
    let gaccCode: string | null = null;
    if (hasZones) {
      const zRes = await this.db.query<{ name: string; gacc_code?: string | null }>(
        `SELECT name${hasZoneGacc ? ", gacc_code" : ""}
           FROM growing_zones
          WHERE upper(btrim(code)) = upper(btrim($1))
          LIMIT 1`,
        [inferredPucCode],
      );
      if (zRes.rows[0]) {
        zoneName = zRes.rows[0].name || zoneName;
        gaccCode = zRes.rows[0].gacc_code ?? null;
      }
    }

    const qrToken = tokenRes.rows[0]?.qr_token?.trim();
    const tracePath = qrToken
      ? `/t/${encodeURIComponent(qrToken)}`
      : `/trace/${encodeURIComponent(hh.code)}`;

    const coopLegalName =
      coopRes.rows[0]?.coop_legal_name?.trim() || "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né";
    const coopAddress =
      coopRes.rows[0]?.coop_address?.trim() || "Xã Krông Búk, Tỉnh Đắk Lắk";
    const isEaKhalZone =
      /^66-PUC-SR0001-/i.test(inferredPucCode) ||
      /ea\s*kh[aă]l|ea\s*k'?s[oô]/i.test(hh.village_name ?? "") ||
      /ea\s*kh[aă]l/i.test(zoneName);
    const zoneAddress = isEaKhalZone ? "Xã Ea Khăl, Huyện Ea H'Leo, Tỉnh Đắk Lắk" : coopAddress;

    return {
      id: Number(hh.id),
      code: hh.code,
      name: hh.name,
      cccd: allowUnmaskedCccd ? String(hh.cccd ?? "").trim() : maskReportCccd(hh.cccd),
      phone: String(hh.phone ?? "").trim(),
      villageId: hh.village_id !== null ? Number(hh.village_id) : null,
      villageName: hh.village_name ?? "Chưa phân thôn",
      plotCount: plots.length > 0 ? plots.length : Number(hh.plot_count ?? 0),
      areaHa: Number(hh.area_ha ?? 0),
      status: hh.status,
      statusLabel: HOUSEHOLD_STATUS_VN[String(hh.status)] ?? hh.status,
      pucCode: inferredPucCode,
      zoneName,
      zoneAddress,
      gaccCode,
      coopLegalName,
      coopAddress,
      tracePath,
      plots,
    };
  }

  private async fetchAttachmentMimeMap(ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (ids.length === 0) return map;
    const unique = Array.from(new Set(ids));
    const { rows } = await this.db.query<{ id: number; mime_type: string }>(
      `SELECT id, mime_type
         FROM attachments
        WHERE id = ANY($1::bigint[])`,
      [unique],
    );
    for (const r of rows) {
      map.set(Number(r.id), String(r.mime_type || ""));
    }
    return map;
  }

  private async buildReportTable(
    type: ReportType,
    filter: ReportFilter,
    user: AuthUser,
    allowUnmaskedCccd = false,
    rowLimit = MAX_EXPORT_ROWS,
  ): Promise<InternalBuildResult> {
    const inCoopScope = isStaffInCuneCoopScope(user, true);

    switch (type) {
      case "household-logbook": {
        if (filter.householdId) {
          return this.buildHouseholdLogbookDetail(filter, rowLimit);
        }
        return this.buildHouseholdLogbookSummary(filter, user, inCoopScope, rowLimit);
      }

      case "households": {
        const params: unknown[] = [];
        const conds: string[] = [];
        if (!inCoopScope) {
          conds.push("1 = 0");
        } else {
          const scoped = villageScope("h.village_id")(user, params);
          if (scoped) conds.push(scoped);
        }
        if (filter.villageId) {
          params.push(filter.villageId);
          conds.push(`h.village_id = $${params.length}`);
        }
        if (filter.householdId) {
          params.push(filter.householdId);
          conds.push(`h.id = $${params.length}`);
        }
        const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
        const fullCccd = inCoopScope && allowUnmaskedCccd && isCoopStaffRole(user.role);
        const cccdSelectExpr = fullCccd
          ? "h.cccd AS cccd"
          : "CASE WHEN h.cccd IS NULL OR btrim(h.cccd) = '' THEN '' ELSE '**********' || right(btrim(h.cccd), 2) END AS cccd";
        const hasSignboards = await hasPublicTable(this.db, "plot_signboard_tokens");
        const tokenJoin = hasSignboards
          ? `LEFT JOIN LATERAL (
               SELECT pst.qr_token
                 FROM plot_signboard_tokens pst
                WHERE pst.household_id = h.id
                ORDER BY pst.plot_code ASC
                LIMIT 1
             ) sb ON true`
          : "";
        const tokenSelect = hasSignboards ? "sb.qr_token" : "NULL::text AS qr_token";
        const { rows } = await this.db.query(
          `SELECT h.code, h.name, ${cccdSelectExpr}, h.phone, COALESCE(v.name, 'Chưa phân thôn') AS village_name,
                  h.plot_count, h.area_ha, h.status, ${tokenSelect}
           FROM households h
           LEFT JOIN villages v ON v.id = h.village_id
           ${tokenJoin}
           ${where}
           ORDER BY h.id
           LIMIT ${rowLimit}`,
          params,
        );
        return {
          headers: [
            "Mã hộ",
            "Tên chủ hộ",
            "CCCD",
            "Điện thoại",
            "Thôn / Tổ",
            "Số thửa",
            "Diện tích (ha)",
            "Trạng thái",
            "Đường dẫn hồ sơ số",
          ],
          rows: rows.map((r) => [
            r.code,
            r.name,
            fullCccd ? r.cccd : maskReportCccd(r.cccd),
            r.phone,
            r.village_name,
            r.plot_count,
            r.area_ha,
            HOUSEHOLD_STATUS_VN[String(r.status)] ?? r.status,
            r.qr_token ? `/t/${String(r.qr_token)}` : `/trace/${String(r.code)}`,
          ]),
          evidencePhotos: [],
          truncatedPhotoCount: 0,
        };
      }

      case "journal": {
        const { where, params } = this.dateVillageWhere(
          "j.entry_on",
          "h.village_id",
          "j.household_id",
          filter,
          user,
        );
        const { rows } = await this.db.query(
          `SELECT j.id, j.entry_on, h.code AS household_code, h.name AS household_name,
                  COALESCE(v.name, 'Chưa phân thôn') AS village_name, j.plot_code, j.activity, j.detail, j.recorder,
                  j.photo_id, j.photo_ids, j.gps_verified,
                  j.verification_status, j.verified_by_name
           FROM journal_entries j
           JOIN households h ON h.id = j.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           ${where}
           ORDER BY ${filter.householdId ? "j.entry_on ASC, j.id ASC" : "j.entry_on DESC, j.id DESC"}
           LIMIT ${rowLimit}`,
          params,
        );

        const allIds: number[] = [];
        const perRowIds = rows.map((r) => {
          const ids = extractUniqueAttachmentIds(r.photo_id, r.photo_ids);
          allIds.push(...ids);
          return ids;
        });
        const mimeMap = await this.fetchAttachmentMimeMap(allIds);

        const evidencePhotos: ReportEvidencePhotoItem[] = [];
        let truncatedPhotoCount = 0;
        let mcSeq = 0;
        let verifiedCount = 0;
        let gpsVerifiedCount = 0;
        let totalFieldPhotos = 0;
        let totalVideos = 0;

        const outRows = rows.map((r, idx) => {
          const isVerified = String(r.verification_status) === "verified";
          if (isVerified) verifiedCount += 1;
          if (r.gps_verified === true) gpsVerifiedCount += 1;

          const media = summarizeMediaCounts(perRowIds[idx], mimeMap, r.gps_verified === true);
          totalFieldPhotos += media.imageIds.length;
          totalVideos += media.videoCount;

          let evidenceCell = media.summaryText;
          if (filter.householdId && filter.includePhotos) {
            const refCodes: string[] = [];
            for (const attId of media.imageIds) {
              if (evidencePhotos.length < MAX_EVIDENCE_PHOTOS) {
                mcSeq += 1;
                const refCode = `MC-${String(mcSeq).padStart(2, "0")}`;
                refCodes.push(refCode);
                evidencePhotos.push({
                  refCode,
                  attachmentId: attId,
                  url: `/api/uploads/${attId}`,
                  mimeType: mimeMap.get(attId) ?? "image/jpeg",
                  category: "field",
                  categoryLabel: "Ảnh hiện trường canh tác",
                  date: formatDateVn(r.entry_on),
                  plotCode: String(r.plot_code || "-"),
                  activityTitle: String(r.activity || "Chăm sóc vườn"),
                  detailSummary: String(r.detail || ""),
                  gpsStatusLabel: formatGpsStatusLabel(r.gps_verified),
                  verificationLabel: formatVerificationLabel(r.verification_status, r.verified_by_name),
                  recorder: String(r.recorder || "Chủ hộ"),
                });
              } else {
                truncatedPhotoCount += 1;
              }
            }
            const cellParts: string[] = [];
            if (refCodes.length > 0) cellParts.push(refCodes.join(", "));
            if (media.videoCount > 0) cellParts.push(`${media.videoCount} video`);
            if (r.gps_verified === true) cellParts.push("GPS tại vườn");
            evidenceCell = cellParts.length > 0 ? cellParts.join(", ") : "Chưa đính kèm";
          }

          return [
            formatDateVn(r.entry_on),
            r.household_code,
            r.household_name,
            r.village_name,
            r.plot_code,
            r.activity,
            r.detail,
            r.recorder,
            formatShortVerificationLabel(r.verification_status),
            evidenceCell,
          ];
        });

        return {
          headers: [
            "Ngày ghi",
            "Mã hộ",
            "Hộ nông dân",
            "Thôn / Tổ",
            "Mã thửa",
            "Hoạt động",
            "Chi tiết",
            "Người ghi",
            "Xác minh",
            "Minh chứng",
          ],
          rows: outRows,
          evidencePhotos,
          truncatedPhotoCount,
          summaryStats: {
            totalRecords: rows.length,
            verifiedCount,
            selfDeclaredCount: rows.length - verifiedCount,
            gpsVerifiedCount,
            fieldPhotoCount: totalFieldPhotos,
            videoCount: totalVideos,
            invoicePhotoCount: 0,
          },
        };
      }

      case "spray": {
        const hasSprayGps = await hasPublicColumn(this.db, "spray_records", "gps_verified");
        const sprayGpsSelect = hasSprayGps ? "s.gps_verified" : "false AS gps_verified";
        const { where, params } = this.dateVillageWhere(
          "s.sprayed_on",
          "h.village_id",
          "s.household_id",
          filter,
          user,
        );
        const { rows } = await this.db.query(
          `SELECT s.id, s.sprayed_on, h.code AS household_code, h.name AS household_name,
                  COALESCE(v.name, 'Chưa phân thôn') AS village_name, s.plot_code,
                  COALESCE(p.name, 'Thuốc BVTV') AS pesticide_name,
                  p.active_ingredient, s.dose, s.area_ha, s.isolation_days, s.mrl_status,
                  s.photo_id, s.photo_ids, ${sprayGpsSelect},
                  s.verification_status, s.verified_by_name
           FROM spray_records s
           JOIN households h ON h.id = s.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           LEFT JOIN pesticides p ON p.id = s.pesticide_id
           ${where}
           ORDER BY ${filter.householdId ? "s.sprayed_on ASC, s.id ASC" : "s.sprayed_on DESC, s.id DESC"}
           LIMIT ${rowLimit}`,
          params,
        );

        const allIds: number[] = [];
        const perRowIds = rows.map((r) => {
          const ids = extractUniqueAttachmentIds(r.photo_id, r.photo_ids);
          allIds.push(...ids);
          return ids;
        });
        const mimeMap = await this.fetchAttachmentMimeMap(allIds);

        const evidencePhotos: ReportEvidencePhotoItem[] = [];
        let truncatedPhotoCount = 0;
        let mcSeq = 0;
        let verifiedCount = 0;
        let gpsVerifiedCount = 0;
        let totalFieldPhotos = 0;
        let totalVideos = 0;

        const outRows = rows.map((r, idx) => {
          const isVerified = String(r.verification_status) === "verified";
          if (isVerified) verifiedCount += 1;
          if (r.gps_verified === true) gpsVerifiedCount += 1;

          const media = summarizeMediaCounts(perRowIds[idx], mimeMap, r.gps_verified === true);
          totalFieldPhotos += media.imageIds.length;
          totalVideos += media.videoCount;

          const mrlLabel = MRL_STATUS_VN[String(r.mrl_status)] ?? String(r.mrl_status);
          let evidenceCell = media.summaryText;
          if (filter.householdId && filter.includePhotos) {
            const refCodes: string[] = [];
            for (const attId of media.imageIds) {
              if (evidencePhotos.length < MAX_EVIDENCE_PHOTOS) {
                mcSeq += 1;
                const refCode = `MC-${String(mcSeq).padStart(2, "0")}`;
                refCodes.push(refCode);
                evidencePhotos.push({
                  refCode,
                  attachmentId: attId,
                  url: `/api/uploads/${attId}`,
                  mimeType: mimeMap.get(attId) ?? "image/jpeg",
                  category: "field",
                  categoryLabel: "Ảnh hiện trường phun thuốc BVTV",
                  date: formatDateVn(r.sprayed_on),
                  plotCode: String(r.plot_code || "-"),
                  activityTitle: `Phun thuốc: ${String(r.pesticide_name || "")}`,
                  detailSummary: `Hoạt chất ${String(r.active_ingredient || "-")}, liều pha ${String(r.dose || "-")}, cách ly ${String(r.isolation_days ?? 0)} ngày (${mrlLabel})`,
                  gpsStatusLabel: formatGpsStatusLabel(r.gps_verified),
                  verificationLabel: formatVerificationLabel(r.verification_status, r.verified_by_name),
                  recorder: "Nông hộ / Cán bộ kỹ thuật",
                });
              } else {
                truncatedPhotoCount += 1;
              }
            }
            const cellParts: string[] = [];
            if (refCodes.length > 0) cellParts.push(refCodes.join(", "));
            if (media.videoCount > 0) cellParts.push(`${media.videoCount} video`);
            if (r.gps_verified === true) cellParts.push("GPS tại vườn");
            evidenceCell = cellParts.length > 0 ? cellParts.join(", ") : "Chưa đính kèm";
          }

          return [
            formatDateVn(r.sprayed_on),
            r.household_code,
            r.household_name,
            r.village_name,
            r.plot_code,
            r.pesticide_name,
            r.active_ingredient,
            r.dose,
            r.area_ha,
            r.isolation_days,
            mrlLabel,
            formatShortVerificationLabel(r.verification_status),
            evidenceCell,
          ];
        });

        return {
          headers: [
            "Ngày phun",
            "Mã hộ",
            "Hộ nông dân",
            "Thôn / Tổ",
            "Mã thửa",
            "Tên thuốc BVTV",
            "Hoạt chất",
            "Liều lượng",
            "Diện tích (ha)",
            "Cách ly (ngày)",
            "Kết quả MRL",
            "Xác minh",
            "Minh chứng",
          ],
          rows: outRows,
          evidencePhotos,
          truncatedPhotoCount,
          summaryStats: {
            totalRecords: rows.length,
            verifiedCount,
            selfDeclaredCount: rows.length - verifiedCount,
            gpsVerifiedCount,
            fieldPhotoCount: totalFieldPhotos,
            videoCount: totalVideos,
            invoicePhotoCount: 0,
          },
        };
      }

      case "lab-tests": {
        const { where, params } = this.dateVillageWhere(
          "lt.sampled_on",
          "h.village_id",
          "lt.household_id",
          filter,
          user,
        );
        const { rows } = await this.db.query(
          `SELECT lt.code, lt.sampled_on, h.code AS household_code, h.name AS household_name,
                  COALESCE(v.name, 'Chưa phân thôn') AS village_name, lt.plot_code, lt.cd_mg_kg, lt.yellow_o_positive,
                  lt.residue_mg_kg, lt.chlorpyrifos_mg_kg, lt.result, lt.lab
           FROM lab_tests lt
           JOIN households h ON h.id = lt.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           ${where}
           ORDER BY lt.sampled_on DESC, lt.id DESC
           LIMIT ${rowLimit}`,
          params,
        );
        return {
          headers: [
            "Mã mẫu",
            "Ngày lấy mẫu",
            "Mã hộ",
            "Hộ nông dân",
            "Thôn / Tổ",
            "Mã thửa",
            "Cadimi (mg/kg)",
            "Vàng O",
            "Dư lượng (mg/kg)",
            "Chlorpyrifos (mg/kg)",
            "Kết quả",
            "Đơn vị kiểm nghiệm",
          ],
          rows: rows.map((r) => [
            r.code,
            formatDateVn(r.sampled_on),
            r.household_code,
            r.household_name,
            r.village_name,
            r.plot_code,
            r.cd_mg_kg,
            r.yellow_o_positive ? "Dương tính" : "Âm tính",
            r.residue_mg_kg,
            r.chlorpyrifos_mg_kg ?? "KPH",
            LAB_RESULT_VN[String(r.result)] ?? r.result,
            r.lab,
          ]),
          evidencePhotos: [],
          truncatedPhotoCount: 0,
        };
      }

      case "violations": {
        const { where, params } = this.dateVillageWhere(
          "vl.detected_on",
          "h.village_id",
          "vl.household_id",
          filter,
          user,
        );
        const { rows } = await this.db.query(
          `SELECT vl.id, vl.detected_on, vl.severity, vl.title, vl.household_label,
                  vl.plot_code, vl.status, vl.farmer_response, vl.resolved_on, vl.resolution_notes,
                  vl.farmer_response_photo_id, vl.farmer_response_photo_ids
           FROM violations vl
           LEFT JOIN households h ON h.id = vl.household_id
           ${where}
           ORDER BY vl.detected_on DESC, vl.id DESC
           LIMIT ${rowLimit}`,
          params,
        );

        const allIds: number[] = [];
        const perRowIds = rows.map((r) => {
          const ids = extractUniqueAttachmentIds(
            r.farmer_response_photo_id,
            r.farmer_response_photo_ids,
          );
          allIds.push(...ids);
          return ids;
        });
        const mimeMap = await this.fetchAttachmentMimeMap(allIds);

        const evidencePhotos: ReportEvidencePhotoItem[] = [];
        let truncatedPhotoCount = 0;
        let mcSeq = 0;

        const outRows = rows.map((r, idx) => {
          const media = summarizeMediaCounts(perRowIds[idx], mimeMap, false);
          let evidenceCell = media.summaryText;
          if (filter.householdId && filter.includePhotos) {
            const refCodes: string[] = [];
            for (const attId of media.imageIds) {
              if (evidencePhotos.length < MAX_EVIDENCE_PHOTOS) {
                mcSeq += 1;
                const refCode = `MC-${String(mcSeq).padStart(2, "0")}`;
                refCodes.push(refCode);
                evidencePhotos.push({
                  refCode,
                  attachmentId: attId,
                  url: `/api/uploads/${attId}`,
                  mimeType: mimeMap.get(attId) ?? "image/jpeg",
                  category: "violation_fix",
                  categoryLabel: "Ảnh phản hồi khắc phục vi phạm",
                  date: formatDateVn(r.resolved_on ?? r.detected_on),
                  plotCode: String(r.plot_code || "-"),
                  activityTitle: String(r.title || "Khắc phục cảnh báo"),
                  detailSummary: String(r.farmer_response || r.resolution_notes || ""),
                  gpsStatusLabel: "Theo hồ sơ giám sát",
                  verificationLabel:
                    String(r.status) === "resolved" ? "HTX đã xác nhận khắc phục" : "Đang theo dõi xử lý",
                  recorder: String(r.household_label || "Hộ thành viên"),
                });
              } else {
                truncatedPhotoCount += 1;
              }
            }
            const cellParts: string[] = [];
            if (refCodes.length > 0) cellParts.push(refCodes.join(", "));
            if (media.videoCount > 0) cellParts.push(`${media.videoCount} video`);
            evidenceCell = cellParts.length > 0 ? cellParts.join(", ") : "Chưa đính kèm";
          }

          return [
            r.id,
            formatDateVn(r.detected_on),
            VIOLATION_SEVERITY_VN[String(r.severity)] ?? r.severity,
            r.title,
            r.household_label,
            r.plot_code,
            VIOLATION_STATUS_VN[String(r.status)] ?? r.status,
            r.farmer_response,
            formatDateVn(r.resolved_on),
            r.resolution_notes,
            evidenceCell,
          ];
        });

        return {
          headers: [
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
            "Minh chứng khắc phục",
          ],
          rows: outRows,
          evidencePhotos,
          truncatedPhotoCount,
        };
      }

      case "harvest": {
        const params: unknown[] = [];
        const conds: string[] = [];
        if (!inCoopScope) {
          conds.push("1 = 0");
        } else {
          conds.push("upper(COALESCE(hl.coop_code, 'HTX-CUNE')) = 'HTX-CUNE'");
          const scoped = villageScope("h_sc.village_id")(user, params);
          if (scoped) {
            if (scoped === "1 = 0") {
              conds.push("1 = 0");
            } else {
              conds.push(
                `EXISTS (
                   SELECT 1 FROM harvest_contributions hc_sc
                   JOIN households h_sc ON h_sc.id = hc_sc.household_id
                   WHERE hc_sc.lot_id = hl.id AND (${scoped})
                 )`,
              );
            }
          }
        }
        if (filter.from) {
          params.push(filter.from);
          conds.push(`hl.harvested_on >= $${params.length}::date`);
        }
        if (filter.to) {
          params.push(filter.to);
          conds.push(`hl.harvested_on <= $${params.length}::date`);
        }
        if (filter.villageId) {
          params.push(filter.villageId);
          conds.push(
            `EXISTS (
               SELECT 1 FROM harvest_contributions hc
               JOIN households h ON h.id = hc.household_id
               WHERE hc.lot_id = hl.id AND h.village_id = $${params.length}
             )`,
          );
        }
        if (filter.householdId) {
          params.push(filter.householdId);
          conds.push(
            `EXISTS (
               SELECT 1 FROM harvest_contributions hc_hh
               WHERE hc_hh.lot_id = hl.id AND hc_hh.household_id = $${params.length}
             )`,
          );
        }
        const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
        const { rows } = await this.db.query(
          `SELECT hl.code, hl.harvested_on, hl.weight_tons, hl.household_count,
                  hl.buyer, hl.market, hl.packhouse_code, hl.status
           FROM harvest_lots hl
           ${where}
           ORDER BY hl.harvested_on DESC, hl.id DESC
           LIMIT ${rowLimit}`,
          params,
        );
        return {
          headers: [
            "Mã lô",
            "Ngày thu hoạch",
            "Khối lượng (tấn)",
            "Số hộ đóng góp",
            "Đơn vị thu mua",
            "Thị trường",
            "Mã nhà đóng gói",
            "Trạng thái",
          ],
          rows: rows.map((r) => [
            r.code,
            formatDateVn(r.harvested_on),
            r.weight_tons,
            r.household_count,
            r.buyer,
            r.market,
            r.packhouse_code,
            HARVEST_STATUS_VN[String(r.status)] ?? r.status,
          ]),
          evidencePhotos: [],
          truncatedPhotoCount: 0,
        };
      }

      case "training-registrations": {
        const { where, params } = this.dateVillageWhere(
          "tc.held_on",
          "h.village_id",
          "tr.household_id",
          filter,
          user,
        );
        const { rows } = await this.db.query(
          `SELECT tc.title, tc.held_on, h.code AS household_code, h.name AS household_name,
                  h.phone, COALESCE(v.name, 'Chưa phân thôn') AS village_name, tr.status, tr.registered_at
           FROM training_registrations tr
           JOIN training_courses tc ON tc.id = tr.course_id
           JOIN households h ON h.id = tr.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           ${where}
           ORDER BY tc.held_on DESC NULLS LAST, tr.id ASC
           LIMIT ${rowLimit}`,
          params,
        );
        return {
          headers: [
            "Khóa tập huấn",
            "Ngày tổ chức",
            "Mã hộ",
            "Hộ nông dân",
            "Điện thoại",
            "Thôn / Tổ",
            "Trạng thái",
            "Thời gian đăng ký",
          ],
          rows: rows.map((r) => [
            r.title,
            formatDateVn(r.held_on),
            r.household_code,
            r.household_name,
            r.phone,
            r.village_name,
            TRAINING_REG_STATUS_VN[String(r.status)] ?? r.status,
            formatDateVn(r.registered_at),
          ]),
          evidencePhotos: [],
          truncatedPhotoCount: 0,
        };
      }
    }
  }

  /**
   * Chế độ 1 cho `household-logbook` (không truyền `householdId`):
   * Bảng tổng hợp mức độ đầy đủ sổ nhật ký canh tác, xác minh HTX và ảnh thực địa của toàn bộ các hộ trong phạm vi,
   * kèm đường dẫn hồ sơ số QR để đoàn kiểm tra đối chiếu nhanh mà không nhồi hàng nghìn ảnh làm treo tệp PDF.
   */
  private async buildHouseholdLogbookSummary(
    filter: ReportFilter,
    user: AuthUser,
    inCoopScope: boolean,
    rowLimit: number,
  ): Promise<InternalBuildResult> {
    const params: unknown[] = [];
    const hhConds: string[] = [];
    if (!inCoopScope) {
      hhConds.push("1 = 0");
    } else {
      const scoped = villageScope("h.village_id")(user, params);
      if (scoped) hhConds.push(scoped);
    }
    if (filter.villageId) {
      params.push(filter.villageId);
      hhConds.push(`h.village_id = $${params.length}`);
    }

    const jDateConds: string[] = [];
    const sDateConds: string[] = [];
    const mDateConds: string[] = ["m.journal_entry_id IS NULL", "m.spray_record_id IS NULL"];
    if (filter.from) {
      params.push(filter.from);
      jDateConds.push(`j.entry_on >= $${params.length}::date`);
      sDateConds.push(`s.sprayed_on >= $${params.length}::date`);
      mDateConds.push(`m.performed_on >= $${params.length}::date`);
    }
    if (filter.to) {
      params.push(filter.to);
      jDateConds.push(`j.entry_on <= $${params.length}::date`);
      sDateConds.push(`s.sprayed_on <= $${params.length}::date`);
      mDateConds.push(`m.performed_on <= $${params.length}::date`);
    }

    const jWhere = jDateConds.length ? `WHERE ${jDateConds.join(" AND ")}` : "";
    const sWhere = sDateConds.length ? `WHERE ${sDateConds.join(" AND ")}` : "";
    const mWhere = `WHERE ${mDateConds.join(" AND ")}`;
    const hhWhere = hhConds.length ? `WHERE ${hhConds.join(" AND ")}` : "";
    const [hasSignboards, hasSprayGps, hasMilestones] = await Promise.all([
      hasPublicTable(this.db, "plot_signboard_tokens"),
      hasPublicColumn(this.db, "spray_records", "gps_verified"),
      hasPublicTable(this.db, "care_milestone_declarations"),
    ]);
    const sprayGpsAggExpr = hasSprayGps
      ? "COUNT(*) FILTER (WHERE s.gps_verified = true)::int AS spray_gps_cnt,"
      : "0::int AS spray_gps_cnt,";
    const mAggCte = hasMilestones
      ? `, m_agg AS (
           SELECT m.household_id,
                  COUNT(*)::int AS milestone_cnt,
                  COUNT(*) FILTER (WHERE m.compliance_status = 'compliant')::int AS milestone_verified_cnt,
                  COUNT(*) FILTER (WHERE m.gps_verified = true)::int AS milestone_gps_cnt,
                  SUM(
                    GREATEST(
                      COALESCE(cardinality(m.field_photo_ids), 0),
                      CASE WHEN m.field_photo_id IS NOT NULL THEN 1 ELSE 0 END
                    )
                  )::int AS milestone_media_cnt
             FROM care_milestone_declarations m
             ${mWhere}
            GROUP BY m.household_id
         )`
      : "";

    const { rows } = await this.db.query<{
      code: string;
      name: string;
      village_name: string;
      plot_count: number;
      area_ha: number;
      status: string;
      journal_cnt: number;
      journal_verified_cnt: number;
      journal_gps_cnt: number;
      journal_media_cnt: number;
      spray_cnt: number;
      spray_verified_cnt: number;
      spray_gps_cnt: number;
      spray_media_cnt: number;
      qr_token: string | null;
    }>(
      `WITH j_agg AS (
         SELECT j.household_id,
                COUNT(*)::int AS journal_cnt,
                COUNT(*) FILTER (WHERE j.verification_status = 'verified')::int AS journal_verified_cnt,
                COUNT(*) FILTER (WHERE j.gps_verified = true)::int AS journal_gps_cnt,
                SUM(
                  GREATEST(
                    COALESCE(cardinality(j.photo_ids), 0),
                    CASE WHEN j.photo_id IS NOT NULL THEN 1 ELSE 0 END
                  )
                )::int AS journal_media_cnt
           FROM journal_entries j
           ${jWhere}
          GROUP BY j.household_id
       ),
       s_agg AS (
         SELECT s.household_id,
                COUNT(*)::int AS spray_cnt,
                COUNT(*) FILTER (WHERE s.verification_status = 'verified')::int AS spray_verified_cnt,
                ${sprayGpsAggExpr}
                SUM(
                  GREATEST(
                    COALESCE(cardinality(s.photo_ids), 0),
                    CASE WHEN s.photo_id IS NOT NULL THEN 1 ELSE 0 END
                  )
                )::int AS spray_media_cnt
           FROM spray_records s
           ${sWhere}
          GROUP BY s.household_id
       )
       ${mAggCte}
       SELECT h.code, h.name, COALESCE(v.name, 'Chưa phân thôn') AS village_name, h.plot_count, h.area_ha::float8 AS area_ha, h.status,
              (COALESCE(j_agg.journal_cnt, 0) + ${hasMilestones ? "COALESCE(m_agg.milestone_cnt, 0)" : "0"})::int AS journal_cnt,
              (COALESCE(j_agg.journal_verified_cnt, 0) + ${hasMilestones ? "COALESCE(m_agg.milestone_verified_cnt, 0)" : "0"})::int AS journal_verified_cnt,
              (COALESCE(j_agg.journal_gps_cnt, 0) + ${hasMilestones ? "COALESCE(m_agg.milestone_gps_cnt, 0)" : "0"})::int AS journal_gps_cnt,
              (COALESCE(j_agg.journal_media_cnt, 0) + ${hasMilestones ? "COALESCE(m_agg.milestone_media_cnt, 0)" : "0"})::int AS journal_media_cnt,
              COALESCE(s_agg.spray_cnt, 0) AS spray_cnt,
              COALESCE(s_agg.spray_verified_cnt, 0) AS spray_verified_cnt,
              COALESCE(s_agg.spray_gps_cnt, 0) AS spray_gps_cnt,
              COALESCE(s_agg.spray_media_cnt, 0) AS spray_media_cnt,
              ${
                hasSignboards
                  ? `(SELECT pst.qr_token FROM plot_signboard_tokens pst WHERE pst.household_id = h.id ORDER BY pst.plot_code ASC LIMIT 1) AS qr_token`
                  : `NULL::text AS qr_token`
              }
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
         LEFT JOIN j_agg ON j_agg.household_id = h.id
         LEFT JOIN s_agg ON s_agg.household_id = h.id
         ${hasMilestones ? "LEFT JOIN m_agg ON m_agg.household_id = h.id" : ""}
         ${hhWhere}
        ORDER BY h.id ASC
        LIMIT ${rowLimit}`,
      params,
    );

    let totalVerified = 0;
    let totalEntries = 0;
    let totalGps = 0;
    let totalMedia = 0;

    const outRows = rows.map((r) => {
      const jCnt = Number(r.journal_cnt ?? 0);
      const sCnt = Number(r.spray_cnt ?? 0);
      const sumCnt = jCnt + sCnt;
      const verCnt = Number(r.journal_verified_cnt ?? 0) + Number(r.spray_verified_cnt ?? 0);
      const gpsCnt = Number(r.journal_gps_cnt ?? 0) + Number(r.spray_gps_cnt ?? 0);
      const mediaCnt = Number(r.journal_media_cnt ?? 0) + Number(r.spray_media_cnt ?? 0);

      totalEntries += sumCnt;
      totalVerified += verCnt;
      totalGps += gpsCnt;
      totalMedia += mediaCnt;

      const verifyText = sumCnt > 0 ? `${verCnt}/${sumCnt} bản ghi đã xác minh` : "Chưa có nhật ký";
      const evidenceText =
        mediaCnt > 0 || gpsCnt > 0
          ? `${mediaCnt} tệp thực địa, ${gpsCnt} định vị GPS`
          : "Chưa có minh chứng";

      return [
        r.code,
        r.name,
        r.village_name,
        r.plot_count,
        r.area_ha,
        `${jCnt} bản ghi`,
        `${sCnt} bản ghi`,
        verifyText,
        evidenceText,
        HOUSEHOLD_STATUS_VN[String(r.status)] ?? r.status,
        r.qr_token ? `/t/${r.qr_token}` : `/trace/${r.code}`,
      ];
    });

    return {
      headers: [
        "Mã hộ",
        "Tên chủ hộ",
        "Thôn / Tổ",
        "Số thửa",
        "Diện tích (ha)",
        "Nhật ký chăm sóc",
        "Nhật ký BVTV",
        "Xác minh HTX",
        "Minh chứng thực địa",
        "Trạng thái hộ",
        "Đường dẫn hồ sơ số",
      ],
      rows: outRows,
      evidencePhotos: [],
      truncatedPhotoCount: 0,
      summaryStats: {
        totalRecords: totalEntries,
        verifiedCount: totalVerified,
        selfDeclaredCount: Math.max(0, totalEntries - totalVerified),
        gpsVerifiedCount: totalGps,
        fieldPhotoCount: totalMedia,
        videoCount: 0,
        invoicePhotoCount: 0,
      },
    };
  }

  /**
   * Chế độ 2 cho `household-logbook` (có `householdId`):
   * Sổ nhật ký canh tác điện tử chi tiết của 1 nông hộ theo chuẩn VietGAP / Nghị định thư GACC,
   * hợp nhất theo trình tự thời gian cả Nhật ký chăm sóc, Nhật ký phun thuốc BVTV và Khai báo mốc vật tư,
   * đánh mã tham chiếu chéo `MC-01, MC-02...` (và `HD-01...` nếu kèm hóa đơn vật tư).
   */
  private async buildHouseholdLogbookDetail(
    filter: ReportFilter,
    rowLimit: number,
  ): Promise<InternalBuildResult> {
    const householdId = filter.householdId!;
    const jParams: unknown[] = [householdId];
    const jConds: string[] = ["j.household_id = $1"];
    const sParams: unknown[] = [householdId];
    const sConds: string[] = ["s.household_id = $1"];
    const mParams: unknown[] = [householdId];
    const mConds: string[] = ["m.household_id = $1"];

    if (filter.from) {
      jParams.push(filter.from);
      jConds.push(`j.entry_on >= $${jParams.length}::date`);
      sParams.push(filter.from);
      sConds.push(`s.sprayed_on >= $${sParams.length}::date`);
      mParams.push(filter.from);
      mConds.push(`m.performed_on >= $${mParams.length}::date`);
    }
    if (filter.to) {
      jParams.push(filter.to);
      jConds.push(`j.entry_on <= $${jParams.length}::date`);
      sParams.push(filter.to);
      sConds.push(`s.sprayed_on <= $${sParams.length}::date`);
      mParams.push(filter.to);
      mConds.push(`m.performed_on <= $${mParams.length}::date`);
    }

    const [hasMilestones, hasSprayGps] = await Promise.all([
      hasPublicTable(this.db, "care_milestone_declarations"),
      hasPublicColumn(this.db, "spray_records", "gps_verified"),
    ]);
    const sprayGpsSelect = hasSprayGps ? "s.gps_verified" : "false AS gps_verified";

    const [jRes, sRes, mRes] = await Promise.all([
      this.db.query(
        `SELECT j.id, j.entry_on, j.plot_code, j.activity, j.detail, j.recorder,
                j.photo_id, j.photo_ids, j.gps_verified,
                j.verification_status, j.verified_by_name, j.created_at
           FROM journal_entries j
          WHERE ${jConds.join(" AND ")}
          ORDER BY j.entry_on ASC, j.id ASC
          LIMIT ${rowLimit}`,
        jParams,
      ),
      this.db.query(
        `SELECT s.id, s.sprayed_on, s.plot_code, COALESCE(p.name, 'Thuốc BVTV') AS pesticide_name,
                p.active_ingredient, s.dose, s.area_ha, s.isolation_days, s.mrl_status,
                s.note, s.photo_id, s.photo_ids, ${sprayGpsSelect},
                s.verification_status, s.verified_by_name, s.created_at
           FROM spray_records s
           LEFT JOIN pesticides p ON p.id = s.pesticide_id
          WHERE ${sConds.join(" AND ")}
          ORDER BY s.sprayed_on ASC, s.id ASC
          LIMIT ${rowLimit}`,
        sParams,
      ),
      hasMilestones
        ? this.db.query(
            `SELECT m.id, m.performed_on, m.plot_code, m.stage_code, m.milestone_code,
                    m.actual_tree_state, m.actual_dosage, m.supplier_name,
                    m.field_photo_id, m.field_photo_ids,
                    m.invoice_photo_id, m.invoice_photo_ids,
                    m.gps_verified, m.compliance_status,
                    m.journal_entry_id, m.spray_record_id, m.created_at
               FROM care_milestone_declarations m
              WHERE ${mConds.join(" AND ")}
              ORDER BY m.performed_on ASC, m.id ASC
              LIMIT ${rowLimit}`,
            mParams,
          )
        : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
    ]);

    const invoiceByJournalId = new Map<number, number[]>();
    const invoiceBySprayId = new Map<number, number[]>();
    const milestoneGpsBySprayId = new Map<number, boolean>();
    const standaloneMilestones: Array<Record<string, unknown>> = [];

    for (const m of mRes.rows) {
      const invIds = extractUniqueAttachmentIds(m.invoice_photo_id, m.invoice_photo_ids);
      const jId = m.journal_entry_id !== null && m.journal_entry_id !== undefined ? Number(m.journal_entry_id) : null;
      const sId = m.spray_record_id !== null && m.spray_record_id !== undefined ? Number(m.spray_record_id) : null;
      if (jId && invIds.length > 0) {
        const prev = invoiceByJournalId.get(jId) ?? [];
        invoiceByJournalId.set(jId, Array.from(new Set([...prev, ...invIds])));
      }
      if (sId) {
        if (invIds.length > 0) {
          const prev = invoiceBySprayId.get(sId) ?? [];
          invoiceBySprayId.set(sId, Array.from(new Set([...prev, ...invIds])));
        }
        if (m.gps_verified === true) {
          milestoneGpsBySprayId.set(sId, true);
        }
      }
      if (!jId && !sId) {
        standaloneMilestones.push(m);
      }
    }

    interface UnifiedLogItem {
      isoDate: string;
      createdMs: number;
      sortKind: number;
      plotCode: string;
      categoryText: string;
      workAndInputText: string;
      safetyText: string;
      gpsVerified: boolean;
      isVerified: boolean;
      verificationFullLabel: string;
      verificationShortLabel: string;
      recorder: string;
      photoCategoryLabel: string;
      activityTitle: string;
      detailSummary: string;
      fieldAttachmentIds: number[];
      invoiceAttachmentIds: number[];
    }

    const unified: UnifiedLogItem[] = [];

    for (const j of jRes.rows) {
      const idNum = Number(j.id);
      const fieldIds = extractUniqueAttachmentIds(j.photo_id, j.photo_ids);
      const invIds = invoiceByJournalId.get(idNum) ?? [];
      const activity = String(j.activity || "Chăm sóc vườn").trim();
      const detail = String(j.detail || "").trim();
      const isVerified = String(j.verification_status) === "verified";
      unified.push({
        isoDate: toIsoDateStr(j.entry_on),
        createdMs: j.created_at ? new Date(String(j.created_at)).getTime() : 0,
        sortKind: 1,
        plotCode: String(j.plot_code || "-"),
        categoryText: /phân/i.test(activity) ? "Bón phân / Dinh dưỡng" : "Chăm sóc canh tác",
        workAndInputText: detail ? `${activity}: ${detail}` : activity,
        safetyText: "Theo quy trình VietGAP",
        gpsVerified: j.gps_verified === true,
        isVerified,
        verificationFullLabel: formatVerificationLabel(j.verification_status, j.verified_by_name),
        verificationShortLabel: formatShortVerificationLabel(j.verification_status),
        recorder: String(j.recorder || "Chủ hộ"),
        photoCategoryLabel: "Ảnh hiện trường chăm sóc vườn",
        activityTitle: activity,
        detailSummary: detail,
        fieldAttachmentIds: fieldIds,
        invoiceAttachmentIds: invIds,
      });
    }

    for (const s of sRes.rows) {
      const idNum = Number(s.id);
      const fieldIds = extractUniqueAttachmentIds(s.photo_id, s.photo_ids);
      const invIds = invoiceBySprayId.get(idNum) ?? [];
      const pestName = String(s.pesticide_name || "").trim();
      const activeIng = String(s.active_ingredient || "").trim();
      const dose = String(s.dose || "-").trim();
      const areaHa = s.area_ha ?? "-";
      const isoDays = Number(s.isolation_days ?? 0);
      const mrlLabel = MRL_STATUS_VN[String(s.mrl_status)] ?? String(s.mrl_status || "Đạt");
      const note = String(s.note || "").trim();
      const isVerified = String(s.verification_status) === "verified";

      const detailPieces = [
        activeIng ? `Hoạt chất: ${activeIng}` : "",
        `Liều pha: ${dose}`,
        `Diện tích phun: ${areaHa} ha`,
        note ? `Ghi chú: ${note}` : "",
      ].filter(Boolean);

      unified.push({
        isoDate: toIsoDateStr(s.sprayed_on),
        createdMs: s.created_at ? new Date(String(s.created_at)).getTime() : 0,
        sortKind: 2,
        plotCode: String(s.plot_code || "-"),
        categoryText: "Bảo vệ thực vật",
        workAndInputText: `${pestName} (${detailPieces.join(", ")})`,
        safetyText: `Cách ly ${isoDays} ngày, MRL: ${mrlLabel}`,
        gpsVerified: s.gps_verified === true || milestoneGpsBySprayId.get(idNum) === true,
        isVerified,
        verificationFullLabel: formatVerificationLabel(s.verification_status, s.verified_by_name),
        verificationShortLabel: formatShortVerificationLabel(s.verification_status),
        recorder: "Chủ hộ / Cán bộ kỹ thuật",
        photoCategoryLabel: "Ảnh hiện trường phun thuốc BVTV",
        activityTitle: `Phun thuốc BVTV: ${pestName}`,
        detailSummary: `${detailPieces.join(", ")}. Cách ly ${isoDays} ngày (${mrlLabel})`,
        fieldAttachmentIds: fieldIds,
        invoiceAttachmentIds: invIds,
      });
    }

    for (const m of standaloneMilestones) {
      const fieldIds = extractUniqueAttachmentIds(m.field_photo_id, m.field_photo_ids);
      const invIds = extractUniqueAttachmentIds(m.invoice_photo_id, m.invoice_photo_ids);
      const milestoneCode = String(m.milestone_code || m.stage_code || "Mốc kỹ thuật");
      const dosage = String(m.actual_dosage || "").trim();
      const treeState = String(m.actual_tree_state || "").trim();
      const supplier = String(m.supplier_name || "").trim();
      const compLabel =
        COMPLIANCE_STATUS_VN[String(m.compliance_status)] ?? "Tuân thủ quy trình";

      const summaryPieces = [
        treeState ? `Hiện trạng cây: ${treeState}` : "",
        dosage ? `Liều thực tế: ${dosage}` : "",
        supplier ? `Nguồn vật tư: ${supplier}` : "",
      ].filter(Boolean);

      unified.push({
        isoDate: toIsoDateStr(m.performed_on),
        createdMs: m.created_at ? new Date(String(m.created_at)).getTime() : 0,
        sortKind: 3,
        plotCode: String(m.plot_code || "-"),
        categoryText: "Mốc quy trình canh tác",
        workAndInputText: `${milestoneCode}: ${summaryPieces.join(", ")}`,
        safetyText: compLabel,
        gpsVerified: m.gps_verified === true,
        isVerified: String(m.compliance_status) === "compliant",
        verificationFullLabel:
          String(m.compliance_status) === "compliant"
            ? "Đạt đối chiếu mốc kỹ thuật"
            : "Nông hộ tự khai báo mốc",
        verificationShortLabel:
          String(m.compliance_status) === "compliant" ? "Đạt mốc kỹ thuật" : "Tự khai báo",
        recorder: "Chủ hộ",
        photoCategoryLabel: "Ảnh hiện trường mốc quy trình",
        activityTitle: `Mốc quy trình: ${milestoneCode}`,
        detailSummary: summaryPieces.join(", "),
        fieldAttachmentIds: fieldIds,
        invoiceAttachmentIds: invIds,
      });
    }

    unified.sort((a, b) => {
      if (a.isoDate !== b.isoDate) return a.isoDate.localeCompare(b.isoDate);
      if (a.createdMs !== b.createdMs) return a.createdMs - b.createdMs;
      return a.sortKind - b.sortKind;
    });

    const limitedItems = unified.slice(0, rowLimit);
    const allLookupIds: number[] = [];
    for (const item of limitedItems) {
      allLookupIds.push(...item.fieldAttachmentIds);
      if (filter.includeInvoices) {
        allLookupIds.push(...item.invoiceAttachmentIds);
      }
    }
    const mimeMap = await this.fetchAttachmentMimeMap(allLookupIds);

    const evidencePhotos: ReportEvidencePhotoItem[] = [];
    let truncatedPhotoCount = 0;
    let mcSeq = 0;
    let hdSeq = 0;
    let verifiedCount = 0;
    let gpsVerifiedCount = 0;
    let totalFieldPhotos = 0;
    let totalVideos = 0;
    let totalInvoicePhotos = 0;

    const outRows = limitedItems.map((item) => {
      if (item.isVerified) verifiedCount += 1;
      if (item.gpsVerified) gpsVerifiedCount += 1;

      const fieldMedia = summarizeMediaCounts(item.fieldAttachmentIds, mimeMap, item.gpsVerified);
      totalFieldPhotos += fieldMedia.imageIds.length;
      totalVideos += fieldMedia.videoCount;

      const invMedia = filter.includeInvoices
        ? summarizeMediaCounts(item.invoiceAttachmentIds, mimeMap, false)
        : { imageIds: [] as number[], videoCount: 0, summaryText: "" };
      totalInvoicePhotos += invMedia.imageIds.length;

      let evidenceCell = fieldMedia.summaryText;
      if (filter.includePhotos) {
        const refCodes: string[] = [];
        for (const attId of fieldMedia.imageIds) {
          if (evidencePhotos.length < MAX_EVIDENCE_PHOTOS) {
            mcSeq += 1;
            const refCode = `MC-${String(mcSeq).padStart(2, "0")}`;
            refCodes.push(refCode);
            evidencePhotos.push({
              refCode,
              attachmentId: attId,
              url: `/api/uploads/${attId}`,
              mimeType: mimeMap.get(attId) ?? "image/jpeg",
              category: "field",
              categoryLabel: item.photoCategoryLabel,
              date: formatDateVn(item.isoDate),
              plotCode: item.plotCode,
              activityTitle: item.activityTitle,
              detailSummary: item.detailSummary,
              gpsStatusLabel: formatGpsStatusLabel(item.gpsVerified),
              verificationLabel: item.verificationFullLabel,
              recorder: item.recorder,
            });
          } else {
            truncatedPhotoCount += 1;
          }
        }
        if (filter.includeInvoices) {
          for (const invId of invMedia.imageIds) {
            if (evidencePhotos.length < MAX_EVIDENCE_PHOTOS) {
              hdSeq += 1;
              const refCode = `HD-${String(hdSeq).padStart(2, "0")}`;
              refCodes.push(refCode);
              evidencePhotos.push({
                refCode,
                attachmentId: invId,
                url: `/api/uploads/${invId}`,
                mimeType: mimeMap.get(invId) ?? "image/jpeg",
                category: "invoice",
                categoryLabel: "Hóa đơn chứng từ vật tư nông nghiệp",
                date: formatDateVn(item.isoDate),
                plotCode: item.plotCode,
                activityTitle: item.activityTitle,
                detailSummary: item.detailSummary,
                gpsStatusLabel: "Chứng từ lưu hồ sơ hộ",
                verificationLabel: item.verificationFullLabel,
                recorder: item.recorder,
              });
            } else {
              truncatedPhotoCount += 1;
            }
          }
        }
        const cellParts: string[] = [];
        if (refCodes.length > 0) cellParts.push(refCodes.join(", "));
        if (fieldMedia.videoCount > 0) cellParts.push(`${fieldMedia.videoCount} video`);
        evidenceCell = cellParts.length > 0 ? cellParts.join(", ") : "Chưa có ảnh";
      }

      const verifyAndGpsText = item.gpsVerified
        ? `${item.verificationShortLabel}, GPS tại vườn`
        : item.verificationShortLabel;

      return [
        formatDateVn(item.isoDate),
        item.plotCode,
        item.categoryText,
        item.workAndInputText,
        item.safetyText,
        verifyAndGpsText,
        item.recorder,
        evidenceCell,
      ];
    });

    return {
      headers: [
        "Ngày thực hiện",
        "Mã thửa",
        "Phân loại",
        "Công việc và vật tư sử dụng",
        "Cách ly và an toàn",
        "Định vị và xác minh",
        "Người ghi",
        "Mã minh chứng",
      ],
      rows: outRows,
      evidencePhotos,
      truncatedPhotoCount,
      summaryStats: {
        totalRecords: limitedItems.length,
        verifiedCount,
        selfDeclaredCount: Math.max(0, limitedItems.length - verifiedCount),
        gpsVerifiedCount,
        fieldPhotoCount: totalFieldPhotos,
        videoCount: totalVideos,
        invoicePhotoCount: totalInvoicePhotos,
      },
    };
  }

  private dateVillageWhere(
    dateCol: string,
    villageCol: string | null,
    householdCol: string | null,
    filter: ReportFilter,
    user: AuthUser,
  ) {
    const params: unknown[] = [];
    const conds: string[] = [];
    if (!isStaffInCuneCoopScope(user, true)) {
      conds.push("1 = 0");
    } else if (villageCol) {
      const scoped = villageScope(villageCol)(user, params);
      if (scoped) conds.push(scoped);
    }
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
    if (householdCol && filter.householdId) {
      params.push(filter.householdId);
      conds.push(`${householdCol} = $${params.length}`);
    }
    return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
  }
}

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(":type")
  @Throttle(RateLimitTier.REPORT_EXPORT)
  @Authorize("reports", "read")
  async exportReport(
    @Param("type") type: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    if (query.format === "json") {
      const recordAudit =
        parseBoolParam(query.audit) || parseBoolParam(query.export);
      const data = await this.reports.getReportData(type, query, user, ip, recordAudit);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(data);
      return;
    }

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
  exports: [ReportsService],
})
export class ReportsModule {}
