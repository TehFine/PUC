import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { can, isCoopStaffRole } from "../auth/permissions";
import { verifyOrderedChain, type VerifiableChainEntry } from "../common/crypto/integrity-chain";
import { forbidden, notFound } from "../common/errors/app.exception";
import { verifyPlotGpsProximity } from "../common/geo/plot-proximity";
import { camelRow, camelRows, formatDateIsoVn, publicAttachmentUrlSql } from "../common/sql/rows";
import { hasPublicTable } from "../common/sql/schema-cache";
import { RateLimitException } from "../common/throttler/rate-limit.policy";
import { DatabaseService } from "../database/database.service";

const UNIFORM_AUDIT_PASS_ERR =
  "Thẻ đoàn thẩm định không hợp lệ, đã hết hạn hoặc không thuộc phạm vi vùng trồng này.";
const AUDIT_PASS_WINDOW_MS = 60_000;
const AUDIT_PASS_MAX_FAILS = process.env.NODE_ENV === "test" ? 25 : 10;

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

/** Che CCCD thống nhất: chỉ giữ 2 số cuối (ví dụ `**********89`), NULL khi hộ chưa khai CCCD. */
const CCCD_MASKED_SQL =
  "CASE WHEN h.cccd IS NOT NULL AND btrim(h.cccd) <> '' THEN '**********' || right(btrim(h.cccd), 2) ELSE NULL END";

/** Nhãn trung tính cho lượt đối chứng GPS của chủ hộ chưa đồng ý công khai tên (Nghị định 13/2023/NĐ-CP). */
const NEUTRAL_FARMER_ACTOR_LABEL = "Chủ hộ thành viên HTX";

/** Che số điện thoại cá nhân nông hộ khi mở quyền tạm thời không đăng nhập cán bộ (ví dụ `0905123456` -> `090*****56`). */
function maskFarmerPhone(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s.length <= 4) return "****";
  return `${s.slice(0, 3)}${"*".repeat(Math.max(3, s.length - 5))}${s.slice(-2)}`;
}

/** Chuẩn hóa mã tra cứu người dùng nhập hoặc dán (bỏ tiền tố tiếng Việt phổ biến và khoảng trắng thừa). */
function normalizeTraceLookupCode(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:thửa|thua|lô|lo|mã\s*lô|ma\s*lo|mã\s*thửa|ma\s*thua|mã\s*vùng|ma\s*vung|mã\s*hộ|ma\s*ho|nông\s*hộ|nong\s*ho|hộ|ho|mã|ma|puc|phc|tem|thùng|thung)\s*[:#-]?\s*/iu, "")
    .replace(/\s+/g, "");
}

/**
 * Biểu thức SQL trả mảng JSON đường dẫn ảnh/video minh chứng hiện trường qua `public_token`,
 * loại trừ cứng các mục đích nội bộ và ảnh hóa đơn mua vật tư (`care_milestone_declarations.invoice_photo_*`).
 */
function safeFieldPhotoUrlsSql(
  idsColumn: string,
  fallbackColumn: string,
  hasMilestoneInvoices: boolean,
): string {
  const excludeInvoicesClause = hasMilestoneInvoices
    ? `AND NOT EXISTS (
         SELECT 1 FROM care_milestone_declarations cmd_inv
         WHERE cmd_inv.invoice_photo_id = a_pub.id
            OR a_pub.id = ANY(cmd_inv.invoice_photo_ids)
       )`
    : "";
  return `COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN a_pub.mime_type = 'video/webm' THEN '/api/public/files/' || a_pub.public_token || '/video.webm'
          WHEN a_pub.mime_type LIKE 'video/%' THEN '/api/public/files/' || a_pub.public_token || '/video.mp4'
          ELSE '/api/public/files/' || a_pub.public_token
        END
        ORDER BY u_pub.ord
      )
      FROM unnest(
        CASE
          WHEN cardinality(${idsColumn}) > 0 THEN ${idsColumn}
          WHEN ${fallbackColumn} IS NOT NULL THEN ARRAY[${fallbackColumn}]
          ELSE ARRAY[]::bigint[]
        END
      ) WITH ORDINALITY AS u_pub(att_id, ord)
      JOIN attachments a_pub ON a_pub.id = u_pub.att_id
      WHERE a_pub.purpose NOT IN ('approval', 'violation', 'harvest', 'stamp')
        ${excludeInvoicesClause}
    ),
    '[]'::jsonb
  )`;
}

function normalizeEvidenceMediaRows<T extends Record<string, unknown> = Record<string, unknown>>(
  rows: Record<string, unknown>[],
): T[] {
  return rows.map((rawRow) => {
    const converted = camelRow<Record<string, unknown>>(rawRow);
    const rawUrls = Array.isArray(converted.photoUrls) ? converted.photoUrls : [];
    const cleanUrls = rawUrls
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((u) => u.trim());
    const fallbackSingle =
      typeof converted.photoUrl === "string" && converted.photoUrl.trim().length > 0
        ? converted.photoUrl.trim()
        : null;
    if (cleanUrls.length === 0 && fallbackSingle) {
      cleanUrls.push(fallbackSingle);
    }
    converted.photoUrls = cleanUrls;
    converted.photoUrl = cleanUrls[0] ?? null;
    return converted as T;
  });
}

export interface TraceRequestContext {
  user?: AuthUser;
  ip?: string;
  userAgent?: string;
  requestedView?: string;
  auditPass?: string;
  countryCode?: string;
  isBackgroundRefresh?: boolean;
  suppressTemporaryGrant?: boolean;
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

export interface ResolvedTemporaryTraceGrant {
  active: boolean;
  id: number;
  requestCode: string;
  requesterName: string;
  organization: string;
  grantedTier: "enterprise" | "authority";
  scopeMode: "record" | "zone" | "coop";
  expiresAt: string;
  reviewedByName: string | null;
  matchedViaToken: boolean;
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
    return formatDateIsoVn(val);
  }
  const s = String(val).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateIsoVn(parsed);
  }
  return null;
}

export interface ResourceScopeTarget {
  targetKind?: "lot" | "box" | "fruit" | "plot";
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

export interface DossierContributorEntry {
  index: number;
  visibilityLevel: "public" | "enterprise" | "authority";
  isAnonymized: boolean;
  displayName: string | null;
  avatarUrl?: string | null;
  householdCode: string | null;
  villageName: string;
  pucCode: string;
  sharePct: number;
  complianceStatus: "valid" | "review";
  plotCode: string | null;
  areaHa: number | null;
  weightKg: number | null;
  phone: string | null;
  cccdMasked: string | null;
  cadastralLabel: string | null;
  publicConsent: boolean | null;
}

export interface TraceFarmerProfile {
  displayName: string;
  isAnonymized: boolean;
  avatarUrl: string | null;
  householdCode: string | null;
  villageName: string;
  adminLocation: string;
  cooperativeName: string;
  plotCount: number;
  totalAreaHa: number;
  totalTrees: number;
  zoneCodes: string[];
  varieties: string;
  complianceStatus: "valid" | "review" | "unverified";
  plots?: Array<{
    plotCode: string;
    qrToken: string | null;
    zoneCode: string;
    areaHa: number;
    treeCount: number;
    variety: string | null;
    plantedYear: number | null;
    status: string;
  }>;
}

export interface CommuneLotContributionItem {
  lotCode: string;
  qrToken: string | null;
  harvestedOn: string | null;
  packedOn: string | null;
  exportedOn: string | null;
  plotCode: string | null;
  contributedKg: number;
  lotWeightTons: number;
  sharePct: number;
  packhouseName: string;
  market: string;
  status: string;
}

export interface CommuneLotContributionsSummary {
  scopeLabel: "plot" | "household";
  totalLots: number;
  totalContributedKg: number;
  currentSeasonYear: number;
  currentSeasonKg: number;
  householdTotalLots?: number;
  householdTotalContributedKg?: number;
  lots: CommuneLotContributionItem[];
}

export interface TraceRealtimeEvent {
  type: "trace-updated";
  epoch: number;
  ts: string;
}

interface TraceStreamSubscriber {
  ipKey: string;
  send: (event: TraceRealtimeEvent) => void;
  close?: () => void;
}

const MAX_TRACE_STREAMS_PER_IP = 12;
const MAX_TOTAL_TRACE_STREAMS = 500;
const TRACE_SYNC_DEBOUNCE_MS = 120;

@Injectable()
export class TraceabilityService implements OnModuleInit, OnModuleDestroy {
  private readonly failedAuditPassByIp = new Map<string, number[]>();
  private minutesColsCache: { hasHouseholdId: boolean; hasPlotCode: boolean } | null = null;
  private readonly traceSubscribers = new Set<TraceStreamSubscriber>();
  private unsubscribeCacheTags: (() => void) | null = null;
  private traceSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private traceEpoch = 0;

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) { }

  onModuleInit(): void {
    if (!this.db.cache) return;
    this.unsubscribeCacheTags = this.db.cache.onTagsInvalidated((tags) => {
      if (!tags.includes("trace")) return;
      this.traceEpoch += 1;
      if (this.traceSubscribers.size === 0) return;
      if (this.traceSyncTimer) return;
      this.traceSyncTimer = setTimeout(() => {
        this.traceSyncTimer = null;
        this.broadcastTraceUpdate();
      }, TRACE_SYNC_DEBOUNCE_MS);
      this.traceSyncTimer.unref?.();
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeCacheTags?.();
    this.unsubscribeCacheTags = null;
    if (this.traceSyncTimer) {
      clearTimeout(this.traceSyncTimer);
      this.traceSyncTimer = null;
    }
    for (const sub of this.traceSubscribers) {
      try {
        sub.close?.();
      } catch {
        // Bỏ qua lỗi khi đóng kết nối
      }
    }
    this.traceSubscribers.clear();
  }

  private broadcastTraceUpdate(): void {
    if (this.traceSubscribers.size === 0) return;
    const event: TraceRealtimeEvent = {
      type: "trace-updated",
      epoch: this.traceEpoch,
      ts: new Date().toISOString(),
    };
    for (const sub of this.traceSubscribers) {
      try {
        sub.send(event);
      } catch {
        // Bỏ qua nếu kết nối vừa ngắt
      }
    }
  }

  /** Đăng ký nhận sự kiện cập nhật dữ liệu truy xuất thời gian thực qua SSE. */
  subscribeTraceStream(
    ip: string | undefined,
    send: (event: TraceRealtimeEvent) => void,
    onEvict?: () => void,
  ): () => void {
    const ipKey = (ip || "local").trim() || "local";
    const sameIpSubs: TraceStreamSubscriber[] = [];
    for (const s of this.traceSubscribers) {
      if (s.ipKey === ipKey) sameIpSubs.push(s);
    }
    while (sameIpSubs.length >= MAX_TRACE_STREAMS_PER_IP) {
      const oldest = sameIpSubs.shift();
      if (oldest) {
        this.traceSubscribers.delete(oldest);
        try {
          oldest.close?.();
        } catch {
          // ignore
        }
      }
    }
    if (this.traceSubscribers.size >= MAX_TOTAL_TRACE_STREAMS) {
      const oldestGlobal = this.traceSubscribers.values().next().value;
      if (oldestGlobal) {
        this.traceSubscribers.delete(oldestGlobal);
        try {
          oldestGlobal.close?.();
        } catch {
          // ignore
        }
      }
    }

    const sub: TraceStreamSubscriber = { ipKey, send, close: onEvict };
    this.traceSubscribers.add(sub);
    return () => {
      this.traceSubscribers.delete(sub);
    };
  }

  private checkAuditPassRateLimit(ip?: string) {
    const key = (ip || "local").trim() || "local";
    const now = Date.now();
    const prev = this.failedAuditPassByIp.get(key);
    if (!prev) return;
    const recent = prev.filter((ts) => now - ts < AUDIT_PASS_WINDOW_MS);
    if (recent.length === 0) {
      this.failedAuditPassByIp.delete(key);
      return;
    }
    this.failedAuditPassByIp.set(key, recent);
    if (recent.length >= AUDIT_PASS_MAX_FAILS) {
      const oldestRecent = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestRecent + AUDIT_PASS_WINDOW_MS - now) / 1000));
      throw new RateLimitException(
        retryAfterSeconds,
        "Quá nhiều lần thử thẻ đoàn thẩm định không hợp lệ. Vui lòng thử lại sau ít phút.",
      );
    }
  }

  private recordFailedAuditPassAttempt(ip?: string) {
    const key = (ip || "local").trim() || "local";
    const now = Date.now();
    const recent = (this.failedAuditPassByIp.get(key) ?? []).filter((ts) => now - ts < AUDIT_PASS_WINDOW_MS);
    recent.push(now);

    if (!this.failedAuditPassByIp.has(key) && this.failedAuditPassByIp.size >= 5000) {
      for (const [candidateIp, timestamps] of this.failedAuditPassByIp) {
        if (timestamps.every((ts) => now - ts >= AUDIT_PASS_WINDOW_MS)) {
          this.failedAuditPassByIp.delete(candidateIp);
        }
      }
      if (this.failedAuditPassByIp.size >= 5000) {
        let evicted = false;
        for (const [candidateIp, timestamps] of this.failedAuditPassByIp) {
          if (timestamps.length < AUDIT_PASS_MAX_FAILS) {
            this.failedAuditPassByIp.delete(candidateIp);
            evicted = true;
            break;
          }
        }
        if (!evicted) {
          const oldestIp = this.failedAuditPassByIp.keys().next().value;
          if (oldestIp !== undefined) {
            this.failedAuditPassByIp.delete(oldestIp);
          }
        }
      }
    }

    this.failedAuditPassByIp.delete(key);
    this.failedAuditPassByIp.set(key, recent);
  }

  resolveRoleBaseTier(user?: AuthUser): ViewerTier {
    if (!user) return "public";
    if (
      user.role === "admin" ||
      user.role === "htx_head" ||
      user.role === "htx_deputy" ||
      user.role === "support_specialist" ||
      user.role === "inspector" ||
      user.role === "village_officer"
    ) {
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

    const kind = scope.targetKind ?? "lot";
    const entityVi =
      kind === "plot"
        ? "thửa đất"
        : kind === "box"
          ? "thùng đóng gói"
          : kind === "fruit"
            ? "tem trái sầu riêng"
            : "lô hàng";

    let inScope = false;
    let scopeReason = "";

    if (user.role === "enterprise") {
      const userEntId = user.enterpriseId !== null && user.enterpriseId !== undefined ? Number(user.enterpriseId) : null;
      const lotEntId = scope.enterpriseId !== null && scope.enterpriseId !== undefined ? Number(scope.enterpriseId) : null;
      inScope = userEntId !== null && lotEntId !== null && userEntId === lotEntId;
      scopeReason = inScope
        ? `Thuộc cơ sở đóng gói hoặc doanh nghiệp phụ trách ${entityVi}`
        : `Hồ sơ ${entityVi} không thuộc cơ sở đóng gói hoặc doanh nghiệp của tài khoản này`;
    } else if (isCoopStaffRole(user.role)) {
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
          ? `Hồ sơ ${entityVi} thuộc địa bàn xã/thôn được phân công`
          : `Hồ sơ ${entityVi} không thuộc xã/thôn được phân công quản lý`;
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
        scopeDeniedMessage:
          kind === "lot"
            ? "Bạn không có quyền xem chi tiết lô này"
            : `Bạn không có quyền xem chi tiết ${entityVi} này`,
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

  /**
   * Bộ lọc hộ nguồn cho dữ liệu Cấp 3 theo địa bàn của cán bộ xã/thôn.
   * Lô ghép nguyên liệu nhiều thôn chỉ cần 1 hộ thuộc thôn của cán bộ là mở Cấp 3, nên từng hộ phải được lọc lại
   * đúng quy tắc của `evaluateAccessAndScope` (thôn `villageId` và/hoặc xã `assignedCommune`).
   * Trả về null khi vai trò không bị giới hạn theo thôn (quản trị, thanh tra, HTX).
   */
  private buildOfficerHouseholdFilter(
    user?: AuthUser,
  ): ((h: { villageId: number | null; adminLocations: string[] }) => boolean) | null {
    if (!user || user.role !== "village_officer") return null;
    const hasVillageRule = user.villageId !== null && user.villageId !== undefined;
    const commune = user.assignedCommune ? user.assignedCommune.trim() : "";
    if (!hasVillageRule && !commune) return () => false;
    return (h) => {
      const villageOk = !hasVillageRule || (h.villageId !== null && Number(h.villageId) === Number(user.villageId));
      const communeOk = !commune || matchesJurisdiction(commune, h.adminLocations);
      return villageOk && communeOk;
    };
  }

  /** Quyền xem phiếu kiểm nghiệm nháp (chưa kiểm chứng) và vi phạm nội bộ theo ma trận quyền máy chủ. */
  private resolveSensitiveTracePermissions(
    viewerTier: ViewerTier,
    user?: AuthUser,
  ) {
    const isAuthorityStaff = viewerTier === "authority" && user !== undefined && this.resolveRoleBaseTier(user) === "authority";
    return {
      canReadDraftLabs: isAuthorityStaff && can(user.role, "testing", "read"),
      canReadViolations: isAuthorityStaff && can(user.role, "violations", "read"),
    };
  }

  /** Chỉ cán bộ nhà nước / ban quản trị đã xác thực phiên mới được xem SĐT gốc và họ tên hộ chưa đồng ý công khai. */
  private isAuthenticatedAuthorityStaff(user?: AuthUser): boolean {
    return Boolean(user && this.resolveRoleBaseTier(user) === "authority");
  }

  /**
   * Kiểm tra doanh nghiệp có thực sự phụ trách thửa đất / tem nông hộ trong vụ hiện hành hoặc hợp đồng hiệu lực hay không.
   */
  private async resolveEnterprisePlotOrStampScope(params: {
    user?: AuthUser;
    householdId: number | null;
    plotCode: string | null;
    linkedLotEnterpriseId: number | null;
    pucCode: string;
  }): Promise<number | null> {
    if (params.user?.role !== "enterprise" || !params.user.enterpriseId) {
      return params.linkedLotEnterpriseId;
    }
    const viewerEntId = Number(params.user.enterpriseId);
    if (params.linkedLotEnterpriseId !== null && Number(params.linkedLotEnterpriseId) === viewerEntId) {
      return viewerEntId;
    }

    const currentYearContrib = await this.db.query<{ matched: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         WHERE hl.status <> 'revoked'
           AND hl.enterprise_id = $1
           AND EXTRACT(YEAR FROM hl.harvested_on)::int = EXTRACT(YEAR FROM CURRENT_DATE)::int
           AND (
             ($2::text IS NOT NULL AND upper(btrim(COALESCE(hc.plot_code, ''))) = upper(btrim($2)))
             OR ($2::text IS NULL AND $3::bigint IS NOT NULL AND hc.household_id = $3)
             OR ($3::bigint IS NOT NULL AND hc.household_id = $3 AND COALESCE(btrim(hc.plot_code), '') = '')
           )
       ) AS matched`,
      [viewerEntId, params.plotCode, params.householdId],
    );
    if (currentYearContrib.rows[0]?.matched) {
      return viewerEntId;
    }

    if (await this.hasTable("contracts")) {
      const contractRes = await this.db.query<{ matched: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM contracts c
           WHERE c.enterprise_id = $1
             AND c.status = 'active'
             AND (c.valid_until IS NULL OR c.valid_until >= CURRENT_DATE)
         ) AS matched`,
        [viewerEntId],
      );
      if (contractRes.rows[0]?.matched) {
        return viewerEntId;
      }
    }

    return params.linkedLotEnterpriseId;
  }

  /**
   * Kiểm tra yêu cầu cấp quyền truy xuất đột xuất đã được Quản trị viên phê duyệt còn hiệu lực:
   * - Khớp theo mã khóa phiên `x-audit-pass` (cho khách / đoàn công tác chưa có tài khoản)
   * - Hoặc khớp theo `requester_user_id` của tài khoản đang đăng nhập (trừ khi người dùng chủ động bấm thoát quyền tạm thời).
   */
  private async resolveApprovedAccessGrant(
    ctx: TraceRequestContext,
    target: {
      scannedCode: string;
      targetKind?: "lot" | "box" | "fruit" | "plot";
      canonicalCodes?: Array<string | null | undefined>;
      resolvedLotCode: string | null;
      pucCode: string;
      distinctZoneCodes?: string[];
    },
    recordAccess = true,
  ): Promise<ResolvedTemporaryTraceGrant | null> {
    const rawToken = ctx.auditPass?.trim() || null;
    if (rawToken) {
      this.checkAuditPassRateLimit(ctx.ip);
    }
    const userId = !ctx.suppressTemporaryGrant && ctx.user?.id ? Number(ctx.user.id) : null;
    if (!rawToken && !userId) {
      return null;
    }

    if (!(await this.hasTable("trace_access_requests"))) {
      return null;
    }

    const res = await this.db.query<{
      id: number;
      request_code: string;
      requester_user_id: number | null;
      requester_name: string;
      organization: string;
      scanned_code: string;
      target_kind: "lot" | "box" | "fruit" | "plot";
      resolved_lot_code: string | null;
      puc_code: string | null;
      granted_tier: "enterprise" | "authority" | null;
      scope_mode: "record" | "zone" | "coop";
      granted_pass_token: string | null;
      expires_at: Date | string;
      reviewed_by_name: string | null;
    }>(
      `SELECT id, request_code, requester_user_id, requester_name, organization,
              scanned_code, target_kind, resolved_lot_code, puc_code, granted_tier, scope_mode,
              granted_pass_token, expires_at, reviewed_by_name
       FROM trace_access_requests
       WHERE status = 'approved'
         AND expires_at > now()
         AND (
           ($1::text IS NOT NULL AND granted_pass_token = $1)
           OR ($2::bigint IS NOT NULL AND requester_user_id = $2)
         )
       ORDER BY (CASE WHEN granted_tier = 'authority' THEN 0 ELSE 1 END), id DESC
       LIMIT 8`,
      [rawToken, userId],
    );

    if (res.rows.length === 0) return null;

    const targetZones = (
      target.distinctZoneCodes && target.distinctZoneCodes.length > 0
        ? target.distinctZoneCodes
        : target.pucCode
          ? [target.pucCode]
          : []
    )
      .map((z) => z.trim().toUpperCase())
      .filter(Boolean);
    const scannedUpper = target.scannedCode.trim().toUpperCase();
    const candidateRecordCodes = new Set<string>([scannedUpper]);
    for (const c of target.canonicalCodes ?? []) {
      if (typeof c === "string" && c.trim()) {
        candidateRecordCodes.add(c.trim().toUpperCase());
      }
    }
    const lotUpper = target.resolvedLotCode ? target.resolvedLotCode.trim().toUpperCase() : null;

    for (const row of res.rows) {
      let matchedViaToken = false;
      if (rawToken && row.granted_pass_token) {
        const a = Buffer.from(rawToken, "utf8");
        const b = Buffer.from(row.granted_pass_token, "utf8");
        if (a.length === b.length && timingSafeEqual(a, b)) {
          matchedViaToken = true;
        }
      }
      const matchedViaUser =
        userId !== null &&
        row.requester_user_id !== null &&
        Number(row.requester_user_id) === userId;
      if (!matchedViaToken && !matchedViaUser) continue;

      let scopeMatches = false;
      const rowScannedUpper = row.scanned_code.trim().toUpperCase();
      const rowLotUpper = row.resolved_lot_code ? row.resolved_lot_code.trim().toUpperCase() : null;
      const rowPucUpper = row.puc_code ? row.puc_code.trim().toUpperCase() : null;
      const directRecordMatch = candidateRecordCodes.has(rowScannedUpper);
      const lotRecordMatch =
        target.targetKind !== "plot" &&
        row.target_kind === "lot" &&
        Boolean(lotUpper && rowLotUpper && lotUpper === rowLotUpper);

      if (row.scope_mode === "coop") {
        scopeMatches = true;
      } else if (row.scope_mode === "zone") {
        scopeMatches =
          directRecordMatch ||
          lotRecordMatch ||
          Boolean(rowPucUpper && targetZones.length > 0 && targetZones.every((z) => z === rowPucUpper));
      } else {
        scopeMatches = directRecordMatch || lotRecordMatch;
      }

      if (!scopeMatches) continue;

      const grantedTier: "enterprise" | "authority" = row.granted_tier ?? "enterprise";
      if (recordAccess && !ctx.isBackgroundRefresh) {
        await this.db.query(
          `UPDATE trace_access_requests
           SET access_count = access_count + 1,
               last_accessed_at = now()
           WHERE id = $1`,
          [row.id],
        );

        if (await this.hasTable("trace_detail_access_logs")) {
          await this.db.query(
            `INSERT INTO trace_detail_access_logs
               (user_id, username, full_name, user_role, viewer_tier, scanned_code, lot_code, scope_granted, scope_reason, ip, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10)`,
            [
              ctx.user?.id ?? null,
              ctx.user?.username ?? row.request_code,
              ctx.user?.fullName ?? `${row.requester_name} (${row.organization})`,
              ctx.user?.role ?? "delegation_guest",
              grantedTier,
              target.scannedCode,
              target.resolvedLotCode,
              `Được phê duyệt yêu cầu cấp quyền đột xuất (${row.request_code})`,
              ctx.ip ?? null,
              ctx.userAgent ? ctx.userAgent.slice(0, 250) : null,
            ],
          );
        }
      }

      return {
        active: true,
        id: Number(row.id),
        requestCode: row.request_code,
        requesterName: row.requester_name,
        organization: row.organization,
        grantedTier,
        scopeMode: row.scope_mode,
        expiresAt: new Date(row.expires_at).toISOString(),
        reviewedByName: row.reviewed_by_name,
        matchedViaToken,
      };
    }

    return null;
  }

  private elevateAccessWithGrant(
    baseAccess: EvaluatedTraceAccess,
    ctx: TraceRequestContext,
    grant: ResolvedTemporaryTraceGrant | null,
  ): EvaluatedTraceAccess {
    if (!grant || !grant.active) return baseAccess;
    const elevatedActual: ViewerTier =
      TIER_RANK[grant.grantedTier] > TIER_RANK[baseAccess.actualTier]
        ? grant.grantedTier
        : baseAccess.actualTier;
    let viewerTier: ViewerTier = elevatedActual;
    if (
      ctx.requestedView === "public" ||
      ctx.requestedView === "enterprise" ||
      ctx.requestedView === "authority"
    ) {
      if (TIER_RANK[ctx.requestedView] <= TIER_RANK[elevatedActual]) {
        viewerTier = ctx.requestedView;
      }
    }
    return {
      roleBaseTier: baseAccess.roleBaseTier,
      actualTier: elevatedActual,
      viewerTier,
      scopeDenied: false,
      scopeDeniedMessage: null,
      scopeReason: `Được cấp quyền tạm thời theo mã phê duyệt ${grant.requestCode}`,
    };
  }

  /**
   * Vi phạm nội bộ khớp chính xác theo `household_id` (không dò chuỗi ILIKE trên nhãn hộ).
   * Bản ghi cũ chưa gắn hộ chỉ được khớp khi trùng chính xác mã thửa thuộc phạm vi.
   */
  private async queryScopedViolations(householdIds: number[], plotCodes: string[], limit: number) {
    const cleanHhIds = [...new Set(householdIds.filter((id) => Number.isFinite(id) && id > 0))];
    const cleanPlots = [...new Set(plotCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (cleanHhIds.length === 0 && cleanPlots.length === 0) return [];
    const res = await this.db.query(
      `SELECT v.severity, v.title, v.household_label, v.detected_on, v.plot_code, v.description, v.status
       FROM violations v
       WHERE v.household_id = ANY($1::bigint[])
          OR (v.household_id IS NULL AND cardinality($2::text[]) > 0 AND upper(btrim(COALESCE(v.plot_code, ''))) = ANY($2::text[]))
       ORDER BY v.detected_on DESC, v.id DESC
       LIMIT $3`,
      [cleanHhIds, cleanPlots, limit],
    );
    return camelRows(res.rows);
  }

  /** Biên bản kiểm tra mới nhất trong phạm vi hộ/thửa nguồn (không lấy biên bản toàn HTX). */
  private async queryLatestScopedMinute(householdIds: number[], plotCodes: string[]) {
    const rows = await this.queryScopedInspectionMinutes<{ code: string; officer: string; held_on: string }>(
      "im.code, im.officer, im.held_on::text AS held_on",
      householdIds,
      plotCodes,
      1,
    );
    return rows[0] ?? null;
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

  private hasTable(tableName: string): Promise<boolean> {
    return hasPublicTable(this.db, tableName);
  }

  private async getMinutesScopeCols(): Promise<{ hasHouseholdId: boolean; hasPlotCode: boolean }> {
    if (this.minutesColsCache) return this.minutesColsCache;
    const res = await this.db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'inspection_minutes'
         AND column_name IN ('household_id', 'plot_code')`,
    );
    const cols = new Set(res.rows.map((r) => r.column_name));
    this.minutesColsCache = {
      hasHouseholdId: cols.has("household_id"),
      hasPlotCode: cols.has("plot_code"),
    };
    return this.minutesColsCache;
  }

  private async resolveEffectivePlotCodesForMinutes(householdIds: number[], plotCodes: string[]): Promise<string[]> {
    const cleanPlots = [...new Set(plotCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (cleanPlots.length > 0 || householdIds.length === 0) return cleanPlots;
    if (!(await this.hasTable("plots"))) return cleanPlots;
    const pRes = await this.db.query<{ code: string }>(
      `SELECT DISTINCT upper(btrim(code)) AS code
       FROM plots
       WHERE household_id = ANY($1::bigint[])
         AND code IS NOT NULL AND btrim(code) <> ''`,
      [householdIds],
    );
    return pRes.rows.map((r) => r.code).filter(Boolean);
  }

  private async queryScopedInspectionMinutes<T extends Record<string, unknown> = Record<string, unknown>>(
    selectColumnsSql: string,
    householdIds: number[],
    plotCodes: string[],
    limit: number,
    orderBySql = "im.held_on DESC, im.id DESC",
  ): Promise<T[]> {
    const cleanHhIds = [...new Set(householdIds.filter((id) => Number.isFinite(id) && id > 0))];
    const effectivePlotCodes = await this.resolveEffectivePlotCodesForMinutes(cleanHhIds, plotCodes);
    if (cleanHhIds.length === 0 && effectivePlotCodes.length === 0) {
      return [];
    }
    const cols = await this.getMinutesScopeCols();
    if (cols.hasHouseholdId && cols.hasPlotCode) {
      const res = await this.db.query<T>(
        `SELECT ${selectColumnsSql}
         FROM inspection_minutes im
         WHERE (
           (cardinality($1::bigint[]) > 0 AND im.household_id = ANY($1::bigint[])
            AND (cardinality($2::text[]) = 0 OR im.plot_code IS NULL OR btrim(im.plot_code) = '' OR upper(btrim(im.plot_code)) = ANY($2::text[])))
           OR (im.household_id IS NULL AND cardinality($2::text[]) > 0 AND upper(btrim(COALESCE(im.plot_code, ''))) = ANY($2::text[]))
         )
         ORDER BY ${orderBySql}
         LIMIT $3`,
        [cleanHhIds, effectivePlotCodes, limit],
      );
      return res.rows;
    }
    if (cols.hasHouseholdId) {
      if (cleanHhIds.length === 0) return [];
      const res = await this.db.query<T>(
        `SELECT ${selectColumnsSql}
         FROM inspection_minutes im
         WHERE im.household_id = ANY($1::bigint[])
         ORDER BY ${orderBySql}
         LIMIT $2`,
        [cleanHhIds, limit],
      );
      return res.rows;
    }
    if (cols.hasPlotCode) {
      if (effectivePlotCodes.length === 0) return [];
      const res = await this.db.query<T>(
        `SELECT ${selectColumnsSql}
         FROM inspection_minutes im
         WHERE upper(btrim(COALESCE(im.plot_code, ''))) = ANY($1::text[])
         ORDER BY ${orderBySql}
         LIMIT $2`,
        [effectivePlotCodes, limit],
      );
      return res.rows;
    }
    return [];
  }

  /** Lấy tọa độ khái quát cấp vùng trồng (làm tròn 2 chữ số thập phân ~1.1km, tuyệt đối không lộ tọa độ từng thửa). */
  private async resolveCoarseZoneMap(hasPlots: boolean, pucCode: string, adminLocation: string) {
    const loadCenter = async () => {
      let centerLat = DEFAULT_ZONE_CENTER.lat;
      let centerLng = DEFAULT_ZONE_CENTER.lng;
      let resolved = false;

      if (hasPlots && pucCode && pucCode !== "Chưa cấp mã PUC") {
        const res = await this.db.query<{ lat: number | null; lng: number | null }>(
          `SELECT ROUND(AVG(ST_Y(ST_Centroid(geom)))::numeric, 2)::float8 AS lat,
                  ROUND(AVG(ST_X(ST_Centroid(geom)))::numeric, 2)::float8 AS lng
           FROM plots
           WHERE geom IS NOT NULL AND upper(btrim(COALESCE(zone_code, ''))) = upper(btrim($1))`,
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
        const sbRes = await this.db.query<{ lat: number | null; lng: null | number }>(
          `SELECT ROUND(AVG(center_lat)::numeric, 2)::float8 AS lat,
                  ROUND(AVG(center_lng)::numeric, 2)::float8 AS lng
           FROM plot_signboard_tokens
           WHERE center_lat IS NOT NULL AND center_lng IS NOT NULL
             AND (upper(btrim(COALESCE(zone_code, ''))) = upper(btrim($1)) OR $1 = '')`,
          [pucCode || ""],
        );
        if (sbRes.rows[0]?.lat && sbRes.rows[0]?.lng) {
          centerLat = Number(sbRes.rows[0].lat);
          centerLng = Number(sbRes.rows[0].lng);
        }
      }
      return { centerLat, centerLng };
    };

    const cacheKey = `trace:coarse-map:${hasPlots ? "pg" : "sb"}:${(pucCode || "").trim().toUpperCase()}`;
    const { centerLat, centerLng } = this.db.cache
      ? await this.db.cache.getOrLoad(cacheKey, 60_000, ["trace", "plots"], loadCenter)
      : await loadCenter();

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
    pucName: string | null;
    pucAdminLocation: string | null;
    packhouseStatus: PackhouseLiveStatus;
    packhouseStatusLabel: string;
    enterpriseName: string | null;
    enterpriseAddress: string | null;
    enterprisePackhouseCode: string | null;
  }> {
    let dbZoneStatus: ZoneLiveStatus = "active";
    let pucValidUntil = "2027-12-31";
    let pucNote: string | null = null;
    let pucName: string | null = null;
    let pucAdminLocation: string | null = null;

    const hasGrowingZones = await this.hasTable("growing_zones");
    const [zRes, eRes] = await Promise.all([
      hasGrowingZones
        ? this.db.query<{
            name: string | null;
            commune: string | null;
            district: string | null;
            province: string | null;
            status: ZoneLiveStatus;
            valid_until: unknown;
            status_note: string | null;
          }>(
            `SELECT name, commune, district, province, status, valid_until, status_note
             FROM growing_zones
             WHERE upper(code) = upper($1)
             LIMIT 1`,
            [params.pucCode],
          )
        : Promise.resolve(null),
      params.enterpriseId
        ? this.db.query<{
            status: PackhouseLiveStatus;
            name: string | null;
            address: string | null;
            packhouse_code: string | null;
          }>(
            `SELECT status, name, address, packhouse_code FROM enterprises WHERE id = $1 LIMIT 1`,
            [params.enterpriseId],
          )
        : params.packhouseCode
          ? this.db.query<{
              status: PackhouseLiveStatus;
              name: string | null;
              address: string | null;
              packhouse_code: string | null;
            }>(
              `SELECT status, name, address, packhouse_code
               FROM enterprises
               WHERE upper(btrim(COALESCE(packhouse_code, ''))) = upper(btrim($1))
               ORDER BY (status IN ('revoked', 'suspended', 'inactive')) DESC, id ASC
               LIMIT 1`,
              [params.packhouseCode],
            )
          : Promise.resolve(null),
    ]);

    if (zRes?.rows[0]) {
      dbZoneStatus = zRes.rows[0].status;
      pucValidUntil = toIsoDateOnly(zRes.rows[0].valid_until) || "2027-12-31";
      pucNote = zRes.rows[0].status_note ?? null;
      pucName = zRes.rows[0].name ? zRes.rows[0].name.trim() : null;
      if (zRes.rows[0].commune && zRes.rows[0].province) {
        pucAdminLocation = [
          zRes.rows[0].commune.trim(),
          zRes.rows[0].district?.trim(),
          zRes.rows[0].province.trim(),
        ]
          .filter(Boolean)
          .join(", ");
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
    let enterpriseName: string | null = null;
    let enterpriseAddress: string | null = null;
    let enterprisePackhouseCode: string | null = null;
    if (eRes?.rows[0]) {
      if (eRes.rows[0].status) packhouseStatus = eRes.rows[0].status;
      enterpriseName = eRes.rows[0].name?.trim() || null;
      enterpriseAddress = eRes.rows[0].address?.trim() || null;
      enterprisePackhouseCode = eRes.rows[0].packhouse_code?.trim() || null;
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
      pucName,
      pucAdminLocation,
      packhouseStatus,
      packhouseStatusLabel,
      enterpriseName,
      enterpriseAddress,
      enterprisePackhouseCode,
    };
  }

  private buildAccessControlPayload(
    access: EvaluatedTraceAccess,
    ctx: TraceRequestContext,
    fieldAuditPass?: ResolvedFieldAuditPass | null,
    temporaryGrant?: ResolvedTemporaryTraceGrant | null,
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
        Boolean(fieldAuditPass?.active) ||
        Boolean(temporaryGrant?.active),
      fieldAuditPass: fieldAuditPass ?? null,
      temporaryGrant: temporaryGrant ?? null,
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
    const isBgRefresh = Boolean(params.ctx.isBackgroundRefresh);

    const sideTasks: Promise<unknown>[] = [];
    if (!isBgRefresh && params.ctx.user && (viewerTier !== "public" || params.access.scopeDenied)) {
      const actionLabel = params.access.scopeDenied ? "Từ chối xem chi tiết QR (ngoài phạm vi)" : "Tra cứu QR mở rộng";
      sideTasks.push(
        this.audit.write(
          { ip: params.ctx.ip, user: params.ctx.user },
          {
            action: actionLabel,
            object: `Mã QR ${params.resolvedLotCode || params.scannedCode}`,
            detail: `Mã quét: ${params.scannedCode} - Cấp xem: ${TIER_LABELS[viewerTier]} (vai trò: ${params.ctx.user.role})${params.access.scopeReason ? ` - Phạm vi: ${params.access.scopeReason}` : ""
              }${params.resolvedLotCode && params.resolvedLotCode !== params.scannedCode ? ` - Thuộc lô ${params.resolvedLotCode}` : ""
              }`,
          },
        ),
      );

      if (hasDetailLogTable) {
        sideTasks.push(
          this.db.query(
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
          ),
        );
      }
    }

    let totalScans = 1;
    let scansLast24h = 1;
    let distinctSources24h = 1;
    let distinctCountries24h = params.ctx.countryCode ? 1 : 0;
    let countries24h: string[] = params.ctx.countryCode ? [params.ctx.countryCode] : [];

    const scanStatsTask = (async () => {
      if (!hasScanTable) return;
      if (!isBgRefresh) {
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
      }

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
    })();

    await Promise.all([...sideTasks, scanStatsTask]);

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

    const [lotsRes, boxesRes, stampsRes, plotsRes] = await Promise.all([
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
                fs.fruit_weight_kg::float8 AS fruit_weight_kg,
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
                    ${hasQuotas
            ? `(SELECT q.max_quota_kg::float8 FROM plot_season_quotas q
                            WHERE upper(q.plot_code) = upper(pst.plot_code)
                              AND (pst.household_id IS NULL OR q.household_id = pst.household_id)
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
    ]);

    const combinedUnits = [...camelRows(boxesRes.rows), ...camelRows(stampsRes.rows)].slice(0, 6);

    return {
      lots: camelRows(lotsRes.rows),
      stamps: combinedUnits,
      plots: camelRows(plotsRes.rows),
      demoAuditPass: null,
    };
  }

  /**
   * Kiểm chứng Thẻ Đoàn Thẩm định Thực địa (Field Audit Pass) có thời hạn cho đối tác và đoàn khách mời.
   */
  private async resolveFieldAuditPass(
    ctx: TraceRequestContext,
    pucCode: string,
    scannedCode: string,
    resolvedLotCode: string | null,
    recordAccess = true,
    distinctZoneCodes?: string[],
  ): Promise<ResolvedFieldAuditPass | null> {
    const rawPass = ctx.auditPass?.trim();
    if (!rawPass) return null;

    this.checkAuditPassRateLimit(ctx.ip);

    if (rawPass.length < 12 || rawPass.length > 80) {
      this.recordFailedAuditPassAttempt(ctx.ip);
      return { active: false, invalidReason: UNIFORM_AUDIT_PASS_ERR };
    }

    if (!(await this.hasTable("field_audit_passes"))) {
      return { active: false, invalidReason: UNIFORM_AUDIT_PASS_ERR };
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
       WHERE pass_token = $1
       LIMIT 1`,
      [rawPass],
    );

    const row = res.rows[0];
    if (!row) {
      this.recordFailedAuditPassAttempt(ctx.ip);
      return { active: false, invalidReason: UNIFORM_AUDIT_PASS_ERR };
    }

    const storedBuf = Buffer.from(row.pass_token, "utf8");
    const inputBuf = Buffer.from(rawPass, "utf8");
    if (storedBuf.length !== inputBuf.length || !timingSafeEqual(storedBuf, inputBuf)) {
      this.recordFailedAuditPassAttempt(ctx.ip);
      return { active: false, invalidReason: UNIFORM_AUDIT_PASS_ERR };
    }

    if (row.status !== "active") {
      this.recordFailedAuditPassAttempt(ctx.ip);
      return { active: false, invalidReason: UNIFORM_AUDIT_PASS_ERR };
    }
    const expMs = new Date(row.expires_at).getTime();
    if (Number.isNaN(expMs) || expMs <= Date.now()) {
      this.recordFailedAuditPassAttempt(ctx.ip);
      return { active: false, invalidReason: UNIFORM_AUDIT_PASS_ERR };
    }
    if (row.allowed_zone_code && row.allowed_zone_code.trim()) {
      const allowedZone = row.allowed_zone_code.trim().toUpperCase();
      const zonesToCheck = (
        distinctZoneCodes && distinctZoneCodes.length > 0
          ? distinctZoneCodes
          : pucCode
            ? [pucCode]
            : []
      )
        .map((z) => z.trim().toUpperCase())
        .filter(Boolean);
      if (zonesToCheck.length === 0 || !zonesToCheck.every((z) => z === allowedZone)) {
        this.recordFailedAuditPassAttempt(ctx.ip);
        return { active: false, invalidReason: UNIFORM_AUDIT_PASS_ERR };
      }
    }

    if (recordAccess && !ctx.isBackgroundRefresh) {
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
   * Trụ cột 1: Kiểm chứng độc lập toàn bộ chuỗi băm SHA-256 (append-only hash chain) và thống kê tuân thủ thời gian ghi nhật ký.
   */
  private async computeLedgerIntegritySummary(
    householdIds: number[],
    plotCodes: string[],
    harvestedOnIso?: string | null,
  ) {
    let effectiveHouseholdIds = [...new Set(householdIds.filter((id) => Number.isFinite(id) && id > 0))];
    const cleanPlots = [...new Set(plotCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];

    if (effectiveHouseholdIds.length === 0 && cleanPlots.length > 0) {
      const hhRes = await this.db.query<{ household_id: number }>(
        `SELECT DISTINCT household_id FROM journal_entries
         WHERE household_id IS NOT NULL AND upper(btrim(plot_code)) = ANY($1::text[])
         UNION
         SELECT DISTINCT household_id FROM spray_records
         WHERE household_id IS NOT NULL AND upper(btrim(plot_code)) = ANY($1::text[])`,
        [cleanPlots],
      );
      effectiveHouseholdIds = hhRes.rows.map((r) => Number(r.household_id)).filter((id) => id > 0);
    }

    const [journalRes, sprayRes, matchedMinutes] = await Promise.all([
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
      this.queryScopedInspectionMinutes<{
        id: number;
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
        `im.id,
         im.code,
         to_char(im.held_on, 'YYYY-MM-DD') AS held_on_iso,
         im.officer,
         im.result,
         im.is_late_entry,
         im.entry_delay_hours::float8 AS entry_delay_hours,
         im.server_recorded_at,
         im.prev_hash,
         im.record_hash,
         im.gps_verified`,
        effectiveHouseholdIds,
        cleanPlots,
        500,
        "im.id ASC",
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
    let phiViolatedBeforeHarvest = false;
    for (const r of sprayRes.rows) {
      trackLatest(r.server_recorded_at, r.record_hash);
      if (harvestedOnIso) {
        if (r.mrl_status !== "pass") {
          phiViolatedBeforeHarvest = true;
        } else if (r.isolation_days !== null && Number(r.isolation_days) > 0) {
          const safeOn = addDaysIso(r.sprayed_on_iso, Number(r.isolation_days));
          if (safeOn && safeOn > harvestedOnIso) {
            phiViolatedBeforeHarvest = true;
          }
        }
      }
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

    let minuteSealedCount = 0;
    let minuteOnTimeCount = 0;
    let minuteLateCount = 0;
    let minuteDelaySum = 0;
    let minuteTamperedCount = 0;

    if (matchedMinutes.length > 0) {
      for (const r of matchedMinutes) {
        if (r.gps_verified) gpsVerifiedRecords += 1;
        trackLatest(r.server_recorded_at, r.record_hash);
        if (r.record_hash) {
          minuteSealedCount += 1;
          if (r.is_late_entry) {
            minuteLateCount += 1;
          } else {
            minuteOnTimeCount += 1;
          }
          minuteDelaySum += Number(r.entry_delay_hours || 0);
        }
      }

      const maxMinuteId = Math.max(...matchedMinutes.map((m) => Number(m.id)));
      const prefixMinutesRes = await this.db.query<{
        code: string;
        held_on_iso: string;
        officer: string;
        result: string;
        is_late_entry: boolean;
        entry_delay_hours: number;
        server_recorded_at: Date | string;
        prev_hash: string | null;
        record_hash: string | null;
      }>(
        `SELECT code,
                to_char(held_on, 'YYYY-MM-DD') AS held_on_iso,
                officer,
                result,
                is_late_entry,
                entry_delay_hours::float8 AS entry_delay_hours,
                server_recorded_at,
                prev_hash,
                record_hash
         FROM inspection_minutes
         WHERE id <= $1
         ORDER BY id ASC`,
        [maxMinuteId],
      );

      const minutePrefixChain: Array<VerifiableChainEntry & { entryDelayHours?: number }> = prefixMinutesRes.rows.map(
        (r) => ({
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
        }),
      );
      const prefixCheck = verifyOrderedChain(minutePrefixChain);
      minuteTamperedCount = prefixCheck.tamperedCount;
    }

    const chainResults = [
      ...[...journalByHh.values()].map((c) => verifyOrderedChain(c)),
      ...[...sprayByHh.values()].map((c) => verifyOrderedChain(c)),
    ];

    let totalSealedRecords = minuteSealedCount;
    let verifiedRecords = minuteTamperedCount === 0 ? minuteSealedCount : Math.max(0, minuteSealedCount - minuteTamperedCount);
    let tamperedRecords = minuteTamperedCount;
    let onTimeRecords = minuteOnTimeCount;
    let lateRecordCount = minuteLateCount;
    let weightedDelaySum = minuteDelaySum;

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
      minuteCount: matchedMinutes.length,
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
      phiViolatedBeforeHarvest,
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
    scopedThisLotWeightKg?: number;
    plotCodes: string[];
    householdIds: number[];
    allowedPlotFilter?: (row: { householdId: number; plotCode: string }) => boolean;
  }) {
    if (!(await this.hasTable("plot_season_quotas"))) {
      return { publicSummary: null, enterpriseBreakdown: null };
    }

    const cleanPlots = [...new Set(params.plotCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const cleanHhIds = [...new Set(params.householdIds.filter((id) => Number.isFinite(id) && id > 0))];
    if (cleanPlots.length === 0 && cleanHhIds.length === 0) {
      return { publicSummary: null, enterpriseBreakdown: null };
    }

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
             (cardinality($2::text[]) > 0 AND upper(btrim(plot_code)) = ANY($2::text[]))
             OR (cardinality($3::bigint[]) > 0 AND household_id = ANY($3::bigint[]))
           )
         ORDER BY plot_code ASC`,
        [yr, cleanPlots, cleanHhIds],
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

    const annotatedPlots = qRes.rows.map((r) => {
      const pKey = r.plot_code.trim().toUpperCase();
      const hid = Number(r.household_id);
      const hhShare = (usedByHhFallback.get(hid) ?? 0) / Math.max(1, plotCountPerHh.get(hid) ?? 1);
      const usedKg = Number(((usedByPlot.get(pKey) ?? 0) + hhShare).toFixed(1));
      const maxQuotaKg = Number(r.max_quota_kg || 0);
      const remainingKg = Number(Math.max(0, maxQuotaKg - usedKg).toFixed(1));
      const utilizationPct = maxQuotaKg > 0 ? Number(((usedKg / maxQuotaKg) * 100).toFixed(1)) : 0;
      return {
        householdId: hid,
        item: {
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
        },
      };
    });

    const plotsBreakdown = annotatedPlots.map((entry) => entry.item);

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

    const scopedPlotsBreakdown = params.allowedPlotFilter
      ? annotatedPlots
        .filter((entry) =>
          params.allowedPlotFilter!({ householdId: entry.householdId, plotCode: entry.item.plotCode }),
        )
        .map((entry) => entry.item)
      : plotsBreakdown;

    let enterpriseBreakdown: typeof publicSummary & {
      thisLotWeightKg: number;
      usedBeforeThisLotKg: number;
      plots: typeof plotsBreakdown;
    };

    if (params.allowedPlotFilter) {
      const entZoneMaxQuotaKg = Number(
        scopedPlotsBreakdown.reduce((sum, p) => sum + p.maxQuotaKg, 0).toFixed(1),
      );
      const entTotalAreaHa = Number(scopedPlotsBreakdown.reduce((sum, p) => sum + p.areaHa, 0).toFixed(2));
      const entTotalTreeCount = scopedPlotsBreakdown.reduce((sum, p) => sum + p.treeCount, 0);
      const entThisLotWeightKg = Number(
        (params.scopedThisLotWeightKg ?? params.thisLotWeightKg ?? 0).toFixed(1),
      );
      const entSumUsedKg = Number(
        scopedPlotsBreakdown.reduce((sum, p) => sum + p.usedKg, 0).toFixed(1),
      );
      const entCumulativeUsedKg = Number(Math.max(entSumUsedKg, entThisLotWeightKg).toFixed(1));
      const entUsedBeforeThisLotKg = Number(Math.max(0, entCumulativeUsedKg - entThisLotWeightKg).toFixed(1));
      const entRemainingQuotaKg = Number(Math.max(0, entZoneMaxQuotaKg - entCumulativeUsedKg).toFixed(1));
      const entUtilizationPct =
        entZoneMaxQuotaKg > 0 ? Number(((entCumulativeUsedKg / entZoneMaxQuotaKg) * 100).toFixed(1)) : 0;
      enterpriseBreakdown = {
        seasonYear: params.seasonYear,
        pucCode: params.pucCode,
        assessedPlotCount: scopedPlotsBreakdown.length,
        totalAreaHa: entTotalAreaHa,
        totalTreeCount: entTotalTreeCount,
        zoneMaxQuotaKg: entZoneMaxQuotaKg,
        cumulativeUsedKg: entCumulativeUsedKg,
        remainingQuotaKg: entRemainingQuotaKg,
        utilizationPct: entUtilizationPct,
        withinQuota: entZoneMaxQuotaKg <= 0 ? true : entCumulativeUsedKg <= entZoneMaxQuotaKg,
        assessedBy,
        assessedOn,
        thisLotWeightKg: entThisLotWeightKg,
        usedBeforeThisLotKg: entUsedBeforeThisLotKg,
        plots: scopedPlotsBreakdown,
      };
    } else {
      enterpriseBreakdown = {
        ...publicSummary,
        thisLotWeightKg,
        usedBeforeThisLotKg,
        plots: plotsBreakdown,
      };
    }

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
    const loadConfig = async () => {
      let cfg = {
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
          cfg = {
            programTitle: c.programTitle || cfg.programTitle,
            directiveNo: c.directiveNo || cfg.directiveNo,
            communeAuthority: c.communeAuthority || cfg.communeAuthority,
            provincialAuthority: c.provincialAuthority || cfg.provincialAuthority,
            officialPortalUrl: c.officialPortalUrl || cfg.officialPortalUrl,
            officialDomain: c.officialDomain || cfg.officialDomain,
            inspectionUnit: c.inspectionUnit || cfg.inspectionUnit,
          };
        }
      }
      return cfg;
    };

    const config = this.db.cache
      ? await this.db.cache.getOrLoad("trace:endorsement-config", 60_000, ["trace"], loadConfig)
      : await loadConfig();

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
   * Tổng hợp lịch sử đóng góp sản lượng của thửa vườn hoặc nông hộ trong các lô hàng đã ghi nhận trên địa bàn xã.
   * Khi đối tác doanh nghiệp xem hồ sơ nông hộ/thửa vườn, ẩn tên cơ sở thu mua khác để bảo mật thương mại nhưng giữ nguyên số liệu sản lượng xã.
   */
  private async queryCommuneLotContributions(params: {
    householdId: number | null;
    plotCode?: string | null;
    viewerUser?: AuthUser;
    canSeePlotCodes: boolean;
  }): Promise<CommuneLotContributionsSummary> {
    const currentYear = new Date().getFullYear();
    const cleanPlot = params.plotCode ? params.plotCode.trim() : null;
    if (!params.householdId && !cleanPlot) {
      return {
        scopeLabel: cleanPlot ? "plot" : "household",
        totalLots: 0,
        totalContributedKg: 0,
        currentSeasonYear: currentYear,
        currentSeasonKg: 0,
        lots: [],
      };
    }

    const res = await this.db.query<{
      lot_id: number;
      lot_code: string;
      qr_token: string | null;
      enterprise_id: number | null;
      harvested_on: unknown;
      packed_on: unknown;
      exported_on: unknown;
      plot_code: string | null;
      contributed_kg: number;
      lot_weight_tons: number;
      lot_contrib_total_kg: number;
      packhouse_name: string | null;
      market: string | null;
      status: string | null;
    }>(
      cleanPlot
        ? `SELECT hl.id AS lot_id,
                  hl.code AS lot_code,
                  hl.qr_token,
                  hl.enterprise_id,
                  hl.harvested_on,
                  hl.packed_on,
                  hl.exported_on,
                  NULLIF(btrim(hc.plot_code), '') AS plot_code,
                  hc.weight_kg::float8 AS contributed_kg,
                  COALESCE(hl.weight_tons, 0)::float8 AS lot_weight_tons,
                  (SELECT COALESCE(SUM(hc2.weight_kg), 0)::float8 FROM harvest_contributions hc2 WHERE hc2.lot_id = hl.id) AS lot_contrib_total_kg,
                  COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                  hl.market,
                  hl.status
           FROM harvest_contributions hc
           JOIN harvest_lots hl ON hl.id = hc.lot_id
           LEFT JOIN enterprises e ON e.id = hl.enterprise_id
           WHERE hl.status <> 'revoked'
             AND (
               upper(btrim(COALESCE(hc.plot_code, ''))) = upper(btrim($2))
               OR ($1::bigint IS NOT NULL AND hc.household_id = $1 AND COALESCE(btrim(hc.plot_code), '') = '')
             )
           ORDER BY hl.harvested_on DESC NULLS LAST, hl.id DESC
           LIMIT 50`
        : `SELECT hl.id AS lot_id,
                  hl.code AS lot_code,
                  hl.qr_token,
                  hl.enterprise_id,
                  hl.harvested_on,
                  hl.packed_on,
                  hl.exported_on,
                  NULLIF(btrim(hc.plot_code), '') AS plot_code,
                  hc.weight_kg::float8 AS contributed_kg,
                  COALESCE(hl.weight_tons, 0)::float8 AS lot_weight_tons,
                  (SELECT COALESCE(SUM(hc2.weight_kg), 0)::float8 FROM harvest_contributions hc2 WHERE hc2.lot_id = hl.id) AS lot_contrib_total_kg,
                  COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                  hl.market,
                  hl.status
           FROM harvest_contributions hc
           JOIN harvest_lots hl ON hl.id = hc.lot_id
           LEFT JOIN enterprises e ON e.id = hl.enterprise_id
           WHERE hl.status <> 'revoked'
             AND hc.household_id = $1
           ORDER BY hl.harvested_on DESC NULLS LAST, hl.id DESC
           LIMIT 50`,
      cleanPlot ? [params.householdId, cleanPlot] : [params.householdId],
    );

    const distinctLotIds = new Set<number>();
    let totalContributedKg = 0;
    let currentSeasonKg = 0;
    const viewerEntId =
      params.viewerUser?.role === "enterprise" && params.viewerUser.enterpriseId
        ? Number(params.viewerUser.enterpriseId)
        : null;

    const lots: CommuneLotContributionItem[] = res.rows.map((r) => {
      distinctLotIds.add(Number(r.lot_id));
      const contributedKg = Number(Number(r.contributed_kg || 0).toFixed(1));
      totalContributedKg += contributedKg;
      const harvestedOn = toIsoDateOnly(r.harvested_on);
      if (harvestedOn && Number(harvestedOn.slice(0, 4)) === currentYear) {
        currentSeasonKg += contributedKg;
      }
      const denomKg =
        Number(r.lot_contrib_total_kg || 0) > 0
          ? Number(r.lot_contrib_total_kg)
          : Number(r.lot_weight_tons || 0) * 1000;
      const sharePct =
        denomKg > 0 ? Number(Math.min(100, (contributedKg / denomKg) * 100).toFixed(1)) : 100;
      const isOtherEnterprise =
        viewerEntId !== null && r.enterprise_id !== null && Number(r.enterprise_id) !== viewerEntId;
      const packhouseName = isOtherEnterprise
        ? "Cơ sở đóng gói liên kết trên địa bàn"
        : String(r.packhouse_name || DEFAULT_PACKHOUSE_NAME);

      return {
        lotCode: r.lot_code,
        qrToken: r.qr_token ? String(r.qr_token) : null,
        harvestedOn,
        packedOn: toIsoDateOnly(r.packed_on),
        exportedOn: toIsoDateOnly(r.exported_on),
        plotCode: params.canSeePlotCodes ? (r.plot_code ?? cleanPlot) : null,
        contributedKg,
        lotWeightTons:
          Number(r.lot_weight_tons || 0) > 0
            ? Number(r.lot_weight_tons)
            : Number((denomKg / 1000).toFixed(3)),
        sharePct,
        packhouseName,
        market: String(r.market || "Xuất khẩu chính ngạch"),
        status: String(r.status || "exported"),
      };
    });

    let householdTotalLots: number | undefined;
    let householdTotalContributedKg: number | undefined;
    if (cleanPlot && params.householdId) {
      const hhTotalRes = await this.db.query<{ total_lots: number; total_kg: number }>(
        `SELECT COUNT(DISTINCT hl.id)::int AS total_lots,
                COALESCE(SUM(hc.weight_kg), 0)::float8 AS total_kg
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         WHERE hl.status <> 'revoked'
           AND hc.household_id = $1`,
        [params.householdId],
      );
      if (hhTotalRes.rows[0]) {
        householdTotalLots = Number(hhTotalRes.rows[0].total_lots || 0);
        householdTotalContributedKg = Number(Number(hhTotalRes.rows[0].total_kg || 0).toFixed(1));
      }
    }

    return {
      scopeLabel: cleanPlot ? "plot" : "household",
      totalLots: distinctLotIds.size,
      totalContributedKg: Number(totalContributedKg.toFixed(1)),
      currentSeasonYear: currentYear,
      currentSeasonKg: Number(currentSeasonKg.toFixed(1)),
      ...(householdTotalLots !== undefined ? { householdTotalLots } : {}),
      ...(householdTotalContributedKg !== undefined ? { householdTotalContributedKg } : {}),
      lots,
    };
  }

  /**
   * Nhật ký canh tác và hình ảnh minh chứng hiện trường dành cho Cấp 2 (Doanh nghiệp thu mua, Cán bộ HTX,
   * Đoàn thẩm định thực địa, Yêu cầu cấp quyền Cấp 2) và chính chủ hộ:
   * - Hiển thị đầy đủ hoạt động chăm sóc, thuốc BVTV, thời gian cách ly PHI, đối chứng GPS và đa ảnh/video hiện trường (`photoUrls`).
   * - Che tuyệt đối SĐT, CCCD, số tờ/thửa sổ đỏ, họ tên hộ chưa đồng ý công khai và ảnh hóa đơn mua vật tư nội bộ.
   */
  private async queryTier2CultivationEvidence(params: {
    householdIds: number[];
    plotCodes?: string[];
    restrictToPlotCodes?: boolean;
    canShowAllNames?: boolean;
    limit?: number;
  }) {
    const cleanHhIds = [...new Set(params.householdIds.filter((id) => Number.isFinite(id) && id > 0))];
    const cleanPlots = [
      ...new Set((params.plotCodes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean)),
    ];
    if (cleanHhIds.length === 0 && cleanPlots.length === 0) {
      return [];
    }
    const hasMilestoneTable = await this.hasTable("care_milestone_declarations");
    const restrictPlots = Boolean(params.restrictToPlotCodes && cleanPlots.length > 0);
    const limit = params.limit ?? 20;

    const res = await this.db.query(
      `SELECT entry_on,
              plot_code,
              household_code,
              household_name,
              recorder,
              kind,
              activity,
              detail,
              mrl_status,
              isolation_days,
              server_recorded_at,
              is_late_entry,
              record_hash,
              gps_verified,
              gps_distance_m::float8 AS gps_distance_m,
              photo_urls
       FROM (
         SELECT to_char(sr.sprayed_on, 'YYYY-MM-DD') AS entry_on,
                COALESCE(sr.plot_code, '') AS plot_code,
                h.code AS household_code,
                CASE
                  WHEN $3::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                    THEN h.name
                  ELSE ('Hộ thành viên ' || h.code)
                END AS household_name,
                CASE
                  WHEN $3::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                    THEN h.name
                  ELSE ('Hộ thành viên ' || h.code)
                END AS recorder,
                'spray'::text AS kind,
                ('Phun thuốc BVTV: ' || p.name) AS activity,
                ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                sr.mrl_status,
                sr.isolation_days,
                sr.server_recorded_at,
                sr.is_late_entry,
                sr.record_hash,
                false AS gps_verified,
                NULL::numeric AS gps_distance_m,
                ${safeFieldPhotoUrlsSql("sr.photo_ids", "sr.photo_id", hasMilestoneTable)} AS photo_urls,
                sr.sprayed_on AS sort_date,
                sr.id AS sort_id
         FROM spray_records sr
         JOIN pesticides p ON p.id = sr.pesticide_id
         JOIN households h ON h.id = sr.household_id
         WHERE (
           (cardinality($1::bigint[]) > 0 AND sr.household_id = ANY($1::bigint[]))
           OR (cardinality($2::text[]) > 0 AND upper(btrim(COALESCE(sr.plot_code, ''))) = ANY($2::text[]))
         )
         AND (
           NOT $4::boolean
           OR COALESCE(btrim(sr.plot_code), '') = ''
           OR upper(btrim(sr.plot_code)) = ANY($2::text[])
         )
         UNION ALL
         SELECT to_char(je.entry_on, 'YYYY-MM-DD') AS entry_on,
                COALESCE(je.plot_code, '') AS plot_code,
                h.code AS household_code,
                CASE
                  WHEN $3::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                    THEN h.name
                  ELSE ('Hộ thành viên ' || h.code)
                END AS household_name,
                CASE
                  WHEN $3::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                    THEN je.recorder
                  ELSE 'Chủ hộ thành viên HTX'
                END AS recorder,
                'journal'::text AS kind,
                je.activity,
                je.detail,
                NULL::text AS mrl_status,
                NULL::int AS isolation_days,
                je.server_recorded_at,
                je.is_late_entry,
                je.record_hash,
                je.gps_verified,
                je.gps_distance_m,
                ${safeFieldPhotoUrlsSql("je.photo_ids", "je.photo_id", hasMilestoneTable)} AS photo_urls,
                je.entry_on AS sort_date,
                je.id AS sort_id
         FROM journal_entries je
         JOIN households h ON h.id = je.household_id
         WHERE (
           (cardinality($1::bigint[]) > 0 AND je.household_id = ANY($1::bigint[]))
           OR (cardinality($2::text[]) > 0 AND upper(btrim(COALESCE(je.plot_code, ''))) = ANY($2::text[]))
         )
         AND (
           NOT $4::boolean
           OR COALESCE(btrim(je.plot_code), '') = ''
           OR upper(btrim(je.plot_code)) = ANY($2::text[])
         )
       ) combined
       ORDER BY sort_date DESC, sort_id DESC
       LIMIT $5`,
      [cleanHhIds, cleanPlots, Boolean(params.canShowAllNames), restrictPlots, limit],
    );

    return normalizeEvidenceMediaRows(res.rows);
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
    precomputedMassBalance?: {
      publicSummary: {
        seasonYear: number;
        assessedBy: string;
      } | null;
      enterpriseBreakdown: {
        plots: Array<{
          plotCode: string;
          maxQuotaKg: number;
          usedKg: number;
          remainingKg: number;
          utilizationPct: number;
          withinQuota: boolean;
          assessedOn: string | null;
        }>;
      } | null;
    };
  }) {
    const currentYear = new Date().getFullYear();
    const hasMilestoneTable = await this.hasTable("care_milestone_declarations");
    const [{ publicSummary: plotQuotaSummary, enterpriseBreakdown: plotQuotaDetail }, sprayPhiRes, ledgerRes, minutesRes, lotsRes, checkinsRes] =
      await Promise.all([
        params.precomputedMassBalance
          ? Promise.resolve(params.precomputedMassBalance)
          : this.computeMassBalanceSummary({
              seasonYear: currentYear,
              pucCode: params.zoneCode,
              plotCodes: [params.plotCode],
              householdIds: [],
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
           WHERE upper(btrim(COALESCE(sr.plot_code, ''))) = upper(btrim($1))
              OR ($2::bigint IS NOT NULL AND sr.household_id = $2 AND (sr.plot_code IS NULL OR btrim(sr.plot_code) = ''))
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
                  photo_urls
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
                    ${safeFieldPhotoUrlsSql("sr.photo_ids", "sr.photo_id", hasMilestoneTable)} AS photo_urls,
                    sr.sprayed_on AS sort_date,
                    sr.id AS sort_id
             FROM spray_records sr
             JOIN pesticides p ON p.id = sr.pesticide_id
             WHERE upper(btrim(COALESCE(sr.plot_code, ''))) = upper(btrim($1))
                OR ($2::bigint IS NOT NULL AND sr.household_id = $2 AND (sr.plot_code IS NULL OR btrim(sr.plot_code) = ''))
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
                    ${safeFieldPhotoUrlsSql("je.photo_ids", "je.photo_id", hasMilestoneTable)} AS photo_urls,
                    je.entry_on AS sort_date,
                    je.id AS sort_id
             FROM journal_entries je
             WHERE upper(btrim(COALESCE(je.plot_code, ''))) = upper(btrim($1))
                OR ($2::bigint IS NOT NULL AND je.household_id = $2 AND (je.plot_code IS NULL OR btrim(je.plot_code) = ''))
           ) combined
           ORDER BY sort_date DESC, sort_id DESC
           LIMIT 15`,
          [params.plotCode, params.householdId],
        ),
        this.queryScopedInspectionMinutes(
          `im.code,
           to_char(im.held_on, 'YYYY-MM-DD') AS held_on,
           im.location,
           im.officer,
           im.result,
           im.gps_verified,
           im.gps_distance_m::float8 AS gps_distance_m,
           im.record_hash,
           ${safeFieldPhotoUrlsSql("im.photo_ids", "im.photo_id", false)} AS photo_urls`,
          params.householdId ? [params.householdId] : [],
          [params.plotCode],
          6,
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
            // Bản ghi cũ có thể đã lưu họ tên chủ hộ: luôn hiển thị nhãn trung tính khi hộ chưa đồng ý công khai.
            `SELECT fc.checked_at,
                      CASE
                        WHEN u.role = 'farmer'
                             AND fc.audit_pass_id IS NULL
                             AND NOT (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                          THEN $2::text
                        ELSE fc.actor_label
                      END AS actor_label,
                      fc.inside_polygon,
                      fc.distance_m::float8 AS distance_meters,
                      fc.verified
               FROM field_gps_checkins fc
               LEFT JOIN users u ON u.id = fc.user_id
               LEFT JOIN households h ON h.id = u.household_id
               WHERE upper(fc.plot_code) = upper($1)
               ORDER BY fc.checked_at DESC
               LIMIT 6`,
            [params.plotCode, NEUTRAL_FARMER_ACTOR_LABEL],
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
      sealedLedger: normalizeEvidenceMediaRows(ledgerRes.rows),
      inspectionHistory: normalizeEvidenceMediaRows(minutesRes),
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
    const cleanCode = normalizeTraceLookupCode(rawCode);
    if (!cleanCode || cleanCode.length > 128 || !/^[A-Za-z0-9._/-]+$/.test(cleanCode)) {
      throw notFound("Không tìm thấy thửa đất cần đối chứng GPS.");
    }

    const [hasPlots, hasSignboards] = await Promise.all([
      this.hasTable("plots"),
      this.hasTable("plot_signboard_tokens"),
    ]);

    let resolvedPlot: {
      plotCode: string;
      plotQrToken: string | null;
      zoneCode: string;
      householdId: number | null;
      villageId: number | null;
      villageName: string | null;
    } | null = null;

    if (hasPlots) {
      const pRes = await this.db.query<{
        code: string;
        qr_token: string | null;
        zone_code: string | null;
        household_id: number | null;
        village_id: number | null;
        village: string | null;
      }>(
        `SELECT p.code, COALESCE(p.qr_token, pst.qr_token) AS qr_token, p.zone_code, p.household_id, h.village_id, COALESCE(p.village, v.name) AS village
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
          plotQrToken: pRes.rows[0].qr_token,
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
        qr_token: string | null;
        zone_code: string | null;
        household_id: number | null;
        village_id: number | null;
        village_name: string | null;
      }>(
        `SELECT pst.plot_code, pst.qr_token, pst.zone_code, pst.household_id, h.village_id, COALESCE(pst.village_name, v.name) AS village_name
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
          plotQrToken: sbRes.rows[0].qr_token,
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
    const effectivePassCtx = { ...ctx, auditPass: dto.auditPass || ctx.auditPass };
    const tempGrant = await this.resolveApprovedAccessGrant(
      effectivePassCtx,
      {
        scannedCode: cleanCode,
        targetKind: "plot",
        canonicalCodes: [resolvedPlot.plotCode, resolvedPlot.plotQrToken],
        resolvedLotCode: null,
        pucCode: resolvedPlot.zoneCode,
      },
      true,
    );
    const passCheck = tempGrant?.matchedViaToken
      ? null
      : await this.resolveFieldAuditPass(
        effectivePassCtx,
        resolvedPlot.zoneCode,
        cleanCode,
        null,
        true,
      );

    let linkedEnterpriseId: number | null = null;
    let linkedCoopCode = "HTX-CUNE";
    const lotScopeRes = await this.db.query<{ enterprise_id: number | null; coop_code: string | null }>(
      `SELECT hl.enterprise_id, hl.coop_code
       FROM harvest_contributions hc
       JOIN harvest_lots hl ON hl.id = hc.lot_id
       WHERE hl.status <> 'revoked'
         AND (
           upper(btrim(COALESCE(hc.plot_code, ''))) = upper(btrim($1))
           OR ($2::bigint IS NOT NULL AND hc.household_id = $2 AND COALESCE(btrim(hc.plot_code), '') = '')
         )
       ORDER BY (CASE WHEN upper(btrim(COALESCE(hc.plot_code, ''))) = upper(btrim($1)) THEN 0 ELSE 1 END),
                hl.harvested_on DESC, hc.id DESC
       LIMIT 1`,
      [
        resolvedPlot.plotCode,
        resolvedPlot.householdId,
      ],
    );
    if (lotScopeRes.rows[0]) {
      linkedEnterpriseId =
        lotScopeRes.rows[0].enterprise_id !== null ? Number(lotScopeRes.rows[0].enterprise_id) : null;
      if (lotScopeRes.rows[0].coop_code) {
        linkedCoopCode = lotScopeRes.rows[0].coop_code;
      }
    }
    const effectiveEnterpriseId = await this.resolveEnterprisePlotOrStampScope({
      user: ctx.user,
      householdId: resolvedPlot.householdId,
      plotCode: resolvedPlot.plotCode,
      linkedLotEnterpriseId: linkedEnterpriseId,
      pucCode: resolvedPlot.zoneCode,
    });

    const roleAccess = this.evaluateAccessAndScope(ctx, {
      targetKind: "plot",
      enterpriseId: effectiveEnterpriseId,
      coopCode: linkedCoopCode,
      villageIds: resolvedPlot.villageId ? [resolvedPlot.villageId] : [],
      adminLocations: [adminLocation],
    });
    const isOwnerFarmer =
      ctx.user?.role === "farmer" &&
      resolvedPlot.householdId !== null &&
      Number(ctx.user.householdId) === Number(resolvedPlot.householdId);
    const canSeeExactPlotGis =
      Boolean(passCheck?.active) ||
      Boolean(tempGrant?.active) ||
      (roleAccess.viewerTier === "authority" && !roleAccess.scopeDenied) ||
      isOwnerFarmer;
    const authorized =
      canSeeExactPlotGis ||
      (roleAccess.viewerTier !== "public" && !roleAccess.scopeDenied);

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

    let farmerConsented = false;
    if (!passCheck?.active && ctx.user?.role === "farmer" && ctx.user.householdId) {
      const consentRes = await this.db.query<{ public_trace_consent: boolean | null; status: string | null }>(
        "SELECT public_trace_consent, status FROM households WHERE id = $1",
        [Number(ctx.user.householdId)],
      );
      const hh = consentRes.rows[0];
      farmerConsented = Boolean(hh?.public_trace_consent) && hh?.status === "qualified";
    }

    // Chủ hộ chưa đồng ý công khai: lưu nhãn trung tính, không ghi họ tên vào nhật ký đối chứng GPS.
    const actorLabel = passCheck?.active
      ? `${passCheck.delegationName} (${passCheck.code})`
      : ctx.user
        ? ctx.user.role === "farmer" && !farmerConsented
          ? NEUTRAL_FARMER_ACTOR_LABEL
          : `${ctx.user.fullName} (${ctx.user.role})`
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
      centerLat: canSeeExactPlotGis ? gps.centerLat : null,
      centerLng: canSeeExactPlotGis ? gps.centerLng : null,
      actorLabel,
      checkedAt,
    };
  }

  private buildFiveStepTimeline(params: {
    pucCode: string;
    pucStatus: ZoneLiveStatus;
    packhouseStatus: PackhouseLiveStatus;
    lastFarmCheckOn: string | null;
    latestMinuteCode?: string | null;
    participatingHouseholdCount?: number;
    harvestedOn: string | null;
    weightTons?: number | null;
    avgBrix?: number | null;
    packedOn: string | null;
    packhouseName: string;
    packhouseCode: string;
    gradeAPct?: number | null;
    treatmentMethod?: string | null;
    latestLabOn: string | null;
    latestLabName: string | null;
    latestLabResult: string | null;
    latestLabCode?: string | null;
    latestLabCdMgKg?: number | null;
    latestLabResidueMgKg?: number | null;
    latestLabYellowO?: boolean | null;
    exportedOn: string | null;
    lotStatus: string;
    market: string;
    revokedReason?: string | null;
    phytoCertNo?: string | null;
    transporter?: string | null;
    vehiclePlate?: string | null;
    temperatureC?: number | null;
  }) {
    const isRevoked = params.lotStatus === "revoked";
    const isExported = params.lotStatus === "exported";
    const isDelivered = params.lotStatus === "delivered";
    const isInTransit = params.lotStatus === "in_transit";
    const pucWarn = params.pucStatus === "suspended" || params.pucStatus === "revoked";
    const phcWarn = params.packhouseStatus !== "active";

    const hhNote =
      params.participatingHouseholdCount && params.participatingHouseholdCount > 0
        ? `, liên kết ${params.participatingHouseholdCount} hộ thành viên`
        : "";
    const minuteNote = params.latestMinuteCode ? ` (Biên bản gần nhất: ${params.latestMinuteCode})` : "";

    const harvestParts: string[] = [];
    if (params.weightTons && params.weightTons > 0) {
      harvestParts.push(`sản lượng ${Number(params.weightTons.toFixed(3))} tấn`);
    }
    if (params.avgBrix !== null && params.avgBrix !== undefined && Number(params.avgBrix) > 0) {
      harvestParts.push(`độ ngọt bình quân ${params.avgBrix}° Brix`);
    }
    const harvestMetricsSuffix = harvestParts.length > 0 ? ` (${harvestParts.join(", ")})` : "";

    const packingParts: string[] = [];
    if (params.treatmentMethod && params.treatmentMethod.trim()) {
      packingParts.push(params.treatmentMethod.trim());
    } else {
      packingParts.push("Làm sạch, phân hạng trái thương phẩm, đóng thùng định danh lô");
    }
    if (params.gradeAPct !== null && params.gradeAPct !== undefined && Number(params.gradeAPct) > 0) {
      packingParts.push(`tỷ lệ Hạng A đạt ${params.gradeAPct}%`);
    }

    const labMetricsParts: string[] = [];
    if (params.latestLabCdMgKg !== null && params.latestLabCdMgKg !== undefined) {
      labMetricsParts.push(`Cd ${params.latestLabCdMgKg} mg/kg`);
    }
    if (params.latestLabYellowO !== null && params.latestLabYellowO !== undefined) {
      labMetricsParts.push(params.latestLabYellowO ? "Phát hiện Vàng O" : "Không Vàng O");
    }
    if (params.latestLabResidueMgKg !== null && params.latestLabResidueMgKg !== undefined) {
      labMetricsParts.push(`dư lượng BVTV ${params.latestLabResidueMgKg} mg/kg`);
    }
    const labMetricsText = labMetricsParts.length > 0 ? ` (${labMetricsParts.join(", ")})` : "";

    const coldChainParts: string[] = [];
    if (params.transporter) {
      coldChainParts.push(
        params.vehiclePlate ? `${params.transporter} (${params.vehiclePlate})` : params.transporter,
      );
    } else if (params.vehiclePlate) {
      coldChainParts.push(`Xe ${params.vehiclePlate}`);
    }
    if (params.temperatureC !== null && params.temperatureC !== undefined) {
      coldChainParts.push(`bảo quản ${params.temperatureC}°C`);
    }
    const coldChainSuffix = coldChainParts.length > 0 ? ` - Vận chuyển: ${coldChainParts.join(", ")}` : "";

    return [
      {
        step: 1,
        key: "orchard",
        title: "Vườn trồng",
        date: params.lastFarmCheckOn || addDaysIso(params.harvestedOn, -15),
        responsibleUnit: DEFAULT_COOP_NAME,
        detail: pucWarn
          ? `Cảnh báo: Mã vùng trồng ${params.pucCode} hiện đang ở trạng thái tạm dừng hoặc thu hồi hiệu lực`
          : `Mã vùng trồng ${params.pucCode}${hhNote}, theo dõi nhật ký VietGAP và thời gian cách ly an toàn${minuteNote}`,
        status: pucWarn ? "warning" : "completed",
      },
      {
        step: 2,
        key: "harvest",
        title: "Thu hoạch",
        date: params.harvestedOn,
        responsibleUnit: "Tổ thu hoạch và Kỹ thuật HTX Cư Né",
        detail: params.harvestedOn
          ? `Thu hái đúng độ chín tự nhiên, phân loại sơ bộ và gom lô nguyên liệu tại vườn${harvestMetricsSuffix}`
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
          ? `Cảnh báo: Cơ sở đóng gói ${params.packhouseCode} hiện đang tạm dừng hoặc ngừng hoạt động`
          : params.packedOn
            ? `${packingParts.join(", ")} và dán tem mã QR truy xuất`
            : "Đang chờ tiếp nhận sơ chế và đóng thùng tại cơ sở đóng gói",
        status: phcWarn ? "warning" : params.packedOn ? "completed" : params.harvestedOn ? "current" : "upcoming",
      },
      {
        step: 4,
        key: "testing",
        title: "Kiểm nghiệm",
        date: params.latestLabOn,
        responsibleUnit: params.latestLabName || "Phòng kiểm nghiệm độc lập chỉ định",
        detail: params.latestLabResult
          ? params.latestLabResult === "pass"
            ? `Đạt chuẩn an toàn thực phẩm${labMetricsText}`
            : `Mẫu kiểm nghiệm phát hiện chỉ tiêu không đạt${labMetricsText} - Tạm dừng xuất xưởng`
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
        title: "Xuất xưởng / Lưu thông",
        date: params.exportedOn,
        responsibleUnit: `${params.packhouseName} và Cơ quan Kiểm dịch thực vật`,
        detail: isRevoked
          ? params.revokedReason
            ? `Lô hàng đã thu hồi: ${params.revokedReason}`
            : "Lô hàng đã thu hồi và ngừng lưu thông trên hệ thống"
          : isExported
            ? `Hoàn tất kiểm dịch và thông quan xuất khẩu phục vụ thị trường: ${params.market}${coldChainSuffix}`
            : isDelivered
              ? `Đã bàn giao lô hàng hợp lệ phục vụ thị trường: ${params.market}${coldChainSuffix}`
              : isInTransit
                ? `Đang vận chuyển lưu thông phục vụ thị trường: ${params.market}${coldChainSuffix}`
                : "Đang hoàn tất thủ tục kiểm định trước khi xuất xưởng",
        status: isRevoked
          ? "warning"
          : isExported || isDelivered
            ? "completed"
            : isInTransit
              ? "current"
              : "upcoming",
      },
    ];
  }

  /** Tra cứu hồ sơ truy xuất QR 3 cấp độ: Công khai (Mục 1), Doanh nghiệp (Cấp 2), Cơ quan quản lý (Cấp 3) theo đúng Vai trò + Phạm vi. */
  async trace(rawCode: string, ctx: TraceRequestContext) {
    const cleanCode = normalizeTraceLookupCode(rawCode);
    if (!cleanCode || cleanCode.length > 128 || !/^[A-Za-z0-9._/-]+$/.test(cleanCode)) {
      throw notFound(`Không tìm thấy hồ sơ truy xuất cho mã "${cleanCode.slice(0, 80)}". Vui lòng kiểm tra lại mã thửa, mã lô hoặc tem QR.`);
    }

    const [hasPlots, hasSignboards, hasGrowingZones] = await Promise.all([
      this.hasTable("plots"),
      this.hasTable("plot_signboard_tokens"),
      this.hasTable("growing_zones"),
    ]);

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
              e.name AS enterprise_name, e.address AS enterprise_address, e.packhouse_code AS enterprise_packhouse_code,
              l.packhouse_code, l.packhouse_name, l.packhouse_address,
              l.phytosanitary_cert_no, l.phytosanitary_issued_on,
              l.grade_a_pct::float8 AS grade_a_pct, l.grade_b_pct::float8 AS grade_b_pct,
              l.grade_c_pct::float8 AS grade_c_pct, l.avg_brix::float8 AS avg_brix, l.treatment_method,
              l.transporter, l.vehicle_plate, l.temperature_c::float8 AS temperature_c, l.departed_at, l.estimated_arrival
       FROM harvest_lots l
       LEFT JOIN enterprises e ON e.id = l.enterprise_id
       WHERE ${lotId ? "l.id = $1" : "l.qr_token = $1 OR upper(l.code) = upper($1) OR (l.qr_code IS NOT NULL AND btrim(l.qr_code) <> '' AND upper(btrim(l.qr_code)) = upper(btrim($1)))"}
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
                ${CCCD_MASKED_SQL} AS cccd_masked,
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
                  ${CCCD_MASKED_SQL} AS cccd_masked,
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
                  ${CCCD_MASKED_SQL} AS cccd_masked,
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
                ${CCCD_MASKED_SQL} AS cccd_masked,
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
                ${CCCD_MASKED_SQL} AS cccd_masked,
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

    // ─── NHÁNH D: TRA CỨU TRỰC TIẾP THEO MÃ ĐỊNH DANH NÔNG HỘ (households.code) ───
    const hhLookupRes = await this.db.query(
      `SELECT h.id,
              h.code,
              h.name,
              h.phone,
              ${CCCD_MASKED_SQL} AS cccd_masked,
              h.status,
              COALESCE(h.public_trace_consent, false) AS public_trace_consent,
              h.village_id,
              v.name AS village_name,
              h.plot_count,
              COALESCE(h.area_ha, 0)::float8 AS area_ha,
              ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
              h.created_at
       FROM households h
       LEFT JOIN villages v ON v.id = h.village_id
       WHERE upper(btrim(h.code)) = upper(btrim($1))
       LIMIT 1`,
      [cleanCode],
    );
    if (hhLookupRes.rowCount && hhLookupRes.rows[0]) {
      return this.buildHouseholdTraceResponse({
        cleanCode,
        rawHouseholdRow: hhLookupRes.rows[0],
        hasPlots,
        hasSignboards,
        ctx,
      });
    }

    // ─── NHÁNH E: TRA CỨU TRỰC TIẾP THEO MÃ SỐ VÙNG TRỒNG PUC (growing_zones / zone_code) ───
    let matchedZoneCode: string | null = null;
    if (hasGrowingZones) {
      const gzRes = await this.db.query<{ code: string }>(
        `SELECT code FROM growing_zones WHERE upper(code) = upper($1) LIMIT 1`,
        [cleanCode],
      );
      if (gzRes.rows[0]?.code) {
        matchedZoneCode = gzRes.rows[0].code.trim();
      }
    }
    if (!matchedZoneCode && hasPlots) {
      const pzRes = await this.db.query<{ zone_code: string }>(
        `SELECT zone_code FROM plots WHERE zone_code IS NOT NULL AND upper(btrim(zone_code)) = upper($1) LIMIT 1`,
        [cleanCode],
      );
      if (pzRes.rows[0]?.zone_code) {
        matchedZoneCode = pzRes.rows[0].zone_code.trim();
      }
    }
    if (!matchedZoneCode && hasSignboards) {
      const szRes = await this.db.query<{ zone_code: string }>(
        `SELECT zone_code FROM plot_signboard_tokens WHERE zone_code IS NOT NULL AND upper(btrim(zone_code)) = upper($1) LIMIT 1`,
        [cleanCode],
      );
      if (szRes.rows[0]?.zone_code) {
        matchedZoneCode = szRes.rows[0].zone_code.trim();
      }
    }

    if (matchedZoneCode) {
      if (hasPlots) {
        const zonePlotRes = await this.db.query(
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
                  ${CCCD_MASKED_SQL} AS cccd_masked,
                  ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                  COALESCE(ST_AsGeoJSON(p.geom), pst.geometry_json) AS geometry_json,
                  COALESCE(ST_Y(ST_Centroid(p.geom))::float8, pst.center_lat::float8) AS lat,
                  COALESCE(ST_X(ST_Centroid(p.geom))::float8, pst.center_lng::float8) AS lng
           FROM plots p
           LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)
           LEFT JOIN households h ON h.id = COALESCE(p.household_id, pst.household_id)
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE upper(btrim(COALESCE(p.zone_code, pst.zone_code, ''))) = upper($1)
           ORDER BY (p.status = 'approved') DESC, p.id ASC
           LIMIT 1`,
          [matchedZoneCode],
        );
        if (zonePlotRes.rowCount && zonePlotRes.rows[0]) {
          return this.buildPlotTraceResponse({
            cleanCode: matchedZoneCode,
            rawPlotRow: zonePlotRes.rows[0],
            hasPlots,
            ctx,
          });
        }
      }

      if (hasSignboards) {
        const zoneSbRes = await this.db.query(
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
                  ${CCCD_MASKED_SQL} AS cccd_masked,
                  ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                  pst.geometry_json,
                  pst.center_lat::float8 AS lat,
                  pst.center_lng::float8 AS lng
           FROM plot_signboard_tokens pst
           LEFT JOIN households h ON h.id = pst.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE upper(btrim(COALESCE(pst.zone_code, ''))) = upper($1)
           ORDER BY pst.plot_code ASC
           LIMIT 1`,
          [matchedZoneCode],
        );
        if (zoneSbRes.rowCount && zoneSbRes.rows[0]) {
          return this.buildPlotTraceResponse({
            cleanCode: matchedZoneCode,
            rawPlotRow: zoneSbRes.rows[0],
            hasPlots,
            ctx,
          });
        }
      }
    }

    throw notFound(`Không tìm thấy hồ sơ truy xuất cho mã "${cleanCode}". Vui lòng kiểm tra lại mã lô, mã thùng, tem QR, mã thửa hoặc mã hộ.`);
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
      avatar_url: string | null;
      weight_kg: number;
      plot_code: string | null;
    }>(
      `SELECT h.id AS household_id, h.name AS household_name, h.code AS household_code,
              h.phone, ${CCCD_MASKED_SQL} AS cccd_masked,
              h.status AS household_status, h.public_trace_consent,
              h.village_id, v.name AS village_name, h.area_ha::float8 AS area_ha,
              ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
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

    const candidateZones = [
      ...new Set(
        effectivePlots
          .map((p) => (p.zone_code ? p.zone_code.trim() : ""))
          .filter(Boolean),
      ),
    ];
    const prelimPucCode = candidateZones[0] || "VN-DLOR-0086";

    const baseAccess = this.evaluateAccessAndScope(ctx, {
      targetKind: traceUnit,
      enterpriseId: lotRow.enterpriseId !== null && lotRow.enterpriseId !== undefined ? Number(lotRow.enterpriseId) : null,
      coopCode: String(lotRow.coopCode || "HTX-CUNE"),
      villageIds: contribVillageIds,
      adminLocations: [...allSourceAdminLocations],
    });
    const temporaryGrant = await this.resolveApprovedAccessGrant(
      ctx,
      {
        scannedCode: cleanCode,
        targetKind: traceUnit,
        canonicalCodes: [
          lotCode,
          lotRow.qrToken ? String(lotRow.qrToken) : null,
          scannedItem?.serialCode ? String(scannedItem.serialCode) : null,
          scannedItem?.qrToken ? String(scannedItem.qrToken) : null,
        ],
        resolvedLotCode: lotCode,
        pucCode: prelimPucCode,
        distinctZoneCodes: candidateZones,
      },
      true,
    );
    const access = this.elevateAccessWithGrant(baseAccess, ctx, temporaryGrant);
    const viewerTier = access.viewerTier;
    const isFullAuthorityStaff = this.isAuthenticatedAuthorityStaff(ctx.user);
    const { canReadDraftLabs, canReadViolations } = this.resolveSensitiveTracePermissions(
      viewerTier,
      ctx.user,
    );

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
    const fallbackAdminLocation = this.resolveAdminLocation(primaryVillage, primaryPucCode);

    const hasSuspendedPlot =
      effectivePlots.some((p) => p.status === "violation") ||
      contribHouseholds.some((h) => h.household_status === "violation");

    const initialPackhouseCode = String(
      lotRow.packhouseCode || lotRow.enterprisePackhouseCode || DEFAULT_PACKHOUSE_CODE,
    );

    const effectivePlotCodesForMinutes =
      contribPlotCodes.length > 0 ? contribPlotCodes : effectivePlots.map((p) => p.code);

    // (4f) Phiếu kiểm nghiệm nháp chỉ dành cho vai trò có quyền `testing:read`; còn lại chỉ lấy phiếu "đã kiểm chứng" (verified).
    // Lô chưa có hộ/thửa đóng góp: trả danh sách rỗng, không lấy bù phiếu của hộ không liên quan.
    const verifiedLabClause = canReadDraftLabs ? "" : "AND lt.record_status = 'verified'";
    const [labTestsRes, latestMinute, live] = await Promise.all([
      contribHouseholdIds.length > 0 || contribPlotCodes.length > 0
        ? this.db.query(
          `SELECT lt.household_id, lt.code, h.name AS household_name, h.code AS household_code, lt.plot_code, lt.sampled_on,
                    lt.cd_mg_kg::float8 AS cd_mg_kg, lt.yellow_o_positive,
                    lt.residue_mg_kg::float8 AS residue_mg_kg, lt.chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
                    lt.result, lt.lab, lt.record_status,
                    lt.lab_accreditation_code, lt.external_verify_code, lt.external_verify_url,
                    ${publicAttachmentUrlSql("lt.scan_attachment_id")} AS scan_url
             FROM lab_tests lt
             JOIN households h ON h.id = lt.household_id
             WHERE (
               lt.household_id = ANY($1::bigint[])
               OR (cardinality($2::text[]) > 0 AND upper(btrim(lt.plot_code)) = ANY($2::text[]))
             )
             ${verifiedLabClause}
             ORDER BY (CASE WHEN cardinality($2::text[]) > 0 AND upper(btrim(lt.plot_code)) = ANY($2::text[]) THEN 0 ELSE 1 END),
                      lt.sampled_on DESC, lt.id DESC
             LIMIT 8`,
          [contribHouseholdIds, contribPlotCodes],
        )
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      this.queryLatestScopedMinute(contribHouseholdIds, effectivePlotCodesForMinutes),
      this.resolveLiveZoneAndPackhouseStatus({
        pucCode: primaryPucCode,
        enterpriseId: lotRow.enterpriseId ? Number(lotRow.enterpriseId) : null,
        packhouseCode: initialPackhouseCode,
        hasPlotOrHouseholdViolation: hasSuspendedPlot,
        hasPendingSource: lotRow.status === "sampling",
      }),
    ]);

    const rawLabTests = camelRows<{
      householdId: number | null;
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

    const lastInspectionOn = toIsoDateOnly(latestMinute?.held_on);
    const latestMinuteCode = latestMinute?.code ?? null;
    const latestMinuteOfficer = latestMinute?.officer ?? null;
    const adminLocation = live.pucAdminLocation || fallbackAdminLocation;
    const packhouseName = String(
      lotRow.packhouseName || live.enterpriseName || lotRow.enterpriseName || DEFAULT_PACKHOUSE_NAME,
    );
    const packhouseCode = String(
      lotRow.packhouseCode || live.enterprisePackhouseCode || lotRow.enterprisePackhouseCode || DEFAULT_PACKHOUSE_CODE,
    );
    const packhouseAddress = String(
      lotRow.packhouseAddress || live.enterpriseAddress || lotRow.enterpriseAddress || DEFAULT_PACKHOUSE_ADDRESS,
    );
    const pucStatus = live.pucStatus;
    const hasRealtimeSuspension =
      live.pucStatus === "suspended" ||
      live.pucStatus === "revoked" ||
      live.packhouseStatus !== "active";

    const canonicalKey = String(scannedItem?.qrToken || lotRow.qrToken || lotCode);
    const [verification, fieldAuditPass, coarseMap] = await Promise.all([
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
      temporaryGrant?.matchedViaToken
        ? Promise.resolve(null)
        : this.resolveFieldAuditPass(ctx, primaryPucCode, cleanCode, lotCode, true, distinctZoneCodes),
      this.resolveCoarseZoneMap(hasPlots, primaryPucCode, adminLocation),
    ]);

    const rawLotStatus = String(lotRow.status || "sampling");
    const hasProgressedPastSampling =
      rawLotStatus === "in_transit" || rawLotStatus === "delivered" || rawLotStatus === "exported";
    const harvestedOn = toIsoDateOnly(lotRow.harvestedOn);
    const packedOn =
      toIsoDateOnly(lotRow.packedOn) || (hasProgressedPastSampling ? addDaysIso(harvestedOn, 1) : null);
    const exportedOn =
      toIsoDateOnly(lotRow.exportedOn) ||
      toIsoDateOnly(lotRow.departedAt) ||
      (rawLotStatus === "exported" || rawLotStatus === "delivered"
        ? addDaysIso(packedOn || harvestedOn, 1)
        : null);

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

    // Cán bộ xã/thôn: chỉ thấy hộ và thửa nguồn thuộc địa bàn được phân công, kể cả khi lô ghép nhiều thôn (trừ khi đã được duyệt cấp quyền đột xuất toàn diện).
    const officerFilter =
      temporaryGrant?.active && temporaryGrant.grantedTier === "authority"
        ? null
        : this.buildOfficerHouseholdFilter(ctx.user);
    const scopedContribHouseholds = officerFilter
      ? contribHouseholds.filter((h) => {
        const hid = Number(h.household_id);
        const hhPlots = sourcePlots.filter(
          (p) =>
            Number(p.household_id) === hid ||
            (h.plot_code ? p.code.toUpperCase() === h.plot_code.toUpperCase() : false),
        );
        const adminLocations = [
          this.resolveAdminLocation(h.village_name, null),
          ...hhPlots.filter((p) => p.zone_code).map((p) => this.resolveAdminLocation(null, p.zone_code)),
        ];
        return officerFilter({ villageId: h.village_id !== null ? Number(h.village_id) : null, adminLocations });
      })
      : contribHouseholds;
    const scopedHouseholdIds = [...new Set(scopedContribHouseholds.map((h) => Number(h.household_id)))];
    const scopedHouseholdIdSet = new Set(scopedHouseholdIds);
    const scopedPlotCodes = [
      ...new Set(
        scopedContribHouseholds
          .map((h) => (h.plot_code ? h.plot_code.trim().toUpperCase() : ""))
          .filter(Boolean),
      ),
    ];
    const scopedPlotCodeSet = new Set(scopedPlotCodes);
    const isPlotInOfficerScope = (p: { household_id: number; code: string }) =>
      !officerFilter ||
      scopedHouseholdIdSet.has(Number(p.household_id)) ||
      (!Number(p.household_id) && scopedPlotCodeSet.has(p.code.toUpperCase()));
    const scopedTotalContribKg = officerFilter
      ? scopedContribHouseholds.reduce((s, h) => s + Number(h.weight_kg || 0), 0)
      : totalContribKg;

    const unpinnedContribHouseholdIds = [
      ...new Set(
        contribHouseholds
          .filter((h) => !h.plot_code || !h.plot_code.trim())
          .map((h) => Number(h.household_id)),
      ),
    ];
    const unpinnedContribHouseholdIdSet = new Set(unpinnedContribHouseholdIds);
    const contribPlotCodeSet = new Set(contribPlotCodes.map((c) => c.trim().toUpperCase()));

    // Bảng hộ thành viên đóng góp vào lô trên tờ A4: phân tầng dữ liệu nghiêm ngặt theo vai trò & phạm vi trên máy chủ
    const hasEnterpriseView =
      TIER_RANK[viewerTier] >= TIER_RANK.enterprise || Boolean(fieldAuditPass?.active);
    const hasAuthorityView = viewerTier === "authority";
    const dossierContributors: DossierContributorEntry[] = contribHouseholds.map((h, idx) => {
      const hid = Number(h.household_id);
      const inOfficerScope = !officerFilter || scopedHouseholdIdSet.has(hid);
      const hPlots = sourcePlots.filter((p) => Number(p.household_id) === hid);
      const exactPlot = h.plot_code
        ? sourcePlots.find((p) => p.code.toUpperCase() === h.plot_code!.toUpperCase())
        : undefined;
      const resolvedPlot = exactPlot ?? hPlots[0] ?? null;
      const rowPucCode =
        exactPlot?.zone_code || hPlots.find((p) => p.zone_code)?.zone_code || primaryPucCode;
      const isConsentedQualified =
        h.public_trace_consent === true && h.household_status === "qualified";
      const hasViolation =
        h.household_status === "violation" ||
        Boolean(exactPlot && exactPlot.status === "violation") ||
        (!exactPlot && hPlots.some((p) => p.status === "violation"));
      const sharePct =
        totalContribKg > 0
          ? Number(((Number(h.weight_kg || 0) / totalContribKg) * 100).toFixed(1))
          : contribHouseholds.length > 0
            ? Number((100 / contribHouseholds.length).toFixed(1))
            : 100;

      if (hasAuthorityView && inOfficerScope) {
        const cadastralLabel =
          resolvedPlot?.sheet_no || resolvedPlot?.parcel_no
            ? `Tờ ${resolvedPlot.sheet_no || "-"} / Thửa ${resolvedPlot.parcel_no || "-"}`
            : null;
        const canShowRawFarmerPii = isFullAuthorityStaff;
        const safeAuthorityName = canShowRawFarmerPii || isConsentedQualified
          ? h.household_name
          : `Hộ thành viên ${h.household_code}`;
        return {
          index: idx + 1,
          visibilityLevel: "authority",
          isAnonymized: !canShowRawFarmerPii && !isConsentedQualified,
          displayName: safeAuthorityName,
          avatarUrl: canShowRawFarmerPii || isConsentedQualified ? (h.avatar_url || null) : null,
          householdCode: h.household_code,
          villageName: h.village_name,
          pucCode: rowPucCode,
          sharePct,
          complianceStatus: hasViolation ? "review" : "valid",
          plotCode: resolvedPlot?.code || h.plot_code || null,
          areaHa: resolvedPlot ? Number(resolvedPlot.area_ha) : Number(h.area_ha || 0),
          weightKg: Number(h.weight_kg || 0),
          phone: canShowRawFarmerPii ? h.phone || null : maskFarmerPhone(h.phone),
          cccdMasked: h.cccd_masked || null,
          cadastralLabel,
          publicConsent: Boolean(h.public_trace_consent),
        };
      }

      if (hasEnterpriseView && inOfficerScope) {
        const isHtxOfficerInScope = ctx.user?.role === "htx_officer" && !access.scopeDenied;
        const canShowEntIdentity = isConsentedQualified || isHtxOfficerInScope;
        return {
          index: idx + 1,
          visibilityLevel: "enterprise",
          isAnonymized: !canShowEntIdentity,
          displayName: canShowEntIdentity ? h.household_name : null,
          avatarUrl: canShowEntIdentity ? (h.avatar_url || null) : null,
          householdCode: h.household_code,
          villageName: h.village_name,
          pucCode: rowPucCode,
          sharePct,
          complianceStatus: hasViolation ? "review" : "valid",
          plotCode: resolvedPlot?.code || h.plot_code || null,
          areaHa: resolvedPlot ? Number(resolvedPlot.area_ha) : Number(h.area_ha || 0),
          weightKg: Number(h.weight_kg || 0),
          phone: null,
          cccdMasked: null,
          cadastralLabel: null,
          publicConsent: null,
        };
      }

      // Cấp công khai (hoặc hộ nằm ngoài thôn phân công của cán bộ thôn): cung cấp mã hộ kỹ thuật để đối chiếu minh bạch nhưng ẩn tuyệt đối PII cá nhân chưa đồng ý
      const allowPublicName = inOfficerScope && isConsentedQualified;
      return {
        index: idx + 1,
        visibilityLevel: "public",
        isAnonymized: !allowPublicName,
        displayName: allowPublicName ? h.household_name : null,
        avatarUrl: allowPublicName ? (h.avatar_url || null) : null,
        householdCode: h.household_code,
        villageName: h.village_name,
        pucCode: rowPucCode,
        sharePct,
        complianceStatus: hasViolation ? "review" : "valid",
        plotCode: null,
        areaHa: null,
        weightKg: null,
        phone: null,
        cccdMasked: null,
        cadastralLabel: null,
        publicConsent: null,
      };
    });

    const [integritySeal, massBalance] = await Promise.all([
      this.computeLedgerIntegritySummary(contribHouseholdIds, contribPlotCodes, harvestedOn),
      this.computeMassBalanceSummary({
        seasonYear,
        pucCode: primaryPucCode,
        lotId: internalLotId,
        thisLotWeightKg: totalContribKg,
        scopedThisLotWeightKg: scopedTotalContribKg,
        plotCodes:
          contribPlotCodes.length > 0
            ? contribPlotCodes
            : effectivePlots.map((p) => p.code),
        householdIds: unpinnedContribHouseholdIds,
        allowedPlotFilter: officerFilter
          ? (r) =>
            scopedHouseholdIdSet.has(Number(r.householdId)) ||
            (!Number(r.householdId) && scopedPlotCodeSet.has(r.plotCode.toUpperCase()))
          : undefined,
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

    const effectiveWeightTons =
      Number(lotRow.weightTons || 0) > 0
        ? Number(lotRow.weightTons)
        : totalContribKg > 0
          ? Number((totalContribKg / 1000).toFixed(3))
          : 0;
    const avgBrixVal =
      lotRow.avgBrix !== null && lotRow.avgBrix !== undefined ? Number(lotRow.avgBrix) : null;
    const gradeAPctVal =
      lotRow.gradeAPct !== null && lotRow.gradeAPct !== undefined ? Number(lotRow.gradeAPct) : null;
    const treatmentMethodVal = lotRow.treatmentMethod ? String(lotRow.treatmentMethod).trim() : null;
    const transporterVal = lotRow.transporter ? String(lotRow.transporter).trim() : null;
    const vehiclePlateVal = lotRow.vehiclePlate ? String(lotRow.vehiclePlate).trim() : null;
    const temperatureCVal =
      lotRow.temperatureC !== null && lotRow.temperatureC !== undefined
        ? Number(lotRow.temperatureC)
        : null;

    const timeline = this.buildFiveStepTimeline({
      pucCode: primaryPucCode,
      pucStatus,
      packhouseStatus: live.packhouseStatus,
      lastFarmCheckOn: lastInspectionOn,
      latestMinuteCode,
      participatingHouseholdCount,
      harvestedOn,
      weightTons: effectiveWeightTons,
      avgBrix: avgBrixVal,
      packedOn,
      packhouseName,
      packhouseCode,
      gradeAPct: gradeAPctVal,
      treatmentMethod: treatmentMethodVal,
      latestLabOn: latestLabSampledOn,
      latestLabName: latestLab?.lab ?? null,
      latestLabResult: latestLab?.result ?? null,
      latestLabCode: latestLab?.code ?? null,
      latestLabCdMgKg: latestLab?.cdMgKg ?? null,
      latestLabResidueMgKg: latestLab?.residueMgKg ?? null,
      latestLabYellowO: latestLab?.yellowOPositive ?? null,
      exportedOn,
      lotStatus: isRevoked ? "revoked" : rawLotStatus,
      market: String(lotRow.market || "Xuất khẩu chính ngạch"),
      revokedReason: isRevoked && lotRow.revokedReason ? String(lotRow.revokedReason) : null,
      phytoCertNo,
      transporter: transporterVal,
      vehiclePlate: vehiclePlateVal,
      temperatureC: temperatureCVal,
    });

    // Kiểm tra tuân thủ cách ly PHI trên toàn bộ các hộ tham gia lô (tái sử dụng kết quả từ computeLedgerIntegritySummary, không truy vấn lặp)
    const complianceConfirmed =
      pucStatus === "active" &&
      !hasSuspendedPlot &&
      latestLab?.result !== "fail" &&
      !integritySeal.phiViolatedBeforeHarvest;

    // Dữ liệu Cấp 2 (Doanh nghiệp hoặc Đoàn Thẩm định có Thẻ hợp lệ: vùng nguồn, hạn ngạch Mass-Balance, kiểm nghiệm chi tiết)
    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise || fieldAuditPass?.active) {
      const visibleContribHouseholds = officerFilter ? scopedContribHouseholds : contribHouseholds;
      const visibleTotalContribKg = officerFilter ? scopedTotalContribKg : totalContribKg;
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

      if (visibleContribHouseholds.length > 0) {
        for (const h of visibleContribHouseholds) {
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
      } else if (!officerFilter) {
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
        householdCount: z.householdIds.size || (officerFilter ? 0 : participatingHouseholdCount),
        areaHa: z.areaHa,
        weightKg: z.weightKg,
        status: z.status,
        sharePct:
          visibleTotalContribKg > 0 ? Number(((z.weightKg / visibleTotalContribKg) * 100).toFixed(1)) : 100,
      }));

      const visibleLabTests = rawLabTests.filter((lt) => {
        const hid = lt.householdId !== null && lt.householdId !== undefined ? Number(lt.householdId) : 0;
        const pUpper = lt.plotCode ? lt.plotCode.trim().toUpperCase() : "";
        if (officerFilter) {
          if (!scopedHouseholdIdSet.has(hid) && (!pUpper || !scopedPlotCodeSet.has(pUpper))) {
            return false;
          }
        }
        if (viewerTier === "enterprise" && contribPlotCodeSet.size > 0 && !unpinnedContribHouseholdIdSet.has(hid)) {
          if (pUpper && !contribPlotCodeSet.has(pUpper)) {
            return false;
          }
        }
        return true;
      });

      const tier2EvidenceLogs =
        viewerTier !== "authority"
          ? await this.queryTier2CultivationEvidence({
              householdIds: [...new Set(visibleContribHouseholds.map((h) => Number(h.household_id)))],
              plotCodes: contribPlotCodes,
              restrictToPlotCodes:
                viewerTier === "enterprise" &&
                contribPlotCodes.length > 0 &&
                unpinnedContribHouseholdIds.length === 0,
              canShowAllNames: ctx.user?.role === "htx_officer" && !access.scopeDenied,
              limit: 20,
            })
          : undefined;

      enterpriseData = {
        sourceZones,
        totalSourceWeightKg: visibleTotalContribKg,
        massBalance: massBalance.enterpriseBreakdown,
        ...(tier2EvidenceLogs ? { evidenceLogs: tier2EvidenceLogs } : {}),
        fieldAuditSourcePlots: effectivePlots.filter(isPlotInOfficerScope).slice(0, 12).map((p) => ({
          plotCode: p.code,
          qrToken: p.qr_token,
          zoneCode: p.zone_code || primaryPucCode,
          variety: p.variety || varietyDisplay,
          areaHa: p.area_ha,
          status: p.status,
        })),
        detailedLabTests: visibleLabTests.map((lt) => {
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
      const hasMilestoneTable = await this.hasTable("care_milestone_declarations");
      const [diariesRes, minutesRows, violationRows] = await Promise.all([
        scopedHouseholdIds.length > 0
          ? this.db.query(
            `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days,
                      server_recorded_at, entry_delay_hours::float8 AS entry_delay_hours, is_late_entry, record_hash,
                      gps_verified, gps_distance_m::float8 AS gps_distance_m, photo_urls
               FROM (
                 SELECT sr.sprayed_on AS entry_on,
                        COALESCE(sr.plot_code, '') AS plot_code,
                        ('Phun thuốc BVTV: ' || p.name) AS activity,
                        ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                        CASE
                          WHEN $2::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                            THEN h.name
                          ELSE ('Hộ thành viên ' || h.code)
                        END AS recorder,
                        CASE
                          WHEN $2::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                            THEN h.name
                          ELSE ('Hộ thành viên ' || h.code)
                        END AS household_name,
                        'spray'::text AS kind,
                        sr.mrl_status,
                        sr.isolation_days,
                        sr.server_recorded_at,
                        sr.entry_delay_hours,
                        sr.is_late_entry,
                        sr.record_hash,
                        false AS gps_verified,
                        NULL::numeric AS gps_distance_m,
                        ${safeFieldPhotoUrlsSql("sr.photo_ids", "sr.photo_id", hasMilestoneTable)} AS photo_urls,
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
                        CASE
                          WHEN $2::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                            THEN je.recorder
                          ELSE 'Chủ hộ thành viên HTX'
                        END AS recorder,
                        CASE
                          WHEN $2::boolean OR (COALESCE(h.public_trace_consent, false) AND h.status = 'qualified')
                            THEN h.name
                          ELSE ('Hộ thành viên ' || h.code)
                        END AS household_name,
                        'journal'::text AS kind,
                        NULL::text AS mrl_status,
                        NULL::int AS isolation_days,
                        je.server_recorded_at,
                        je.entry_delay_hours,
                        je.is_late_entry,
                        je.record_hash,
                        je.gps_verified,
                        je.gps_distance_m,
                        ${safeFieldPhotoUrlsSql("je.photo_ids", "je.photo_id", hasMilestoneTable)} AS photo_urls,
                        je.id AS sort_id
                 FROM journal_entries je
                 JOIN households h ON h.id = je.household_id
                 WHERE je.household_id = ANY($1::bigint[])
               ) combined
               ORDER BY entry_on DESC, sort_id DESC
               LIMIT 25`,
            [scopedHouseholdIds, isFullAuthorityStaff],
          )
          : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
        // Biên bản kiểm tra chỉ trong phạm vi hộ/thửa nguồn được xem (không lấy bù biên bản của hộ khác).
        this.queryScopedInspectionMinutes(
          `im.code, im.held_on, im.location, im.officer, im.result,
           im.plot_code, im.gps_verified, im.gps_distance_m::float8 AS gps_distance_m,
           im.record_hash, im.server_recorded_at,
           ${safeFieldPhotoUrlsSql("im.photo_ids", "im.photo_id", false)} AS photo_urls`,
          scopedHouseholdIds,
          scopedPlotCodes,
          8,
        ),
        canReadViolations ? this.queryScopedViolations(scopedHouseholdIds, scopedPlotCodes, 10) : Promise.resolve([]),
      ]);

      authorityData = {
        sourceHouseholds: scopedContribHouseholds.map((h) => {
          const isConsentedQualified = h.public_trace_consent === true && h.household_status === "qualified";
          return {
            householdCode: h.household_code,
            householdName: isFullAuthorityStaff || isConsentedQualified ? h.household_name : `Hộ thành viên ${h.household_code}`,
            avatarUrl: isFullAuthorityStaff || isConsentedQualified ? (h.avatar_url || null) : null,
            villageName: h.village_name,
            phone: isFullAuthorityStaff ? h.phone : maskFarmerPhone(h.phone),
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
              .filter(isPlotInOfficerScope)
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
          };
        }),
        cultivationDiaries: normalizeEvidenceMediaRows(diariesRes.rows),
        inspectionMinutes: normalizeEvidenceMediaRows(minutesRows),
        internalViolations: violationRows,
      };
    }

    const publicLotStatus = isRevoked ? "revoked" : lotRow.status === "sampling" ? "pending" : "valid";
    const resolvedQrToken = String(scannedItem?.qrToken || lotRow.qrToken || "").trim() || null;

    return {
      verifiedAt: verification.verifiedAt,
      accessControl: this.buildAccessControlPayload(access, ctx, fieldAuditPass, temporaryGrant),
      // Trường tương thích ngược đã khử hoàn toàn thông tin nhạy cảm
      lot: {
        code: lotCode,
        qrCode: String(lotRow.qrCode || lotCode),
        qrToken: resolvedQrToken,
        harvestedOn,
        packedOn,
        exportedOn,
        weightTons: effectiveWeightTons,
        householdCount: participatingHouseholdCount,
        market: String(lotRow.market || "Xuất khẩu chính ngạch"),
        status: isRevoked ? "revoked" : rawLotStatus,
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
          weightTons: effectiveWeightTons,
          itemWeightKg: scannedItem?.weightKg !== undefined ? Number(scannedItem.weightKg) : null,
          itemGrade: scannedItem?.grade ? String(scannedItem.grade) : null,
          market: String(lotRow.market || "Xuất khẩu chính ngạch"),
          status: publicLotStatus,
          rawLotStatus: isRevoked ? "revoked" : rawLotStatus,
          avgBrix: avgBrixVal,
          gradeAPct: gradeAPctVal,
          treatmentMethod: treatmentMethodVal,
          transporter: transporterVal,
          vehiclePlate: vehiclePlateVal,
          temperatureC: temperatureCVal,
          statusLabel: isRevoked
            ? "Đã thu hồi - Không lưu thông"
            : rawLotStatus === "sampling"
              ? "Đang lấy mẫu kiểm định trước xuất"
              : rawLotStatus === "in_transit"
                ? "Lô hợp lệ - Đang vận chuyển lưu thông"
                : rawLotStatus === "delivered"
                  ? "Lô hợp lệ - Đã bàn giao phân phối"
                  : rawLotStatus === "exported"
                    ? "Lô hợp lệ - Đã thông quan xuất khẩu"
                    : "Lô hợp lệ - Đủ điều kiện lưu thông",
          revokedReason: isRevoked
            ? String(lotRow.revokedReason || "Thu hồi theo quyết định kiểm soát chất lượng của đơn vị quản lý.")
            : null,
        },
        growingZone: {
          name: live.pucName || "Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né",
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
          dossierContributorsTier: hasAuthorityView
            ? "authority"
            : hasEnterpriseView
              ? "enterprise"
              : "public",
          dossierContributors,
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

    const [latestLotRes, latestMinute] = await Promise.all([
      this.db.query(
        `SELECT hl.id, hl.code, hl.qr_token, hl.enterprise_id, hl.coop_code, hl.packed_on, hl.exported_on, hl.market, hl.status,
                hl.packhouse_code, COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                COALESCE(hl.packhouse_address, e.address) AS packhouse_address,
                hl.phytosanitary_cert_no, hl.phytosanitary_issued_on,
                hl.grade_a_pct::float8 AS grade_a_pct, hl.grade_b_pct::float8 AS grade_b_pct, hl.grade_c_pct::float8 AS grade_c_pct,
                hl.avg_brix::float8 AS avg_brix, hl.treatment_method, hl.transporter, hl.vehicle_plate,
                hl.temperature_c::float8 AS temperature_c, hl.departed_at, hl.estimated_arrival
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         LEFT JOIN enterprises e ON e.id = hl.enterprise_id
         WHERE hl.status <> 'revoked'
           AND hc.household_id = $1
           AND ($2::text IS NULL OR COALESCE(btrim(hc.plot_code), '') = '' OR upper(btrim(hc.plot_code)) = upper(btrim($2)))
         ORDER BY (CASE WHEN $2::text IS NOT NULL AND upper(btrim(COALESCE(hc.plot_code, ''))) = upper(btrim($2)) THEN 0 ELSE 1 END),
                  hl.harvested_on DESC, hc.id DESC
         LIMIT 1`,
        [householdId, stampPlotCode],
      ),
      this.queryLatestScopedMinute([householdId], stampPlotCode ? [stampPlotCode] : []),
    ]);

    const derivedZone = String(raw.householdCode || "").replace(/-(?:H|T)\d+$/i, "");
    const pucCode = String(
      raw.zoneCode || (derivedZone && derivedZone !== raw.householdCode ? derivedZone : "VN-DLOR-0086"),
    );
    const adminLocation = this.resolveAdminLocation(raw.villageName, pucCode);
    const linkedLot = latestLotRes.rows[0] ? camelRow<Record<string, unknown>>(latestLotRes.rows[0]) : null;
    const resolvedLinkedLotCode = linkedLot ? String(linkedLot.code) : null;
    const effectiveEnterpriseId = await this.resolveEnterprisePlotOrStampScope({
      user: ctx.user,
      householdId,
      plotCode: stampPlotCode,
      linkedLotEnterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
      pucCode,
    });

    const baseAccess = this.evaluateAccessAndScope(ctx, {
      targetKind: "fruit",
      enterpriseId: effectiveEnterpriseId,
      coopCode: linkedLot?.coopCode ? String(linkedLot.coopCode) : "HTX-CUNE",
      villageIds: raw.villageId !== null && raw.villageId !== undefined ? [Number(raw.villageId)] : [],
      adminLocations: [adminLocation],
    });
    const temporaryGrant = await this.resolveApprovedAccessGrant(
      ctx,
      {
        scannedCode: cleanCode,
        targetKind: "fruit",
        canonicalCodes: [
          raw.serialCode ? String(raw.serialCode) : null,
          raw.qrToken ? String(raw.qrToken) : null,
        ],
        resolvedLotCode: resolvedLinkedLotCode,
        pucCode,
      },
      true,
    );
    const access = this.elevateAccessWithGrant(baseAccess, ctx, temporaryGrant);
    const viewerTier = access.viewerTier;
    const isFullAuthorityStaff = this.isAuthenticatedAuthorityStaff(ctx.user);
    const { canReadDraftLabs, canReadViolations } = this.resolveSensitiveTracePermissions(
      viewerTier,
      ctx.user,
    );
    const verifiedLabClause = canReadDraftLabs ? "" : "AND record_status = 'verified'";

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
      temporaryGrant?.matchedViaToken
        ? Promise.resolve(null)
        : this.resolveFieldAuditPass(ctx, pucCode, cleanCode, resolvedLinkedLotCode, true),
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
    const lastInspectionOn = toIsoDateOnly(latestMinute?.held_on);
    const latestMinuteCode = latestMinute?.code ?? null;
    const latestMinuteOfficer = latestMinute?.officer ?? null;

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
        householdIds: stampPlotCode ? [] : [householdId],
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

    // Dữ liệu Cấp 2 (Doanh nghiệp, Cán bộ HTX, Đoàn Thẩm định hoặc chính Chủ hộ đang xem tem của mình)
    const isStampOwnerFarmer =
      ctx.user?.role === "farmer" && Number(ctx.user.householdId) === householdId;
    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise || fieldAuditPass?.active || isStampOwnerFarmer) {
      const visibleStampLabs =
        viewerTier === "enterprise" && stampPlotCode
          ? rawLabs.filter(
            (lt) => !lt.plotCode || !lt.plotCode.trim() || lt.plotCode.trim().toUpperCase() === stampPlotCode.toUpperCase(),
          )
          : rawLabs;
      const tier2EvidenceLogs =
        viewerTier !== "authority"
          ? await this.queryTier2CultivationEvidence({
              householdIds: [householdId],
              plotCodes: stampPlotCode ? [stampPlotCode] : [],
              restrictToPlotCodes: viewerTier === "enterprise" && Boolean(stampPlotCode),
              canShowAllNames:
                isStampOwnerFarmer || (ctx.user?.role === "htx_officer" && !access.scopeDenied),
              limit: 20,
            })
          : undefined;
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
        ...(tier2EvidenceLogs ? { evidenceLogs: tier2EvidenceLogs } : {}),
        detailedLabTests: visibleStampLabs.map((lt) => ({
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
        packingSpecs: linkedLot
          ? {
              gradeAPct:
                linkedLot.gradeAPct !== null && linkedLot.gradeAPct !== undefined
                  ? Number(linkedLot.gradeAPct)
                  : null,
              gradeBPct:
                linkedLot.gradeBPct !== null && linkedLot.gradeBPct !== undefined
                  ? Number(linkedLot.gradeBPct)
                  : null,
              gradeCPct:
                linkedLot.gradeCPct !== null && linkedLot.gradeCPct !== undefined
                  ? Number(linkedLot.gradeCPct)
                  : null,
              avgBrix:
                linkedLot.avgBrix !== null && linkedLot.avgBrix !== undefined
                  ? Number(linkedLot.avgBrix)
                  : null,
              treatmentMethod: linkedLot.treatmentMethod ? String(linkedLot.treatmentMethod) : null,
              transporter: linkedLot.transporter ? String(linkedLot.transporter) : null,
              vehiclePlate: linkedLot.vehiclePlate ? String(linkedLot.vehiclePlate) : null,
              temperatureC:
                linkedLot.temperatureC !== null && linkedLot.temperatureC !== undefined
                  ? Number(linkedLot.temperatureC)
                  : null,
              departedAt: linkedLot.departedAt ? String(linkedLot.departedAt) : null,
              estimatedArrival: linkedLot.estimatedArrival ? String(linkedLot.estimatedArrival) : null,
            }
          : null,
      };
    }

    // Dữ liệu Cấp 3 (Cơ quan quản lý)
    let authorityData: Record<string, unknown> | undefined;
    if (viewerTier === "authority") {
      const hasMilestoneTable = await this.hasTable("care_milestone_declarations");
      const officerFilter =
        temporaryGrant?.active && temporaryGrant.grantedTier === "authority"
          ? null
          : this.buildOfficerHouseholdFilter(ctx.user);
      const householdVisible =
        !officerFilter ||
        officerFilter({
          villageId: raw.villageId !== null && raw.villageId !== undefined ? Number(raw.villageId) : null,
          adminLocations: [adminLocation],
        });
      const scopedHouseholdIds = householdVisible ? [householdId] : [];
      const scopedPlotCodes = householdVisible && stampPlotCode ? [stampPlotCode] : [];
      const safeStampHouseholdName =
        isFullAuthorityStaff || hasConsent
          ? String(raw.householdName || "")
          : `Hộ thành viên ${String(raw.householdCode || "HTX")}`;
      const [diariesRes, minutesRows, violationRows] = await Promise.all([
        householdVisible
          ? this.db.query(
            `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days,
                      server_recorded_at, entry_delay_hours::float8 AS entry_delay_hours, is_late_entry, record_hash,
                      gps_verified, gps_distance_m::float8 AS gps_distance_m, photo_urls
               FROM (
                 SELECT sr.sprayed_on AS entry_on,
                        COALESCE(sr.plot_code, '') AS plot_code,
                        ('Phun thuốc BVTV: ' || p.name) AS activity,
                        ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                        $2::text AS recorder,
                        $2::text AS household_name,
                        'spray'::text AS kind,
                        sr.mrl_status,
                        sr.isolation_days,
                        sr.server_recorded_at,
                        sr.entry_delay_hours,
                        sr.is_late_entry,
                        sr.record_hash,
                        false AS gps_verified,
                        NULL::numeric AS gps_distance_m,
                        ${safeFieldPhotoUrlsSql("sr.photo_ids", "sr.photo_id", hasMilestoneTable)} AS photo_urls,
                        sr.id AS sort_id
                 FROM spray_records sr
                 JOIN pesticides p ON p.id = sr.pesticide_id
                 WHERE sr.household_id = $1
                 UNION ALL
                 SELECT je.entry_on,
                        je.plot_code,
                        je.activity,
                        je.detail,
                        CASE WHEN $3::boolean THEN je.recorder ELSE 'Chủ hộ thành viên HTX' END AS recorder,
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
                        ${safeFieldPhotoUrlsSql("je.photo_ids", "je.photo_id", hasMilestoneTable)} AS photo_urls,
                        je.id AS sort_id
                 FROM journal_entries je
                 WHERE je.household_id = $1
               ) combined
               ORDER BY entry_on DESC, sort_id DESC
               LIMIT 20`,
            [householdId, safeStampHouseholdName, isFullAuthorityStaff || hasConsent],
          )
          : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
        this.queryScopedInspectionMinutes(
          `im.code, im.held_on, im.location, im.officer, im.result,
           im.plot_code, im.gps_verified, im.gps_distance_m::float8 AS gps_distance_m,
           im.record_hash, im.server_recorded_at,
           ${safeFieldPhotoUrlsSql("im.photo_ids", "im.photo_id", false)} AS photo_urls`,
          scopedHouseholdIds,
          scopedPlotCodes,
          6,
        ),
        canReadViolations ? this.queryScopedViolations(scopedHouseholdIds, scopedPlotCodes, 6) : Promise.resolve([]),
      ]);

      authorityData = {
        sourceHouseholds: householdVisible
          ? [
            {
              householdCode: String(raw.householdCode),
              householdName: safeStampHouseholdName,
              avatarUrl:
                isFullAuthorityStaff || hasConsent
                  ? (typeof raw.avatarUrl === "string" && raw.avatarUrl ? raw.avatarUrl : null)
                  : null,
              villageName: String(raw.villageName || ""),
              phone: isFullAuthorityStaff ? String(raw.householdPhone || "") : maskFarmerPhone(raw.householdPhone),
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
                    plantedYear:
                      raw.plantedYear !== null && raw.plantedYear !== undefined ? Number(raw.plantedYear) : null,
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
          ]
          : [],
        cultivationDiaries: normalizeEvidenceMediaRows(diariesRes.rows),
        inspectionMinutes: normalizeEvidenceMediaRows(minutesRows),
        internalViolations: violationRows,
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
      accessControl: this.buildAccessControlPayload(access, ctx, fieldAuditPass, temporaryGrant),
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
          name: live.pucName || "Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né",
          pucCode,
          additionalZoneCount: 0,
          adminLocation: live.pucAdminLocation || adminLocation,
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

    const [latestLotRes, latestMinute] = await Promise.all([
      this.db.query(
        `SELECT hl.id, hl.code, hl.qr_token, hl.enterprise_id, hl.coop_code, hl.harvested_on, hl.packed_on, hl.exported_on,
                hl.weight_tons::float8 AS weight_tons, hl.market, hl.status,
                hl.packhouse_code, COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                COALESCE(hl.packhouse_address, e.address) AS packhouse_address,
                hl.phytosanitary_cert_no, hl.phytosanitary_issued_on,
                hl.grade_a_pct::float8 AS grade_a_pct, hl.grade_b_pct::float8 AS grade_b_pct, hl.grade_c_pct::float8 AS grade_c_pct,
                hl.avg_brix::float8 AS avg_brix, hl.treatment_method, hl.transporter, hl.vehicle_plate,
                hl.temperature_c::float8 AS temperature_c, hl.departed_at, hl.estimated_arrival,
                hc.weight_kg::float8 AS contributed_kg
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         LEFT JOIN enterprises e ON e.id = hl.enterprise_id
         WHERE hl.status <> 'revoked'
           AND (
             upper(btrim(COALESCE(hc.plot_code, ''))) = upper(btrim($2))
             OR ($1::bigint IS NOT NULL AND hc.household_id = $1 AND COALESCE(btrim(hc.plot_code), '') = '')
           )
         ORDER BY (CASE WHEN upper(btrim(COALESCE(hc.plot_code, ''))) = upper(btrim($2)) THEN 0 ELSE 1 END),
                  hl.harvested_on DESC, hc.id DESC
         LIMIT 1`,
        [plotHouseholdId, plotCode],
      ),
      this.queryLatestScopedMinute(plotHouseholdId ? [plotHouseholdId] : [], [plotCode]),
    ]);

    const linkedLot = latestLotRes.rows[0] ? camelRow<Record<string, unknown>>(latestLotRes.rows[0]) : null;
    const resolvedLinkedLotCode = linkedLot ? String(linkedLot.code) : null;
    const effectiveEnterpriseId = await this.resolveEnterprisePlotOrStampScope({
      user: ctx.user,
      householdId: plotHouseholdId,
      plotCode,
      linkedLotEnterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
      pucCode,
    });
    const baseAccess = this.evaluateAccessAndScope(ctx, {
      targetKind: "plot",
      enterpriseId: effectiveEnterpriseId,
      coopCode: linkedLot?.coopCode ? String(linkedLot.coopCode) : "HTX-CUNE",
      villageIds: raw.villageId !== null && raw.villageId !== undefined ? [Number(raw.villageId)] : [],
      adminLocations: [adminLocation],
    });
    const temporaryGrant = await this.resolveApprovedAccessGrant(
      ctx,
      {
        scannedCode: cleanCode,
        targetKind: "plot",
        canonicalCodes: [plotCode, plotQrToken],
        resolvedLotCode: resolvedLinkedLotCode,
        pucCode,
      },
      true,
    );
    const access = this.elevateAccessWithGrant(baseAccess, ctx, temporaryGrant);
    const viewerTier = access.viewerTier;
    const isFullAuthorityStaff = this.isAuthenticatedAuthorityStaff(ctx.user);
    const { canReadDraftLabs, canReadViolations } = this.resolveSensitiveTracePermissions(
      viewerTier,
      ctx.user,
    );
    const verifiedLabClause = canReadDraftLabs ? "" : "AND record_status = 'verified'";

    const packhouseName = String(linkedLot?.packhouseName || DEFAULT_PACKHOUSE_NAME);
    const packhouseCode = String(linkedLot?.packhouseCode || DEFAULT_PACKHOUSE_CODE);
    const packhouseAddress = String(linkedLot?.packhouseAddress || DEFAULT_PACKHOUSE_ADDRESS);

    const [labTestsRes, live, coarseMap] = await Promise.all([
      this.db.query(
        `SELECT code, plot_code, sampled_on, cd_mg_kg::float8 AS cd_mg_kg, yellow_o_positive,
                residue_mg_kg::float8 AS residue_mg_kg, chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
                result, lab, lab_accreditation_code, external_verify_code, external_verify_url,
                ${publicAttachmentUrlSql("scan_attachment_id")} AS scan_url
         FROM lab_tests
         WHERE (
           upper(btrim(plot_code)) = upper(btrim($1))
           OR ($2::bigint IS NOT NULL AND household_id = $2)
         )
         ${verifiedLabClause}
         ORDER BY (CASE WHEN upper(btrim(plot_code)) = upper(btrim($1)) THEN 0 ELSE 1 END), sampled_on DESC, id DESC
         LIMIT 4`,
        [plotCode, plotHouseholdId],
      ),
      this.resolveLiveZoneAndPackhouseStatus({
        pucCode,
        enterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
        packhouseCode,
        hasPlotOrHouseholdViolation: isSuspended,
        hasPendingSource: isDraftOrUnverified,
      }),
      this.resolveCoarseZoneMap(hasPlots, pucCode, adminLocation),
    ]);
    const pucStatus = live.pucStatus;
    const hasRealtimeSuspension =
      live.pucStatus === "suspended" ||
      live.pucStatus === "revoked" ||
      live.packhouseStatus !== "active";

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
      temporaryGrant?.matchedViaToken
        ? Promise.resolve(null)
        : this.resolveFieldAuditPass(ctx, pucCode, cleanCode, resolvedLinkedLotCode, true),
    ]);

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
    const lastInspectionOn = toIsoDateOnly(latestMinute?.held_on);
    const latestMinuteCode = latestMinute?.code ?? null;
    const latestMinuteOfficer = latestMinute?.officer ?? null;

    const contribKg = linkedLot?.contributedKg ? Number(linkedLot.contributedKg) : 0;
    const seasonYear = harvestedOn ? Number(harvestedOn.slice(0, 4)) || new Date().getFullYear() : new Date().getFullYear();

    const [integritySeal, massBalance, lastCareRes] = await Promise.all([
      this.computeLedgerIntegritySummary(plotHouseholdId ? [plotHouseholdId] : [], [plotCode], harvestedOn),
      this.computeMassBalanceSummary({
        seasonYear,
        pucCode,
        lotId: linkedLot?.id ? Number(linkedLot.id) : null,
        thisLotWeightKg: contribKg,
        plotCodes: [plotCode],
        householdIds: [],
      }),
      this.db.query<{ last_care_on: Date | string | null }>(
        `SELECT GREATEST(
           (SELECT MAX(je.entry_on) FROM journal_entries je
            WHERE upper(btrim(COALESCE(je.plot_code, ''))) = upper(btrim($2))
               OR ($1::bigint IS NOT NULL AND je.household_id = $1 AND (je.plot_code IS NULL OR btrim(je.plot_code) = ''))),
           (SELECT MAX(sr.sprayed_on) FROM spray_records sr
            WHERE upper(btrim(COALESCE(sr.plot_code, ''))) = upper(btrim($2))
               OR ($1::bigint IS NOT NULL AND sr.household_id = $1 AND (sr.plot_code IS NULL OR btrim(sr.plot_code) = '')))
         ) AS last_care_on`,
        [plotHouseholdId, plotCode],
      ),
    ]);
    const lastCareOn = toIsoDateOnly(lastCareRes.rows[0]?.last_care_on);

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
    const isHtxOfficerInScope = ctx.user?.role === "htx_officer" && !access.scopeDenied;
    const plotOfficerFilter =
      temporaryGrant?.active && temporaryGrant.grantedTier === "authority"
        ? null
        : this.buildOfficerHouseholdFilter(ctx.user);
    const plotHouseholdInOfficerScope =
      !plotOfficerFilter ||
      plotOfficerFilter({
        villageId: raw.villageId !== null && raw.villageId !== undefined ? Number(raw.villageId) : null,
        adminLocations: [adminLocation],
      });
    const canViewPlotFarmerIdentity =
      hasConsent ||
      isOwnerFarmer ||
      isHtxOfficerInScope ||
      (isFullAuthorityStaff && plotHouseholdInOfficerScope && !access.scopeDenied);

    const canViewFieldAudit =
      Boolean(fieldAuditPass?.active) ||
      Boolean(temporaryGrant?.active) ||
      (viewerTier === "authority" && !access.scopeDenied) ||
      isOwnerFarmer;

    const fieldAuditPromise = canViewFieldAudit
      ? this.buildFieldAuditPlotDossier({
          plotCode,
          qrToken: plotQrToken,
          householdId: plotHouseholdId,
          householdCode: raw.householdCode ? String(raw.householdCode) : null,
          consentedOwnerName: canViewPlotFarmerIdentity && raw.ownerName ? String(raw.ownerName) : null,
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
          precomputedMassBalance: seasonYear === new Date().getFullYear() ? massBalance : undefined,
        })
      : Promise.resolve(undefined);

    const communeLotContributionsPromise = this.queryCommuneLotContributions({
      householdId: plotHouseholdId,
      plotCode,
      viewerUser: ctx.user,
      canSeePlotCodes: true,
    });

    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise || fieldAuditPass?.active || isOwnerFarmer) {
      const visiblePlotLabs =
        viewerTier === "enterprise"
          ? rawLabs.filter(
            (lt) => !lt.plotCode || !lt.plotCode.trim() || lt.plotCode.trim().toUpperCase() === plotCode.toUpperCase(),
          )
          : rawLabs;
      const tier2EvidenceLogs =
        viewerTier !== "authority"
          ? await this.queryTier2CultivationEvidence({
              householdIds: plotHouseholdId ? [plotHouseholdId] : [],
              plotCodes: [plotCode],
              restrictToPlotCodes: true,
              canShowAllNames: canViewPlotFarmerIdentity,
              limit: 20,
            })
          : undefined;
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
        ...(tier2EvidenceLogs ? { evidenceLogs: tier2EvidenceLogs } : {}),
        detailedLabTests: visiblePlotLabs.map((lt) => ({
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
        packingSpecs: linkedLot
          ? {
              gradeAPct:
                linkedLot.gradeAPct !== null && linkedLot.gradeAPct !== undefined
                  ? Number(linkedLot.gradeAPct)
                  : null,
              gradeBPct:
                linkedLot.gradeBPct !== null && linkedLot.gradeBPct !== undefined
                  ? Number(linkedLot.gradeBPct)
                  : null,
              gradeCPct:
                linkedLot.gradeCPct !== null && linkedLot.gradeCPct !== undefined
                  ? Number(linkedLot.gradeCPct)
                  : null,
              avgBrix:
                linkedLot.avgBrix !== null && linkedLot.avgBrix !== undefined
                  ? Number(linkedLot.avgBrix)
                  : null,
              treatmentMethod: linkedLot.treatmentMethod ? String(linkedLot.treatmentMethod) : null,
              transporter: linkedLot.transporter ? String(linkedLot.transporter) : null,
              vehiclePlate: linkedLot.vehiclePlate ? String(linkedLot.vehiclePlate) : null,
              temperatureC:
                linkedLot.temperatureC !== null && linkedLot.temperatureC !== undefined
                  ? Number(linkedLot.temperatureC)
                  : null,
              departedAt: linkedLot.departedAt ? String(linkedLot.departedAt) : null,
              estimatedArrival: linkedLot.estimatedArrival ? String(linkedLot.estimatedArrival) : null,
            }
          : null,
      };
    }

    let authorityData: Record<string, unknown> | undefined;
    const authorityPromise = (async () => {
      if (viewerTier !== "authority") return undefined;
      const hasMilestoneTable = await this.hasTable("care_milestone_declarations");
      const householdVisible = plotHouseholdInOfficerScope;
      const scopedHouseholdIds = householdVisible && plotHouseholdId ? [plotHouseholdId] : [];
      const scopedPlotCodes = householdVisible ? [plotCode] : [];
      // Cán bộ xã/thôn: nhật ký theo mã thửa chỉ lấy bản ghi của hộ thuộc địa bàn (không lấy bản ghi hộ khác trùng mã thửa).
      const restrictToScopedHouseholds = plotOfficerFilter !== null;
      const safePlotOwnerName =
        isFullAuthorityStaff || hasConsent
          ? String(raw.ownerName || "Chưa cập nhật")
          : `Hộ thành viên ${String(raw.householdCode || "HTX")}`;
      const [diariesRes, minutesRows, violationRows] = await Promise.all([
        householdVisible
          ? this.db.query(
            `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days,
                      server_recorded_at, entry_delay_hours::float8 AS entry_delay_hours, is_late_entry, record_hash,
                      gps_verified, gps_distance_m::float8 AS gps_distance_m, photo_urls
               FROM (
                 SELECT sr.sprayed_on AS entry_on,
                        COALESCE(sr.plot_code, $1::text) AS plot_code,
                        ('Phun thuốc BVTV: ' || p.name) AS activity,
                        ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                        $3::text AS recorder,
                        $3::text AS household_name,
                        'spray'::text AS kind,
                        sr.mrl_status,
                        sr.isolation_days,
                        sr.server_recorded_at,
                        sr.entry_delay_hours,
                        sr.is_late_entry,
                        sr.record_hash,
                        false AS gps_verified,
                        NULL::numeric AS gps_distance_m,
                        ${safeFieldPhotoUrlsSql("sr.photo_ids", "sr.photo_id", hasMilestoneTable)} AS photo_urls,
                        sr.id AS sort_id
                 FROM spray_records sr
                 JOIN pesticides p ON p.id = sr.pesticide_id
                 WHERE (upper(btrim(COALESCE(sr.plot_code, ''))) = upper(btrim($1))
                        OR ($2::bigint IS NOT NULL AND sr.household_id = $2 AND (sr.plot_code IS NULL OR btrim(sr.plot_code) = '')))
                   AND (NOT $4::boolean OR sr.household_id = ANY($5::bigint[]))
                 UNION ALL
                 SELECT je.entry_on,
                        je.plot_code,
                        je.activity,
                        je.detail,
                        CASE WHEN $6::boolean THEN je.recorder ELSE 'Chủ hộ thành viên HTX' END AS recorder,
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
                        ${safeFieldPhotoUrlsSql("je.photo_ids", "je.photo_id", hasMilestoneTable)} AS photo_urls,
                        je.id AS sort_id
                 FROM journal_entries je
                 WHERE (upper(btrim(COALESCE(je.plot_code, ''))) = upper(btrim($1))
                        OR ($2::bigint IS NOT NULL AND je.household_id = $2 AND (je.plot_code IS NULL OR btrim(je.plot_code) = '')))
                   AND (NOT $4::boolean OR je.household_id = ANY($5::bigint[]))
               ) combined
               ORDER BY entry_on DESC, sort_id DESC
               LIMIT 20`,
            [plotCode, plotHouseholdId, safePlotOwnerName, restrictToScopedHouseholds, scopedHouseholdIds, isFullAuthorityStaff || hasConsent],
          )
          : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
        this.queryScopedInspectionMinutes(
          `im.code, im.held_on, im.location, im.officer, im.result,
           im.plot_code, im.gps_verified, im.gps_distance_m::float8 AS gps_distance_m,
           im.record_hash, im.server_recorded_at,
           ${safeFieldPhotoUrlsSql("im.photo_ids", "im.photo_id", false)} AS photo_urls`,
          scopedHouseholdIds,
          scopedPlotCodes,
          6,
        ),
        canReadViolations ? this.queryScopedViolations(scopedHouseholdIds, scopedPlotCodes, 6) : Promise.resolve([]),
      ]);

      return {
        sourceHouseholds: householdVisible
          ? [
            {
              householdCode: String(raw.householdCode || "Chưa gán mã hộ"),
              householdName: safePlotOwnerName,
              avatarUrl:
                isFullAuthorityStaff || hasConsent
                  ? (typeof raw.avatarUrl === "string" && raw.avatarUrl ? raw.avatarUrl : null)
                  : null,
              villageName: String(raw.village || ""),
              phone: isFullAuthorityStaff ? String(raw.householdPhone || "") : maskFarmerPhone(raw.householdPhone),
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
          ]
          : [],
        cultivationDiaries: normalizeEvidenceMediaRows(diariesRes.rows),
        inspectionMinutes: normalizeEvidenceMediaRows(minutesRows),
        internalViolations: violationRows,
      };
    })();

    const [fieldAuditData, resolvedAuthorityData, communeLotContributions] = await Promise.all([
      fieldAuditPromise,
      authorityPromise,
      communeLotContributionsPromise,
    ]);
    authorityData = resolvedAuthorityData;

    const publicPlotStatus = isSuspended ? "revoked" : isDraftOrUnverified ? "unverified" : "valid";
    const resolvedQrToken = plotQrToken || (linkedLot?.qrToken ? String(linkedLot.qrToken) : null);
    const householdCodeVal = raw.householdCode ? String(raw.householdCode) : null;
    const farmerProfile: TraceFarmerProfile = {
      displayName:
        canViewPlotFarmerIdentity && raw.ownerName
          ? String(raw.ownerName)
          : householdCodeVal
            ? `Hộ thành viên ${householdCodeVal}`
            : "Hộ thành viên liên kết HTX Cư Né",
      isAnonymized: !canViewPlotFarmerIdentity,
      avatarUrl:
        canViewPlotFarmerIdentity && typeof raw.avatarUrl === "string" && raw.avatarUrl
          ? raw.avatarUrl
          : null,
      householdCode: householdCodeVal,
      villageName: String(raw.village || "Xã Cư Né"),
      adminLocation: live.pucAdminLocation || adminLocation,
      cooperativeName: DEFAULT_COOP_NAME,
      plotCount: 1,
      totalAreaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 0,
      totalTrees: raw.treeCount !== null && raw.treeCount !== undefined ? Number(raw.treeCount) : 0,
      zoneCodes: [pucCode],
      varieties: String(raw.variety || "Ri6 & Monthong (Dona)"),
      complianceStatus: isSuspended ? "review" : isDraftOrUnverified ? "unverified" : "valid",
    };

    return {
      verifiedAt: verification.verifiedAt,
      isPlotSignboard: true,
      farmerProfile,
      communeLotContributions,
      plotSignboard: {
        plotCode,
        qrToken: plotQrToken,
        zoneCode: pucCode,
        villageName: String(raw.village || "Xã Cư Né"),
        variety: String(raw.variety || "Ri6 & Monthong (Dona)"),
        plantedYear:
          raw.plantedYear !== null && raw.plantedYear !== undefined ? Number(raw.plantedYear) : null,
        areaHa: raw.areaHa !== null && raw.areaHa !== undefined ? Number(raw.areaHa) : 0,
        treeCount: raw.treeCount !== null && raw.treeCount !== undefined ? Number(raw.treeCount) : 0,
        plotStatus: String(raw.status || "approved"),
        lastCareOn,
        lastInspectionOn,
        latestMinuteCode,
        latestMinuteOfficer,
        linkedLotCode: resolvedLinkedLotCode,
      },
      accessControl: this.buildAccessControlPayload(access, ctx, fieldAuditPass, temporaryGrant),
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
          name: live.pucName || "Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né",
          pucCode,
          additionalZoneCount: 0,
          adminLocation: live.pucAdminLocation || adminLocation,
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

  /**
   * Xây dựng phản hồi 3 cấp cho Hồ sơ Nông hộ Liên kết khi tra cứu theo Mã hộ (`households.code`):
   * - Hiển thị thẻ định danh nông hộ trên khổ A4 (kèm ảnh profile khi được phép), lịch sử đóng góp sản lượng
   *   trong các lô hàng đã ghi nhận trên địa bàn xã, và hình ảnh minh chứng quá trình canh tác phân quyền theo 3 cấp.
   */
  private async buildHouseholdTraceResponse(params: {
    cleanCode: string;
    rawHouseholdRow: Record<string, unknown>;
    hasPlots: boolean;
    hasSignboards: boolean;
    ctx: TraceRequestContext;
  }) {
    const { cleanCode, hasPlots, hasSignboards, ctx } = params;
    const raw = camelRow<Record<string, unknown>>(params.rawHouseholdRow);
    const householdId = Number(raw.id);
    const householdCode = String(raw.code);
    const householdStatus = String(raw.status || "pending");
    const isSuspended = householdStatus === "violation";
    const isDraftOrUnverified = householdStatus === "pending";
    const hasConsent = Boolean(raw.publicTraceConsent) && householdStatus === "qualified";

    let hhPlots: Array<{
      code: string;
      qr_token: string | null;
      zone_code: string | null;
      sheet_no: string | null;
      parcel_no: string | null;
      variety: string | null;
      planted_year: number | null;
      area_ha: number;
      tree_count: number;
      status: string;
      source: string | null;
      geometry_json: string | null;
      lat: number | null;
      lng: number | null;
    }> = [];

    if (hasPlots) {
      hhPlots = (
        await this.db.query<{
          code: string;
          qr_token: string | null;
          zone_code: string | null;
          sheet_no: string | null;
          parcel_no: string | null;
          variety: string | null;
          planted_year: number | null;
          area_ha: number;
          tree_count: number;
          status: string;
          source: string | null;
          geometry_json: string | null;
          lat: number | null;
          lng: number | null;
        }>(
          `SELECT p.code,
                  ${hasSignboards ? "COALESCE(p.qr_token, pst.qr_token)" : "p.qr_token"} AS qr_token,
                  ${hasSignboards ? "COALESCE(p.zone_code, pst.zone_code)" : "p.zone_code"} AS zone_code,
                  p.sheet_no,
                  p.parcel_no,
                  ${hasSignboards ? "COALESCE(p.variety, pst.variety)" : "p.variety"} AS variety,
                  ${hasSignboards ? "COALESCE(p.planted_year, pst.planted_year)" : "p.planted_year"} AS planted_year,
                  COALESCE(p.area_ha, 0)::float8 AS area_ha,
                  COALESCE(p.tree_count, GREATEST(30, ROUND(COALESCE(p.area_ha, 1.0) * 150)::int)) AS tree_count,
                  p.status,
                  p.source,
                  ST_AsGeoJSON(p.geom) AS geometry_json,
                  ST_Y(ST_Centroid(p.geom))::float8 AS lat,
                  ST_X(ST_Centroid(p.geom))::float8 AS lng
           FROM plots p
           ${hasSignboards ? "LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)" : ""}
           WHERE p.household_id = $1
           ORDER BY (p.status = 'approved') DESC, p.id ASC`,
          [householdId],
        )
      ).rows;
    }

    if (hhPlots.length === 0 && hasSignboards) {
      hhPlots = (
        await this.db.query<{
          code: string;
          qr_token: string | null;
          zone_code: string | null;
          sheet_no: string | null;
          parcel_no: string | null;
          variety: string | null;
          planted_year: number | null;
          area_ha: number;
          tree_count: number;
          status: string;
          source: string | null;
          geometry_json: string | null;
          lat: number | null;
          lng: number | null;
        }>(
          `SELECT pst.plot_code AS code,
                  pst.qr_token,
                  pst.zone_code,
                  NULL::text AS sheet_no,
                  NULL::text AS parcel_no,
                  pst.variety,
                  pst.planted_year,
                  COALESCE(pst.area_ha, 0)::float8 AS area_ha,
                  COALESCE(pst.tree_count, 150) AS tree_count,
                  CASE
                    WHEN $2::text = 'violation' THEN 'violation'
                    WHEN $2::text = 'pending' THEN 'pending'
                    ELSE 'approved'
                  END AS status,
                  'signboard'::text AS source,
                  pst.geometry_json,
                  pst.center_lat::float8 AS lat,
                  pst.center_lng::float8 AS lng
           FROM plot_signboard_tokens pst
           WHERE pst.household_id = $1
           ORDER BY pst.plot_code ASC`,
          [householdId, householdStatus],
        )
      ).rows;
    }

    const hhPlotCodes = hhPlots.map((p) => p.code).filter(Boolean);
    const hasPlotViolation = hhPlots.some((p) => p.status === "violation");
    const effectiveSuspended = isSuspended || hasPlotViolation;
    const distinctZones = [
      ...new Set(hhPlots.map((p) => (p.zone_code ? p.zone_code.trim() : "")).filter(Boolean)),
    ];
    const derivedZone = householdCode.replace(/-(?:H|T)\d+$/i, "");
    const primaryPucCode =
      distinctZones[0] ||
      (derivedZone && derivedZone !== householdCode ? derivedZone : "VN-DLOR-0086");
    const villageName = String(raw.villageName || "Xã Cư Né");
    const adminLocation = this.resolveAdminLocation(villageName, primaryPucCode);
    const varietiesDisplay =
      [...new Set(hhPlots.map((p) => (p.variety ? p.variety.trim() : "")).filter(Boolean))].join(", ") ||
      "Ri6 & Monthong (Dona)";
    const computedAreaHa =
      hhPlots.length > 0
        ? Number(hhPlots.reduce((sum, p) => sum + Number(p.area_ha || 0), 0).toFixed(2))
        : Number(raw.areaHa || 0);
    const computedTrees =
      hhPlots.length > 0
        ? hhPlots.reduce((sum, p) => sum + Number(p.tree_count || 0), 0)
        : Math.max(0, Math.round(computedAreaHa * 150));
    const computedPlotCount = Math.max(hhPlots.length, Number(raw.plotCount || 0));

    const [latestLotRes, latestMinute] = await Promise.all([
      this.db.query(
        `SELECT hl.id, hl.code, hl.qr_token, hl.enterprise_id, hl.coop_code, hl.harvested_on, hl.packed_on, hl.exported_on,
                hl.weight_tons::float8 AS weight_tons, hl.market, hl.status,
                hl.packhouse_code, COALESCE(hl.packhouse_name, e.name) AS packhouse_name,
                COALESCE(hl.packhouse_address, e.address) AS packhouse_address,
                hl.phytosanitary_cert_no, hl.phytosanitary_issued_on,
                hl.grade_a_pct::float8 AS grade_a_pct, hl.grade_b_pct::float8 AS grade_b_pct, hl.grade_c_pct::float8 AS grade_c_pct,
                hl.avg_brix::float8 AS avg_brix, hl.treatment_method, hl.transporter, hl.vehicle_plate,
                hl.temperature_c::float8 AS temperature_c, hl.departed_at, hl.estimated_arrival,
                hc.weight_kg::float8 AS contributed_kg
         FROM harvest_contributions hc
         JOIN harvest_lots hl ON hl.id = hc.lot_id
         LEFT JOIN enterprises e ON e.id = hl.enterprise_id
         WHERE hl.status <> 'revoked'
           AND hc.household_id = $1
         ORDER BY hl.harvested_on DESC NULLS LAST, hc.id DESC
         LIMIT 1`,
        [householdId],
      ),
      this.queryLatestScopedMinute([householdId], hhPlotCodes),
    ]);

    const linkedLot = latestLotRes.rows[0] ? camelRow<Record<string, unknown>>(latestLotRes.rows[0]) : null;
    const resolvedLinkedLotCode = linkedLot ? String(linkedLot.code) : null;
    const effectiveEnterpriseId = await this.resolveEnterprisePlotOrStampScope({
      user: ctx.user,
      householdId,
      plotCode: null,
      linkedLotEnterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
      pucCode: primaryPucCode,
    });

    const baseAccess = this.evaluateAccessAndScope(ctx, {
      targetKind: "plot",
      enterpriseId: effectiveEnterpriseId,
      coopCode: linkedLot?.coopCode ? String(linkedLot.coopCode) : "HTX-CUNE",
      villageIds: raw.villageId !== null && raw.villageId !== undefined ? [Number(raw.villageId)] : [],
      adminLocations: [adminLocation],
    });
    const temporaryGrant = await this.resolveApprovedAccessGrant(
      ctx,
      {
        scannedCode: cleanCode,
        targetKind: "plot",
        canonicalCodes: [householdCode, ...hhPlotCodes],
        resolvedLotCode: resolvedLinkedLotCode,
        pucCode: primaryPucCode,
        distinctZoneCodes: distinctZones,
      },
      true,
    );
    const access = this.elevateAccessWithGrant(baseAccess, ctx, temporaryGrant);
    const viewerTier = access.viewerTier;
    const isFullAuthorityStaff = this.isAuthenticatedAuthorityStaff(ctx.user);
    const { canReadDraftLabs, canReadViolations } = this.resolveSensitiveTracePermissions(
      viewerTier,
      ctx.user,
    );
    const verifiedLabClause = canReadDraftLabs ? "" : "AND record_status = 'verified'";

    const packhouseName = String(linkedLot?.packhouseName || DEFAULT_PACKHOUSE_NAME);
    const packhouseCode = String(linkedLot?.packhouseCode || DEFAULT_PACKHOUSE_CODE);
    const packhouseAddress = String(linkedLot?.packhouseAddress || DEFAULT_PACKHOUSE_ADDRESS);

    const [labTestsRes, live, coarseMap] = await Promise.all([
      this.db.query(
        `SELECT code, plot_code, sampled_on, cd_mg_kg::float8 AS cd_mg_kg, yellow_o_positive,
                residue_mg_kg::float8 AS residue_mg_kg, chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
                result, lab, lab_accreditation_code, external_verify_code, external_verify_url,
                ${publicAttachmentUrlSql("scan_attachment_id")} AS scan_url
         FROM lab_tests
         WHERE household_id = $1
         ${verifiedLabClause}
         ORDER BY sampled_on DESC, id DESC
         LIMIT 6`,
        [householdId],
      ),
      this.resolveLiveZoneAndPackhouseStatus({
        pucCode: primaryPucCode,
        enterpriseId: linkedLot?.enterpriseId ? Number(linkedLot.enterpriseId) : null,
        packhouseCode,
        hasPlotOrHouseholdViolation: effectiveSuspended,
        hasPendingSource: isDraftOrUnverified,
      }),
      this.resolveCoarseZoneMap(hasPlots, primaryPucCode, adminLocation),
    ]);

    const pucStatus = live.pucStatus;
    const hasRealtimeSuspension =
      live.pucStatus === "suspended" ||
      live.pucStatus === "revoked" ||
      live.packhouseStatus !== "active";

    const [verification, fieldAuditPass] = await Promise.all([
      this.recordScanAndVerify({
        scannedCode: cleanCode,
        canonicalKey: householdCode,
        resolvedLotCode: resolvedLinkedLotCode,
        traceUnit: "puc_zone",
        isRevoked: effectiveSuspended,
        hasRealtimeSuspension,
        access,
        ctx,
      }),
      temporaryGrant?.matchedViaToken
        ? Promise.resolve(null)
        : this.resolveFieldAuditPass(
            ctx,
            primaryPucCode,
            cleanCode,
            resolvedLinkedLotCode,
            true,
            distinctZones,
          ),
    ]);

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
    const lastInspectionOn = toIsoDateOnly(latestMinute?.held_on);
    const latestMinuteCode = latestMinute?.code ?? null;
    const latestMinuteOfficer = latestMinute?.officer ?? null;
    const seasonYear = harvestedOn
      ? Number(harvestedOn.slice(0, 4)) || new Date().getFullYear()
      : new Date().getFullYear();

    const isOwnerFarmer =
      ctx.user?.role === "farmer" && Number(ctx.user.householdId) === householdId;
    const isHtxOfficerInScope = ctx.user?.role === "htx_officer" && !access.scopeDenied;
    const officerFilter =
      temporaryGrant?.active && temporaryGrant.grantedTier === "authority"
        ? null
        : this.buildOfficerHouseholdFilter(ctx.user);
    const householdVisibleToOfficer =
      !officerFilter ||
      officerFilter({
        villageId: raw.villageId !== null && raw.villageId !== undefined ? Number(raw.villageId) : null,
        adminLocations: [adminLocation],
      });
    const canViewFarmerIdentity =
      hasConsent ||
      isOwnerFarmer ||
      isHtxOfficerInScope ||
      (isFullAuthorityStaff && householdVisibleToOfficer && !access.scopeDenied);
    const canSeePlotCodes =
      TIER_RANK[viewerTier] >= TIER_RANK.enterprise ||
      Boolean(fieldAuditPass?.active) ||
      isOwnerFarmer ||
      hasConsent;

    const [integritySeal, massBalance, lastCareRes, communeLotContributions] = await Promise.all([
      this.computeLedgerIntegritySummary([householdId], hhPlotCodes, harvestedOn),
      this.computeMassBalanceSummary({
        seasonYear,
        pucCode: primaryPucCode,
        lotId: linkedLot?.id ? Number(linkedLot.id) : null,
        thisLotWeightKg: linkedLot?.contributedKg ? Number(linkedLot.contributedKg) : 0,
        plotCodes: hhPlotCodes,
        householdIds: [householdId],
      }),
      this.db.query<{ last_care_on: Date | string | null }>(
        `SELECT GREATEST(
           (SELECT MAX(je.entry_on) FROM journal_entries je WHERE je.household_id = $1),
           (SELECT MAX(sr.sprayed_on) FROM spray_records sr WHERE sr.household_id = $1)
         ) AS last_care_on`,
        [householdId],
      ),
      this.queryCommuneLotContributions({
        householdId,
        plotCode: null,
        viewerUser: ctx.user,
        canSeePlotCodes,
      }),
    ]);
    const lastCareOn = toIsoDateOnly(lastCareRes.rows[0]?.last_care_on);

    const phytoCertNo = linkedLot?.phytosanitaryCertNo ? String(linkedLot.phytosanitaryCertNo) : null;
    const governance = await this.buildGovernancePayload({
      pucCode: primaryPucCode,
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
      pucCode: primaryPucCode,
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
      lotStatus: effectiveSuspended ? "revoked" : linkedLot ? String(linkedLot.status) : "sampling",
      market: String(linkedLot?.market || "Xuất khẩu chính ngạch & Nội địa"),
    });

    let enterpriseData: Record<string, unknown> | undefined;
    if (TIER_RANK[viewerTier] >= TIER_RANK.enterprise || fieldAuditPass?.active || isOwnerFarmer) {
      const tier2EvidenceLogs =
        viewerTier !== "authority"
          ? await this.queryTier2CultivationEvidence({
              householdIds: [householdId],
              plotCodes: hhPlotCodes,
              restrictToPlotCodes: false,
              canShowAllNames: canViewFarmerIdentity,
              limit: 25,
            })
          : undefined;
      enterpriseData = {
        sourceZones: [
          {
            zoneCode: primaryPucCode,
            villageName,
            householdCount: 1,
            areaHa: computedAreaHa,
            weightKg: communeLotContributions.totalContributedKg,
            sharePct: 100,
            status: pucStatus === "active" ? "Đủ điều kiện" : "Cần rà soát",
          },
        ],
        totalSourceWeightKg: communeLotContributions.totalContributedKg,
        massBalance: massBalance.enterpriseBreakdown,
        ...(tier2EvidenceLogs ? { evidenceLogs: tier2EvidenceLogs } : {}),
        fieldAuditSourcePlots: hhPlots.slice(0, 12).map((p) => ({
          plotCode: p.code,
          qrToken: p.qr_token,
          zoneCode: p.zone_code || primaryPucCode,
          variety: p.variety || varietiesDisplay,
          areaHa: p.area_ha,
          status: p.status,
        })),
        detailedLabTests: rawLabs.map((lt) => ({
          code: lt.code,
          zoneCode: primaryPucCode,
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
    if (viewerTier === "authority" && householdVisibleToOfficer) {
      const hasMilestoneTable = await this.hasTable("care_milestone_declarations");
      const safeHhName =
        isFullAuthorityStaff || hasConsent
          ? String(raw.name || "Chưa cập nhật")
          : `Hộ thành viên ${householdCode}`;
      const [diariesRes, minutesRows, violationRows] = await Promise.all([
        this.db.query(
          `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days,
                    server_recorded_at, entry_delay_hours::float8 AS entry_delay_hours, is_late_entry, record_hash,
                    gps_verified, gps_distance_m::float8 AS gps_distance_m, photo_urls
             FROM (
               SELECT sr.sprayed_on AS entry_on,
                      COALESCE(sr.plot_code, '') AS plot_code,
                      ('Phun thuốc BVTV: ' || p.name) AS activity,
                      ('Hoạt chất: ' || p.active_ingredient || ' | Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày') AS detail,
                      $2::text AS recorder,
                      $2::text AS household_name,
                      'spray'::text AS kind,
                      sr.mrl_status,
                      sr.isolation_days,
                      sr.server_recorded_at,
                      sr.entry_delay_hours,
                      sr.is_late_entry,
                      sr.record_hash,
                      false AS gps_verified,
                      NULL::numeric AS gps_distance_m,
                      ${safeFieldPhotoUrlsSql("sr.photo_ids", "sr.photo_id", hasMilestoneTable)} AS photo_urls,
                      sr.id AS sort_id
               FROM spray_records sr
               JOIN pesticides p ON p.id = sr.pesticide_id
               WHERE sr.household_id = $1
               UNION ALL
               SELECT je.entry_on,
                      je.plot_code,
                      je.activity,
                      je.detail,
                      CASE WHEN $3::boolean THEN je.recorder ELSE 'Chủ hộ thành viên HTX' END AS recorder,
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
                      ${safeFieldPhotoUrlsSql("je.photo_ids", "je.photo_id", hasMilestoneTable)} AS photo_urls,
                      je.id AS sort_id
               FROM journal_entries je
               WHERE je.household_id = $1
             ) combined
             ORDER BY entry_on DESC, sort_id DESC
             LIMIT 25`,
          [householdId, safeHhName, isFullAuthorityStaff || hasConsent],
        ),
        this.queryScopedInspectionMinutes(
          `im.code, im.held_on, im.location, im.officer, im.result,
           im.plot_code, im.gps_verified, im.gps_distance_m::float8 AS gps_distance_m,
           im.record_hash, im.server_recorded_at,
           ${safeFieldPhotoUrlsSql("im.photo_ids", "im.photo_id", false)} AS photo_urls`,
          [householdId],
          hhPlotCodes,
          8,
        ),
        canReadViolations ? this.queryScopedViolations([householdId], hhPlotCodes, 8) : Promise.resolve([]),
      ]);

      authorityData = {
        sourceHouseholds: [
          {
            householdCode,
            householdName: safeHhName,
            avatarUrl:
              isFullAuthorityStaff || hasConsent
                ? (typeof raw.avatarUrl === "string" && raw.avatarUrl ? raw.avatarUrl : null)
                : null,
            villageName,
            phone: isFullAuthorityStaff ? String(raw.phone || "") : maskFarmerPhone(raw.phone),
            cccdMasked: String(raw.cccdMasked || ""),
            status: householdStatus,
            publicTraceConsent: Boolean(raw.publicTraceConsent),
            contributedKg: communeLotContributions.totalContributedKg,
            contributedPlotCode: hhPlotCodes[0] ?? null,
            plots: hhPlots.map((p) => ({
              plotCode: p.code,
              qrToken: p.qr_token,
              zoneCode: p.zone_code || primaryPucCode,
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
          },
        ],
        cultivationDiaries: normalizeEvidenceMediaRows(diariesRes.rows),
        inspectionMinutes: normalizeEvidenceMediaRows(minutesRows),
        internalViolations: violationRows,
      };
    }

    const publicHhStatus = effectiveSuspended ? "revoked" : isDraftOrUnverified ? "unverified" : "valid";
    const farmerProfile: TraceFarmerProfile = {
      displayName:
        canViewFarmerIdentity && raw.name
          ? String(raw.name)
          : `Hộ thành viên ${householdCode}`,
      isAnonymized: !canViewFarmerIdentity,
      avatarUrl:
        canViewFarmerIdentity && typeof raw.avatarUrl === "string" && raw.avatarUrl
          ? raw.avatarUrl
          : null,
      householdCode,
      villageName,
      adminLocation: live.pucAdminLocation || adminLocation,
      cooperativeName: DEFAULT_COOP_NAME,
      plotCount: computedPlotCount,
      totalAreaHa: computedAreaHa,
      totalTrees: computedTrees,
      zoneCodes: distinctZones.length > 0 ? distinctZones : [primaryPucCode],
      varieties: varietiesDisplay,
      complianceStatus: effectiveSuspended ? "review" : isDraftOrUnverified ? "unverified" : "valid",
      ...(canSeePlotCodes && hhPlots.length > 0
        ? {
            plots: hhPlots.map((p) => ({
              plotCode: p.code,
              qrToken: p.qr_token,
              zoneCode: p.zone_code || primaryPucCode,
              areaHa: p.area_ha,
              treeCount: p.tree_count,
              variety: p.variety,
              plantedYear: p.planted_year,
              status: p.status,
            })),
          }
        : {}),
    };

    return {
      verifiedAt: verification.verifiedAt,
      isHouseholdDossier: true,
      farmerProfile,
      communeLotContributions,
      householdDossier: {
        householdCode,
        villageName,
        zoneCode: primaryPucCode,
        varieties: varietiesDisplay,
        plotCount: computedPlotCount,
        totalAreaHa: computedAreaHa,
        totalTrees: computedTrees,
        householdStatus,
        lastCareOn,
        lastInspectionOn,
        latestMinuteCode,
        latestMinuteOfficer,
        linkedLotCode: resolvedLinkedLotCode,
      },
      accessControl: this.buildAccessControlPayload(access, ctx, fieldAuditPass, temporaryGrant),
      publicData: {
        lotIdentity: {
          productName: "Sầu riêng vùng trồng liên kết hộ thành viên (Durio zibethinus)",
          variety: varietiesDisplay,
          lotCode: resolvedLinkedLotCode || primaryPucCode,
          qrToken: linkedLot?.qrToken ? String(linkedLot.qrToken) : null,
          scannedCode: cleanCode,
          traceUnit: "puc_zone",
          traceUnitLabel: `Hồ sơ Nông hộ ${householdCode} (Vùng trồng ${primaryPucCode})`,
          weightTons: Number((communeLotContributions.totalContributedKg / 1000).toFixed(3)),
          itemWeightKg: null,
          itemGrade: null,
          market: String(linkedLot?.market || "Xuất khẩu chính ngạch & Nội địa"),
          status: publicHhStatus,
          statusLabel: effectiveSuspended
            ? "Tạm dừng liên kết thu hoạch để rà soát kỹ thuật"
            : isDraftOrUnverified
              ? "Chưa kiểm chứng - Hồ sơ hộ thành viên đang chờ duyệt"
              : "Nông hộ liên kết đủ điều kiện",
          revokedReason: effectiveSuspended
            ? "Đang tạm dừng tiếp nhận nguyên liệu thương mại để rà soát kỹ thuật canh tác."
            : null,
        },
        growingZone: {
          name: live.pucName || "Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né",
          pucCode: primaryPucCode,
          additionalZoneCount: Math.max(0, distinctZones.length - 1),
          adminLocation: live.pucAdminLocation || adminLocation,
          status: pucStatus,
          statusLabel: live.pucStatusLabel,
          statusNote: live.pucNote,
          validUntil: live.pucValidUntil,
          coarseMap,
        },
        producer: {
          cooperativeName: DEFAULT_COOP_NAME,
          groupName: `Nhóm hộ liên kết ${villageName} - HTX Cư Né`,
          participatingHouseholdCount: 1,
          consentedHouseholds: hasConsent && raw.name ? [String(raw.name)] : [],
          consentNote:
            hasConsent && raw.name
              ? "Hộ thành viên đã đồng ý công khai thông tin đại diện trên hồ sơ truy xuất."
              : "Theo quy định bảo vệ dữ liệu cá nhân, số điện thoại, CCCD và tọa độ thửa riêng lẻ không hiển thị công khai.",
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
          allClear: !effectiveSuspended && !hasRealtimeSuspension && publicHhStatus === "valid",
          hasSuspensionAlert: effectiveSuspended || hasRealtimeSuspension,
          lotStatus: publicHhStatus,
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
          sampledOn: toIsoDateOnly(latestLab?.sampledOn),
        },
        timeline,
        farmingProcess: {
          standard: "VietGAP & Nghị định thư Kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
          complianceConfirmed:
            pucStatus === "active" &&
            !isDraftOrUnverified &&
            latestLab?.result !== "fail" &&
            !integritySeal.phiViolatedBeforeHarvest,
          complianceNote:
            "Canh tác theo quy trình VietGAP thống nhất của HTX Cư Né, ghi nhật ký điện tử niêm phong SHA-256 và tuân thủ thời gian cách ly thuốc BVTV.",
          inspectionNote: lastInspectionOn
            ? `Vườn của hộ đã được kiểm tra thực địa định kỳ (đợt gần nhất: ${lastInspectionOn}).`
            : "Vườn của hộ được Ban Kỹ thuật HTX Cư Né và Tổ Giám sát xã kiểm tra định kỳ.",
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
            ? "Đã cấp giấy chứng nhận kiểm dịch thực vật theo lô xuất khẩu liên kết"
            : "Cấp theo từng lô hàng xuất khẩu tại cơ sở đóng gói",
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
}
