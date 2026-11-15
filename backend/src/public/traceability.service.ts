import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { notFound } from "../common/errors/app.exception";
import { camelRow, camelRows, publicAttachmentUrlSql } from "../common/sql/rows";
import { DatabaseService } from "../database/database.service";

export type ViewerTier = "public" | "enterprise" | "authority";

const TIER_RANK: Record<ViewerTier, number> = {
  public: 1,
  enterprise: 2,
  authority: 3,
};

const TIER_LABELS: Record<ViewerTier, string> = {
  public: "Công khai (Người tiêu dùng & Nhà nhập khẩu)",
  enterprise: "Doanh nghiệp (Cơ sở đóng gói & Phân phối)",
  authority: "Cơ quan quản lý (Chi cục, Xã & Thanh tra)",
};

const DEFAULT_ZONE_CENTER = { lat: 13.13, lng: 108.19 };
const DEFAULT_COOP_NAME = "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né";
const DEFAULT_PACKHOUSE_NAME = "Cơ sở Đóng gói - Sơ chế Liên kết HTX Cư Né";
const DEFAULT_PACKHOUSE_CODE = "VN-DLPH-0089";
const DEFAULT_PACKHOUSE_ADDRESS = "Km 19, Quốc lộ 14, Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk";

export interface TraceRequestContext {
  user?: AuthUser;
  ip?: string;
  userAgent?: string;
  requestedView?: string;
  countryCode?: string;
}

export type ZoneLiveStatus = "active" | "suspended" | "revoked" | "pending";
export type PackhouseLiveStatus = "active" | "suspended" | "revoked" | "inactive";
export type ScanWarningReason = "revoked" | "realtime_suspended" | "multi_country" | "high_frequency" | null;

function addDaysIso(isoDate: string | null | undefined, days: number): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate));
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function toIsoDateOnly(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(val);
  }
  const s = String(val).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(parsed);
  }
  return null;
}

export interface ResourceScopeTarget {
  enterpriseId: number | null;
  coopCode: string;
  villageIds: number[];
  adminLocations: string[];
}

export interface EvaluatedTraceAccess {
  roleBaseTier: ViewerTier;
  actualTier: ViewerTier;
  viewerTier: ViewerTier;
  scopeDenied: boolean;
  scopeDeniedMessage: string | null;
  scopeReason: string | null;
}

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

@Injectable()
export class TraceabilityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  resolveRoleBaseTier(user?: AuthUser): ViewerTier {
    if (!user) return "public";
    if (user.role === "admin" || user.role === "inspector" || user.role === "village_officer") {
      return "authority";
    }
    if (user.role === "enterprise" || user.role === "htx_officer") {
      return "enterprise";
    }
    return "public";
  }

  /**
   * Kiểm tra đồng thời Vai trò + Phạm vi quản lý (RBAC + Scope) trên máy chủ:
   * - Doanh nghiệp (enterprise): lot.enterprise_id == user.enterprise_id
   * - Cán bộ xã/thôn (village_officer): lô có thửa nguồn thuộc xã (assigned_commune) / thôn (village_id) của cán bộ
   * - Chi cục / Thanh tra (inspector): lô thuộc địa bàn được giao (assigned_region, mặc định Tỉnh Đắk Lắk)
   * - Quản trị / Cán bộ HTX (admin, htx_officer): lô thuộc HTX của họ (coop_code)
   * Nếu ngoài phạm vi -> hạ về bản Công khai và gắn cờ scopeDenied = true.
   */
  evaluateAccessAndScope(ctx: TraceRequestContext, scope: ResourceScopeTarget): EvaluatedTraceAccess {
    const user = ctx.user;
    const roleBaseTier = this.resolveRoleBaseTier(user);
    if (!user || roleBaseTier === "public") {
      return {
        roleBaseTier: "public",
        actualTier: "public",
        viewerTier: "public",
        scopeDenied: false,
        scopeDeniedMessage: null,
        scopeReason: null,
      };
    }

    let inScope = false;
    let scopeReason = "";

    if (user.role === "enterprise") {
      const userEntId = user.enterpriseId !== null && user.enterpriseId !== undefined ? Number(user.enterpriseId) : null;
      const lotEntId = scope.enterpriseId !== null && scope.enterpriseId !== undefined ? Number(scope.enterpriseId) : null;
      inScope = userEntId !== null && lotEntId !== null && userEntId === lotEntId;
      scopeReason = inScope
        ? "Thuộc cơ sở đóng gói / doanh nghiệp sở hữu lô"
        : "Lô hàng không thuộc cơ sở đóng gói hoặc doanh nghiệp của tài khoản này";
    } else if (user.role === "htx_officer" || user.role === "admin") {
      const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
      const lotCoop = (scope.coopCode || "HTX-CUNE").trim().toUpperCase();
      inScope = userCoop === lotCoop;
      scopeReason = inScope
        ? `Thuộc phạm vi Hợp tác xã (${lotCoop})`
        : `Ngoài phạm vi Hợp tác xã quản lý (${userCoop})`;
    } else if (user.role === "village_officer") {
      const hasVillageRule = user.villageId !== null && user.villageId !== undefined;
      const hasCommuneRule = Boolean(user.assignedCommune && user.assignedCommune.trim());
      if (!hasVillageRule && !hasCommuneRule) {
        inScope = false;
        scopeReason = "Tài khoản cán bộ xã/thôn chưa được phân công địa bàn quản lý";
      } else {
        const villageOk = !hasVillageRule || scope.villageIds.includes(Number(user.villageId));
        const communeOk = !hasCommuneRule || matchesJurisdiction(user.assignedCommune!, scope.adminLocations);
        inScope = villageOk && communeOk;
        scopeReason = inScope
          ? "Lô có thửa nguồn thuộc địa bàn xã/thôn được phân công"
          : "Lô hàng không có thửa nguồn thuộc xã/thôn được phân công quản lý";
      }
    } else if (user.role === "inspector") {
      const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
      inScope = matchesJurisdiction(region, scope.adminLocations);
      scopeReason = inScope
        ? `Thuộc địa bàn được giao (${region})`
        : `Ngoài địa bàn được giao (${region})`;
    }

    if (!inScope) {
      return {
        roleBaseTier,
        actualTier: "public",
        viewerTier: "public",
        scopeDenied: true,
        scopeDeniedMessage: "Bạn không có quyền xem chi tiết lô này",
        scopeReason,
      };
    }

    const actualTier: ViewerTier = roleBaseTier;
    let viewerTier: ViewerTier = actualTier;
    if (ctx.requestedView === "public" || ctx.requestedView === "enterprise" || ctx.requestedView === "authority") {
      if (TIER_RANK[ctx.requestedView] <= TIER_RANK[actualTier]) {
        viewerTier = ctx.requestedView;
      }
    }

    return {
      roleBaseTier,
      actualTier,
      viewerTier,
      scopeDenied: false,
      scopeDeniedMessage: null,
      scopeReason,
    };
  }

  /** Chuẩn hóa địa danh hành chính cấp xã/huyện/tỉnh (không bao giờ lộ địa chỉ nhà riêng của hộ). */
  resolveAdminLocation(village?: unknown, zoneCode?: unknown): string {
    const v = typeof village === "string" ? village.trim() : "";
    const z = typeof zoneCode === "string" ? zoneCode.trim() : "";
    if (/ea\s*kh[aă]l|ea\s*k'?s[oô]/i.test(v) || /^66-PUC-SR0001-/i.test(z)) {
      return "Xã Ea Khăl, Huyện Ea H'Leo, Tỉnh Đắk Lắk";
    }
    return "Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk";
  }

  private async hasTable(tableName: string): Promise<boolean> {
    const res = await this.db.query<{ reg: string | null }>("SELECT to_regclass($1) AS reg", [`public.${tableName}`]);
    return res.rows[0]?.reg !== null;
  }

  /** Lấy tọa độ khái quát cấp vùng trồng (làm tròn 2 chữ số thập phân ~1.1km, tuyệt đối không lộ tọa độ từng thửa). */
  private async resolveCoarseZoneMap(hasPlots: boolean, pucCode: string, adminLocation: string) {
    let centerLat = DEFAULT_ZONE_CENTER.lat;
    let centerLng = DEFAULT_ZONE_CENTER.lng;

    if (hasPlots && pucCode && pucCode !== "Chưa cấp mã PUC") {
      const res = await this.db.query<{ lat: number | null; lng: number | null }>(
        `SELECT ROUND(AVG(ST_Y(ST_Centroid(geom)))::numeric, 2)::float8 AS lat,
                ROUND(AVG(ST_X(ST_Centroid(geom)))::numeric, 2)::float8 AS lng
         FROM plots
         WHERE geom IS NOT NULL AND upper(COALESCE(zone_code, '')) = upper($1)`,
        [pucCode],
      );
      if (res.rows[0]?.lat && res.rows[0]?.lng) {
        centerLat = Number(res.rows[0].lat);
        centerLng = Number(res.rows[0].lng);
      } else {
        const allRes = await this.db.query<{ lat: number | null; lng: number | null }>(
          `SELECT ROUND(AVG(ST_Y(ST_Centroid(geom)))::numeric, 2)::float8 AS lat,
                  ROUND(AVG(ST_X(ST_Centroid(geom)))::numeric, 2)::float8 AS lng
           FROM plots
           WHERE geom IS NOT NULL`,
        );
        if (allRes.rows[0]?.lat && allRes.rows[0]?.lng) {
          centerLat = Number(allRes.rows[0].lat);
          centerLng = Number(allRes.rows[0].lng);
        }
      }
    }

    return {
      centerLat,
      centerLng,
      radiusMeters: 2500,
      zoom: 13,
      label: `Vùng trồng khái quát (${adminLocation})`,
      privacyNote: "Bản đồ chỉ hiển thị phạm vi vùng trồng chung cấp xã/mã vùng, không hiển thị ranh giới từng thửa đất cá nhân.",
    };
  }

  /**
   * (4c) Kiểm tra trực tiếp trạng thái thời gian thực của Mã số vùng trồng (PUC) và Mã cơ sở đóng gói (PHC)
   * ngay tại thời điểm người dùng quét mã QR.
   */
  private async resolveLiveZoneAndPackhouseStatus(params: {
    pucCode: string;
    enterpriseId?: number | null;
    packhouseCode: string;
    hasPlotOrHouseholdViolation: boolean;
    hasPendingSource: boolean;
  }): Promise<{
    pucStatus: ZoneLiveStatus;
    pucStatusLabel: string;
    pucValidUntil: string;
    pucNote: string | null;
    packhouseStatus: PackhouseLiveStatus;
    packhouseStatusLabel: string;
  }> {
    let dbZoneStatus: ZoneLiveStatus = "active";
    let pucValidUntil = "2027-12-31";
    let pucNote: string | null = null;

    if (await this.hasTable("growing_zones")) {
      const zRes = await this.db.query<{
        status: ZoneLiveStatus;
        valid_until: unknown;
        status_note: string | null;
      }>(
        `SELECT status, valid_until, status_note
         FROM growing_zones
         WHERE upper(code) = upper($1)
         LIMIT 1`,
        [params.pucCode],
      );
      if (zRes.rows[0]) {
        dbZoneStatus = zRes.rows[0].status;
        pucValidUntil = toIsoDateOnly(zRes.rows[0].valid_until) || "2027-12-31";
        pucNote = zRes.rows[0].status_note ?? null;
      }
    }

    let pucStatus: ZoneLiveStatus = dbZoneStatus;
    if (dbZoneStatus === "revoked") {
      pucStatus = "revoked";
    } else if (dbZoneStatus === "suspended" || params.hasPlotOrHouseholdViolation) {
      pucStatus = "suspended";
    } else if (dbZoneStatus === "pending" || params.hasPendingSource) {
      pucStatus = "pending";
    }

    const pucStatusLabel =
      pucStatus === "active"
        ? "Còn hiệu lực"
        : pucStatus === "revoked"
          ? "Đã thu hồi mã vùng"
          : pucStatus === "suspended"
            ? "Tạm dừng hiệu lực"
            : "Đang thẩm định";

    let packhouseStatus: PackhouseLiveStatus = "active";
    if (params.enterpriseId) {
      const eRes = await this.db.query<{ status: PackhouseLiveStatus }>(
        `SELECT status FROM enterprises WHERE id = $1 LIMIT 1`,
        [params.enterpriseId],
      );
      if (eRes.rows[0]?.status) {
        packhouseStatus = eRes.rows[0].status;
      }
    } else if (params.packhouseCode) {
      const eByCode = await this.db.query<{ status: PackhouseLiveStatus }>(
        `SELECT status
         FROM enterprises
         WHERE upper(COALESCE(packhouse_code, '')) = upper($1)
         ORDER BY (status IN ('revoked', 'suspended', 'inactive')) DESC, id ASC
         LIMIT 1`,
        [params.packhouseCode],
      );
      if (eByCode.rows[0]?.status) {
        packhouseStatus = eByCode.rows[0].status;
      }
    }

    const packhouseStatusLabel =
      packhouseStatus === "active"
        ? "Đang hoạt động hợp lệ"
        : packhouseStatus === "revoked"
          ? "Đã thu hồi mã cơ sở đóng gói"
          : packhouseStatus === "suspended"
            ? "Tạm dừng hoạt động cơ sở đóng gói"
            : "Ngừng hoạt động";

    return {
      pucStatus,
      pucStatusLabel,
      pucValidUntil,
      pucNote,
      packhouseStatus,
      packhouseStatusLabel,
    };
  }

  private buildAccessControlPayload(access: EvaluatedTraceAccess, ctx: TraceRequestContext) {
    return {
      viewerTier: access.viewerTier,
      actualTier: access.actualTier,
      roleBaseTier: access.roleBaseTier,
      viewerTierLabel: TIER_LABELS[access.viewerTier],
      isAuthenticated: Boolean(ctx.user),
      viewerRole: ctx.user?.role ?? null,
      viewerName: ctx.user?.fullName ?? null,
      scopeDenied: access.scopeDenied,
      scopeDeniedMessage: access.scopeDeniedMessage,
      scopeReason: access.scopeReason,
      auditLogged: Boolean(ctx.user) && (access.viewerTier !== "public" || access.scopeDenied),
    };
  }

  /** Ghi nhận lượt quét QR (kèm mã quốc gia), nhật ký minh bạch trace_detail_access_logs & audit_logs cho mọi lượt xem chi tiết (cả được cấp và ngoài phạm vi). */
  private async recordScanAndVerify(params: {
    scannedCode: string;
    canonicalKey: string;
    resolvedLotCode: string | null;
    traceUnit: "lot" | "box" | "fruit" | "puc_zone";
    isRevoked: boolean;
    hasRealtimeSuspension: boolean;
    access: EvaluatedTraceAccess;
    ctx: TraceRequestContext;
  }) {
    const verifiedAt = new Date().toISOString();
    const [hasScanTable, hasDetailLogTable] = await Promise.all([
      this.hasTable("trace_scan_logs"),
      this.hasTable("trace_detail_access_logs"),
    ]);

    const ipHash = createHash("sha256")
      .update(`puc-trace-v1:${params.ctx.ip || "local"}:${(params.ctx.userAgent || "").slice(0, 64)}`)
      .digest("hex")
      .slice(0, 24);

    const viewerTier = params.access.viewerTier;

    if (params.ctx.user && (viewerTier !== "public" || params.access.scopeDenied)) {
      const actionLabel = params.access.scopeDenied ? "Từ chối xem chi tiết QR (ngoài phạm vi)" : "Tra cứu QR mở rộng";
      await this.audit.write(
        { ip: params.ctx.ip, user: params.ctx.user },
        {
          action: actionLabel,
          object: `Mã QR ${params.resolvedLotCode || params.scannedCode}`,
          detail: `Mã quét: ${params.scannedCode} - Cấp xem: ${TIER_LABELS[viewerTier]} (vai trò: ${params.ctx.user.role})${
            params.access.scopeReason ? ` - Phạm vi: ${params.access.scopeReason}` : ""
          }${
            params.resolvedLotCode && params.resolvedLotCode !== params.scannedCode ? ` - Thuộc lô ${params.resolvedLotCode}` : ""
          }`,
        },
      );

      if (hasDetailLogTable) {
        await this.db.query(
          `INSERT INTO trace_detail_access_logs
             (user_id, username, full_name, user_role, viewer_tier, scanned_code, lot_code, scope_granted, scope_reason, ip, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            params.ctx.user.id,
            params.ctx.user.username,
            params.ctx.user.fullName,
            params.ctx.user.role,
            viewerTier,
            params.scannedCode,
            params.resolvedLotCode,
            !params.access.scopeDenied,
            params.access.scopeReason,
            params.ctx.ip ?? null,
            params.ctx.userAgent ? params.ctx.userAgent.slice(0, 250) : null,
          ],
        );
      }
    }

    let totalScans = 1;
    let scansLast24h = 1;
    let distinctSources24h = 1;
    let distinctCountries24h = params.ctx.countryCode ? 1 : 0;
    let countries24h: string[] = params.ctx.countryCode ? [params.ctx.countryCode] : [];

    if (hasScanTable) {
      await this.db.query(
        `INSERT INTO trace_scan_logs (scanned_code, resolved_lot_code, viewer_tier, user_id, ip_hash, user_agent, country_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          params.canonicalKey,
          params.resolvedLotCode,
          viewerTier,
          params.ctx.user?.id ?? null,
          ipHash,
          params.ctx.userAgent ? params.ctx.userAgent.slice(0, 200) : null,
          params.ctx.countryCode ?? null,
        ],
      );

      const statsRes = await this.db.query<{
        total_scans: number;
        scans_24h: number;
        distinct_sources_24h: number;
        distinct_countries_24h: number;
        countries_24h: string[] | null;
      }>(
        `SELECT COUNT(*)::int AS total_scans,
                COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '24 hours')::int AS scans_24h,
                COUNT(DISTINCT ip_hash) FILTER (WHERE scanned_at >= now() - INTERVAL '24 hours')::int AS distinct_sources_24h,
                COUNT(DISTINCT country_code) FILTER (WHERE country_code IS NOT NULL AND scanned_at >= now() - INTERVAL '24 hours')::int AS distinct_countries_24h,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT country_code) FILTER (WHERE country_code IS NOT NULL AND scanned_at >= now() - INTERVAL '24 hours'), NULL) AS countries_24h
         FROM trace_scan_logs
         WHERE upper(scanned_code) = upper($1) OR upper(scanned_code) = upper($2)`,
        [params.canonicalKey, params.scannedCode],
      );
      if (statsRes.rows[0]) {
        totalScans = Math.max(1, Number(statsRes.rows[0].total_scans || 1));
        scansLast24h = Math.max(1, Number(statsRes.rows[0].scans_24h || 1));
        distinctSources24h = Math.max(1, Number(statsRes.rows[0].distinct_sources_24h || 1));
        distinctCountries24h = Number(statsRes.rows[0].distinct_countries_24h || 0);
        countries24h = Array.isArray(statsRes.rows[0].countries_24h) ? statsRes.rows[0].countries_24h : [];
      }
    }

    const isUnitItem = params.traceUnit === "fruit" || params.traceUnit === "box";
    const multiCountryDetected = isUnitItem ? distinctCountries24h >= 2 : distinctCountries24h >= 3;
    const spikeDetected = isUnitItem
      ? distinctSources24h >= 8 || scansLast24h >= 40
      : distinctSources24h >= 35 || scansLast24h >= 200;

    let warningReason: ScanWarningReason = null;
    let warningMessage: string | null = null;
    if (params.isRevoked) {
      warningReason = "revoked";
      warningMessage = "Mã lô hoặc tem này đã bị thu hồi trên máy chủ. Không lưu thông sản phẩm thuộc mã đã thu hồi.";
    } else if (params.hasRealtimeSuspension) {
      warningReason = "realtime_suspended";
      warningMessage =
        "Cảnh báo thời gian thực: Mã số vùng trồng (PUC) hoặc Mã cơ sở đóng gói (PHC) liên kết với lô hàng hiện đang bị tạm dừng hoặc thu hồi hiệu lực.";
    } else if (multiCountryDetected) {
      warningReason = "multi_country";
      warningMessage = `Cảnh báo chống giả: Mã này được quét từ ${distinctCountries24h} quốc gia khác nhau (${countries24h.join(", ")}) trong 24 giờ qua. Vui lòng đối chiếu mã lô in trên nhãn thùng.`;
    } else if (spikeDetected) {
      warningReason = "high_frequency";
      warningMessage = `Phát hiện tần suất quét cao bất thường (${scansLast24h} lượt từ ${distinctSources24h} nguồn mạng trong 24 giờ qua). Vui lòng đối chiếu kỹ niêm phong thùng/lô hàng với đơn vị phân phối.`;
    }

    const isAbnormal = warningReason !== null;

    return {
      verifiedAt,
      totalScans,
      scansLast24h,
      distinctSources24h,
      distinctCountries24h,
      countries24h,
      isAbnormal,
      warningReason,
      warningMessage,
      nationalStandardNote:
        "Dữ liệu định danh theo lô/thùng trên máy chủ bằng token ngẫu nhiên chống giả, kiểm tra trạng thái PUC - PHC thời gian thực và sẵn sàng liên thông Cổng Truy xuất nguồn gốc Quốc gia (Bộ KH&CN).",
    };
  }

  /** Danh sách hồ sơ mẫu trên `/trace`: kèm qr_token ngẫu nhiên (/t/:token) và mã lô chữ dự phòng. */
  async traceSamples() {
    const [lotsRes, boxesRes, stampsRes] = await Promise.all([
      this.db.query(
        `SELECT 'lot'::text AS sample_type,
                hl.code,
                hl.qr_token,
                COALESCE(hl.variety, 'Ri6 & Monthong') AS variety,
                hl.harvested_on,
                (hl.weight_tons * 1000)::float8 AS weight_kg,
                COALESCE(hl.packhouse_code, 'VN-DLPH-0089') AS packhouse_code,
                COALESCE(hl.packhouse_name, e.name, $1) AS producer_label,
                hl.market,
                hl.status
         FROM harvest_lots hl
         LEFT JOIN enterprises e ON e.id = hl.enterprise_id
         ORDER BY hl.harvested_on DESC, hl.id DESC
         LIMIT 6`,
        [DEFAULT_PACKHOUSE_NAME],
      ),
      this.db.query(
        `SELECT 'box'::text AS unit_type,
                hi.serial_code AS code,
                hi.qr_token,
                hi.weight_kg::float8 AS weight_kg,
                hi.grade,
                COALESCE(hi.printed_at::date::text, hl.packed_on::text, hl.harvested_on::text) AS issued_at,
                hl.code AS lot_code,
                $1::text AS producer_label
         FROM harvest_items hi
         JOIN harvest_lots hl ON hl.id = hi.lot_id
         WHERE hi.item_type = 'box' AND hi.status <> 'recalled'
         ORDER BY hi.id DESC
         LIMIT 4`,
        [DEFAULT_COOP_NAME],
      ),
      this.db.query(
        `SELECT 'fruit'::text AS unit_type,
                fs.serial_code AS code,
                fs.qr_token,
                fs.fruit_weight_kg::float8 AS weight_kg,
                fs.grade,
                COALESCE(fs.harvest_date::text, fs.activated_at::date::text) AS issued_at,
                NULL::text AS lot_code,
                CASE
                  WHEN h.public_trace_consent = true AND h.status = 'qualified' THEN ('Hộ ' || h.name || ' - HTX Cư Né')
                  ELSE $1::text
                END AS producer_label
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         WHERE fs.status = 'activated'
         ORDER BY fs.activated_at DESC NULLS LAST, fs.id DESC
         LIMIT 3`,
        [DEFAULT_COOP_NAME],
      ),
    ]);

    const combinedUnits = [...camelRows(boxesRes.rows), ...camelRows(stampsRes.rows)].slice(0, 6);

    return {
      lots: camelRows(lotsRes.rows),
      stamps: combinedUnits,
    };
  }

  private buildFiveStepTimeline(params: {
    pucCode: string;
    pucStatus: ZoneLiveStatus;
    packhouseStatus: PackhouseLiveStatus;
    lastFarmCheckOn: string | null;
    harvestedOn: string | null;
    packedOn: string | null;
    packhouseName: string;
    packhouseCode: string;
    latestLabOn: string | null;
    latestLabName: string | null;
    latestLabResult: string | null;
    exportedOn: string | null;
    lotStatus: string;
    market: string;
  }) {
    const isRevoked = params.lotStatus === "revoked";
    const isExported = params.lotStatus === "exported" || params.lotStatus === "delivered" || params.lotStatus === "in_transit";
    const pucWarn = params.pucStatus === "suspended" || params.pucStatus === "revoked";
    const phcWarn = params.packhouseStatus !== "active";

    return [
      {
        step: 1,
        key: "orchard",
        title: "Vườn trồng",
        date: params.lastFarmCheckOn || addDaysIso(params.harvestedOn, -15),
        responsibleUnit: DEFAULT_COOP_NAME,
        detail: pucWarn
          ? `Cảnh báo: Mã vùng trồng ${params.pucCode} hiện đang ở trạng thái tạm dừng / thu hồi hiệu lực`
          : `Mã vùng trồng ${params.pucCode} - Giám sát nhật ký VietGAP & thời gian cách ly an toàn trước thu hoạch`,
        status: pucWarn ? "warning" : "completed",
      },
      {
        step: 2,
        key: "harvest",
        title: "Thu hoạch",
        date: params.harvestedOn,
        responsibleUnit: "Tổ thu hoạch & Kỹ thuật HTX Cư Né",
        detail: params.harvestedOn
          ? "Thu hái đúng độ chín sinh lý (Brix đạt chuẩn), phân loại sơ bộ và gom lô nguyên liệu tại vườn"
          : "Chưa ghi nhận mốc thu hoạch lô thương phẩm",
        status: params.harvestedOn ? "completed" : "upcoming",
      },
      {
        step: 3,
        key: "packing",
        title: "Đóng gói",
        date: params.packedOn,
        responsibleUnit: `${params.packhouseName} (${params.packhouseCode})`,
        detail: phcWarn
          ? `Cảnh báo: Cơ sở đóng gói ${params.packhouseCode} hiện đang tạm dừng hoặc ngừng hiệu lực hoạt động`
          : params.packedOn
            ? "Làm sạch, phân hạng thương phẩm, đóng thùng định danh lô và niêm phong mã QR truy xuất"
            : "Đang chờ tiếp nhận sơ chế và đóng thùng tại cơ sở đóng gói",
        status: phcWarn ? "warning" : params.packedOn ? "completed" : params.harvestedOn ? "current" : "upcoming",
      },
      {
        step: 4,
        key: "testing",
        title: "Kiểm nghiệm",
        date: params.latestLabOn,
        responsibleUnit: params.latestLabName || "Phòng kiểm nghiệm độc lập được chỉ định",
        detail: params.latestLabResult
          ? params.latestLabResult === "pass"
            ? "Đạt yêu cầu Cadimi (Cd), Âm tính Vàng O và dư lượng thuốc BVTV trong ngưỡng an toàn"
            : "Mẫu kiểm nghiệm phát hiện chỉ tiêu vượt ngưỡng - Không đủ điều kiện xuất lô"
          : "Đang chờ cập nhật phiếu kết quả phân tích mẫu của lô",
        status:
          params.latestLabResult === "fail"
            ? "warning"
            : params.latestLabResult === "pass"
              ? "completed"
              : params.packedOn
                ? "current"
                : "upcoming",
      },
      {
        step: 5,
        key: "export",
        title: "Xuất khẩu / Lưu thông",
        date: params.exportedOn,
        responsibleUnit: `${params.packhouseName} & Cơ quan Kiểm dịch thực vật`,
        detail: isRevoked
          ? "Lô hàng đã bị thu hồi và khóa lưu thông trên hệ thống"
          : isExported
            ? `Hoàn tất kiểm tra hồ sơ kiểm dịch và xuất lô phục vụ thị trường: ${params.market}`
            : "Đang hoàn tất thủ tục kiểm định trước khi xuất bến",
        status: isRevoked ? "warning" : isExported ? "completed" : "upcoming",
      },
    ];
  }

  /** Tra cứu hồ sơ truy xuất QR 3 cấp độ: Công khai (Mục 1), Doanh nghiệp (Cấp 2), Cơ quan quản lý (Cấp 3) theo đúng Vai trò + Phạm vi. */
  async trace(rawCode: string, ctx: TraceRequestContext) {
    const cleanCode = rawCode.trim();
    if (!cleanCode || cleanCode.length > 80 || !/^[A-Za-z0-9._/-]+$/.test(cleanCode)) {
      throw notFound(`Không tìm thấy hồ sơ lô hàng hoặc mã tem "${cleanCode.slice(0, 80)}". Vui lòng kiểm tra lại tem QR.`);
    }

    const hasPlots = await this.hasTable("plots");

    // ─── NHÁNH A: QUÉT TOKEN NGẪU NHIÊN /t/:token HOẶC MÃ LÔ / MÃ THÙNG DỰ PHÒNG (CHUẨN QUỐC GIA ƯU TIÊN) ───
    let scannedItem: Record<string, unknown> | null = null;
    let lotId: number | null = null;

    const itemRes = await this.db.query(
      `SELECT lot_id, item_type, serial_code, qr_token, weight_kg::float8 AS weight_kg, grade, printed_at, status
       FROM harvest_items
       WHERE qr_token = $1 OR upper(serial_code) = upper($1)
       ORDER BY (qr_token = $1) DESC
       LIMIT 1`,
      [cleanCode],
    );
    if (itemRes.rowCount && itemRes.rows[0]) {
      const rawItem = camelRow<Record<string, unknown>>(itemRes.rows[0]);
      lotId = Number(rawItem.lotId);
      const { lotId: _omitLotId, ...publicItem } = rawItem;
      void _omitLotId;
      scannedItem = publicItem;
    }

    const lotRes = await this.db.query(
      `SELECT l.id, l.code, l.qr_token, l.enterprise_id, l.coop_code, l.variety, l.qr_code, l.harvested_on, l.packed_on, l.exported_on,
              l.weight_tons::float8 AS weight_tons, l.household_count, l.market, l.status, l.revoked_reason,
              e.name AS enterprise_name, e.address AS enterprise_address,
              l.packhouse_code, l.packhouse_name, l.packhouse_address,
              l.phytosanitary_cert_no, l.phytosanitary_issued_on,
              l.grade_a_pct::float8 AS grade_a_pct, l.grade_b_pct::float8 AS grade_b_pct,
              l.grade_c_pct::float8 AS grade_c_pct, l.avg_brix::float8 AS avg_brix, l.treatment_method,
              l.transporter, l.vehicle_plate, l.temperature_c::float8 AS temperature_c, l.departed_at, l.estimated_arrival
       FROM harvest_lots l
       LEFT JOIN enterprises e ON e.id = l.enterprise_id
       WHERE ${lotId ? "l.id = $1" : "l.qr_token = $1 OR upper(l.code) = upper($1) OR upper(COALESCE(l.qr_code, '')) = upper($1)"}
       ORDER BY ${lotId ? "l.id ASC" : "(l.qr_token = $1) DESC, l.id DESC"}
       LIMIT 1`,
      [lotId ?? cleanCode],
    );

    if (lotRes.rowCount && lotRes.rows[0]) {
      return this.buildLotTraceResponse({
        cleanCode,
        rawLotRow: lotRes.rows[0],
        scannedItem,
        hasPlots,
        ctx,
      });
    }

    // ─── NHÁNH B: QUÉT TEM NÔNG HỘ DÒNG CAO CẤP / THƯƠNG HIỆU RIÊNG (farmer_stamps) ───
    const farmerStampSql = hasPlots
      ? `SELECT fs.household_id, fs.plot_code, fs.serial_code, fs.qr_token, fs.status,
                fs.activated_at, fs.fruit_weight_kg::float8 AS fruit_weight_kg, fs.grade, fs.harvest_date,
                h.name AS household_name, h.status AS household_status, h.public_trace_consent,
                h.code AS household_code, h.phone AS household_phone, h.village_id,
                repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) AS cccd_masked,
                v.name AS village_name,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                p.zone_code, p.variety, COALESCE(p.area_ha, h.area_ha)::float8 AS area_ha, p.planted_year,
                p.sheet_no, p.parcel_no, p.source AS plot_source, p.status AS plot_status,
                ST_AsGeoJSON(p.geom) AS geometry_json,
                ST_Y(ST_Centroid(p.geom))::float8 AS lat,
                ST_X(ST_Centroid(p.geom))::float8 AS lng
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p ON upper(p.code) = upper(fs.plot_code)
         WHERE fs.qr_token = $1 OR upper(fs.serial_code) = upper($1)
         ORDER BY (fs.qr_token = $1) DESC
         LIMIT 1`
      : `SELECT fs.household_id, fs.plot_code, fs.serial_code, fs.qr_token, fs.status,
                fs.activated_at, fs.fruit_weight_kg::float8 AS fruit_weight_kg, fs.grade, fs.harvest_date,
                h.name AS household_name, h.status AS household_status, h.public_trace_consent,
                h.code AS household_code, h.phone AS household_phone, h.village_id,
                repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) AS cccd_masked,
                v.name AS village_name,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                NULL::text AS zone_code, NULL::text AS variety, h.area_ha::float8 AS area_ha, NULL::int AS planted_year,
                NULL::text AS sheet_no, NULL::text AS parcel_no, NULL::text AS plot_source, NULL::text AS plot_status,
                NULL::text AS geometry_json, NULL::float8 AS lat, NULL::float8 AS lng
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         JOIN villages v ON v.id = h.village_id
         WHERE fs.qr_token = $1 OR upper(fs.serial_code) = upper($1)
         ORDER BY (fs.qr_token = $1) DESC
         LIMIT 1`;

    const farmerStampRes = await this.db.query(farmerStampSql, [cleanCode]);
    if (farmerStampRes.rowCount && farmerStampRes.rows[0]) {
      return this.buildFarmerStampTraceResponse({
        cleanCode,
        rawStampRow: farmerStampRes.rows[0],
        hasPlots,
        ctx,
      });
    }

    // ─── NHÁNH C: QUÉT MÃ BIỂN VÙNG / LÔ VƯỜN (plots) ───
    if (hasPlots) {
      const plotRes = await this.db.query(
        `SELECT p.household_id, p.code, p.sheet_no, p.parcel_no, p.source,
                COALESCE(p.owner_name, h.name) AS owner_name,
                COALESCE(p.village, v.name) AS village, p.zone_code, p.variety, p.planted_year,
                p.area_ha::float8 AS area_ha,
                p.status, p.updated_at,
                h.code AS household_code, h.status AS household_status, h.phone AS household_phone, h.village_id,
                COALESCE(h.public_trace_consent, false) AS public_trace_consent,
                CASE WHEN h.cccd IS NOT NULL THEN repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) ELSE NULL END AS cccd_masked,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                ST_AsGeoJSON(p.geom) AS geometry_json,
                ST_Y(ST_Centroid(p.geom))::float8 AS lat,
                ST_X(ST_Centroid(p.geom))::float8 AS lng
         FROM plots p
         LEFT JOIN households h ON h.id = p.household_id
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE upper(p.code) = upper($1)
         LIMIT 1`,
        [cleanCode],
      );

      if (plotRes.rowCount && plotRes.rows[0]) {
        return this.buildPlotTraceResponse({
          cleanCode,
          rawPlotRow: plotRes.rows[0],
          hasPlots,
          ctx,
        });
      }
    }

    throw notFound(`Không tìm thấy hồ sơ lô hàng hoặc mã tem "${cleanCode}". Vui lòng kiểm tra lại tem QR.`);
  }

  /** Xây dựng phản hồi 3 cấp cho Lô hàng / Thùng hàng / Tem con của lô. */
  private async buildLotTraceResponse(params: {
    cleanCode: string;
    rawLotRow: Record<string, unknown>;
    scannedItem: Record<string, unknown> | null;
    hasPlots: boolean;
    ctx: TraceRequestContext;
  }) {
    const { cleanCode, scannedItem, hasPlots, ctx } = params;
    const lotRow = camelRow<Record<string, unknown>>(params.rawLotRow);
    const internalLotId = Number(lotRow.id);
    const lotCode = String(lotRow.code);

    const isItemRecalled = scannedItem?.status === "recalled";
    const isRevoked = lotRow.status === "revoked" || isItemRecalled;
    const traceUnit: "lot" | "box" | "fruit" = scannedItem
      ? scannedItem.itemType === "fruit"
        ? "fruit"
        : "box"
      : "lot";

    // (4a) Truy vấn danh sách hộ & thửa nguồn đóng góp vào lô (lot_id <-> household_id + plot_code)
    const contribsRes = await this.db.query<{
      household_id: number;
      household_name: string;
      household_code: string;
      phone: string;
      cccd_masked: string;
      household_status: string;
      public_trace_consent: boolean;
      village_id: number;
      village_name: string;
      area_ha: number;
      weight_kg: number;
      plot_code: string | null;
    }>(
      `SELECT h.id AS household_id, h.name AS household_name, h.code AS household_code,
              h.phone, repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) AS cccd_masked,
              h.status AS household_status, h.public_trace_consent,
              h.village_id, v.name AS village_name, h.area_ha::float8 AS area_ha,
              hc.weight_kg::float8 AS weight_kg,
              NULLIF(hc.plot_code, '') AS plot_code
       FROM harvest_contributions hc
       JOIN households h ON h.id = hc.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE hc.lot_id = $1
       ORDER BY hc.weight_kg DESC, hc.id ASC`,
      [internalLotId],
    );

    const contribHouseholds = contribsRes.rows;
    const contribHouseholdIds = [...new Set(contribHouseholds.map((h) => Number(h.household_id)))];
    const contribVillageIds = [...new Set(contribHouseholds.map((h) => Number(h.village_id)))];
    const contribPlotCodes = [
      ...new Set(
        contribHouseholds
          .map((h) => (h.plot_code ? h.plot_code.trim().toUpperCase() : ""))
          .filter(Boolean),
      ),
    ];

    // Nếu có bảng plots, lấy thông tin thửa nguồn của các hộ/thửa đóng góp để xác định mã vùng trồng (PUC) thực tế
    const sourcePlots =
      hasPlots && (contribHouseholdIds.length > 0 || contribPlotCodes.length > 0)
        ? (
            await this.db.query<{
              household_id: number;
              code: string;
              zone_code: string | null;
              sheet_no: string | null;
              parcel_no: string | null;
              variety: string | null;
              planted_year: number | null;
              area_ha: number;
              status: string;
              source: string | null;
              geometry_json: string | null;
              lat: number | null;
              lng: number | null;
            }>(
              `SELECT p.household_id, p.code, p.zone_code, p.sheet_no, p.parcel_no,
                      p.variety, p.planted_year, p.area_ha::float8 AS area_ha,
                      p.status, p.source,
                      ST_AsGeoJSON(p.geom) AS geometry_json,
                      ST_Y(ST_Centroid(p.geom))::float8 AS lat,
                      ST_X(ST_Centroid(p.geom))::float8 AS lng
               FROM plots p
               WHERE p.household_id = ANY($1::bigint[])
                  OR (cardinality($2::text[]) > 0 AND upper(p.code) = ANY($2::text[]))
               ORDER BY p.id ASC`,
              [contribHouseholdIds, contribPlotCodes],
            )
          ).rows
        : [];

    const exactSourcePlots =
      contribPlotCodes.length > 0
        ? sourcePlots.filter((p) => contribPlotCodes.includes(p.code.toUpperCase()))
        : sourcePlots;
    const effectivePlots = exactSourcePlots.length > 0 ? exactSourcePlots : sourcePlots;

    const allSourceAdminLocations = new Set<string>();
    for (const h of contribHouseholds) {
      allSourceAdminLocations.add(this.resolveAdminLocation(h.village_name, null));
    }
    for (const p of effectivePlots) {
      allSourceAdminLocations.add(this.resolveAdminLocation(null, p.zone_code));
    }
    if (allSourceAdminLocations.size === 0) {
      allSourceAdminLocations.add(this.resolveAdminLocation(null, "VN-DLOR-0086"));
    }

    const access = this.evaluateAccessAndScope(ctx, {
      enterpriseId: lotRow.enterpriseId !== null && lotRow.enterpriseId !== undefined ? Number(lotRow.enterpriseId) : null,
      coopCode: String(lotRow.coopCode || "HTX-CUNE"),
      villageIds: contribVillageIds,
      adminLocations: [...allSourceAdminLocations],
    });
    const viewerTier = access.viewerTier;

    // (4f) Trang công khai & doanh nghiệp chỉ lấy phiếu kiểm nghiệm trạng thái "đã kiểm chứng" (verified)
    const verifiedLabClause = viewerTier === "authority" ? "" : "AND lt.record_status = 'verified'";
    const labTestsRes =
      contribHouseholdIds.length > 0 || contribPlotCodes.length > 0
        ? await this.db.query(
            `SELECT lt.code, h.name AS household_name, h.code AS household_code, lt.plot_code, lt.sampled_on,
                    lt.cd_mg_kg::float8 AS cd_mg_kg, lt.yellow_o_positive,
                    lt.residue_mg_kg::float8 AS residue_mg_kg, lt.chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
                    lt.result, lt.lab, lt.record_status,
                    ${publicAttachmentUrlSql("lt.scan_attachment_id")} AS scan_url
             FROM lab_tests lt
             JOIN households h ON h.id = lt.household_id
             WHERE (
               lt.household_id = ANY($1::bigint[])
               OR (cardinality($2::text[]) > 0 AND upper(lt.plot_code) = ANY($2::text[]))
             )
             ${verifiedLabClause}
             ORDER BY (CASE WHEN cardinality($2::text[]) > 0 AND upper(lt.plot_code) = ANY($2::text[]) THEN 0 ELSE 1 END),
                      lt.sampled_on DESC, lt.id DESC
             LIMIT 8`,
            [contribHouseholdIds, contribPlotCodes],
          )
        : await this.db.query(
            `SELECT lt.code, h.name AS household_name, h.code AS household_code, lt.plot_code, lt.sampled_on,
                    lt.cd_mg_kg::float8 AS cd_mg_kg, lt.yellow_o_positive,
                    lt.residue_mg_kg::float8 AS residue_mg_kg, lt.chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
                    lt.result, lt.lab, lt.record_status,
                    ${publicAttachmentUrlSql("lt.scan_attachment_id")} AS scan_url
             FROM lab_tests lt
             JOIN households h ON h.id = lt.household_id
             WHERE 1 = 1 ${verifiedLabClause}
             ORDER BY lt.sampled_on DESC, lt.id DESC
             LIMIT 3`,
          );

    const rawLabTests = camelRows<{
      code: string;
      householdName: string;
      householdCode: string;
      plotCode: string;
      sampledOn: string;
      cdMgKg: number;
      yellowOPositive: boolean;
      residueMgKg: number;
      chlorpyrifosMgKg: number | null;
      result: string;
      lab: string;
      recordStatus: string;
      scanUrl: string | null;
    }>(labTestsRes.rows);

    const latestMinuteRes = await this.db.query<{ held_on: string }>(
      `SELECT held_on::text AS held_on FROM inspection_minutes ORDER BY held_on DESC, id DESC LIMIT 1`,
    );
    const lastInspectionOn = toIsoDateOnly(latestMinuteRes.rows[0]?.held_on);

    const verifiedPlots = effectivePlots.filter((p) => p.status === "approved");
    const displayPlots = viewerTier === "public" && verifiedPlots.length > 0 ? verifiedPlots : effectivePlots;

    const distinctZoneCodes = [
      ...new Set(
        displayPlots
          .map((p) => (p.zone_code ? p.zone_code.trim() : ""))
          .filter((z) => z.length > 0),
      ),
    ];
    const primaryPucCode = distinctZoneCodes[0] || "VN-DLOR-0086";
    const primaryVillage = contribHouseholds[0]?.village_name || null;
    const adminLocation = this.resolveAdminLocation(primaryVillage, primaryPucCode);

    const hasSuspendedPlot =
      effectivePlots.some((p) => p.status === "violation") ||
      contribHouseholds.some((h) => h.household_status === "violation");

    const packhouseName = String(
      lotRow.packhouseName || lotRow.enterpriseName || DEFAULT_PACKHOUSE_NAME,
    );
    const packhouseCode = String(lotRow.packhouseCode || DEFAULT_PACKHOUSE_CODE);
    const packhouseAddress = String(
      lotRow.packhouseAddress || lotRow.enterpriseAddress || DEFAULT_PACKHOUSE_ADDRESS,
    );

    // (4c) Kiểm tra trực tiếp trạng thái PUC & PHC thời gian thực tại thời điểm quét
    const live = await this.resolveLiveZoneAndPackhouseStatus({
      pucCode: primaryPucCode,
      enterpriseId: lotRow.enterpriseId ? Number(lotRow.enterpriseId) : null,
      packhouseCode,
      hasPlotOrHouseholdViolation: hasSuspendedPlot,
      hasPendingSource: lotRow.status === "sampling",
    });
    const pucStatus = live.pucStatus;
    const hasRealtimeSuspension =
      live.pucStatus === "suspended" ||
      live.pucStatus === "revoked" ||
      live.packhouseStatus !== "active";

    const canonicalKey = String(scannedItem?.qrToken || lotRow.qrToken || lotCode);
    const verification = await this.recordScanAndVerify({
      scannedCode: cleanCode,
      canonicalKey,
      resolvedLotCode: lotCode,
      traceUnit,
      isRevoked,
      hasRealtimeSuspension,
      access,
      ctx,
    });

    const coarseMap = await this.resolveCoarseZoneMap(hasPlots, primaryPucCode, adminLocation);

    const harvestedOn = toIsoDateOnly(lotRow.harvestedOn);
    const packedOn = toIsoDateOnly(lotRow.packedOn) || addDaysIso(harvestedOn, 1);
    const exportedOn =
      toIsoDateOnly(lotRow.exportedOn) ||
      toIsoDateOnly(lotRow.departedAt) ||
      (lotRow.status === "exported" || lotRow.status === "delivered" ? addDaysIso(harvestedOn, 2) : null);

    const latestLab = rawLabTests[0] ?? null;
    const latestLabSampledOn = toIsoDateOnly(latestLab?.sampledOn);
    const varietyDisplay = String(
      lotRow.variety ||
        [...new Set(displayPlots.map((p) => p.variety).filter(Boolean))].join(", ") ||
        "Ri6 & Monthong (Dona)",
    );

    // (Mục 1 + 4f) Chỉ hiển thị hộ ĐỒNG Ý công khai VÀ đã duyệt đủ điều kiện ("qualified")
    const consentedHouseholdNames = [
      ...new Set(
        contribHouseholds
          .filter((h) => h.public_trace_consent === true && h.household_status === "qualified")
          .map((h) => h.household_name),
      ),
    ];

    const participatingHouseholdCount = Math.max(
      Number(lotRow.householdCount || 0),
      contribHouseholdIds.length,
    );

    // Kiểm nghiệm công khai: KHÔNG lộ tên chủ hộ và mã thửa riêng lẻ
    const publicLabTests = rawLabTests.slice(0, 3).map((lt) => ({
      code: lt.code,
      sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
      lab: lt.lab,
      cdMgKg: lt.cdMgKg,
      yellowOPositive: lt.yellowOPositive,
      residueMgKg: lt.residueMgKg,
      chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
      result: lt.result,
      scanUrl: lt.scanUrl,
    }));

    const timeline = this.buildFiveStepTimeline({
      pucCode: primaryPucCode,
      pucStatus,
      packhouseStatus: live.packhouseStatus,
      lastFarmCheckOn: lastInspectionOn,
      harvestedOn,
      packedOn,
      packhouseName,
      packhouseCode,
      latestLabOn: latestLabSampledOn,
      latestLabName: latestLab?.lab ?? null,
      latestLabResult: latestLab?.result ?? null,
      exportedOn,
      lotStatus: isRevoked ? "revoked" : String(lotRow.status),
      market: String(lotRow.market || "Xuất khẩu chính ngạch"),
    });

    // Kiểm tra tuân thủ cách ly PHI trên toàn bộ các hộ tham gia lô (chỉ xuất kết luận tổng quát ra công khai)
    let complianceConfirmed = pucStatus === "active" && !hasSuspendedPlot && latestLab?.result !== "fail";
    if (contribHouseholdIds.length > 0 && harvestedOn) {
      const phiViolationRes = await this.db.query<{ violated: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM spray_records sr
           WHERE sr.household_id = ANY($1::bigint[])
             AND (
               sr.mrl_status <> 'pass'
               OR (sr.isolation_days > 0 AND (sr.sprayed_on + sr.isolation_days) > $2::date)
             )
         ) AS violated`,
        [contribHouseholdIds, harvestedOn],
      );
      if (phiViolationRes.rows[0]?.violated) {
        complianceConfirmed = false;
      }
    }

    const phytoCertNo = lotRow.phytosanitaryCertNo ? String(lotRow.phytosanitaryCertNo) : null;
    const phytoIssuedOn = toIsoDateOnly(lotRow.phytosanitaryIssuedOn);

    // Dữ liệu Cấp 2 (Doanh nghiệp: vùng nguồn, sản lượng từng vùng, trạng thái kiểm nghiệm chi tiết)
    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise) {
      const totalContribKg =
        contribHouseholds.reduce((s, h) => s + Number(h.weight_kg || 0), 0) ||
        Number(lotRow.weightTons || 0) * 1000;

      const zoneMap = new Map<
        string,
        {
          zoneCode: string;
          villageName: string;
          householdIds: Set<number>;
          areaHa: number;
          weightKg: number;
          status: string;
        }
      >();

      if (contribHouseholds.length > 0) {
        for (const h of contribHouseholds) {
          const hPlots = sourcePlots.filter((p) => Number(p.household_id) === Number(h.household_id));
          const exactPlot = h.plot_code
            ? hPlots.find((p) => p.code.toUpperCase() === h.plot_code!.toUpperCase())
            : undefined;
          const zCode = exactPlot?.zone_code || hPlots.find((p) => p.zone_code)?.zone_code || primaryPucCode;
          const key = `${zCode}__${h.village_name}`;
          const cur = zoneMap.get(key) ?? {
            zoneCode: zCode,
            villageName: h.village_name,
            householdIds: new Set<number>(),
            areaHa: 0,
            weightKg: 0,
            status: pucStatus === "active" ? "Đủ điều kiện" : "Cần rà soát",
          };
          const hid = Number(h.household_id);
          if (exactPlot) {
            cur.areaHa = Number((cur.areaHa + Number(exactPlot.area_ha || 0)).toFixed(2));
          } else if (!cur.householdIds.has(hid)) {
            cur.areaHa = Number((cur.areaHa + Number(h.area_ha || 0)).toFixed(2));
          }
          cur.householdIds.add(hid);
          cur.weightKg = Number((cur.weightKg + Number(h.weight_kg || 0)).toFixed(1));
          if (h.household_status === "violation" || hPlots.some((p) => p.status === "violation")) {
            cur.status = "Cần rà soát";
          }
          zoneMap.set(key, cur);
        }
      } else {
        zoneMap.set(primaryPucCode, {
          zoneCode: primaryPucCode,
          villageName: "Vùng liên kết HTX Cư Né",
          householdIds: new Set<number>(),
          areaHa: 0,
          weightKg: Number((Number(lotRow.weightTons || 0) * 1000).toFixed(1)),
          status: pucStatus === "active" ? "Đủ điều kiện" : "Cần rà soát",
        });
      }

      const sourceZones = [...zoneMap.values()].map((z) => ({
        zoneCode: z.zoneCode,
        villageName: z.villageName,
        householdCount: z.householdIds.size || participatingHouseholdCount,
        areaHa: z.areaHa,
        weightKg: z.weightKg,
        status: z.status,
        sharePct: totalContribKg > 0 ? Number(((z.weightKg / totalContribKg) * 100).toFixed(1)) : 100,
      }));

      enterpriseData = {
        sourceZones,
        totalSourceWeightKg: totalContribKg,
        detailedLabTests: rawLabTests.map((lt) => {
          const matchedPlot = sourcePlots.find((p) => p.code.toUpperCase() === lt.plotCode.toUpperCase());
          return {
            code: lt.code,
            zoneCode: matchedPlot?.zone_code || primaryPucCode,
            sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
            lab: lt.lab,
            cdMgKg: lt.cdMgKg,
            cdThresholdMgKg: 0.05,
            yellowOPositive: lt.yellowOPositive,
            residueMgKg: lt.residueMgKg,
            residueThresholdMgKg: 0.1,
            chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
            result: lt.result,
            scanUrl: lt.scanUrl,
          };
        }),
        packingSpecs: {
          gradeAPct: lotRow.gradeAPct ?? null,
          gradeBPct: lotRow.gradeBPct ?? null,
          gradeCPct: lotRow.gradeCPct ?? null,
          avgBrix: lotRow.avgBrix ?? null,
          treatmentMethod: lotRow.treatmentMethod ? String(lotRow.treatmentMethod) : null,
          transporter: lotRow.transporter ? String(lotRow.transporter) : null,
          vehiclePlate: lotRow.vehiclePlate ? String(lotRow.vehiclePlate) : null,
          temperatureC: lotRow.temperatureC ?? null,
          departedAt: lotRow.departedAt ? String(lotRow.departedAt) : null,
          estimatedArrival: lotRow.estimatedArrival ? String(lotRow.estimatedArrival) : null,
        },
      };
    }

    // Dữ liệu Cấp 3 (Cơ quan quản lý: danh sách hộ/thửa nguồn kèm GIS, nhật ký canh tác & thuốc BVTV, biên bản kiểm tra)
    let authorityData: Record<string, unknown> | undefined;
    if (viewerTier === "authority") {
      const [diariesRes, minutesRes, violationsRes] = await Promise.all([
        contribHouseholdIds.length > 0
          ? this.db.query(
              `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days
               FROM (
                 SELECT sr.sprayed_on AS entry_on,
                        COALESCE(sr.plot_code, '') AS plot_code,
                        ('Phun thuốc BVTV: ' || p.name) AS activity,
                        ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                        h.name AS recorder,
                        h.name AS household_name,
                        'spray'::text AS kind,
                        sr.mrl_status,
                        sr.isolation_days,
                        sr.id AS sort_id
                 FROM spray_records sr
                 JOIN pesticides p ON p.id = sr.pesticide_id
                 JOIN households h ON h.id = sr.household_id
                 WHERE sr.household_id = ANY($1::bigint[])
                 UNION ALL
                 SELECT je.entry_on,
                        je.plot_code,
                        je.activity,
                        je.detail,
                        je.recorder,
                        h.name AS household_name,
                        'journal'::text AS kind,
                        NULL::text AS mrl_status,
                        NULL::int AS isolation_days,
                        je.id AS sort_id
                 FROM journal_entries je
                 JOIN households h ON h.id = je.household_id
                 WHERE je.household_id = ANY($1::bigint[])
               ) combined
               ORDER BY entry_on DESC, sort_id DESC
               LIMIT 25`,
              [contribHouseholdIds],
            )
          : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
        this.db.query(
          `SELECT code, held_on, location, officer, result
           FROM inspection_minutes
           ORDER BY held_on DESC, id DESC
           LIMIT 8`,
        ),
        contribHouseholdIds.length > 0
          ? this.db.query(
              `SELECT v.severity, v.title, v.household_label, v.detected_on, v.plot_code, v.description, v.status
               FROM violations v
               WHERE EXISTS (
                 SELECT 1 FROM households h
                 WHERE h.id = ANY($1::bigint[])
                   AND (v.household_label ILIKE '%' || h.code || '%' OR v.household_label ILIKE '%' || h.name || '%')
               )
               ORDER BY v.detected_on DESC, v.id DESC
               LIMIT 10`,
              [contribHouseholdIds],
            )
          : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      ]);

      authorityData = {
        sourceHouseholds: contribHouseholds.map((h) => ({
          householdCode: h.household_code,
          householdName: h.household_name,
          villageName: h.village_name,
          phone: h.phone,
          cccdMasked: h.cccd_masked,
          status: h.household_status,
          publicTraceConsent: h.public_trace_consent,
          contributedKg: h.weight_kg,
          contributedPlotCode: h.plot_code || null,
          plots: sourcePlots
            .filter((p) =>
              h.plot_code
                ? p.code.toUpperCase() === h.plot_code.toUpperCase()
                : Number(p.household_id) === Number(h.household_id),
            )
            .map((p) => ({
              plotCode: p.code,
              zoneCode: p.zone_code,
              sheetNo: p.sheet_no,
              parcelNo: p.parcel_no,
              variety: p.variety,
              plantedYear: p.planted_year,
              areaHa: p.area_ha,
              status: p.status,
              source: p.source,
              lat: p.lat,
              lng: p.lng,
              geometryJson: p.geometry_json,
            })),
        })),
        cultivationDiaries: camelRows(diariesRes.rows),
        inspectionMinutes: camelRows(minutesRes.rows),
        internalViolations: camelRows(violationsRes.rows),
      };
    }

    const publicLotStatus = isRevoked ? "revoked" : lotRow.status === "sampling" ? "pending" : "valid";
    const resolvedQrToken = String(scannedItem?.qrToken || lotRow.qrToken || "").trim() || null;

    return {
      verifiedAt: verification.verifiedAt,
      accessControl: this.buildAccessControlPayload(access, ctx),
      // Trường tương thích ngược đã khử hoàn toàn thông tin nhạy cảm
      lot: {
        code: lotCode,
        qrCode: String(lotRow.qrCode || lotCode),
        qrToken: resolvedQrToken,
        harvestedOn,
        packedOn,
        exportedOn,
        weightTons: Number(lotRow.weightTons || 0),
        householdCount: participatingHouseholdCount,
        market: String(lotRow.market || "Xuất khẩu chính ngạch"),
        status: isRevoked ? "revoked" : String(lotRow.status),
        packhouseCode,
      },
      item: scannedItem,
      // 9 nhóm thông tin chuẩn Mục 1 (Công khai) + trạng thái thời gian thực (4c)
      publicData: {
        lotIdentity: {
          productName: "Sầu riêng tươi nguyên trái (Durio zibethinus)",
          variety: varietyDisplay,
          lotCode,
          qrToken: resolvedQrToken,
          scannedCode: cleanCode,
          traceUnit,
          traceUnitLabel:
            traceUnit === "box"
              ? "Thùng đóng gói định danh lô"
              : traceUnit === "fruit"
                ? "Tem định danh quả (Dòng cao cấp)"
                : "Lô hàng xuất xưởng / xuất khẩu",
          weightTons: Number(lotRow.weightTons || 0),
          itemWeightKg: scannedItem?.weightKg !== undefined ? Number(scannedItem.weightKg) : null,
          itemGrade: scannedItem?.grade ? String(scannedItem.grade) : null,
          market: String(lotRow.market || "Xuất khẩu chính ngạch"),
          status: publicLotStatus,
          statusLabel: isRevoked
            ? "Đã thu hồi - Không lưu thông"
            : lotRow.status === "sampling"
              ? "Đang lấy mẫu kiểm định trước xuất"
              : "Lô hợp lệ - Đủ điều kiện lưu thông",
          revokedReason: isRevoked
            ? String(lotRow.revokedReason || "Thu hồi theo quyết định kiểm soát chất lượng của đơn vị quản lý.")
            : null,
        },
        growingZone: {
          name: `Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né`,
          pucCode: primaryPucCode,
          additionalZoneCount: Math.max(0, distinctZoneCodes.length - 1),
          adminLocation,
          status: pucStatus,
          statusLabel: live.pucStatusLabel,
          statusNote: live.pucNote,
          validUntil: live.pucValidUntil,
          coarseMap,
        },
        producer: {
          cooperativeName: DEFAULT_COOP_NAME,
          groupName: `Liên tổ sản xuất sầu riêng VietGAP xã Cư Né (${participatingHouseholdCount} hộ thành viên liên kết)`,
          participatingHouseholdCount,
          consentedHouseholds: consentedHouseholdNames,
          consentNote:
            consentedHouseholdNames.length > 0
              ? "Chỉ hiển thị tên các hộ thành viên đã xác nhận đồng ý công khai thông tin trên mã QR."
              : "Theo quy định bảo vệ dữ liệu cá nhân, thông tin hộ canh tác được đại diện bởi Hợp tác xã Cư Né.",
        },
        packhouse: {
          name: packhouseName,
          code: packhouseCode,
          address: packhouseAddress,
          status: live.packhouseStatus,
          statusLabel: live.packhouseStatusLabel,
        },
        realtimeStatus: {
          checkedAt: verification.verifiedAt,
          allClear: !isRevoked && !hasRealtimeSuspension && publicLotStatus === "valid",
          hasSuspensionAlert: isRevoked || hasRealtimeSuspension,
          lotStatus: publicLotStatus,
          pucCode: primaryPucCode,
          pucStatus: live.pucStatus,
          pucStatusLabel: live.pucStatusLabel,
          pucNote: live.pucNote,
          packhouseCode,
          packhouseStatus: live.packhouseStatus,
          packhouseStatusLabel: live.packhouseStatusLabel,
        },
        milestones: {
          harvestedOn,
          packedOn,
          exportedOn,
          sampledOn: latestLabSampledOn,
        },
        timeline,
        farmingProcess: {
          standard: "VietGAP & Nghị định thư Kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
          complianceConfirmed,
          complianceNote: complianceConfirmed
            ? "Xác nhận tuân thủ quy trình canh tác thống nhất và đảm bảo thời gian cách ly thuốc BVTV an toàn trước ngày thu hoạch."
            : "Đang trong diện rà soát bổ sung hồ sơ tuân thủ quy trình kỹ thuật.",
          inspectionNote: lastInspectionOn
            ? `Vùng trồng đã được kiểm tra, giám sát định kỳ (đợt kiểm tra gần nhất: ${lastInspectionOn}).`
            : "Vùng trồng được Ban Kỹ thuật HTX Cư Né và cơ quan chuyên môn kiểm tra định kỳ trong vụ.",
        },
        labTests: publicLabTests,
        phytosanitary: {
          certNo: phytoCertNo,
          issuedOn: phytoIssuedOn,
          authority: "Chi cục Kiểm dịch Thực vật Vùng / Cục Bảo vệ Thực vật",
          statusLabel: phytoCertNo
            ? "Đã cấp giấy chứng nhận kiểm dịch thực vật"
            : "Cập nhật khi hoàn tất hồ sơ thông quan xuất khẩu",
        },
        verification,
      },
      ...(enterpriseData ? { enterpriseData } : {}),
      ...(authorityData ? { authorityData } : {}),
    };
  }

  /** Xây dựng phản hồi 3 cấp cho Tem nông hộ dòng cao cấp (farmer_stamps). */
  private async buildFarmerStampTraceResponse(params: {
    cleanCode: string;
    rawStampRow: Record<string, unknown>;
    hasPlots: boolean;
    ctx: TraceRequestContext;
  }) {
    const { cleanCode, hasPlots, ctx } = params;
    const raw = camelRow<Record<string, unknown>>(params.rawStampRow);
    const householdId = Number(raw.householdId);
    const stampPlotCode = typeof raw.plotCode === "string" && raw.plotCode.trim() ? raw.plotCode.trim() : null;
    const isRevoked = raw.status === "revoked";
    const isDraftOrUnverified =
      raw.status === "allocated" || raw.plotStatus === "pending" || raw.householdStatus === "pending";
    const hasConsent = Boolean(raw.publicTraceConsent) && raw.householdStatus === "qualified" && !isDraftOrUnverified;

    const [latestLotRes, latestMinuteRes] = await Promise.all([
      this.db.query(
        `SELECT hl.code, hl.qr_token, hl.enterprise_id, hl.coop_code, hl.packed_on, hl.exported_on, hl.market, hl.status,
                hl.packhouse_code, COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                COALESCE(hl.packhouse_address, e.address) AS packhouse_address,
                hl.phytosanitary_cert_no, hl.phytosanitary_issued_on
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         LEFT JOIN enterprises e ON e.id = hl.enterprise_id
         WHERE hc.household_id = $1
         ORDER BY hl.harvested_on DESC, hc.id DESC
         LIMIT 1`,
        [householdId],
      ),
      this.db.query<{ held_on: string }>(
        `SELECT held_on::text AS held_on FROM inspection_minutes ORDER BY held_on DESC, id DESC LIMIT 1`,
      ),
    ]);

    const derivedZone = String(raw.householdCode || "").replace(/-(?:H|T)\d+$/i, "");
    const pucCode = String(
      raw.zoneCode || (derivedZone && derivedZone !== raw.householdCode ? derivedZone : "VN-DLOR-0086"),
    );
    const adminLocation = this.resolveAdminLocation(raw.villageName, pucCode);
    const linkedLot = latestLotRes.rows[0] ? camelRow<Record<string, unknown>>(latestLotRes.rows[0]) : null;

    const access = this.evaluateAccessAndScope(ctx, {
      enterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
      coopCode: linkedLot?.coopCode ? String(linkedLot.coopCode) : "HTX-CUNE",
      villageIds: raw.villageId !== null && raw.villageId !== undefined ? [Number(raw.villageId)] : [],
      adminLocations: [adminLocation],
    });
    const viewerTier = access.viewerTier;
    const verifiedLabClause = viewerTier === "authority" ? "" : "AND record_status = 'verified'";

    const labTestsRes = await this.db.query(
      `SELECT code, plot_code, sampled_on, cd_mg_kg::float8 AS cd_mg_kg, yellow_o_positive,
              residue_mg_kg::float8 AS residue_mg_kg, chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
              result, lab, ${publicAttachmentUrlSql("scan_attachment_id")} AS scan_url
       FROM lab_tests
       WHERE household_id = $1 ${verifiedLabClause}
       ORDER BY (CASE WHEN $2::text IS NOT NULL AND upper(plot_code) = upper($2) THEN 0 ELSE 1 END),
                sampled_on DESC, id DESC
       LIMIT 4`,
      [householdId, stampPlotCode],
    );

    const packhouseName = String(linkedLot?.packhouseName || DEFAULT_PACKHOUSE_NAME);
    const packhouseCode = String(linkedLot?.packhouseCode || DEFAULT_PACKHOUSE_CODE);
    const packhouseAddress = String(linkedLot?.packhouseAddress || DEFAULT_PACKHOUSE_ADDRESS);

    const live = await this.resolveLiveZoneAndPackhouseStatus({
      pucCode,
      enterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
      packhouseCode,
      hasPlotOrHouseholdViolation: raw.plotStatus === "violation" || raw.householdStatus === "violation",
      hasPendingSource: isDraftOrUnverified,
    });
    const pucStatus = live.pucStatus;
    const hasRealtimeSuspension =
      live.pucStatus === "suspended" ||
      live.pucStatus === "revoked" ||
      live.packhouseStatus !== "active";

    const canonicalKey = String(raw.qrToken || raw.serialCode);
    const verification = await this.recordScanAndVerify({
      scannedCode: cleanCode,
      canonicalKey,
      resolvedLotCode: linkedLot ? String(linkedLot.code) : null,
      traceUnit: "fruit",
      isRevoked,
      hasRealtimeSuspension,
      access,
      ctx,
    });

    const coarseMap = await this.resolveCoarseZoneMap(hasPlots, pucCode, adminLocation);
    const rawLabs = camelRows<{
      code: string;
      plotCode: string;
      sampledOn: string;
      cdMgKg: number;
      yellowOPositive: boolean;
      residueMgKg: number;
      chlorpyrifosMgKg: number | null;
      result: string;
      lab: string;
      scanUrl: string | null;
    }>(labTestsRes.rows);
    const latestLab = rawLabs[0] ?? null;

    const harvestedOn =
      toIsoDateOnly(raw.harvestDate) || toIsoDateOnly(raw.activatedAt);
    const packedOn = toIsoDateOnly(linkedLot?.packedOn) || addDaysIso(harvestedOn, 1);
    const exportedOn = toIsoDateOnly(linkedLot?.exportedOn);
    const lastInspectionOn = toIsoDateOnly(latestMinuteRes.rows[0]?.held_on);

    const stampWeightKg =
      raw.fruitWeightKg !== null && raw.fruitWeightKg !== undefined ? Number(raw.fruitWeightKg) : null;

    const timeline = this.buildFiveStepTimeline({
      pucCode,
      pucStatus,
      packhouseStatus: live.packhouseStatus,
      lastFarmCheckOn: lastInspectionOn,
      harvestedOn,
      packedOn,
      packhouseName,
      packhouseCode,
      latestLabOn: toIsoDateOnly(latestLab?.sampledOn),
      latestLabName: latestLab?.lab ?? null,
      latestLabResult: latestLab?.result ?? null,
      exportedOn,
      lotStatus: isRevoked ? "revoked" : raw.status === "activated" ? "exported" : "sampling",
      market: String(linkedLot?.market || "Dòng tuyển chọn cao cấp & Xuất khẩu"),
    });

    // Dữ liệu Cấp 2 (Doanh nghiệp)
    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise) {
      enterpriseData = {
        sourceZones: [
          {
            zoneCode: pucCode,
            villageName: String(raw.villageName || "Xã Cư Né"),
            householdCount: 1,
            areaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 0,
            weightKg: stampWeightKg ?? 0,
            sharePct: 100,
            status: pucStatus === "active" ? "Đủ điều kiện" : "Cần rà soát",
          },
        ],
        totalSourceWeightKg: stampWeightKg ?? 0,
        detailedLabTests: rawLabs.map((lt) => ({
          code: lt.code,
          zoneCode: pucCode,
          sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
          lab: lt.lab,
          cdMgKg: lt.cdMgKg,
          cdThresholdMgKg: 0.05,
          yellowOPositive: lt.yellowOPositive,
          residueMgKg: lt.residueMgKg,
          residueThresholdMgKg: 0.1,
          chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
          result: lt.result,
          scanUrl: lt.scanUrl,
        })),
        packingSpecs: null,
      };
    }

    // Dữ liệu Cấp 3 (Cơ quan quản lý)
    let authorityData: Record<string, unknown> | undefined;
    if (viewerTier === "authority") {
      const [diariesRes, minutesRes, violationsRes] = await Promise.all([
        this.db.query(
          `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days
           FROM (
             SELECT sr.sprayed_on AS entry_on,
                    COALESCE(sr.plot_code, '') AS plot_code,
                    ('Phun thuốc BVTV: ' || p.name) AS activity,
                    ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                    h.name AS recorder,
                    h.name AS household_name,
                    'spray'::text AS kind,
                    sr.mrl_status,
                    sr.isolation_days,
                    sr.id AS sort_id
             FROM spray_records sr
             JOIN pesticides p ON p.id = sr.pesticide_id
             JOIN households h ON h.id = sr.household_id
             WHERE sr.household_id = $1
             UNION ALL
             SELECT je.entry_on,
                    je.plot_code,
                    je.activity,
                    je.detail,
                    je.recorder,
                    $2::text AS household_name,
                    'journal'::text AS kind,
                    NULL::text AS mrl_status,
                    NULL::int AS isolation_days,
                    je.id AS sort_id
             FROM journal_entries je
             WHERE je.household_id = $1
           ) combined
           ORDER BY entry_on DESC, sort_id DESC
           LIMIT 20`,
          [householdId, String(raw.householdName || "")],
        ),
        this.db.query(
          `SELECT code, held_on, location, officer, result
           FROM inspection_minutes
           ORDER BY held_on DESC, id DESC
           LIMIT 6`,
        ),
        this.db.query(
          `SELECT severity, title, household_label, detected_on, plot_code, description, status
           FROM violations
           WHERE (plot_code IS NOT NULL AND $1::text IS NOT NULL AND upper(plot_code) = upper($1))
              OR household_label ILIKE '%' || $2 || '%'
           ORDER BY detected_on DESC, id DESC
           LIMIT 6`,
          [stampPlotCode, String(raw.householdCode || "")],
        ),
      ]);

      authorityData = {
        sourceHouseholds: [
          {
            householdCode: String(raw.householdCode),
            householdName: String(raw.householdName),
            villageName: String(raw.villageName || ""),
            phone: String(raw.householdPhone || ""),
            cccdMasked: String(raw.cccdMasked || ""),
            status: String(raw.householdStatus || "qualified"),
            publicTraceConsent: Boolean(raw.publicTraceConsent),
            contributedKg: stampWeightKg,
            contributedPlotCode: stampPlotCode,
            plots: stampPlotCode
              ? [
                  {
                    plotCode: stampPlotCode,
                    zoneCode: pucCode,
                    sheetNo: (raw.sheetNo as string | null) ?? null,
                    parcelNo: (raw.parcelNo as string | null) ?? null,
                    variety: (raw.variety as string | null) ?? null,
                    plantedYear: raw.plantedYear !== null && raw.plantedYear !== undefined ? Number(raw.plantedYear) : null,
                    areaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 0,
                    status: String(raw.plotStatus || "approved"),
                    source: (raw.plotSource as string | null) ?? null,
                    lat: raw.lat !== null && raw.lat !== undefined ? Number(raw.lat) : null,
                    lng: raw.lng !== null && raw.lng !== undefined ? Number(raw.lng) : null,
                    geometryJson: (raw.geometryJson as string | null) ?? null,
                  },
                ]
              : [],
          },
        ],
        cultivationDiaries: camelRows(diariesRes.rows),
        inspectionMinutes: camelRows(minutesRes.rows),
        internalViolations: camelRows(violationsRes.rows),
      };
    }

    const resolvedQrToken = raw.qrToken ? String(raw.qrToken) : null;
    // (4f) Không lộ dữ liệu nháp hộ dân chưa duyệt trên trang công khai
    const sanitizedFarmerStamp = {
      serialCode: String(raw.serialCode),
      qrToken: resolvedQrToken,
      status: String(raw.status),
      activatedAt: raw.activatedAt ?? null,
      fruitWeightKg: isDraftOrUnverified && viewerTier === "public" ? null : stampWeightKg,
      grade: isDraftOrUnverified && viewerTier === "public" ? null : raw.grade ? String(raw.grade) : null,
      harvestDate: isDraftOrUnverified && viewerTier === "public" ? null : harvestedOn,
      ...(hasConsent ? { householdName: String(raw.householdName) } : {}),
    };

    const publicStampStatus = isRevoked ? "revoked" : isDraftOrUnverified ? "unverified" : "valid";

    return {
      verifiedAt: verification.verifiedAt,
      isFarmerStamp: true,
      farmerStamp: sanitizedFarmerStamp,
      lot: {
        code: linkedLot ? String(linkedLot.code) : String(raw.serialCode),
        qrCode: String(raw.serialCode),
        qrToken: resolvedQrToken,
        harvestedOn,
        packedOn,
        exportedOn,
        weightTons: stampWeightKg !== null ? Number((stampWeightKg / 1000).toFixed(4)) : 0,
        householdCount: 1,
        market: String(linkedLot?.market || "Hàng cao cấp thương hiệu riêng & Xuất khẩu"),
        status: isRevoked ? "revoked" : raw.status === "activated" ? "exported" : "sampling",
        packhouseCode,
      },
      accessControl: this.buildAccessControlPayload(access, ctx),
      publicData: {
        lotIdentity: {
          productName: "Sầu riêng tuyển chọn thương hiệu HTX Cư Né",
          variety: String(raw.variety || "Monthong (Dona) & Ri6"),
          lotCode: linkedLot ? String(linkedLot.code) : String(raw.serialCode),
          qrToken: resolvedQrToken,
          scannedCode: cleanCode,
          traceUnit: "fruit",
          traceUnitLabel: "Tem định danh từng quả (Dòng cao cấp / Thương hiệu riêng)",
          weightTons: stampWeightKg !== null ? Number((stampWeightKg / 1000).toFixed(4)) : 0,
          itemWeightKg: isDraftOrUnverified && viewerTier === "public" ? null : stampWeightKg,
          itemGrade: isDraftOrUnverified && viewerTier === "public" ? null : raw.grade ? String(raw.grade) : null,
          market: String(linkedLot?.market || "Dòng cao cấp & Xuất khẩu chính ngạch"),
          status: publicStampStatus,
          statusLabel: isRevoked
            ? "Tem đã thu hồi - Không lưu thông"
            : isDraftOrUnverified
              ? "Chưa kiểm chứng - Bản khai chưa duyệt"
              : "Hợp lệ - Đã kích hoạt xuất vườn",
          revokedReason: isRevoked ? "Tem đã bị thu hồi trên hệ thống quản lý của Hợp tác xã." : null,
        },
        growingZone: {
          name: `Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né`,
          pucCode,
          additionalZoneCount: 0,
          adminLocation,
          status: pucStatus,
          statusLabel: live.pucStatusLabel,
          statusNote: live.pucNote,
          validUntil: live.pucValidUntil,
          coarseMap,
        },
        producer: {
          cooperativeName: DEFAULT_COOP_NAME,
          groupName: "Nhóm vườn sầu riêng VietGAP HTX Cư Né",
          participatingHouseholdCount: 1,
          consentedHouseholds: hasConsent ? [String(raw.householdName)] : [],
          consentNote: hasConsent
            ? "Hộ thành viên đã đồng ý công khai tên trên tem truy xuất."
            : "Theo quy định bảo vệ dữ liệu cá nhân, thông tin hộ canh tác được đại diện bởi Hợp tác xã Cư Né.",
        },
        packhouse: {
          name: packhouseName,
          code: packhouseCode,
          address: packhouseAddress,
          status: live.packhouseStatus,
          statusLabel: live.packhouseStatusLabel,
        },
        realtimeStatus: {
          checkedAt: verification.verifiedAt,
          allClear: !isRevoked && !hasRealtimeSuspension && publicStampStatus === "valid",
          hasSuspensionAlert: isRevoked || hasRealtimeSuspension,
          lotStatus: publicStampStatus,
          pucCode,
          pucStatus: live.pucStatus,
          pucStatusLabel: live.pucStatusLabel,
          pucNote: live.pucNote,
          packhouseCode,
          packhouseStatus: live.packhouseStatus,
          packhouseStatusLabel: live.packhouseStatusLabel,
        },
        milestones: {
          harvestedOn,
          packedOn,
          exportedOn,
          sampledOn: toIsoDateOnly(latestLab?.sampledOn),
        },
        timeline,
        farmingProcess: {
          standard: "VietGAP & Nghị định thư Kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
          complianceConfirmed: pucStatus === "active" && !isDraftOrUnverified && latestLab?.result !== "fail",
          complianceNote:
            "Sản phẩm được thu hái từ vùng trồng áp dụng quy trình VietGAP và kiểm soát thời gian cách ly thuốc BVTV.",
          inspectionNote: lastInspectionOn
            ? `Vùng trồng đã được kiểm tra định kỳ (đợt gần nhất: ${lastInspectionOn}).`
            : "Vùng trồng được kiểm tra, giám sát định kỳ bởi Ban Kỹ thuật HTX Cư Né.",
        },
        labTests: rawLabs.slice(0, 3).map((lt) => ({
          code: lt.code,
          sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
          lab: lt.lab,
          cdMgKg: lt.cdMgKg,
          yellowOPositive: lt.yellowOPositive,
          residueMgKg: lt.residueMgKg,
          chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
          result: lt.result,
          scanUrl: lt.scanUrl,
        })),
        phytosanitary: {
          certNo: linkedLot?.phytosanitaryCertNo ? String(linkedLot.phytosanitaryCertNo) : null,
          issuedOn: toIsoDateOnly(linkedLot?.phytosanitaryIssuedOn),
          authority: "Chi cục Kiểm dịch Thực vật Vùng / Cục Bảo vệ Thực vật",
          statusLabel: linkedLot?.phytosanitaryCertNo
            ? "Đã cấp giấy chứng nhận kiểm dịch thực vật theo lô"
            : "Áp dụng theo lô xuất khẩu của cơ sở đóng gói",
        },
        verification,
      },
      ...(enterpriseData ? { enterpriseData } : {}),
      ...(authorityData ? { authorityData } : {}),
    };
  }

  /** Xây dựng phản hồi 3 cấp khi quét mã vùng / biển vườn (plots) – Ẩn hoàn toàn tọa độ thửa & dữ liệu cá nhân ở Cấp 1. */
  private async buildPlotTraceResponse(params: {
    cleanCode: string;
    rawPlotRow: Record<string, unknown>;
    hasPlots: boolean;
    ctx: TraceRequestContext;
  }) {
    const { cleanCode, hasPlots, ctx } = params;
    const raw = camelRow<Record<string, unknown>>(params.rawPlotRow);
    const plotHouseholdId =
      raw.householdId !== null && raw.householdId !== undefined ? Number(raw.householdId) : null;
    const isSuspended = raw.status === "violation" || raw.householdStatus === "violation";
    const isDraftOrUnverified = raw.status === "pending" || raw.householdStatus === "pending";
    const hasConsent =
      Boolean(raw.publicTraceConsent) &&
      !isDraftOrUnverified &&
      raw.status === "approved" &&
      raw.householdStatus === "qualified";

    const derivedZone = String(raw.householdCode || "").replace(/-(?:H|T)\d+$/i, "");
    const pucCode =
      typeof raw.zoneCode === "string" && raw.zoneCode.trim()
        ? raw.zoneCode.trim()
        : derivedZone && derivedZone !== raw.householdCode
          ? derivedZone
          : "VN-DLOR-0086";
    const adminLocation = this.resolveAdminLocation(raw.village, pucCode);

    const [latestLotRes, latestMinuteRes] = await Promise.all([
      plotHouseholdId
        ? this.db.query(
            `SELECT hl.code, hl.qr_token, hl.enterprise_id, hl.coop_code, hl.harvested_on, hl.packed_on, hl.exported_on,
                    hl.weight_tons::float8 AS weight_tons, hl.market, hl.status,
                    hl.packhouse_code, COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                    COALESCE(hl.packhouse_address, e.address) AS packhouse_address,
                    hl.phytosanitary_cert_no, hl.phytosanitary_issued_on,
                    hc.weight_kg::float8 AS contributed_kg
             FROM harvest_contributions hc
             JOIN harvest_lots hl ON hl.id = hc.lot_id
             LEFT JOIN enterprises e ON e.id = hl.enterprise_id
             WHERE hc.household_id = $1
             ORDER BY hl.harvested_on DESC, hc.id DESC
             LIMIT 1`,
            [plotHouseholdId],
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      this.db.query<{ held_on: string }>(
        `SELECT held_on::text AS held_on FROM inspection_minutes ORDER BY held_on DESC, id DESC LIMIT 1`,
      ),
    ]);

    const linkedLot = latestLotRes.rows[0] ? camelRow<Record<string, unknown>>(latestLotRes.rows[0]) : null;
    const access = this.evaluateAccessAndScope(ctx, {
      enterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
      coopCode: linkedLot?.coopCode ? String(linkedLot.coopCode) : "HTX-CUNE",
      villageIds: raw.villageId !== null && raw.villageId !== undefined ? [Number(raw.villageId)] : [],
      adminLocations: [adminLocation],
    });
    const viewerTier = access.viewerTier;
    const verifiedLabClause = viewerTier === "authority" ? "" : "AND record_status = 'verified'";

    const labTestsRes = await this.db.query(
      `SELECT code, plot_code, sampled_on, cd_mg_kg::float8 AS cd_mg_kg, yellow_o_positive,
              residue_mg_kg::float8 AS residue_mg_kg, chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
              result, lab, ${publicAttachmentUrlSql("scan_attachment_id")} AS scan_url
       FROM lab_tests
       WHERE (
         upper(plot_code) = upper($1)
         OR ($2::bigint IS NOT NULL AND household_id = $2)
       )
       ${verifiedLabClause}
       ORDER BY (CASE WHEN upper(plot_code) = upper($1) THEN 0 ELSE 1 END), sampled_on DESC, id DESC
       LIMIT 4`,
      [raw.code, plotHouseholdId],
    );

    const packhouseName = String(linkedLot?.packhouseName || DEFAULT_PACKHOUSE_NAME);
    const packhouseCode = String(linkedLot?.packhouseCode || DEFAULT_PACKHOUSE_CODE);
    const packhouseAddress = String(linkedLot?.packhouseAddress || DEFAULT_PACKHOUSE_ADDRESS);

    const live = await this.resolveLiveZoneAndPackhouseStatus({
      pucCode,
      enterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
      packhouseCode,
      hasPlotOrHouseholdViolation: isSuspended,
      hasPendingSource: isDraftOrUnverified,
    });
    const pucStatus = live.pucStatus;
    const hasRealtimeSuspension =
      live.pucStatus === "suspended" ||
      live.pucStatus === "revoked" ||
      live.packhouseStatus !== "active";

    const verification = await this.recordScanAndVerify({
      scannedCode: cleanCode,
      canonicalKey: String(raw.code),
      resolvedLotCode: linkedLot ? String(linkedLot.code) : null,
      traceUnit: "puc_zone",
      isRevoked: isSuspended,
      hasRealtimeSuspension,
      access,
      ctx,
    });

    const coarseMap = await this.resolveCoarseZoneMap(hasPlots, pucCode, adminLocation);

    const rawLabs = camelRows<{
      code: string;
      plotCode: string;
      sampledOn: string;
      cdMgKg: number;
      yellowOPositive: boolean;
      residueMgKg: number;
      chlorpyrifosMgKg: number | null;
      result: string;
      lab: string;
      scanUrl: string | null;
    }>(labTestsRes.rows);
    const latestLab = rawLabs[0] ?? null;

    const harvestedOn = toIsoDateOnly(linkedLot?.harvestedOn);
    const packedOn = toIsoDateOnly(linkedLot?.packedOn);
    const exportedOn = toIsoDateOnly(linkedLot?.exportedOn);
    const lastInspectionOn = toIsoDateOnly(latestMinuteRes.rows[0]?.held_on);

    const timeline = this.buildFiveStepTimeline({
      pucCode,
      pucStatus,
      packhouseStatus: live.packhouseStatus,
      lastFarmCheckOn: lastInspectionOn,
      harvestedOn,
      packedOn,
      packhouseName,
      packhouseCode,
      latestLabOn: toIsoDateOnly(latestLab?.sampledOn),
      latestLabName: latestLab?.lab ?? null,
      latestLabResult: latestLab?.result ?? null,
      exportedOn,
      lotStatus: isSuspended ? "revoked" : linkedLot ? String(linkedLot.status) : "sampling",
      market: String(linkedLot?.market || "Xuất khẩu chính ngạch & Nội địa"),
    });

    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise) {
      const contribKg = linkedLot?.contributedKg ? Number(linkedLot.contributedKg) : 0;
      enterpriseData = {
        sourceZones: [
          {
            zoneCode: pucCode,
            villageName: String(raw.village || "Xã Cư Né"),
            householdCount: 1,
            areaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 0,
            weightKg: contribKg,
            sharePct: 100,
            status: pucStatus === "active" ? "Đủ điều kiện" : "Cần rà soát",
          },
        ],
        totalSourceWeightKg: contribKg,
        detailedLabTests: rawLabs.map((lt) => ({
          code: lt.code,
          zoneCode: pucCode,
          sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
          lab: lt.lab,
          cdMgKg: lt.cdMgKg,
          cdThresholdMgKg: 0.05,
          yellowOPositive: lt.yellowOPositive,
          residueMgKg: lt.residueMgKg,
          residueThresholdMgKg: 0.1,
          chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
          result: lt.result,
          scanUrl: lt.scanUrl,
        })),
        packingSpecs: null,
      };
    }

    let authorityData: Record<string, unknown> | undefined;
    if (viewerTier === "authority") {
      const [diariesRes, minutesRes, violationsRes] = await Promise.all([
        this.db.query(
          `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days
           FROM (
             SELECT sr.sprayed_on AS entry_on,
                    COALESCE(sr.plot_code, $1::text) AS plot_code,
                    ('Phun thuốc BVTV: ' || p.name) AS activity,
                    ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                    h.name AS recorder,
                    h.name AS household_name,
                    'spray'::text AS kind,
                    sr.mrl_status,
                    sr.isolation_days,
                    sr.id AS sort_id
             FROM spray_records sr
             JOIN pesticides p ON p.id = sr.pesticide_id
             JOIN households h ON h.id = sr.household_id
             WHERE upper(sr.plot_code) = upper($1)
                OR ($2::bigint IS NOT NULL AND sr.household_id = $2)
             UNION ALL
             SELECT je.entry_on,
                    je.plot_code,
                    je.activity,
                    je.detail,
                    je.recorder,
                    $3::text AS household_name,
                    'journal'::text AS kind,
                    NULL::text AS mrl_status,
                    NULL::int AS isolation_days,
                    je.id AS sort_id
             FROM journal_entries je
             WHERE upper(je.plot_code) = upper($1)
           ) combined
           ORDER BY entry_on DESC, sort_id DESC
           LIMIT 20`,
          [raw.code, plotHouseholdId, String(raw.ownerName || "")],
        ),
        this.db.query(
          `SELECT code, held_on, location, officer, result
           FROM inspection_minutes
           ORDER BY held_on DESC, id DESC
           LIMIT 6`,
        ),
        this.db.query(
          `SELECT severity, title, household_label, detected_on, plot_code, description, status
           FROM violations
           WHERE upper(COALESCE(plot_code, '')) = upper($1)
              OR ($2::text IS NOT NULL AND $2 <> '' AND household_label ILIKE '%' || $2 || '%')
           ORDER BY detected_on DESC, id DESC
           LIMIT 6`,
          [raw.code, String(raw.householdCode || "")],
        ),
      ]);

      authorityData = {
        sourceHouseholds: [
          {
            householdCode: String(raw.householdCode || "Chưa gán mã hộ"),
            householdName: String(raw.ownerName || "Chưa cập nhật"),
            villageName: String(raw.village || ""),
            phone: String(raw.householdPhone || ""),
            cccdMasked: String(raw.cccdMasked || ""),
            status: String(raw.householdStatus || raw.status || "pending"),
            publicTraceConsent: Boolean(raw.publicTraceConsent),
            contributedKg: linkedLot?.contributedKg ? Number(linkedLot.contributedKg) : null,
            contributedPlotCode: String(raw.code),
            plots: [
              {
                plotCode: String(raw.code),
                zoneCode: pucCode,
                sheetNo: (raw.sheetNo as string | null) ?? null,
                parcelNo: (raw.parcelNo as string | null) ?? null,
                variety: (raw.variety as string | null) ?? null,
                plantedYear: raw.plantedYear !== null && raw.plantedYear !== undefined ? Number(raw.plantedYear) : null,
                areaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 0,
                status: String(raw.status || "pending"),
                source: (raw.source as string | null) ?? null,
                lat: raw.lat !== null && raw.lat !== undefined ? Number(raw.lat) : null,
                lng: raw.lng !== null && raw.lng !== undefined ? Number(raw.lng) : null,
                geometryJson: (raw.geometryJson as string | null) ?? null,
              },
            ],
          },
        ],
        cultivationDiaries: camelRows(diariesRes.rows),
        inspectionMinutes: camelRows(minutesRes.rows),
        internalViolations: camelRows(violationsRes.rows),
      };
    }

    const publicPlotStatus = isSuspended ? "revoked" : isDraftOrUnverified ? "unverified" : "valid";
    const resolvedQrToken = linkedLot?.qrToken ? String(linkedLot.qrToken) : null;

    return {
      verifiedAt: verification.verifiedAt,
      isPlotSignboard: true,
      accessControl: this.buildAccessControlPayload(access, ctx),
      publicData: {
        lotIdentity: {
          productName: "Sầu riêng vùng trồng định danh (Durio zibethinus)",
          variety: String(raw.variety || "Ri6 & Monthong (Dona)"),
          lotCode: linkedLot ? String(linkedLot.code) : pucCode,
          qrToken: resolvedQrToken,
          scannedCode: cleanCode,
          traceUnit: "puc_zone",
          traceUnitLabel: "Điểm vùng trồng nguyên liệu (Liên kết lô thu hoạch)",
          weightTons: linkedLot?.weightTons ? Number(linkedLot.weightTons) : 0,
          itemWeightKg: null,
          itemGrade: null,
          market: String(linkedLot?.market || "Xuất khẩu chính ngạch & Nội địa"),
          status: publicPlotStatus,
          statusLabel: isSuspended
            ? "Tạm dừng hiệu lực vùng nguyên liệu"
            : isDraftOrUnverified
              ? "Chưa kiểm chứng - Hồ sơ thửa đang chờ duyệt"
              : "Vùng nguyên liệu hợp lệ",
          revokedReason: isSuspended ? "Đang tạm dừng hiệu lực để rà soát kỹ thuật canh tác." : null,
        },
        growingZone: {
          name: `Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né`,
          pucCode,
          additionalZoneCount: 0,
          adminLocation,
          status: pucStatus,
          statusLabel: live.pucStatusLabel,
          statusNote: live.pucNote,
          validUntil: live.pucValidUntil,
          coarseMap,
        },
        producer: {
          cooperativeName: DEFAULT_COOP_NAME,
          groupName: `Nhóm vườn liên kết ${raw.village || "xã Cư Né"} - HTX Cư Né`,
          participatingHouseholdCount: 1,
          consentedHouseholds: hasConsent && raw.ownerName ? [String(raw.ownerName)] : [],
          consentNote:
            hasConsent && raw.ownerName
              ? "Hộ thành viên đã đồng ý công khai tên trên hồ sơ vùng trồng."
              : "Theo quy định bảo vệ dữ liệu cá nhân, tọa độ thửa riêng lẻ và thông tin chủ hộ không hiển thị công khai.",
        },
        packhouse: {
          name: packhouseName,
          code: packhouseCode,
          address: packhouseAddress,
          status: live.packhouseStatus,
          statusLabel: live.packhouseStatusLabel,
        },
        realtimeStatus: {
          checkedAt: verification.verifiedAt,
          allClear: !isSuspended && !hasRealtimeSuspension && publicPlotStatus === "valid",
          hasSuspensionAlert: isSuspended || hasRealtimeSuspension,
          lotStatus: publicPlotStatus,
          pucCode,
          pucStatus: live.pucStatus,
          pucStatusLabel: live.pucStatusLabel,
          pucNote: live.pucNote,
          packhouseCode,
          packhouseStatus: live.packhouseStatus,
          packhouseStatusLabel: live.packhouseStatusLabel,
        },
        milestones: {
          harvestedOn,
          packedOn,
          exportedOn,
          sampledOn: toIsoDateOnly(latestLab?.sampledOn),
        },
        timeline,
        farmingProcess: {
          standard: "VietGAP & Nghị định thư Kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
          complianceConfirmed: pucStatus === "active" && !isDraftOrUnverified && latestLab?.result !== "fail",
          complianceNote:
            "Canh tác theo quy trình VietGAP của HTX Cư Né, kiểm soát chặt chẽ thời gian cách ly thuốc BVTV.",
          inspectionNote: lastInspectionOn
            ? `Vùng trồng đã được kiểm tra định kỳ (đợt gần nhất: ${lastInspectionOn}).`
            : "Vùng trồng đã được Ban Kỹ thuật HTX Cư Né kiểm tra và giám sát.",
        },
        labTests: rawLabs.slice(0, 3).map((lt) => ({
          code: lt.code,
          sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
          lab: lt.lab,
          cdMgKg: lt.cdMgKg,
          yellowOPositive: lt.yellowOPositive,
          residueMgKg: lt.residueMgKg,
          chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
          result: lt.result,
          scanUrl: lt.scanUrl,
        })),
        phytosanitary: {
          certNo: linkedLot?.phytosanitaryCertNo ? String(linkedLot.phytosanitaryCertNo) : null,
          issuedOn: toIsoDateOnly(linkedLot?.phytosanitaryIssuedOn),
          authority: "Chi cục Kiểm dịch Thực vật Vùng / Cục Bảo vệ Thực vật",
          statusLabel: linkedLot?.phytosanitaryCertNo
            ? "Đã cấp giấy chứng nhận kiểm dịch thực vật cho lô liên kết"
            : "Cấp theo từng lô hàng xuất khẩu tại cơ sở đóng gói",
        },
        verification,
      },
      ...(enterpriseData ? { enterpriseData } : {}),
      ...(authorityData ? { authorityData } : {}),
    };
  }
}
