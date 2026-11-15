import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { verifyOrderedChain, type VerifiableChainEntry } from "../common/crypto/integrity-chain";
import { forbidden, notFound } from "../common/errors/app.exception";
import { verifyPlotGpsProximity } from "../common/geo/plot-proximity";
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
  auditPass?: string;
  countryCode?: string;
}

export interface ResolvedFieldAuditPass {
  active: boolean;
  id?: number;
  code?: string;
  passToken?: string;
  delegationName?: string;
  organization?: string | null;
  allowedZoneCode?: string | null;
  defaultLang?: "vi" | "en" | "zh";
  expiresAt?: string;
  issuedByName?: string;
  invalidReason?: string | null;
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
    let resolved = false;

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
        resolved = true;
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
          resolved = true;
        }
      }
    }

    if (!resolved && (await this.hasTable("plot_signboard_tokens"))) {
      const sbRes = await this.db.query<{ lat: number | null; lng: number | null }>(
        `SELECT ROUND(AVG(center_lat)::numeric, 2)::float8 AS lat,
                ROUND(AVG(center_lng)::numeric, 2)::float8 AS lng
         FROM plot_signboard_tokens
         WHERE center_lat IS NOT NULL AND center_lng IS NOT NULL
           AND (upper(COALESCE(zone_code, '')) = upper($1) OR $1 = '')`,
        [pucCode || ""],
      );
      if (sbRes.rows[0]?.lat && sbRes.rows[0]?.lng) {
        centerLat = Number(sbRes.rows[0].lat);
        centerLng = Number(sbRes.rows[0].lng);
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

  private buildAccessControlPayload(
    access: EvaluatedTraceAccess,
    ctx: TraceRequestContext,
    fieldAuditPass?: ResolvedFieldAuditPass | null,
  ) {
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
      auditLogged:
        (Boolean(ctx.user) && (access.viewerTier !== "public" || access.scopeDenied)) ||
        Boolean(fieldAuditPass?.active),
      fieldAuditPass: fieldAuditPass ?? null,
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

  /** Danh sách hồ sơ mẫu trên `/trace`: kèm qr_token ngẫu nhiên (/t/:token), mã lô chữ dự phòng và Bảng QR Thửa Đất mẫu. */
  async traceSamples() {
    const hasSignboards = await this.hasTable("plot_signboard_tokens");
    const hasQuotas = await this.hasTable("plot_season_quotas");
    const hasPasses = await this.hasTable("field_audit_passes");

    const [lotsRes, boxesRes, stampsRes, plotsRes, demoPassRes] = await Promise.all([
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
      hasSignboards
        ? this.db.query(
            `SELECT pst.plot_code,
                    pst.qr_token,
                    pst.zone_code,
                    COALESCE(pst.village_name, v.name, 'Xã Cư Né') AS village_name,
                    COALESCE(pst.variety, 'Monthong (Dona) & Ri6') AS variety,
                    pst.area_ha::float8 AS area_ha,
                    pst.tree_count,
                    ${
                      hasQuotas
                        ? `(SELECT q.max_quota_kg::float8 FROM plot_season_quotas q
                            WHERE upper(q.plot_code) = upper(pst.plot_code)
                            ORDER BY q.season_year DESC LIMIT 1)`
                        : "NULL::float8"
                    } AS max_quota_kg,
                    CASE
                      WHEN h.public_trace_consent = true AND h.status = 'qualified' THEN ('Vườn hộ ' || h.name || ' - HTX Cư Né')
                      ELSE $1::text
                    END AS producer_label
             FROM plot_signboard_tokens pst
             LEFT JOIN households h ON h.id = pst.household_id
             LEFT JOIN villages v ON v.id = h.village_id
             ORDER BY pst.plot_code ASC
             LIMIT 6`,
            [DEFAULT_COOP_NAME],
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      hasPasses
        ? this.db.query<{
            code: string;
            pass_token: string;
            delegation_name: string;
            default_lang: string;
            expires_at: Date | string;
          }>(
            `SELECT code, pass_token, delegation_name, default_lang, expires_at
             FROM field_audit_passes
             WHERE status = 'active' AND expires_at > now() AND code = 'AUDIT-2026-CN01'
             LIMIT 1`,
          )
        : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
    ]);

    const combinedUnits = [...camelRows(boxesRes.rows), ...camelRows(stampsRes.rows)].slice(0, 6);
    const demoPassRow = demoPassRes.rows[0] ? camelRow<Record<string, unknown>>(demoPassRes.rows[0]) : null;

    return {
      lots: camelRows(lotsRes.rows),
      stamps: combinedUnits,
      plots: camelRows(plotsRes.rows),
      demoAuditPass: demoPassRow
        ? {
            code: String(demoPassRow.code),
            passToken: String(demoPassRow.passToken),
            delegationName: String(demoPassRow.delegationName),
            defaultLang: String(demoPassRow.defaultLang || "zh"),
            expiresAt: demoPassRow.expiresAt,
          }
        : null,
    };
  }

  /**
   * Kiểm chứng Thẻ Đoàn Thẩm định Thực địa (Field Audit Pass) có thời hạn cho đối tác / đoàn khách mời.
   */
  private async resolveFieldAuditPass(
    ctx: TraceRequestContext,
    pucCode: string,
    scannedCode: string,
    resolvedLotCode: string | null,
    recordAccess = true,
  ): Promise<ResolvedFieldAuditPass | null> {
    const rawPass = ctx.auditPass?.trim();
    if (!rawPass) return null;

    if (!(await this.hasTable("field_audit_passes"))) {
      return { active: false, invalidReason: "Phân hệ Thẻ Đoàn Thẩm định chưa sẵn sàng." };
    }

    const res = await this.db.query<{
      id: number;
      code: string;
      pass_token: string;
      delegation_name: string;
      organization: string | null;
      allowed_zone_code: string | null;
      default_lang: "vi" | "en" | "zh";
      expires_at: Date | string;
      status: string;
      issued_by_name: string;
    }>(
      `SELECT id, code, pass_token, delegation_name, organization, allowed_zone_code,
              default_lang, expires_at, status, issued_by_name
       FROM field_audit_passes
       WHERE pass_token = $1 OR upper(code) = upper($1)
       ORDER BY (pass_token = $1) DESC, id DESC
       LIMIT 1`,
      [rawPass],
    );

    const row = res.rows[0];
    if (!row) {
      return { active: false, invalidReason: "Mã Thẻ Đoàn Thẩm định không tồn tại hoặc không hợp lệ." };
    }
    if (row.status !== "active") {
      return {
        active: false,
        code: row.code,
        invalidReason: "Thẻ Đoàn Thẩm định đã bị thu hồi hiệu lực trên máy chủ.",
      };
    }
    const expMs = new Date(row.expires_at).getTime();
    if (Number.isNaN(expMs) || expMs <= Date.now()) {
      return {
        active: false,
        code: row.code,
        invalidReason: "Thẻ Đoàn Thẩm định đã hết thời hạn hiệu lực.",
      };
    }
    if (
      row.allowed_zone_code &&
      row.allowed_zone_code.trim() &&
      pucCode &&
      row.allowed_zone_code.trim().toUpperCase() !== pucCode.trim().toUpperCase()
    ) {
      return {
        active: false,
        code: row.code,
        invalidReason: `Thẻ này chỉ áp dụng cho vùng trồng ${row.allowed_zone_code.trim()}.`,
      };
    }

    if (recordAccess) {
      await this.db.query(
        `UPDATE field_audit_passes
         SET access_count = access_count + 1,
             last_accessed_at = now()
         WHERE id = $1`,
        [row.id],
      );

      if (await this.hasTable("trace_detail_access_logs")) {
        await this.db.query(
          `INSERT INTO trace_detail_access_logs
             (user_id, username, full_name, user_role, viewer_tier, scanned_code, lot_code, scope_granted, scope_reason, ip, user_agent)
           VALUES (NULL, $1, $2, 'field_auditor', 'field_audit', $3, $4, true, $5, $6, $7)`,
          [
            row.code,
            row.delegation_name,
            scannedCode,
            resolvedLotCode,
            `Thẻ Đoàn Thẩm định Thực địa hợp lệ (${row.code})`,
            ctx.ip ?? null,
            ctx.userAgent ? ctx.userAgent.slice(0, 250) : null,
          ],
        );
      }
    }

    return {
      active: true,
      id: Number(row.id),
      code: row.code,
      passToken: row.pass_token,
      delegationName: row.delegation_name,
      organization: row.organization,
      allowedZoneCode: row.allowed_zone_code,
      defaultLang: row.default_lang || "zh",
      expiresAt: new Date(row.expires_at).toISOString(),
      issuedByName: row.issued_by_name,
      invalidReason: null,
    };
  }

  /**
   * Trụ cột 1: Kiểm chứng độc lập toàn bộ chuỗi băm SHA-256 (append-only hash chain) & thống kê tuân thủ thời gian ghi nhật ký.
   */
  private async computeLedgerIntegritySummary(householdIds: number[], plotCodes: string[]) {
    let effectiveHouseholdIds = [...new Set(householdIds.filter((id) => Number.isFinite(id) && id > 0))];
    const cleanPlots = [...new Set(plotCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];

    if (effectiveHouseholdIds.length === 0 && cleanPlots.length > 0) {
      const hhRes = await this.db.query<{ household_id: number }>(
        `SELECT DISTINCT household_id FROM journal_entries
         WHERE household_id IS NOT NULL AND upper(plot_code) = ANY($1::text[])
         UNION
         SELECT DISTINCT household_id FROM spray_records
         WHERE household_id IS NOT NULL AND upper(plot_code) = ANY($1::text[])`,
        [cleanPlots],
      );
      effectiveHouseholdIds = hhRes.rows.map((r) => Number(r.household_id)).filter((id) => id > 0);
    }

    const [journalRes, sprayRes, minuteRes] = await Promise.all([
      effectiveHouseholdIds.length > 0
        ? this.db.query<{
            household_id: number;
            entry_on_iso: string;
            plot_code: string | null;
            activity: string;
            recorder: string;
            is_late_entry: boolean;
            entry_delay_hours: number;
            server_recorded_at: Date | string;
            prev_hash: string | null;
            record_hash: string | null;
            gps_verified: boolean;
          }>(
            `SELECT household_id,
                    to_char(entry_on, 'YYYY-MM-DD') AS entry_on_iso,
                    plot_code,
                    activity,
                    recorder,
                    is_late_entry,
                    entry_delay_hours::float8 AS entry_delay_hours,
                    server_recorded_at,
                    prev_hash,
                    record_hash,
                    gps_verified
             FROM journal_entries
             WHERE household_id = ANY($1::bigint[])
             ORDER BY household_id ASC, id ASC`,
            [effectiveHouseholdIds],
          )
        : Promise.resolve({ rows: [] }),
      effectiveHouseholdIds.length > 0
        ? this.db.query<{
            household_id: number;
            sprayed_on_iso: string;
            plot_code: string | null;
            pesticide_id: number | null;
            dose: string;
            isolation_days: number | null;
            mrl_status: string;
            is_late_entry: boolean;
            entry_delay_hours: number;
            server_recorded_at: Date | string;
            prev_hash: string | null;
            record_hash: string | null;
          }>(
            `SELECT household_id,
                    to_char(sprayed_on, 'YYYY-MM-DD') AS sprayed_on_iso,
                    plot_code,
                    pesticide_id,
                    dose,
                    isolation_days,
                    mrl_status,
                    is_late_entry,
                    entry_delay_hours::float8 AS entry_delay_hours,
                    server_recorded_at,
                    prev_hash,
                    record_hash
             FROM spray_records
             WHERE household_id = ANY($1::bigint[])
             ORDER BY household_id ASC, id ASC`,
            [effectiveHouseholdIds],
          )
        : Promise.resolve({ rows: [] }),
      this.db.query<{
        code: string;
        held_on_iso: string;
        officer: string;
        result: string;
        is_late_entry: boolean;
        entry_delay_hours: number;
        server_recorded_at: Date | string;
        prev_hash: string | null;
        record_hash: string | null;
        gps_verified: boolean;
      }>(
        `SELECT code,
                to_char(held_on, 'YYYY-MM-DD') AS held_on_iso,
                officer,
                result,
                is_late_entry,
                entry_delay_hours::float8 AS entry_delay_hours,
                server_recorded_at,
                prev_hash,
                record_hash,
                gps_verified
         FROM inspection_minutes
         ORDER BY id ASC`,
      ),
    ]);

    const journalByHh = new Map<number, Array<VerifiableChainEntry & { entryDelayHours?: number }>>();
    let gpsVerifiedRecords = 0;
    let latestTs = 0;
    let latestLedgerHash: string | null = null;

    const trackLatest = (tsVal: Date | string, hash: string | null) => {
      if (!hash) return;
      const ms = new Date(tsVal).getTime();
      if (Number.isFinite(ms) && ms >= latestTs) {
        latestTs = ms;
        latestLedgerHash = hash;
      }
    };

    for (const r of journalRes.rows) {
      if (r.gps_verified) gpsVerifiedRecords += 1;
      trackLatest(r.server_recorded_at, r.record_hash);
      const hid = Number(r.household_id);
      const arr = journalByHh.get(hid) ?? [];
      arr.push({
        input: {
          kind: "journal",
          prevHash: r.prev_hash,
          householdId: hid,
          entryOn: r.entry_on_iso,
          plotCode: r.plot_code,
          activity: r.activity,
          recorder: r.recorder,
          isLateEntry: Boolean(r.is_late_entry),
          serverRecordedAt: r.server_recorded_at,
        },
        storedPrevHash: r.prev_hash,
        storedRecordHash: r.record_hash,
        entryDelayHours: Number(r.entry_delay_hours || 0),
      });
      journalByHh.set(hid, arr);
    }

    const sprayByHh = new Map<number, Array<VerifiableChainEntry & { entryDelayHours?: number }>>();
    for (const r of sprayRes.rows) {
      trackLatest(r.server_recorded_at, r.record_hash);
      const hid = Number(r.household_id);
      const arr = sprayByHh.get(hid) ?? [];
      arr.push({
        input: {
          kind: "spray",
          prevHash: r.prev_hash,
          householdId: hid,
          sprayedOn: r.sprayed_on_iso,
          plotCode: r.plot_code,
          pesticideId: r.pesticide_id !== null ? Number(r.pesticide_id) : null,
          dose: r.dose,
          isolationDays: r.isolation_days !== null ? Number(r.isolation_days) : null,
          mrlStatus: r.mrl_status,
          isLateEntry: Boolean(r.is_late_entry),
          serverRecordedAt: r.server_recorded_at,
        },
        storedPrevHash: r.prev_hash,
        storedRecordHash: r.record_hash,
        entryDelayHours: Number(r.entry_delay_hours || 0),
      });
      sprayByHh.set(hid, arr);
    }

    const minuteChain: Array<VerifiableChainEntry & { entryDelayHours?: number }> = [];
    for (const r of minuteRes.rows) {
      if (r.gps_verified) gpsVerifiedRecords += 1;
      trackLatest(r.server_recorded_at, r.record_hash);
      minuteChain.push({
        input: {
          kind: "minute",
          prevHash: r.prev_hash,
          code: r.code,
          heldOn: r.held_on_iso,
          officer: r.officer,
          result: r.result,
          isLateEntry: Boolean(r.is_late_entry),
          serverRecordedAt: r.server_recorded_at,
        },
        storedPrevHash: r.prev_hash,
        storedRecordHash: r.record_hash,
        entryDelayHours: Number(r.entry_delay_hours || 0),
      });
    }

    const chainResults = [
      ...[...journalByHh.values()].map((c) => verifyOrderedChain(c)),
      ...[...sprayByHh.values()].map((c) => verifyOrderedChain(c)),
      verifyOrderedChain(minuteChain),
    ];

    let totalSealedRecords = 0;
    let verifiedRecords = 0;
    let tamperedRecords = 0;
    let onTimeRecords = 0;
    let lateRecordCount = 0;
    let weightedDelaySum = 0;

    for (const cr of chainResults) {
      totalSealedRecords += cr.totalSealedRecords;
      verifiedRecords += cr.verifiedCount;
      tamperedRecords += cr.tamperedCount;
      onTimeRecords += cr.onTimeCount;
      lateRecordCount += cr.lateRecordCount;
      weightedDelaySum += cr.avgDelayHours * cr.totalSealedRecords;
    }

    const onTimePct =
      totalSealedRecords > 0 ? Number(((onTimeRecords / totalSealedRecords) * 100).toFixed(1)) : 100;
    const avgDelayHours =
      totalSealedRecords > 0 ? Number((weightedDelaySum / totalSealedRecords).toFixed(1)) : 0;

    return {
      hashAlgorithm: "SHA-256",
      chainVerified: tamperedRecords === 0,
      totalSealedRecords,
      journalCount: journalRes.rows.length,
      sprayCount: sprayRes.rows.length,
      minuteCount: minuteRes.rows.length,
      verifiedRecords,
      tamperedRecords,
      onTimeRecords,
      lateRecordCount,
      onTimePct,
      avgDelayHours,
      gpsVerifiedRecords,
      latestLedgerHash,
      farmerBackdateCapDays: 7,
      lateThresholdHours: 48,
      phiAutoLockEnabled: true,
      massBalanceLockEnabled: true,
    };
  }

  /**
   * Trụ cột 2: Cân đối hạn ngạch sản lượng trần đầu vụ (Mass-Balance) theo thửa & mã số vùng trồng PUC.
   */
  private async computeMassBalanceSummary(params: {
    seasonYear: number;
    pucCode: string;
    lotId?: number | null;
    thisLotWeightKg?: number;
    plotCodes: string[];
    householdIds: number[];
  }) {
    if (!(await this.hasTable("plot_season_quotas"))) {
      return { publicSummary: null, enterpriseBreakdown: null };
    }

    const cleanPlots = [...new Set(params.plotCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const cleanHhIds = [...new Set(params.householdIds.filter((id) => Number.isFinite(id) && id > 0))];

    const fetchQuotasForYear = async (yr: number) => {
      return this.db.query<{
        season_year: number;
        household_id: number;
        plot_code: string;
        zone_code: string;
        area_ha: number;
        tree_count: number;
        max_quota_kg: number;
        assessed_by: string;
        assessed_on: unknown;
      }>(
        `SELECT season_year,
                household_id,
                plot_code,
                zone_code,
                area_ha::float8 AS area_ha,
                tree_count,
                max_quota_kg::float8 AS max_quota_kg,
                assessed_by,
                assessed_on
         FROM plot_season_quotas
         WHERE season_year = $1
           AND (
             upper(zone_code) = upper($2)
             OR (cardinality($3::text[]) > 0 AND upper(plot_code) = ANY($3::text[]))
             OR (cardinality($4::bigint[]) > 0 AND household_id = ANY($4::bigint[]))
           )
         ORDER BY plot_code ASC`,
        [yr, params.pucCode, cleanPlots, cleanHhIds],
      );
    };

    let qRes = await fetchQuotasForYear(params.seasonYear);
    if (qRes.rows.length === 0) {
      const latestYrRes = await this.db.query<{ max_yr: number | null }>(
        `SELECT MAX(season_year)::int AS max_yr FROM plot_season_quotas`,
      );
      const fallbackYr = latestYrRes.rows[0]?.max_yr;
      if (fallbackYr && fallbackYr !== params.seasonYear) {
        qRes = await fetchQuotasForYear(fallbackYr);
      }
    }

    if (qRes.rows.length === 0) {
      return { publicSummary: null, enterpriseBreakdown: null };
    }

    const quotaPlotCodes = qRes.rows.map((r) => r.plot_code.trim().toUpperCase());
    const quotaHhIds = [...new Set(qRes.rows.map((r) => Number(r.household_id)))];

    const usageRes = await this.db.query<{
      plot_upper: string | null;
      household_id: number;
      lot_id: number;
      weight_kg: number;
    }>(
      `SELECT NULLIF(upper(btrim(hc.plot_code)), '') AS plot_upper,
              hc.household_id,
              hc.lot_id,
              hc.weight_kg::float8 AS weight_kg
       FROM harvest_contributions hc
       JOIN harvest_lots hl ON hl.id = hc.lot_id
       WHERE hl.status <> 'revoked'
         AND EXTRACT(YEAR FROM hl.harvested_on)::int = $1
         AND (
           (cardinality($2::text[]) > 0 AND upper(btrim(COALESCE(hc.plot_code, ''))) = ANY($2::text[]))
           OR (cardinality($3::bigint[]) > 0 AND hc.household_id = ANY($3::bigint[]))
         )`,
      [params.seasonYear, quotaPlotCodes, quotaHhIds],
    );

    const usedByPlot = new Map<string, number>();
    const usedByHhFallback = new Map<number, number>();
    let totalHarvestedInSeasonKg = 0;
    let usedInOtherLotsKg = 0;

    for (const u of usageRes.rows) {
      const w = Number(u.weight_kg || 0);
      totalHarvestedInSeasonKg += w;
      if (!params.lotId || Number(u.lot_id) !== Number(params.lotId)) {
        usedInOtherLotsKg += w;
      }
      if (u.plot_upper) {
        usedByPlot.set(u.plot_upper, (usedByPlot.get(u.plot_upper) ?? 0) + w);
      } else {
        const hid = Number(u.household_id);
        usedByHhFallback.set(hid, (usedByHhFallback.get(hid) ?? 0) + w);
      }
    }

    const plotCountPerHh = new Map<number, number>();
    for (const r of qRes.rows) {
      const hid = Number(r.household_id);
      plotCountPerHh.set(hid, (plotCountPerHh.get(hid) ?? 0) + 1);
    }

    const plotsBreakdown = qRes.rows.map((r) => {
      const pKey = r.plot_code.trim().toUpperCase();
      const hid = Number(r.household_id);
      const hhShare = (usedByHhFallback.get(hid) ?? 0) / Math.max(1, plotCountPerHh.get(hid) ?? 1);
      const usedKg = Number(((usedByPlot.get(pKey) ?? 0) + hhShare).toFixed(1));
      const maxQuotaKg = Number(r.max_quota_kg || 0);
      const remainingKg = Number(Math.max(0, maxQuotaKg - usedKg).toFixed(1));
      const utilizationPct = maxQuotaKg > 0 ? Number(((usedKg / maxQuotaKg) * 100).toFixed(1)) : 0;
      return {
        plotCode: r.plot_code,
        zoneCode: r.zone_code,
        areaHa: Number(r.area_ha || 0),
        treeCount: Number(r.tree_count || 0),
        maxQuotaKg,
        usedKg,
        remainingKg,
        utilizationPct,
        withinQuota: maxQuotaKg <= 0 ? true : usedKg <= maxQuotaKg,
        assessedOn: toIsoDateOnly(r.assessed_on),
      };
    });

    const zoneMaxQuotaKg = Number(
      plotsBreakdown.reduce((sum, p) => sum + p.maxQuotaKg, 0).toFixed(1),
    );
    const totalAreaHa = Number(plotsBreakdown.reduce((sum, p) => sum + p.areaHa, 0).toFixed(2));
    const totalTreeCount = plotsBreakdown.reduce((sum, p) => sum + p.treeCount, 0);
    const thisLotWeightKg = Number((params.thisLotWeightKg ?? 0).toFixed(1));
    const cumulativeUsedKg = Number(
      Math.max(totalHarvestedInSeasonKg, usedInOtherLotsKg + thisLotWeightKg).toFixed(1),
    );
    const usedBeforeThisLotKg = Number(Math.max(0, cumulativeUsedKg - thisLotWeightKg).toFixed(1));
    const remainingQuotaKg = Number(Math.max(0, zoneMaxQuotaKg - cumulativeUsedKg).toFixed(1));
    const utilizationPct =
      zoneMaxQuotaKg > 0 ? Number(((cumulativeUsedKg / zoneMaxQuotaKg) * 100).toFixed(1)) : 0;
    const withinQuota = zoneMaxQuotaKg <= 0 ? true : cumulativeUsedKg <= zoneMaxQuotaKg;
    const firstRow = qRes.rows[0];
    const assessedBy = firstRow?.assessed_by || "Tổ Giám sát Kỹ thuật UBND Xã Cư Né";
    const assessedOn = toIsoDateOnly(firstRow?.assessed_on);

    const publicSummary = {
      seasonYear: params.seasonYear,
      pucCode: params.pucCode,
      assessedPlotCount: plotsBreakdown.length,
      totalAreaHa,
      totalTreeCount,
      zoneMaxQuotaKg,
      cumulativeUsedKg,
      remainingQuotaKg,
      utilizationPct,
      withinQuota,
      assessedBy,
      assessedOn,
    };

    const enterpriseBreakdown = {
      ...publicSummary,
      thisLotWeightKg,
      usedBeforeThisLotKg,
      plots: plotsBreakdown,
    };

    return { publicSummary, enterpriseBreakdown };
  }

  /**
   * Trụ cột 5: Bảo chứng Chính quyền Tỉnh / UBND Xã & Mô hình đối chứng chéo độc lập 3 bên.
   */
  private async buildGovernancePayload(params: {
    pucCode: string;
    cooperativeName: string;
    participatingHouseholdCount: number;
    onTimePct: number;
    chainVerified: boolean;
    lastInspectionOn: string | null;
    latestMinuteCode: string | null;
    latestMinuteOfficer: string | null;
    latestLab: {
      code: string;
      lab: string;
      sampledOn: string | null;
      result: string;
      labAccreditationCode?: string | null;
    } | null;
    phytoCertNo: string | null;
  }) {
    let config = {
      programTitle: "Mô hình điểm Truy xuất nguồn gốc Sầu riêng cấp Xã theo chỉ đạo của Tỉnh Đắk Lắk",
      directiveNo: "Đề án Chuyển đổi số Nông nghiệp & Chuẩn hóa Mã số Vùng trồng Xuất khẩu Tỉnh Đắk Lắk",
      communeAuthority: "Ủy ban Nhân dân Xã Cư Né - Huyện Krông Búk",
      provincialAuthority: "Ủy ban Nhân dân Tỉnh Đắk Lắk - Sở Nông nghiệp và Môi trường",
      officialPortalUrl: "https://daklak.gov.vn",
      officialDomain: "truyxuat.cune-krongbuk.gov.vn",
      inspectionUnit: "Tổ Giám sát Cộng đồng Xã Cư Né & Ban Kỹ thuật HTX Nông nghiệp Cư Né",
    };

    if (await this.hasTable("commune_endorsement_config")) {
      const cfgRes = await this.db.query(
        `SELECT program_title, directive_no, commune_authority, provincial_authority,
                official_portal_url, official_domain, inspection_unit
         FROM commune_endorsement_config
         WHERE id = 1
         LIMIT 1`,
      );
      if (cfgRes.rows[0]) {
        const c = camelRow<Record<string, string>>(cfgRes.rows[0]);
        config = {
          programTitle: c.programTitle || config.programTitle,
          directiveNo: c.directiveNo || config.directiveNo,
          communeAuthority: c.communeAuthority || config.communeAuthority,
          provincialAuthority: c.provincialAuthority || config.provincialAuthority,
          officialPortalUrl: c.officialPortalUrl || config.officialPortalUrl,
          officialDomain: c.officialDomain || config.officialDomain,
          inspectionUnit: c.inspectionUnit || config.inspectionUnit,
        };
      }
    }

    const threePartyAttestation = [
      {
        partyOrder: 1,
        partyKey: "producer",
        roleLabel: "Nông hộ & Hợp tác xã Sản xuất",
        actorName: params.cooperativeName,
        status: params.chainVerified ? "verified" : "review",
        evidenceCode: params.pucCode,
        verifiedOn: null as string | null,
        summary: `Ghi chép nhật ký điện tử (${params.participatingHouseholdCount} hộ liên kết, ${params.onTimePct}% đúng hạn, niêm phong SHA-256)`,
      },
      {
        partyOrder: 2,
        partyKey: "commune_gov",
        roleLabel: "Chính quyền Xã & Tổ Giám sát Cộng đồng",
        actorName: config.communeAuthority,
        status: params.lastInspectionOn ? "verified" : "active",
        evidenceCode: params.latestMinuteCode || "GS-UBND-CUNE",
        verifiedOn: params.lastInspectionOn,
        summary: params.latestMinuteOfficer
          ? `Thẩm định hạn ngạch đầu vụ & kiểm tra thực địa bởi ${params.latestMinuteOfficer}`
          : `Giám sát thực địa định kỳ bởi ${config.inspectionUnit}`,
      },
      {
        partyOrder: 3,
        partyKey: "independent_lab",
        roleLabel: "Phòng Kiểm nghiệm ISO/IEC 17025 & Kiểm dịch",
        actorName: params.latestLab?.lab || "Phòng Kiểm nghiệm Độc lập VILAS / Chi cục KDTV",
        status:
          params.latestLab?.result === "pass"
            ? "verified"
            : params.latestLab?.result === "fail"
              ? "warning"
              : "pending",
        evidenceCode: params.latestLab?.code || params.phytoCertNo || "Đang cập nhật",
        verifiedOn: params.latestLab?.sampledOn ?? null,
        summary: params.latestLab
          ? `Đối chiếu độc lập chỉ tiêu Cd, Vàng O & dư lượng (${params.latestLab.labAccreditationCode || "ISO/IEC 17025"})`
          : "Cơ quan chuyên môn độc lập kiểm nghiệm mẫu lô & cấp chứng nhận kiểm dịch",
      },
    ];

    return {
      governmentEndorsement: config,
      threePartyAttestation,
    };
  }

  /**
   * Trụ cột 3: Hồ sơ Thẩm định Thực địa tại Vườn (Field Audit Mode) – đầy đủ đa giác GIS thửa đất,
   * hạn ngạch sản lượng, trạng thái cách ly PHI và sổ cái SHA-256 nhưng ẨN TUYỆT ĐỐI CCCD & SĐT cá nhân nông hộ.
   */
  private async buildFieldAuditPlotDossier(params: {
    plotCode: string;
    qrToken: string | null;
    householdId: number | null;
    householdCode: string | null;
    consentedOwnerName: string | null;
    zoneCode: string;
    villageName: string;
    adminLocation: string;
    variety: string;
    plantedYear: number | null;
    areaHa: number;
    treeCount: number;
    status: string;
    sheetNo: string | null;
    parcelNo: string | null;
    centerLat: number | null;
    centerLng: number | null;
    geometryJson: string | null;
  }) {
    const currentYear = new Date().getFullYear();
    const [{ publicSummary: plotQuotaSummary, enterpriseBreakdown: plotQuotaDetail }, sprayPhiRes, ledgerRes, minutesRes, lotsRes, checkinsRes] =
      await Promise.all([
        this.computeMassBalanceSummary({
          seasonYear: currentYear,
          pucCode: params.zoneCode,
          plotCodes: [params.plotCode],
          householdIds: params.householdId ? [params.householdId] : [],
        }),
        this.db.query<{
          sprayed_on: unknown;
          isolation_days: number;
          safe_on: string;
          mrl_status: string;
          pesticide_name: string;
          active_ingredient: string;
          still_isolated: boolean;
        }>(
          `SELECT sr.sprayed_on,
                  sr.isolation_days,
                  to_char(sr.sprayed_on + sr.isolation_days, 'YYYY-MM-DD') AS safe_on,
                  sr.mrl_status,
                  p.name AS pesticide_name,
                  p.active_ingredient,
                  (sr.isolation_days > 0 AND (sr.sprayed_on + sr.isolation_days) > CURRENT_DATE) AS still_isolated
           FROM spray_records sr
           JOIN pesticides p ON p.id = sr.pesticide_id
           WHERE upper(COALESCE(sr.plot_code, '')) = upper($1)
              OR ($2::bigint IS NOT NULL AND sr.household_id = $2 AND sr.plot_code IS NULL)
           ORDER BY sr.sprayed_on DESC, sr.id DESC
           LIMIT 5`,
          [params.plotCode, params.householdId],
        ),
        this.db.query(
          `SELECT entry_on,
                  kind,
                  activity,
                  detail,
                  server_recorded_at,
                  entry_delay_hours::float8 AS entry_delay_hours,
                  is_late_entry,
                  record_hash,
                  gps_verified,
                  gps_distance_m::float8 AS gps_distance_m,
                  photo_url
           FROM (
             SELECT to_char(sr.sprayed_on, 'YYYY-MM-DD') AS entry_on,
                    'spray'::text AS kind,
                    ('Phun BVTV: ' || p.name) AS activity,
                    ('Hoạt chất: ' || p.active_ingredient || ' | Liều: ' || sr.dose || ' | PHI: ' || sr.isolation_days || ' ngày') AS detail,
                    sr.server_recorded_at,
                    sr.entry_delay_hours,
                    sr.is_late_entry,
                    sr.record_hash,
                    false AS gps_verified,
                    NULL::numeric AS gps_distance_m,
                    NULL::text AS photo_url,
                    sr.sprayed_on AS sort_date,
                    sr.id AS sort_id
             FROM spray_records sr
             JOIN pesticides p ON p.id = sr.pesticide_id
             WHERE upper(COALESCE(sr.plot_code, '')) = upper($1)
                OR ($2::bigint IS NOT NULL AND sr.household_id = $2)
             UNION ALL
             SELECT to_char(je.entry_on, 'YYYY-MM-DD') AS entry_on,
                    'journal'::text AS kind,
                    je.activity,
                    je.detail,
                    je.server_recorded_at,
                    je.entry_delay_hours,
                    je.is_late_entry,
                    je.record_hash,
                    je.gps_verified,
                    je.gps_distance_m,
                    ${publicAttachmentUrlSql("je.photo_id")} AS photo_url,
                    je.entry_on AS sort_date,
                    je.id AS sort_id
             FROM journal_entries je
             WHERE upper(je.plot_code) = upper($1)
                OR ($2::bigint IS NOT NULL AND je.household_id = $2)
           ) combined
           ORDER BY sort_date DESC, sort_id DESC
           LIMIT 15`,
          [params.plotCode, params.householdId],
        ),
        this.db.query(
          `SELECT im.code,
                  to_char(im.held_on, 'YYYY-MM-DD') AS held_on,
                  im.location,
                  im.officer,
                  im.result,
                  im.gps_verified,
                  im.gps_distance_m::float8 AS gps_distance_m,
                  im.record_hash,
                  ${publicAttachmentUrlSql("im.photo_id")} AS photo_url
           FROM inspection_minutes im
           ORDER BY (CASE WHEN upper(COALESCE(im.plot_code, '')) = upper($1) THEN 0 ELSE 1 END),
                    im.held_on DESC, im.id DESC
           LIMIT 6`,
          [params.plotCode],
        ),
        params.householdId
          ? this.db.query(
              `SELECT hl.code AS lot_code,
                      hl.qr_token,
                      to_char(hl.harvested_on, 'YYYY-MM-DD') AS harvested_on,
                      hc.weight_kg::float8 AS contributed_kg,
                      hl.market,
                      hl.status
               FROM harvest_contributions hc
               JOIN harvest_lots hl ON hl.id = hc.lot_id
               WHERE (upper(COALESCE(hc.plot_code, '')) = upper($1))
                  OR (hc.household_id = $2 AND hc.plot_code IS NULL)
               ORDER BY hl.harvested_on DESC, hl.id DESC
               LIMIT 5`,
              [params.plotCode, params.householdId],
            )
          : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
        (await this.hasTable("field_gps_checkins"))
          ? this.db.query(
              `SELECT checked_at,
                      actor_label,
                      inside_polygon,
                      distance_m::float8 AS distance_meters,
                      verified
               FROM field_gps_checkins
               WHERE upper(plot_code) = upper($1)
               ORDER BY checked_at DESC
               LIMIT 6`,
              [params.plotCode],
            )
          : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      ]);

    const exactPlotQuota =
      plotQuotaDetail?.plots.find((p) => p.plotCode.toUpperCase() === params.plotCode.toUpperCase()) ?? null;
    const latestSpray = sprayPhiRes.rows[0] ?? null;
    const activeIsolated = sprayPhiRes.rows.find((r) => Boolean(r.still_isolated)) ?? null;
    const mrlAllPass = sprayPhiRes.rows.every((r) => r.mrl_status === "pass");

    return {
      plotProfile: {
        plotCode: params.plotCode,
        qrToken: params.qrToken,
        zoneCode: params.zoneCode,
        householdRefCode: params.householdCode || "Thành viên HTX Cư Né",
        ownerLabel: params.consentedOwnerName || `Hộ thành viên ${params.householdCode || "HTX Cư Né"}`,
        villageName: params.villageName,
        adminLocation: params.adminLocation,
        variety: params.variety,
        plantedYear: params.plantedYear,
        areaHa: params.areaHa,
        treeCount: params.treeCount,
        status: params.status,
        sheetNo: params.sheetNo,
        parcelNo: params.parcelNo,
        centerLat: params.centerLat,
        centerLng: params.centerLng,
        geometryJson: params.geometryJson,
      },
      quota: exactPlotQuota
        ? {
            seasonYear: plotQuotaSummary?.seasonYear ?? currentYear,
            maxQuotaKg: exactPlotQuota.maxQuotaKg,
            usedKg: exactPlotQuota.usedKg,
            remainingKg: exactPlotQuota.remainingKg,
            utilizationPct: exactPlotQuota.utilizationPct,
            withinQuota: exactPlotQuota.withinQuota,
            assessedBy: plotQuotaSummary?.assessedBy ?? "Tổ Giám sát Kỹ thuật UBND Xã Cư Né",
            assessedOn: exactPlotQuota.assessedOn,
          }
        : null,
      phiSafety: {
        safeToHarvestToday: !activeIsolated && mrlAllPass,
        activeIsolationUntil: activeIsolated ? activeIsolated.safe_on : null,
        lastSprayOn: latestSpray ? toIsoDateOnly(latestSpray.sprayed_on) : null,
        lastPesticideName: latestSpray?.pesticide_name ?? null,
        lastActiveIngredient: latestSpray?.active_ingredient ?? null,
        mrlAllPass,
      },
      sealedLedger: camelRows(ledgerRes.rows),
      inspectionHistory: camelRows(minutesRes.rows),
      linkedLots: camelRows(lotsRes.rows),
      recentGpsCheckins: camelRows(checkinsRes.rows),
    };
  }

  /**
   * Đối chứng trực tiếp tọa độ GPS điện thoại của Đoàn thẩm định / Cán bộ với ranh giới đa giác GIS của thửa đất.
   */
  async verifyLiveFieldGps(
    rawCode: string,
    dto: { latitude: number; longitude: number; accuracyMeters?: number; auditPass?: string },
    ctx: TraceRequestContext,
  ) {
    const cleanCode = rawCode.trim();
    if (!cleanCode || cleanCode.length > 80 || !/^[A-Za-z0-9._/-]+$/.test(cleanCode)) {
      throw notFound("Không tìm thấy thửa đất cần đối chứng GPS.");
    }

    const hasPlots = await this.hasTable("plots");
    const hasSignboards = await this.hasTable("plot_signboard_tokens");

    let resolvedPlot: {
      plotCode: string;
      zoneCode: string;
      householdId: number | null;
      villageId: number | null;
      villageName: string | null;
    } | null = null;

    if (hasPlots) {
      const pRes = await this.db.query<{
        code: string;
        zone_code: string | null;
        household_id: number | null;
        village_id: number | null;
        village: string | null;
      }>(
        `SELECT p.code, p.zone_code, p.household_id, h.village_id, COALESCE(p.village, v.name) AS village
         FROM plots p
         LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)
         LEFT JOIN households h ON h.id = p.household_id
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE p.qr_token = $1 OR pst.qr_token = $1 OR upper(p.code) = upper($1)
         ORDER BY (p.qr_token = $1 OR pst.qr_token = $1) DESC
         LIMIT 1`,
        [cleanCode],
      );
      if (pRes.rows[0]) {
        resolvedPlot = {
          plotCode: pRes.rows[0].code,
          zoneCode: pRes.rows[0].zone_code || "VN-DLOR-0086",
          householdId: pRes.rows[0].household_id !== null ? Number(pRes.rows[0].household_id) : null,
          villageId: pRes.rows[0].village_id !== null ? Number(pRes.rows[0].village_id) : null,
          villageName: pRes.rows[0].village,
        };
      }
    }

    if (!resolvedPlot && hasSignboards) {
      const sbRes = await this.db.query<{
        plot_code: string;
        zone_code: string | null;
        household_id: number | null;
        village_id: number | null;
        village_name: string | null;
      }>(
        `SELECT pst.plot_code, pst.zone_code, pst.household_id, h.village_id, COALESCE(pst.village_name, v.name) AS village_name
         FROM plot_signboard_tokens pst
         LEFT JOIN households h ON h.id = pst.household_id
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE pst.qr_token = $1 OR upper(pst.plot_code) = upper($1)
         ORDER BY (pst.qr_token = $1) DESC
         LIMIT 1`,
        [cleanCode],
      );
      if (sbRes.rows[0]) {
        resolvedPlot = {
          plotCode: sbRes.rows[0].plot_code,
          zoneCode: sbRes.rows[0].zone_code || "VN-DLOR-0086",
          householdId: sbRes.rows[0].household_id !== null ? Number(sbRes.rows[0].household_id) : null,
          villageId: sbRes.rows[0].village_id !== null ? Number(sbRes.rows[0].village_id) : null,
          villageName: sbRes.rows[0].village_name,
        };
      }
    }

    if (!resolvedPlot) {
      throw notFound("Không tìm thấy hồ sơ thửa đất tương ứng để đối chứng tọa độ GPS.");
    }

    const adminLocation = this.resolveAdminLocation(resolvedPlot.villageName, resolvedPlot.zoneCode);
    const passCheck = await this.resolveFieldAuditPass(
      { ...ctx, auditPass: dto.auditPass || ctx.auditPass },
      resolvedPlot.zoneCode,
      cleanCode,
      null,
      false,
    );

    const roleAccess = this.evaluateAccessAndScope(ctx, {
      enterpriseId: ctx.user?.enterpriseId !== null && ctx.user?.enterpriseId !== undefined ? Number(ctx.user.enterpriseId) : null,
      coopCode: "HTX-CUNE",
      villageIds: resolvedPlot.villageId ? [resolvedPlot.villageId] : [],
      adminLocations: [adminLocation],
    });
    const isOwnerFarmer =
      ctx.user?.role === "farmer" &&
      resolvedPlot.householdId !== null &&
      Number(ctx.user.householdId) === Number(resolvedPlot.householdId);
    const authorized =
      Boolean(passCheck?.active) ||
      (roleAccess.viewerTier !== "public" && !roleAccess.scopeDenied) ||
      isOwnerFarmer;

    if (!authorized) {
      throw forbidden(
        passCheck?.invalidReason ||
          "Cần Thẻ Đoàn Thẩm định Thực địa đang hiệu lực hoặc tài khoản đối tác / cán bộ quản lý trong phạm vi để đối chứng tọa độ GPS thửa đất.",
      );
    }

    const gps = await verifyPlotGpsProximity(
      this.db,
      resolvedPlot.plotCode,
      dto.latitude,
      dto.longitude,
      dto.accuracyMeters ?? null,
    );

    const actorLabel = passCheck?.active
      ? `${passCheck.delegationName} (${passCheck.code})`
      : ctx.user
        ? `${ctx.user.fullName} (${ctx.user.role})`
        : "Đoàn Thẩm định Thực địa";

    const checkedAt = new Date().toISOString();
    const ipHash = createHash("sha256")
      .update(`puc-gps-v1:${ctx.ip || "local"}:${(ctx.userAgent || "").slice(0, 64)}`)
      .digest("hex")
      .slice(0, 24);

    if (await this.hasTable("field_gps_checkins")) {
      await this.db.query(
        `INSERT INTO field_gps_checkins
           (plot_code, audit_pass_id, user_id, actor_label, latitude, longitude, accuracy_m, inside_polygon, distance_m, verified, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          resolvedPlot.plotCode,
          passCheck?.active ? passCheck.id ?? null : null,
          ctx.user?.id ?? null,
          actorLabel,
          dto.latitude,
          dto.longitude,
          dto.accuracyMeters ?? null,
          gps.insidePolygon,
          gps.distanceMeters,
          gps.verified,
          ipHash,
        ],
      );
    }

    return {
      verified: gps.verified,
      insidePolygon: gps.insidePolygon,
      distanceMeters: gps.distanceMeters,
      accuracyMeters: dto.accuracyMeters ?? null,
      plotCode: resolvedPlot.plotCode,
      zoneCode: resolvedPlot.zoneCode,
      centerLat: gps.centerLat,
      centerLng: gps.centerLng,
      actorLabel,
      checkedAt,
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
    const hasSignboards = await this.hasTable("plot_signboard_tokens");
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
      : hasSignboards
        ? `SELECT fs.household_id, fs.plot_code, fs.serial_code, fs.qr_token, fs.status,
                  fs.activated_at, fs.fruit_weight_kg::float8 AS fruit_weight_kg, fs.grade, fs.harvest_date,
                  h.name AS household_name, h.status AS household_status, h.public_trace_consent,
                  h.code AS household_code, h.phone AS household_phone, h.village_id,
                  repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) AS cccd_masked,
                  v.name AS village_name,
                  ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                  pst.zone_code, pst.variety, COALESCE(pst.area_ha, h.area_ha)::float8 AS area_ha, pst.planted_year,
                  NULL::text AS sheet_no, NULL::text AS parcel_no, 'signboard'::text AS plot_source, 'approved'::text AS plot_status,
                  pst.geometry_json, pst.center_lat::float8 AS lat, pst.center_lng::float8 AS lng
           FROM farmer_stamps fs
           JOIN households h ON h.id = fs.household_id
           JOIN villages v ON v.id = h.village_id
           LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(fs.plot_code)
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

    // ─── NHÁNH C: QUÉT BẢNG QR THỬA ĐẤT / BIỂN VƯỜN (plots + plot_signboard_tokens) ───
    if (hasPlots) {
      const plotRes = await this.db.query(
        `SELECT COALESCE(p.household_id, pst.household_id) AS household_id,
                p.code,
                COALESCE(p.qr_token, pst.qr_token) AS plot_qr_token,
                p.sheet_no,
                p.parcel_no,
                p.source,
                COALESCE(p.owner_name, h.name) AS owner_name,
                COALESCE(p.village, pst.village_name, v.name) AS village,
                COALESCE(p.zone_code, pst.zone_code) AS zone_code,
                COALESCE(p.variety, pst.variety) AS variety,
                COALESCE(p.planted_year, pst.planted_year) AS planted_year,
                COALESCE(p.area_ha, pst.area_ha, 1.0)::float8 AS area_ha,
                COALESCE(p.tree_count, pst.tree_count, GREATEST(30, ROUND(COALESCE(p.area_ha, 1.0) * 150)::int)) AS tree_count,
                p.status,
                p.updated_at,
                h.code AS household_code,
                h.status AS household_status,
                h.phone AS household_phone,
                h.village_id,
                COALESCE(h.public_trace_consent, false) AS public_trace_consent,
                CASE WHEN h.cccd IS NOT NULL THEN repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) ELSE NULL END AS cccd_masked,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                COALESCE(ST_AsGeoJSON(p.geom), pst.geometry_json) AS geometry_json,
                COALESCE(ST_Y(ST_Centroid(p.geom))::float8, pst.center_lat::float8) AS lat,
                COALESCE(ST_X(ST_Centroid(p.geom))::float8, pst.center_lng::float8) AS lng
         FROM plots p
         LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)
         LEFT JOIN households h ON h.id = COALESCE(p.household_id, pst.household_id)
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE p.qr_token = $1 OR pst.qr_token = $1 OR upper(p.code) = upper($1)
         ORDER BY (p.qr_token = $1 OR pst.qr_token = $1) DESC
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

    if (hasSignboards) {
      const sbPlotRes = await this.db.query(
        `SELECT pst.household_id,
                pst.plot_code AS code,
                pst.qr_token AS plot_qr_token,
                NULL::text AS sheet_no,
                NULL::text AS parcel_no,
                'signboard'::text AS source,
                h.name AS owner_name,
                COALESCE(pst.village_name, v.name) AS village,
                pst.zone_code,
                pst.variety,
                pst.planted_year,
                pst.area_ha::float8 AS area_ha,
                pst.tree_count,
                CASE
                  WHEN h.status = 'violation' THEN 'violation'
                  WHEN h.status = 'pending' THEN 'pending'
                  ELSE 'approved'
                END AS status,
                pst.created_at AS updated_at,
                h.code AS household_code,
                h.status AS household_status,
                h.phone AS household_phone,
                h.village_id,
                COALESCE(h.public_trace_consent, false) AS public_trace_consent,
                CASE WHEN h.cccd IS NOT NULL THEN repeat('*', greatest(length(h.cccd) - 4, 0)) || right(h.cccd, 4) ELSE NULL END AS cccd_masked,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                pst.geometry_json,
                pst.center_lat::float8 AS lat,
                pst.center_lng::float8 AS lng
         FROM plot_signboard_tokens pst
         LEFT JOIN households h ON h.id = pst.household_id
         LEFT JOIN villages v ON v.id = h.village_id
         WHERE pst.qr_token = $1 OR upper(pst.plot_code) = upper($1)
         ORDER BY (pst.qr_token = $1) DESC
         LIMIT 1`,
        [cleanCode],
      );

      if (sbPlotRes.rowCount && sbPlotRes.rows[0]) {
        return this.buildPlotTraceResponse({
          cleanCode,
          rawPlotRow: sbPlotRes.rows[0],
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

    // Lấy thông tin thửa nguồn của các hộ/thửa đóng góp (ưu tiên plots PostGIS, dự phòng plot_signboard_tokens)
    const hasSignboards = await this.hasTable("plot_signboard_tokens");
    let sourcePlots: Array<{
      household_id: number;
      code: string;
      qr_token: string | null;
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
    }> = [];

    if (hasPlots && (contribHouseholdIds.length > 0 || contribPlotCodes.length > 0)) {
      sourcePlots = (
        await this.db.query<{
          household_id: number;
          code: string;
          qr_token: string | null;
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
          `SELECT p.household_id, p.code,
                  ${hasSignboards ? "COALESCE(p.qr_token, pst.qr_token)" : "p.qr_token"} AS qr_token,
                  p.zone_code, p.sheet_no, p.parcel_no,
                  p.variety, p.planted_year, p.area_ha::float8 AS area_ha,
                  p.status, p.source,
                  ST_AsGeoJSON(p.geom) AS geometry_json,
                  ST_Y(ST_Centroid(p.geom))::float8 AS lat,
                  ST_X(ST_Centroid(p.geom))::float8 AS lng
           FROM plots p
           ${hasSignboards ? "LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)" : ""}
           WHERE p.household_id = ANY($1::bigint[])
              OR (cardinality($2::text[]) > 0 AND upper(p.code) = ANY($2::text[]))
           ORDER BY p.id ASC`,
          [contribHouseholdIds, contribPlotCodes],
        )
      ).rows;
    } else if (hasSignboards && (contribHouseholdIds.length > 0 || contribPlotCodes.length > 0)) {
      sourcePlots = (
        await this.db.query<{
          household_id: number;
          code: string;
          qr_token: string | null;
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
          `SELECT COALESCE(pst.household_id, 0)::bigint AS household_id,
                  pst.plot_code AS code,
                  pst.qr_token,
                  pst.zone_code,
                  NULL::text AS sheet_no,
                  NULL::text AS parcel_no,
                  pst.variety,
                  pst.planted_year,
                  pst.area_ha::float8 AS area_ha,
                  'approved'::text AS status,
                  'signboard'::text AS source,
                  pst.geometry_json,
                  pst.center_lat::float8 AS lat,
                  pst.center_lng::float8 AS lng
           FROM plot_signboard_tokens pst
           WHERE pst.household_id = ANY($1::bigint[])
              OR (cardinality($2::text[]) > 0 AND upper(pst.plot_code) = ANY($2::text[]))
           ORDER BY pst.plot_code ASC`,
          [contribHouseholdIds, contribPlotCodes],
        )
      ).rows;
    }

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
                    lt.lab_accreditation_code, lt.external_verify_code, lt.external_verify_url,
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
                    lt.lab_accreditation_code, lt.external_verify_code, lt.external_verify_url,
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
      labAccreditationCode: string | null;
      externalVerifyCode: string | null;
      externalVerifyUrl: string | null;
      scanUrl: string | null;
    }>(labTestsRes.rows);

    const latestMinuteRes = await this.db.query<{ code: string; officer: string; held_on: string }>(
      `SELECT code, officer, held_on::text AS held_on FROM inspection_minutes ORDER BY held_on DESC, id DESC LIMIT 1`,
    );
    const lastInspectionOn = toIsoDateOnly(latestMinuteRes.rows[0]?.held_on);
    const latestMinuteCode = latestMinuteRes.rows[0]?.code ?? null;
    const latestMinuteOfficer = latestMinuteRes.rows[0]?.officer ?? null;

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
    const [verification, fieldAuditPass] = await Promise.all([
      this.recordScanAndVerify({
        scannedCode: cleanCode,
        canonicalKey,
        resolvedLotCode: lotCode,
        traceUnit,
        isRevoked,
        hasRealtimeSuspension,
        access,
        ctx,
      }),
      this.resolveFieldAuditPass(ctx, primaryPucCode, cleanCode, lotCode, true),
    ]);

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

    const totalContribKg =
      contribHouseholds.reduce((s, h) => s + Number(h.weight_kg || 0), 0) ||
      Number(lotRow.weightTons || 0) * 1000;
    const seasonYear = harvestedOn ? Number(harvestedOn.slice(0, 4)) || new Date().getFullYear() : new Date().getFullYear();

    const [integritySeal, massBalance] = await Promise.all([
      this.computeLedgerIntegritySummary(contribHouseholdIds, contribPlotCodes),
      this.computeMassBalanceSummary({
        seasonYear,
        pucCode: primaryPucCode,
        lotId: internalLotId,
        thisLotWeightKg: totalContribKg,
        plotCodes:
          contribPlotCodes.length > 0
            ? contribPlotCodes
            : effectivePlots.map((p) => p.code),
        householdIds: contribHouseholdIds,
      }),
    ]);

    const phytoCertNo = lotRow.phytosanitaryCertNo ? String(lotRow.phytosanitaryCertNo) : null;
    const phytoIssuedOn = toIsoDateOnly(lotRow.phytosanitaryIssuedOn);

    const governance = await this.buildGovernancePayload({
      pucCode: primaryPucCode,
      cooperativeName: DEFAULT_COOP_NAME,
      participatingHouseholdCount,
      onTimePct: integritySeal.onTimePct,
      chainVerified: integritySeal.chainVerified,
      lastInspectionOn,
      latestMinuteCode,
      latestMinuteOfficer,
      latestLab: latestLab
        ? {
            code: latestLab.code,
            lab: latestLab.lab,
            sampledOn: latestLabSampledOn,
            result: latestLab.result,
            labAccreditationCode: latestLab.labAccreditationCode,
          }
        : null,
      phytoCertNo,
    });

    // Kiểm nghiệm công khai: KHÔNG lộ tên chủ hộ và mã thửa riêng lẻ, có kèm mã đối chiếu gốc ISO/IEC 17025
    const publicLabTests = rawLabTests.slice(0, 3).map((lt) => ({
      code: lt.code,
      sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
      lab: lt.lab,
      labAccreditationCode: lt.labAccreditationCode,
      externalVerifyCode: lt.externalVerifyCode,
      externalVerifyUrl: lt.externalVerifyUrl,
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

    // Dữ liệu Cấp 2 (Doanh nghiệp hoặc Đoàn Thẩm định có Thẻ hợp lệ: vùng nguồn, hạn ngạch Mass-Balance, kiểm nghiệm chi tiết)
    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise || fieldAuditPass?.active) {
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
        massBalance: massBalance.enterpriseBreakdown,
        fieldAuditSourcePlots: effectivePlots.slice(0, 12).map((p) => ({
          plotCode: p.code,
          qrToken: p.qr_token,
          zoneCode: p.zone_code || primaryPucCode,
          variety: p.variety || varietyDisplay,
          areaHa: p.area_ha,
          status: p.status,
        })),
        detailedLabTests: rawLabTests.map((lt) => {
          const matchedPlot = sourcePlots.find((p) => p.code.toUpperCase() === lt.plotCode.toUpperCase());
          return {
            code: lt.code,
            zoneCode: matchedPlot?.zone_code || primaryPucCode,
            sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
            lab: lt.lab,
            labAccreditationCode: lt.labAccreditationCode,
            externalVerifyCode: lt.externalVerifyCode,
            externalVerifyUrl: lt.externalVerifyUrl,
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

    // Dữ liệu Cấp 3 (Cơ quan quản lý: danh sách hộ/thửa nguồn kèm GIS, nhật ký canh tác & thuốc BVTV niêm phong SHA-256, biên bản kiểm tra)
    let authorityData: Record<string, unknown> | undefined;
    if (viewerTier === "authority") {
      const [diariesRes, minutesRes, violationsRes] = await Promise.all([
        contribHouseholdIds.length > 0
          ? this.db.query(
              `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days,
                      server_recorded_at, entry_delay_hours::float8 AS entry_delay_hours, is_late_entry, record_hash,
                      gps_verified, gps_distance_m::float8 AS gps_distance_m, photo_url
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
                        sr.server_recorded_at,
                        sr.entry_delay_hours,
                        sr.is_late_entry,
                        sr.record_hash,
                        false AS gps_verified,
                        NULL::numeric AS gps_distance_m,
                        NULL::text AS photo_url,
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
                        je.server_recorded_at,
                        je.entry_delay_hours,
                        je.is_late_entry,
                        je.record_hash,
                        je.gps_verified,
                        je.gps_distance_m,
                        ${publicAttachmentUrlSql("je.photo_id")} AS photo_url,
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
          `SELECT im.code, im.held_on, im.location, im.officer, im.result,
                  im.plot_code, im.gps_verified, im.gps_distance_m::float8 AS gps_distance_m,
                  im.record_hash, im.server_recorded_at,
                  ${publicAttachmentUrlSql("im.photo_id")} AS photo_url
           FROM inspection_minutes im
           ORDER BY im.held_on DESC, im.id DESC
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
              qrToken: p.qr_token,
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
      accessControl: this.buildAccessControlPayload(access, ctx, fieldAuditPass),
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
      // 9 nhóm thông tin chuẩn Mục 1 (Công khai) + trạng thái thời gian thực (4c) + 5 trụ cột bảo chứng minh bạch
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
        integritySeal,
        massBalanceSummary: massBalance.publicSummary,
        governance,
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
        `SELECT hl.id, hl.code, hl.qr_token, hl.enterprise_id, hl.coop_code, hl.packed_on, hl.exported_on, hl.market, hl.status,
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
      this.db.query<{ code: string; officer: string; held_on: string }>(
        `SELECT code, officer, held_on::text AS held_on FROM inspection_minutes ORDER BY held_on DESC, id DESC LIMIT 1`,
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
              result, lab, lab_accreditation_code, external_verify_code, external_verify_url,
              ${publicAttachmentUrlSql("scan_attachment_id")} AS scan_url
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
    const resolvedLinkedLotCode = linkedLot ? String(linkedLot.code) : null;
    const [verification, fieldAuditPass] = await Promise.all([
      this.recordScanAndVerify({
        scannedCode: cleanCode,
        canonicalKey,
        resolvedLotCode: resolvedLinkedLotCode,
        traceUnit: "fruit",
        isRevoked,
        hasRealtimeSuspension,
        access,
        ctx,
      }),
      this.resolveFieldAuditPass(ctx, pucCode, cleanCode, resolvedLinkedLotCode, true),
    ]);

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
      labAccreditationCode: string | null;
      externalVerifyCode: string | null;
      externalVerifyUrl: string | null;
      scanUrl: string | null;
    }>(labTestsRes.rows);
    const latestLab = rawLabs[0] ?? null;

    const harvestedOn =
      toIsoDateOnly(raw.harvestDate) || toIsoDateOnly(raw.activatedAt);
    const packedOn = toIsoDateOnly(linkedLot?.packedOn) || addDaysIso(harvestedOn, 1);
    const exportedOn = toIsoDateOnly(linkedLot?.exportedOn);
    const lastInspectionOn = toIsoDateOnly(latestMinuteRes.rows[0]?.held_on);
    const latestMinuteCode = latestMinuteRes.rows[0]?.code ?? null;
    const latestMinuteOfficer = latestMinuteRes.rows[0]?.officer ?? null;

    const stampWeightKg =
      raw.fruitWeightKg !== null && raw.fruitWeightKg !== undefined ? Number(raw.fruitWeightKg) : null;
    const seasonYear = harvestedOn ? Number(harvestedOn.slice(0, 4)) || new Date().getFullYear() : new Date().getFullYear();

    const [integritySeal, massBalance] = await Promise.all([
      this.computeLedgerIntegritySummary([householdId], stampPlotCode ? [stampPlotCode] : []),
      this.computeMassBalanceSummary({
        seasonYear,
        pucCode,
        lotId: linkedLot?.id ? Number(linkedLot.id) : null,
        thisLotWeightKg: stampWeightKg ?? 0,
        plotCodes: stampPlotCode ? [stampPlotCode] : [],
        householdIds: [householdId],
      }),
    ]);

    const phytoCertNo = linkedLot?.phytosanitaryCertNo ? String(linkedLot.phytosanitaryCertNo) : null;
    const governance = await this.buildGovernancePayload({
      pucCode,
      cooperativeName: DEFAULT_COOP_NAME,
      participatingHouseholdCount: 1,
      onTimePct: integritySeal.onTimePct,
      chainVerified: integritySeal.chainVerified,
      lastInspectionOn,
      latestMinuteCode,
      latestMinuteOfficer,
      latestLab: latestLab
        ? {
            code: latestLab.code,
            lab: latestLab.lab,
            sampledOn: toIsoDateOnly(latestLab.sampledOn),
            result: latestLab.result,
            labAccreditationCode: latestLab.labAccreditationCode,
          }
        : null,
      phytoCertNo,
    });

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

    // Dữ liệu Cấp 2 (Doanh nghiệp hoặc Đoàn Thẩm định có Thẻ hợp lệ)
    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise || fieldAuditPass?.active) {
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
        massBalance: massBalance.enterpriseBreakdown,
        detailedLabTests: rawLabs.map((lt) => ({
          code: lt.code,
          zoneCode: pucCode,
          sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
          lab: lt.lab,
          labAccreditationCode: lt.labAccreditationCode,
          externalVerifyCode: lt.externalVerifyCode,
          externalVerifyUrl: lt.externalVerifyUrl,
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
          `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days,
                  server_recorded_at, entry_delay_hours::float8 AS entry_delay_hours, is_late_entry, record_hash,
                  gps_verified, gps_distance_m::float8 AS gps_distance_m, photo_url
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
                    sr.server_recorded_at,
                    sr.entry_delay_hours,
                    sr.is_late_entry,
                    sr.record_hash,
                    false AS gps_verified,
                    NULL::numeric AS gps_distance_m,
                    NULL::text AS photo_url,
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
                    je.server_recorded_at,
                    je.entry_delay_hours,
                    je.is_late_entry,
                    je.record_hash,
                    je.gps_verified,
                    je.gps_distance_m,
                    ${publicAttachmentUrlSql("je.photo_id")} AS photo_url,
                    je.id AS sort_id
             FROM journal_entries je
             WHERE je.household_id = $1
           ) combined
           ORDER BY entry_on DESC, sort_id DESC
           LIMIT 20`,
          [householdId, String(raw.householdName || "")],
        ),
        this.db.query(
          `SELECT im.code, im.held_on, im.location, im.officer, im.result,
                  im.plot_code, im.gps_verified, im.gps_distance_m::float8 AS gps_distance_m,
                  im.record_hash, im.server_recorded_at,
                  ${publicAttachmentUrlSql("im.photo_id")} AS photo_url
           FROM inspection_minutes im
           ORDER BY im.held_on DESC, im.id DESC
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
      accessControl: this.buildAccessControlPayload(access, ctx, fieldAuditPass),
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
          labAccreditationCode: lt.labAccreditationCode,
          externalVerifyCode: lt.externalVerifyCode,
          externalVerifyUrl: lt.externalVerifyUrl,
          cdMgKg: lt.cdMgKg,
          yellowOPositive: lt.yellowOPositive,
          residueMgKg: lt.residueMgKg,
          chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
          result: lt.result,
          scanUrl: lt.scanUrl,
        })),
        phytosanitary: {
          certNo: phytoCertNo,
          issuedOn: toIsoDateOnly(linkedLot?.phytosanitaryIssuedOn),
          authority: "Chi cục Kiểm dịch Thực vật Vùng / Cục Bảo vệ Thực vật",
          statusLabel: phytoCertNo
            ? "Đã cấp giấy chứng nhận kiểm dịch thực vật theo lô"
            : "Áp dụng theo lô xuất khẩu của cơ sở đóng gói",
        },
        integritySeal,
        massBalanceSummary: massBalance.publicSummary,
        governance,
        verification,
      },
      ...(enterpriseData ? { enterpriseData } : {}),
      ...(authorityData ? { authorityData } : {}),
    };
  }

  /** Xây dựng phản hồi 3 cấp + Chế độ Đoàn Thẩm định Thực địa khi quét Bảng QR Thửa Đất (plots / plot_signboard_tokens). */
  private async buildPlotTraceResponse(params: {
    cleanCode: string;
    rawPlotRow: Record<string, unknown>;
    hasPlots: boolean;
    ctx: TraceRequestContext;
  }) {
    const { cleanCode, hasPlots, ctx } = params;
    const raw = camelRow<Record<string, unknown>>(params.rawPlotRow);
    const plotCode = String(raw.code);
    const plotQrToken = raw.plotQrToken ? String(raw.plotQrToken) : null;
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
            `SELECT hl.id, hl.code, hl.qr_token, hl.enterprise_id, hl.coop_code, hl.harvested_on, hl.packed_on, hl.exported_on,
                    hl.weight_tons::float8 AS weight_tons, hl.market, hl.status,
                    hl.packhouse_code, COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                    COALESCE(hl.packhouse_address, e.address) AS packhouse_address,
                    hl.phytosanitary_cert_no, hl.phytosanitary_issued_on,
                    hc.weight_kg::float8 AS contributed_kg
             FROM harvest_contributions hc
             JOIN harvest_lots hl ON hl.id = hc.lot_id
             LEFT JOIN enterprises e ON e.id = hl.enterprise_id
             WHERE hc.household_id = $1
             ORDER BY (CASE WHEN upper(COALESCE(hc.plot_code, '')) = upper($2) THEN 0 ELSE 1 END),
                      hl.harvested_on DESC, hc.id DESC
             LIMIT 1`,
            [plotHouseholdId, plotCode],
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      this.db.query<{ code: string; officer: string; held_on: string }>(
        `SELECT code, officer, held_on::text AS held_on FROM inspection_minutes ORDER BY held_on DESC, id DESC LIMIT 1`,
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
              result, lab, lab_accreditation_code, external_verify_code, external_verify_url,
              ${publicAttachmentUrlSql("scan_attachment_id")} AS scan_url
       FROM lab_tests
       WHERE (
         upper(plot_code) = upper($1)
         OR ($2::bigint IS NOT NULL AND household_id = $2)
       )
       ${verifiedLabClause}
       ORDER BY (CASE WHEN upper(plot_code) = upper($1) THEN 0 ELSE 1 END), sampled_on DESC, id DESC
       LIMIT 4`,
      [plotCode, plotHouseholdId],
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

    const resolvedLinkedLotCode = linkedLot ? String(linkedLot.code) : null;
    const [verification, fieldAuditPass] = await Promise.all([
      this.recordScanAndVerify({
        scannedCode: cleanCode,
        canonicalKey: plotQrToken || plotCode,
        resolvedLotCode: resolvedLinkedLotCode,
        traceUnit: "puc_zone",
        isRevoked: isSuspended,
        hasRealtimeSuspension,
        access,
        ctx,
      }),
      this.resolveFieldAuditPass(ctx, pucCode, cleanCode, resolvedLinkedLotCode, true),
    ]);

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
      labAccreditationCode: string | null;
      externalVerifyCode: string | null;
      externalVerifyUrl: string | null;
      scanUrl: string | null;
    }>(labTestsRes.rows);
    const latestLab = rawLabs[0] ?? null;

    const harvestedOn = toIsoDateOnly(linkedLot?.harvestedOn);
    const packedOn = toIsoDateOnly(linkedLot?.packedOn);
    const exportedOn = toIsoDateOnly(linkedLot?.exportedOn);
    const lastInspectionOn = toIsoDateOnly(latestMinuteRes.rows[0]?.held_on);
    const latestMinuteCode = latestMinuteRes.rows[0]?.code ?? null;
    const latestMinuteOfficer = latestMinuteRes.rows[0]?.officer ?? null;

    const contribKg = linkedLot?.contributedKg ? Number(linkedLot.contributedKg) : 0;
    const seasonYear = harvestedOn ? Number(harvestedOn.slice(0, 4)) || new Date().getFullYear() : new Date().getFullYear();

    const [integritySeal, massBalance] = await Promise.all([
      this.computeLedgerIntegritySummary(plotHouseholdId ? [plotHouseholdId] : [], [plotCode]),
      this.computeMassBalanceSummary({
        seasonYear,
        pucCode,
        lotId: linkedLot?.id ? Number(linkedLot.id) : null,
        thisLotWeightKg: contribKg,
        plotCodes: [plotCode],
        householdIds: plotHouseholdId ? [plotHouseholdId] : [],
      }),
    ]);

    const phytoCertNo = linkedLot?.phytosanitaryCertNo ? String(linkedLot.phytosanitaryCertNo) : null;
    const governance = await this.buildGovernancePayload({
      pucCode,
      cooperativeName: DEFAULT_COOP_NAME,
      participatingHouseholdCount: 1,
      onTimePct: integritySeal.onTimePct,
      chainVerified: integritySeal.chainVerified,
      lastInspectionOn,
      latestMinuteCode,
      latestMinuteOfficer,
      latestLab: latestLab
        ? {
            code: latestLab.code,
            lab: latestLab.lab,
            sampledOn: toIsoDateOnly(latestLab.sampledOn),
            result: latestLab.result,
            labAccreditationCode: latestLab.labAccreditationCode,
          }
        : null,
      phytoCertNo,
    });

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

    const isOwnerFarmer =
      ctx.user?.role === "farmer" &&
      plotHouseholdId !== null &&
      Number(ctx.user.householdId) === plotHouseholdId;
    const canViewFieldAudit =
      Boolean(fieldAuditPass?.active) ||
      (viewerTier !== "public" && !access.scopeDenied) ||
      isOwnerFarmer;

    let fieldAuditData: Record<string, unknown> | undefined;
    if (canViewFieldAudit) {
      fieldAuditData = await this.buildFieldAuditPlotDossier({
        plotCode,
        qrToken: plotQrToken,
        householdId: plotHouseholdId,
        householdCode: raw.householdCode ? String(raw.householdCode) : null,
        consentedOwnerName: hasConsent && raw.ownerName ? String(raw.ownerName) : null,
        zoneCode: pucCode,
        villageName: String(raw.village || "Xã Cư Né"),
        adminLocation,
        variety: String(raw.variety || "Ri6 & Monthong (Dona)"),
        plantedYear: raw.plantedYear !== null && raw.plantedYear !== undefined ? Number(raw.plantedYear) : null,
        areaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 1,
        treeCount: raw.treeCount !== null && raw.treeCount !== undefined ? Number(raw.treeCount) : 150,
        status: String(raw.status || "approved"),
        sheetNo: (raw.sheetNo as string | null) ?? null,
        parcelNo: (raw.parcelNo as string | null) ?? null,
        centerLat: raw.lat !== null && raw.lat !== undefined ? Number(raw.lat) : null,
        centerLng: raw.lng !== null && raw.lng !== undefined ? Number(raw.lng) : null,
        geometryJson: (raw.geometryJson as string | null) ?? null,
      });
    }

    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise || fieldAuditPass?.active) {
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
        massBalance: massBalance.enterpriseBreakdown,
        detailedLabTests: rawLabs.map((lt) => ({
          code: lt.code,
          zoneCode: pucCode,
          sampledOn: toIsoDateOnly(lt.sampledOn) || lt.sampledOn,
          lab: lt.lab,
          labAccreditationCode: lt.labAccreditationCode,
          externalVerifyCode: lt.externalVerifyCode,
          externalVerifyUrl: lt.externalVerifyUrl,
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
          `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days,
                  server_recorded_at, entry_delay_hours::float8 AS entry_delay_hours, is_late_entry, record_hash,
                  gps_verified, gps_distance_m::float8 AS gps_distance_m, photo_url
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
                    sr.server_recorded_at,
                    sr.entry_delay_hours,
                    sr.is_late_entry,
                    sr.record_hash,
                    false AS gps_verified,
                    NULL::numeric AS gps_distance_m,
                    NULL::text AS photo_url,
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
                    je.server_recorded_at,
                    je.entry_delay_hours,
                    je.is_late_entry,
                    je.record_hash,
                    je.gps_verified,
                    je.gps_distance_m,
                    ${publicAttachmentUrlSql("je.photo_id")} AS photo_url,
                    je.id AS sort_id
             FROM journal_entries je
             WHERE upper(je.plot_code) = upper($1)
           ) combined
           ORDER BY entry_on DESC, sort_id DESC
           LIMIT 20`,
          [plotCode, plotHouseholdId, String(raw.ownerName || "")],
        ),
        this.db.query(
          `SELECT im.code, im.held_on, im.location, im.officer, im.result,
                  im.plot_code, im.gps_verified, im.gps_distance_m::float8 AS gps_distance_m,
                  im.record_hash, im.server_recorded_at,
                  ${publicAttachmentUrlSql("im.photo_id")} AS photo_url
           FROM inspection_minutes im
           ORDER BY im.held_on DESC, im.id DESC
           LIMIT 6`,
        ),
        this.db.query(
          `SELECT severity, title, household_label, detected_on, plot_code, description, status
           FROM violations
           WHERE upper(COALESCE(plot_code, '')) = upper($1)
              OR ($2::text IS NOT NULL AND $2 <> '' AND household_label ILIKE '%' || $2 || '%')
           ORDER BY detected_on DESC, id DESC
           LIMIT 6`,
          [plotCode, String(raw.householdCode || "")],
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
            contributedPlotCode: plotCode,
            plots: [
              {
                plotCode,
                qrToken: plotQrToken,
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
    const resolvedQrToken = plotQrToken || (linkedLot?.qrToken ? String(linkedLot.qrToken) : null);

    return {
      verifiedAt: verification.verifiedAt,
      isPlotSignboard: true,
      plotSignboard: {
        plotCode,
        qrToken: plotQrToken,
        zoneCode: pucCode,
        areaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 0,
        treeCount: raw.treeCount !== null && raw.treeCount !== undefined ? Number(raw.treeCount) : 0,
      },
      accessControl: this.buildAccessControlPayload(access, ctx, fieldAuditPass),
      publicData: {
        lotIdentity: {
          productName: "Sầu riêng vùng trồng định danh (Durio zibethinus)",
          variety: String(raw.variety || "Ri6 & Monthong (Dona)"),
          lotCode: linkedLot ? String(linkedLot.code) : pucCode,
          qrToken: resolvedQrToken,
          scannedCode: cleanCode,
          traceUnit: "puc_zone",
          traceUnitLabel: `Bảng QR Thửa đất ${plotCode} (Vùng trồng ${pucCode})`,
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
          labAccreditationCode: lt.labAccreditationCode,
          externalVerifyCode: lt.externalVerifyCode,
          externalVerifyUrl: lt.externalVerifyUrl,
          cdMgKg: lt.cdMgKg,
          yellowOPositive: lt.yellowOPositive,
          residueMgKg: lt.residueMgKg,
          chlorpyrifosMgKg: lt.chlorpyrifosMgKg,
          result: lt.result,
          scanUrl: lt.scanUrl,
        })),
        phytosanitary: {
          certNo: phytoCertNo,
          issuedOn: toIsoDateOnly(linkedLot?.phytosanitaryIssuedOn),
          authority: "Chi cục Kiểm dịch Thực vật Vùng / Cục Bảo vệ Thực vật",
          statusLabel: phytoCertNo
            ? "Đã cấp giấy chứng nhận kiểm dịch thực vật cho lô liên kết"
            : "Cấp theo từng lô hàng xuất khẩu tại cơ sở đóng gói",
        },
        integritySeal,
        massBalanceSummary: massBalance.publicSummary,
        governance,
        verification,
      },
      ...(fieldAuditData ? { fieldAuditData } : {}),
      ...(enterpriseData ? { enterpriseData } : {}),
      ...(authorityData ? { authorityData } : {}),
    };
  }
}
