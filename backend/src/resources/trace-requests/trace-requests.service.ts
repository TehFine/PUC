import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { MANAGEMENT_ROLES } from "../../auth/permissions";
import {
  CUNE_ADMIN_LOCATION,
  EAKHAL_ADMIN_LOCATION,
  isStaffInCuneCoopScope,
  matchesJurisdiction,
  resolveParcelAdminLocation,
} from "../../common/crud/village-scope";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { camelRow } from "../../common/sql/rows";
import { hasPublicColumn, hasPublicTable } from "../../common/sql/schema-cache";
import { RateLimitException } from "../../common/throttler/rate-limit.policy";
import { TraceDeviceGuardService } from "../../common/trace-device/trace-device-guard.service";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import type {
  ApproveTraceAccessRequestDto,
  CreateTraceAccessRequestDto,
  ListTraceAccessRequestsQueryDto,
  RejectOrRevokeTraceAccessRequestDto,
  TraceAccessScopeMode,
  TraceAccessTier,
} from "./trace-requests.dto";

const ROLE_LABELS_VN: Record<string, string> = {
  admin: "Quản trị viên",
  htx_head: "Trưởng HTX",
  htx_deputy: "Phó HTX",
  support_specialist: "Chuyên viên hỗ trợ hệ thống",
  htx_officer: "Cán bộ HTX",
  inspector: "Kiểm tra viên",
  village_officer: "Cán bộ Thôn",
  enterprise: "Doanh nghiệp / CSĐG",
  farmer: "Nông dân",
};

const TIER_LABELS_VN: Record<TraceAccessTier, string> = {
  enterprise: "Cấp 2 - Đánh giá Đối tác và Thực địa vườn",
  authority: "Cấp 3 - Thanh tra Quản lý toàn diện",
};

const TARGET_KIND_VN: Record<string, string> = {
  lot: "Lô hàng",
  box: "Thùng đóng gói",
  fruit: "Tem trái sầu riêng",
  plot: "Thửa đất",
};

function hashSecret(raw: string): string {
  return createHash("sha256").update(`puc-trace-req-v1:${raw}`, "utf8").digest("hex");
}

function generateAlphaNumToken(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

const TRACE_PREFIX_STRIP_RE =
  /^(?:mã\s*sự\s*kiện|ma\s*su\s*kien|sự\s*kiện|su\s*kien|mã\s*vùng|ma\s*vung|mã\s*thửa|ma\s*thua|mã\s*lô|ma\s*lo|mã\s*hộ|ma\s*ho|nông\s*hộ|nong\s*ho|thùng|thung|thửa|thua|lô|lo|hộ|ho|mã|ma|puc|phc|tem)(?:\s*[:#]\s*|\s+[-–]?\s*)/iu;
const SECRET_FAIL_WINDOW_MS = 60_000;
const SECRET_MAX_FAILS = process.env.NODE_ENV === "test" ? 30 : 12;
const DUMMY_SECRET_HASH = hashSecret("puc-dummy-nonexistent-request-secret-constant");
const REQUEST_CODE_SYNTAX_RE = /^YCCQ-\d{4}-[A-Z0-9]{4,12}$/;

function resolveRequestAdminLocation(pucCode?: string | null, scannedCode?: string | null): string {
  const z = (pucCode || "").trim();
  const s = (scannedCode || "").trim();
  if (/^66-PUC-SR0001-/i.test(z) || /^(?:66-PUC-SR0001-|EK\d)/i.test(s)) {
    return EAKHAL_ADMIN_LOCATION;
  }
  return resolveParcelAdminLocation(null, z || s);
}

function normalizeScannedLookup(raw: string): string {
  return raw
    .slice(0, 256)
    .trim()
    .replace(TRACE_PREFIX_STRIP_RE, "")
    .replace(/\s+/g, "");
}

function generateRequestCode(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[bytes[i]! % alphabet.length];
  }
  return `YCCQ-${year}-${suffix}`;
}

interface RawTraceRequestRow extends Record<string, unknown> {
  id: number;
  request_code: string;
  request_secret_hash: string;
  requester_user_id: number | null;
  requester_username: string | null;
  requester_role: string | null;
  requester_name: string;
  organization: string;
  contact_phone: string;
  purpose: string;
  scanned_code: string;
  target_kind: "lot" | "box" | "fruit" | "plot";
  resolved_lot_code: string | null;
  puc_code: string | null;
  requested_tier: TraceAccessTier;
  granted_tier: TraceAccessTier | null;
  scope_mode: TraceAccessScopeMode;
  duration_hours: number;
  status: "pending" | "approved" | "rejected" | "revoked";
  granted_pass_token: string | null;
  expires_at: Date | string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_by_role: string | null;
  review_note: string | null;
  reviewed_at: Date | string | null;
  ip: string | null;
  user_agent: string | null;
  device_fingerprint?: string | null;
  access_count: number;
  last_accessed_at: Date | string | null;
  created_at: Date | string;
}

@Injectable()
export class TraceRequestsService {
  private readonly failedSecretByIp = new Map<string, number[]>();

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly deviceGuard: TraceDeviceGuardService,
  ) {}

  private isRequestInReviewerScope(
    user: AuthUser,
    row: Pick<RawTraceRequestRow, "puc_code" | "scanned_code">,
  ): boolean {
    if (!isStaffInCuneCoopScope(user, true)) return false;
    const commune = user.assignedCommune?.trim() || "";
    if (commune) {
      const targetLoc = resolveRequestAdminLocation(row.puc_code, row.scanned_code);
      if (!matchesJurisdiction(commune, [targetLoc])) return false;
    }
    return true;
  }

  private buildReviewerCommuneSqlFilter(alias: string, user: AuthUser): string | null {
    const commune = user.assignedCommune?.trim() || "";
    if (!commune) return null;
    const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
    const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
    if (!inCune && !inEaKhal) return "1 = 0";
    const eaKhalExpr = `(COALESCE(${alias}.puc_code, '') ~* '^66-PUC-SR0001-' OR ${alias}.scanned_code ~* '^(?:66-PUC-SR0001-|EK\\d)')`;
    if (inEaKhal && !inCune) return eaKhalExpr;
    if (inCune && !inEaKhal) return `NOT ${eaKhalExpr}`;
    return null;
  }

  private checkSecretRateLimit(ip?: string): void {
    const key = (ip || "local").trim() || "local";
    const now = Date.now();
    const prev = this.failedSecretByIp.get(key);
    if (!prev) return;
    const recent = prev.filter((ts) => now - ts < SECRET_FAIL_WINDOW_MS);
    if (recent.length === 0) {
      this.failedSecretByIp.delete(key);
      return;
    }
    this.failedSecretByIp.set(key, recent);
    if (recent.length >= SECRET_MAX_FAILS) {
      const oldest = recent[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + SECRET_FAIL_WINDOW_MS - now) / 1000));
      throw new RateLimitException(
        retryAfterSec,
        "Quá nhiều lần đối chiếu khóa phiên yêu cầu không hợp lệ. Vui lòng thử lại sau ít phút.",
      );
    }
  }

  private recordFailedSecretAttempt(ip?: string): void {
    const key = (ip || "local").trim() || "local";
    const now = Date.now();
    const recent = (this.failedSecretByIp.get(key) ?? []).filter((ts) => now - ts < SECRET_FAIL_WINDOW_MS);
    recent.push(now);
    if (!this.failedSecretByIp.has(key) && this.failedSecretByIp.size >= 4000) {
      const oldestKey = this.failedSecretByIp.keys().next().value;
      if (oldestKey !== undefined) this.failedSecretByIp.delete(oldestKey);
    }
    this.failedSecretByIp.set(key, recent);
  }

  private hasTable(tableName: string): Promise<boolean> {
    return hasPublicTable(this.db, tableName);
  }

  /** Xác định mã quét thuộc loại hồ sơ nào (lô, thùng, tem trái hay thửa đất) và mã PUC liên kết. */
  private async resolveScannedTarget(rawCode: string): Promise<{
    canonicalDisplayCode: string;
    targetKind: "lot" | "box" | "fruit" | "plot";
    resolvedLotCode: string | null;
    pucCode: string | null;
  }> {
    const clean = normalizeScannedLookup(rawCode);
    if (!clean || clean.length > 128) {
      throw notFound("Không tìm thấy hồ sơ truy xuất tương ứng với mã vừa quét.");
    }
    const [hasPlots, hasSignboards, hasGrowingZones] = await Promise.all([
      this.hasTable("plots"),
      this.hasTable("plot_signboard_tokens"),
      this.hasTable("growing_zones"),
    ]);

    // 1. Thùng / Quả của lô (harvest_items)
    const itemRes = await this.db.query<{
      lot_id: number;
      item_type: string;
      serial_code: string;
    }>(
      `SELECT lot_id, item_type, serial_code
       FROM harvest_items
       WHERE qr_token = $1 OR upper(serial_code) = upper($1)
       ORDER BY (qr_token = $1) DESC
       LIMIT 1`,
      [clean],
    );

    if (itemRes.rows[0]) {
      const lotId = Number(itemRes.rows[0].lot_id);
      const [lotRes, pucCode] = await Promise.all([
        this.db.query<{ code: string }>("SELECT code FROM harvest_lots WHERE id = $1 LIMIT 1", [lotId]),
        this.resolveLotPrimaryPuc(lotId, hasPlots, hasSignboards),
      ]);
      const lotCode = lotRes.rows[0]?.code ?? null;
      return {
        canonicalDisplayCode: itemRes.rows[0].serial_code || lotCode || clean,
        targetKind: itemRes.rows[0].item_type === "fruit" ? "fruit" : "box",
        resolvedLotCode: lotCode,
        pucCode,
      };
    }

    // 2. Sự kiện chuỗi cung ứng (EVT-...) hoặc Lô hàng (harvest_lots)
    if (await this.hasTable("supply_chain_events")) {
      const evRes = await this.db.query<{ lot_id: number }>(
        `SELECT lot_id FROM supply_chain_events WHERE upper(event_code) = upper($1) LIMIT 1`,
        [clean],
      );
      if (evRes.rows[0]) {
        const lotId = Number(evRes.rows[0].lot_id);
        const [evLot, pucCode] = await Promise.all([
          this.db.query<{ code: string }>("SELECT code FROM harvest_lots WHERE id = $1 LIMIT 1", [lotId]),
          this.resolveLotPrimaryPuc(lotId, hasPlots, hasSignboards),
        ]);
        if (evLot.rows[0]) {
          return {
            canonicalDisplayCode: evLot.rows[0].code,
            targetKind: "lot",
            resolvedLotCode: evLot.rows[0].code,
            pucCode,
          };
        }
      }
    }

    const lotRes = await this.db.query<{ id: number; code: string }>(
      `SELECT id, code
       FROM harvest_lots
       WHERE qr_token = $1
          OR upper(code) = upper($1)
          OR (qr_code IS NOT NULL AND btrim(qr_code) <> '' AND upper(btrim(qr_code)) = upper(btrim($1)))
       ORDER BY (qr_token = $1) DESC, id DESC
       LIMIT 1`,
      [clean],
    );
    if (lotRes.rows[0]) {
      const pucCode = await this.resolveLotPrimaryPuc(
        Number(lotRes.rows[0].id),
        hasPlots,
        hasSignboards,
      );
      return {
        canonicalDisplayCode: lotRes.rows[0].code,
        targetKind: "lot",
        resolvedLotCode: lotRes.rows[0].code,
        pucCode,
      };
    }

    // 3. Tem nông hộ (farmer_stamps)
    const fsRes = await this.db.query<{
      household_id: number;
      plot_code: string | null;
      serial_code: string;
    }>(
      `SELECT household_id, plot_code, serial_code
       FROM farmer_stamps
       WHERE qr_token = $1 OR upper(serial_code) = upper($1)
       ORDER BY (qr_token = $1) DESC
       LIMIT 1`,
      [clean],
    );
    if (fsRes.rows[0]) {
      const pCode = fsRes.rows[0].plot_code;
      const pucCode = await this.resolvePlotZoneCode(pCode, hasPlots, hasSignboards);
      return {
        canonicalDisplayCode: fsRes.rows[0].serial_code,
        targetKind: "fruit",
        resolvedLotCode: null,
        pucCode: pucCode || null,
      };
    }

    // 4. Bảng QR Thửa đất (plots / plot_signboard_tokens)
    if (hasPlots) {
      const plRes = await this.db.query<{ code: string; zone_code: string | null }>(
        `SELECT p.code, COALESCE(p.zone_code, pst.zone_code) AS zone_code
         FROM plots p
         LEFT JOIN plot_signboard_tokens pst ON upper(pst.plot_code) = upper(p.code)
         WHERE p.qr_token = $1 OR pst.qr_token = $1 OR upper(p.code) = upper($1)
         ORDER BY (p.qr_token = $1 OR pst.qr_token = $1) DESC
         LIMIT 1`,
        [clean],
      );
      if (plRes.rows[0]) {
        return {
          canonicalDisplayCode: plRes.rows[0].code,
          targetKind: "plot",
          resolvedLotCode: null,
          pucCode: plRes.rows[0].zone_code?.trim() || null,
        };
      }
    }

    if (hasSignboards) {
      const sbRes = await this.db.query<{ plot_code: string; zone_code: string | null }>(
        `SELECT plot_code, zone_code
         FROM plot_signboard_tokens
         WHERE qr_token = $1 OR upper(plot_code) = upper($1)
         ORDER BY (qr_token = $1) DESC
         LIMIT 1`,
        [clean],
      );
      if (sbRes.rows[0]) {
        return {
          canonicalDisplayCode: sbRes.rows[0].plot_code,
          targetKind: "plot",
          resolvedLotCode: null,
          pucCode: sbRes.rows[0].zone_code?.trim() || null,
        };
      }
    }

    // 5. Mã số vùng trồng PUC (growing_zones)
    if (hasGrowingZones) {
      const gzRes = await this.db.query<{ code: string }>(
        `SELECT code FROM growing_zones WHERE upper(code) = upper($1) LIMIT 1`,
        [clean],
      );
      if (gzRes.rows[0]) {
        return {
          canonicalDisplayCode: gzRes.rows[0].code,
          targetKind: "plot",
          resolvedLotCode: null,
          pucCode: gzRes.rows[0].code.trim(),
        };
      }
    }

    // 6. Mã định danh nông hộ (households.code)
    const hhRes = await this.db.query<{ id: number; code: string }>(
      `SELECT id, code
       FROM households
       WHERE upper(btrim(code)) = upper(btrim($1))
       LIMIT 1`,
      [clean],
    );
    if (hhRes.rows[0]) {
      const hhId = Number(hhRes.rows[0].id);
      let resolvedZone: string | null = null;
      if (hasPlots) {
        const pz = await this.db.query<{ zone_code: string | null }>(
          `SELECT zone_code FROM plots
           WHERE household_id = $1 AND zone_code IS NOT NULL AND btrim(zone_code) <> ''
           ORDER BY (status = 'approved') DESC, id ASC
           LIMIT 1`,
          [hhId],
        );
        if (pz.rows[0]?.zone_code) resolvedZone = pz.rows[0].zone_code.trim();
      }
      if (!resolvedZone && hasSignboards) {
        const sz = await this.db.query<{ zone_code: string | null }>(
          `SELECT zone_code FROM plot_signboard_tokens
           WHERE household_id = $1 AND zone_code IS NOT NULL AND btrim(zone_code) <> ''
           ORDER BY plot_code ASC
           LIMIT 1`,
          [hhId],
        );
        if (sz.rows[0]?.zone_code) resolvedZone = sz.rows[0].zone_code.trim();
      }
      const derivedZone = hhRes.rows[0].code.replace(/-(?:H|T)\d+$/i, "");
      const validDerived =
        derivedZone && derivedZone !== hhRes.rows[0].code && /^(?:VN-|66-PUC-)/i.test(derivedZone)
          ? derivedZone
          : null;
      return {
        canonicalDisplayCode: hhRes.rows[0].code,
        targetKind: "plot",
        resolvedLotCode: null,
        pucCode: resolvedZone || validDerived,
      };
    }

    throw notFound("Không tìm thấy hồ sơ truy xuất tương ứng với mã vừa quét.");
  }

  private async resolveLotPrimaryPuc(
    lotId: number,
    hasPlots: boolean,
    hasSignboards: boolean,
  ): Promise<string | null> {
    if (hasPlots) {
      const res = await this.db.query<{ zone_code: string | null }>(
        `SELECT p.zone_code
         FROM harvest_contributions hc
         LEFT JOIN plots p ON (
           (hc.plot_code IS NOT NULL AND btrim(hc.plot_code) <> '' AND upper(p.code) = upper(hc.plot_code))
           OR ((hc.plot_code IS NULL OR btrim(hc.plot_code) = '') AND p.household_id = hc.household_id)
         )
         WHERE hc.lot_id = $1 AND p.zone_code IS NOT NULL AND btrim(p.zone_code) <> ''
         ORDER BY hc.weight_kg DESC, hc.id ASC
         LIMIT 1`,
        [lotId],
      );
      if (res.rows[0]?.zone_code) return res.rows[0].zone_code.trim();
    }
    if (hasSignboards) {
      const res = await this.db.query<{ zone_code: string | null }>(
        `SELECT pst.zone_code
         FROM harvest_contributions hc
         JOIN plot_signboard_tokens pst ON (
           (hc.plot_code IS NOT NULL AND btrim(hc.plot_code) <> '' AND upper(pst.plot_code) = upper(hc.plot_code))
           OR pst.household_id = hc.household_id
         )
         WHERE hc.lot_id = $1 AND pst.zone_code IS NOT NULL AND btrim(pst.zone_code) <> ''
         LIMIT 1`,
        [lotId],
      );
      if (res.rows[0]?.zone_code) return res.rows[0].zone_code.trim();
    }
    return null;
  }

  private async resolvePlotZoneCode(
    plotCode: string | null,
    hasPlots: boolean,
    hasSignboards: boolean,
  ): Promise<string | null> {
    if (!plotCode || !plotCode.trim()) return null;
    if (hasPlots) {
      const r = await this.db.query<{ zone_code: string | null }>(
        "SELECT zone_code FROM plots WHERE upper(code) = upper($1) LIMIT 1",
        [plotCode.trim()],
      );
      if (r.rows[0]?.zone_code) return r.rows[0].zone_code.trim();
    }
    if (hasSignboards) {
      const r = await this.db.query<{ zone_code: string | null }>(
        "SELECT zone_code FROM plot_signboard_tokens WHERE upper(plot_code) = upper($1) LIMIT 1",
        [plotCode.trim()],
      );
      if (r.rows[0]?.zone_code) return r.rows[0].zone_code.trim();
    }
    return null;
  }

  private sanitizeForAdmin(row: RawTraceRequestRow) {
    const rawToken = typeof row.granted_pass_token === "string" ? row.granted_pass_token : "";
    const passTokenMasked =
      rawToken.length >= 8 ? `${rawToken.slice(0, 4)}********${rawToken.slice(-3)}` : null;
    const expMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
    const isExpired =
      row.status === "approved" && expMs !== null && !Number.isNaN(expMs) && expMs <= Date.now();
    const isActiveNow = row.status === "approved" && !isExpired;
    const {
      request_secret_hash: _omitSecret,
      granted_pass_token: _omitToken,
      device_fingerprint: _omitDeviceFp,
      ...rest
    } = row;
    void _omitSecret;
    void _omitToken;
    void _omitDeviceFp;
    return {
      ...camelRow(rest),
      requesterRoleLabel: row.requester_role
        ? ROLE_LABELS_VN[row.requester_role] || row.requester_role
        : null,
      reviewedByRoleLabel: row.reviewed_by_role
        ? ROLE_LABELS_VN[row.reviewed_by_role] || row.reviewed_by_role
        : null,
      passTokenMasked,
      isExpired,
      isActiveNow,
    };
  }

  /** Khách / Đoàn công tác / Tài khoản bị hạn chế gửi yêu cầu cấp quyền xem hồ sơ đánh giá đột xuất ngay sau khi quét QR. */
  async createPublicRequest(
    dto: CreateTraceAccessRequestDto,
    ctx: { user?: AuthUser; ip?: string; userAgent?: string; req?: Request },
  ) {
    const device = ctx.req
      ? await this.deviceGuard.assertNotBlocked(ctx.req, ctx.req.res, ctx.user)
      : null;

    const cleanScanned = normalizeScannedLookup(dto.scannedCode);
    const target = await this.resolveScannedTarget(cleanScanned);
    const requestedTier: TraceAccessTier = dto.requestedTier ?? "enterprise";
    const requesterName = dto.requesterName.trim();
    const organization = dto.organization.trim();
    const contactPhone = dto.contactPhone.trim();
    const purpose = dto.purpose.trim();
    const clientSecret = generateAlphaNumToken(32);
    const secretHash = hashSecret(clientSecret);
    const hasDeviceFpCol = await hasPublicColumn(this.db, "trace_access_requests", "device_fingerprint");

    // Chính sách mỗi thiết bị chỉ được gửi 1 yêu cầu tại một thời điểm;
    // chỉ khi hết thời hạn xem (hoặc đã từ chối/thu hồi) mới được gửi yêu cầu mới.
    if (device) {
      const cookieMatchKey = device.hadValidCookie && hasDeviceFpCol ? device.cookieKey : null;
      const userMatchId = ctx.user?.id ? Number(ctx.user.id) : null;
      const useIpUaFallback =
        !device.hadValidCookie && !ctx.user?.id && device.strictCookieLess;

      if (cookieMatchKey || userMatchId !== null || useIpUaFallback) {
        const activeExistingRes = await this.db.query<RawTraceRequestRow>(
          `SELECT *
           FROM trace_access_requests
           WHERE (
             (status = 'pending' AND created_at >= now() - interval '24 hours')
             OR (status = 'approved' AND expires_at > now())
           )
           AND (
             ($1::text IS NOT NULL AND ${hasDeviceFpCol ? "device_fingerprint = $1" : "false"})
             OR ($2::bigint IS NOT NULL AND requester_user_id = $2)
             OR (
               $3::boolean = true
               AND requester_user_id IS NULL
               AND COALESCE(ip, '') = COALESCE($4::text, '')
               AND COALESCE(user_agent, '') = COALESCE($5::text, '')
             )
           )
           ORDER BY (CASE WHEN status = 'approved' THEN 0 ELSE 1 END), id DESC
           LIMIT 1`,
          [
            cookieMatchKey,
            userMatchId,
            useIpUaFallback,
            ctx.ip ?? null,
            device.userAgent ?? null,
          ],
        );

        const activeRow = activeExistingRes.rows[0];
        if (activeRow && (activeRow.status === "pending" || activeRow.status === "approved")) {
          return this.deviceGuard.recordDuplicateAttemptAndThrow({
            device,
            user: ctx.user,
            existingStatus: activeRow.status,
            requestCode: activeRow.request_code,
            expiresAt: activeRow.expires_at,
            scannedCode: target.canonicalDisplayCode,
          });
        }
      }

      await this.deviceGuard.resetDeviceStrikes(device);
    }

    // Chốt chặn bổ sung theo IP cho lưu lượng ẩn danh chống botnet phân tán không giữ cookie
    if (!ctx.user?.id) {
      const pendingByIp = await this.db.query<{ same_code_cnt: number; total_ip_cnt: number }>(
        `SELECT COUNT(*) FILTER (WHERE upper(scanned_code) = upper($1))::int AS same_code_cnt,
                COUNT(*)::int AS total_ip_cnt
         FROM trace_access_requests
         WHERE status = 'pending'
           AND created_at >= now() - interval '2 hours'
           AND requester_user_id IS NULL
           AND COALESCE(ip, '') = COALESCE($2::text, '')`,
        [cleanScanned, ctx.ip ?? null],
      );
      if (
        (pendingByIp.rows[0]?.same_code_cnt ?? 0) >= 6 ||
        (pendingByIp.rows[0]?.total_ip_cnt ?? 0) >= 12
      ) {
        throw new RateLimitException(
          120,
          "Đã có nhiều yêu cầu đang chờ phê duyệt từ kết nối này. Vui lòng đợi Ban quản trị xử lý.",
        );
      }
    }

    const requestCode = generateRequestCode();
    const deviceFpToStore = device ? device.cookieKey : null;
    const uaToStore = ctx.userAgent ? ctx.userAgent.trim().slice(0, 250) : null;

    const ins = hasDeviceFpCol
      ? await this.db.query<RawTraceRequestRow>(
          `INSERT INTO trace_access_requests (
             request_code, request_secret_hash,
             requester_user_id, requester_username, requester_role,
             requester_name, organization, contact_phone, purpose,
             scanned_code, target_kind, resolved_lot_code, puc_code,
             requested_tier, scope_mode, duration_hours, status,
             ip, user_agent, device_fingerprint
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'record', 24, 'pending', $15, $16, $17)
           RETURNING *`,
          [
            requestCode,
            secretHash,
            ctx.user?.id ?? null,
            ctx.user?.username ?? null,
            ctx.user?.role ?? null,
            requesterName,
            organization,
            contactPhone,
            purpose,
            cleanScanned,
            target.targetKind,
            target.resolvedLotCode,
            target.pucCode,
            requestedTier,
            ctx.ip ?? null,
            uaToStore,
            deviceFpToStore,
          ],
        )
      : await this.db.query<RawTraceRequestRow>(
          `INSERT INTO trace_access_requests (
             request_code, request_secret_hash,
             requester_user_id, requester_username, requester_role,
             requester_name, organization, contact_phone, purpose,
             scanned_code, target_kind, resolved_lot_code, puc_code,
             requested_tier, scope_mode, duration_hours, status,
             ip, user_agent
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'record', 24, 'pending', $15, $16)
           RETURNING *`,
          [
            requestCode,
            secretHash,
            ctx.user?.id ?? null,
            ctx.user?.username ?? null,
            ctx.user?.role ?? null,
            requesterName,
            organization,
            contactPhone,
            purpose,
            cleanScanned,
            target.targetKind,
            target.resolvedLotCode,
            target.pucCode,
            requestedTier,
            ctx.ip ?? null,
            uaToStore,
          ],
        );
    const saved = ins.rows[0]!;

    const kindLabel = TARGET_KIND_VN[saved.target_kind] || "Hồ sơ";
    const displayRef = target.canonicalDisplayCode;
    const roleTag = ctx.user
      ? ` [Tài khoản: ${ctx.user.fullName} - ${ROLE_LABELS_VN[ctx.user.role] || ctx.user.role}]`
      : " [Khách quét QR tại hiện trường]";

    await this.notifications.notifyRoles(
      [...MANAGEMENT_ROLES],
      {
        kind: "approval",
        title: `Yêu cầu cấp quyền xem hồ sơ QR (${saved.request_code})`,
        body: `${requesterName} (${organization}, SĐT: ${contactPhone})${roleTag} đề nghị mở ${TIER_LABELS_VN[requestedTier]} cho ${kindLabel} ${displayRef}. Nội dung: ${purpose}`,
        link: `/admin?section=system&sub=trace-requests&id=${saved.id}`,
      },
      ctx.user ? { excludeUserId: ctx.user.id } : undefined,
    );

    await this.audit.write(
      { ip: ctx.ip, user: ctx.user },
      {
        action: "Gửi yêu cầu cấp quyền truy xuất đột xuất",
        object: saved.request_code,
        detail: `${requesterName} (${organization}) - ${kindLabel} ${displayRef} - Đề nghị: ${TIER_LABELS_VN[requestedTier]}`,
      },
    );

    return {
      requestCode: saved.request_code,
      status: saved.status,
      requestedTier: saved.requested_tier,
      targetKind: saved.target_kind,
      targetDisplayCode: displayRef,
      pucCode: saved.puc_code,
      createdAt: saved.created_at,
      clientSecret,
    };
  }

  /** Kiểm tra trạng thái phê duyệt theo thời gian thực cho đúng thiết bị hoặc tài khoản đã gửi yêu cầu. */
  async getPublicRequestStatus(
    requestCode: string,
    ctx: { user?: AuthUser; ip?: string; clientSecret?: string; req?: Request },
  ) {
    if (ctx.req) {
      await this.deviceGuard.assertNotBlocked(ctx.req, ctx.req.res, ctx.user);
    }
    this.checkSecretRateLimit(ctx.ip);
    const cleanCode = requestCode.trim().toUpperCase();
    if (!cleanCode || !REQUEST_CODE_SYNTAX_RE.test(cleanCode)) {
      throw notFound("Không tìm thấy yêu cầu cấp quyền.");
    }

    const res = await this.db.query<RawTraceRequestRow>(
      "SELECT * FROM trace_access_requests WHERE upper(request_code) = $1 LIMIT 1",
      [cleanCode],
    );
    const row = res.rows[0];
    if (!row) {
      const dummyCandidate = Buffer.from(hashSecret(ctx.clientSecret?.trim() || "invalid"), "utf8");
      const dummyStored = Buffer.from(DUMMY_SECRET_HASH, "utf8");
      if (dummyCandidate.length === dummyStored.length) {
        timingSafeEqual(dummyCandidate, dummyStored);
      }
      this.recordFailedSecretAttempt(ctx.ip);
      throw forbidden("Bạn không có quyền truy cập trạng thái của yêu cầu này.");
    }

    const isOwnerUser =
      Boolean(ctx.user?.id) &&
      row.requester_user_id !== null &&
      Number(ctx.user!.id) === Number(row.requester_user_id);

    let hasValidSecret = false;
    if (ctx.clientSecret && ctx.clientSecret.trim()) {
      const candidateHash = Buffer.from(hashSecret(ctx.clientSecret.trim()), "utf8");
      const storedHash = Buffer.from(row.request_secret_hash, "utf8");
      if (
        candidateHash.length === storedHash.length &&
        timingSafeEqual(candidateHash, storedHash)
      ) {
        hasValidSecret = true;
      }
    }

    if (!isOwnerUser && !hasValidSecret) {
      this.recordFailedSecretAttempt(ctx.ip);
      throw forbidden("Bạn không có quyền truy cập trạng thái của yêu cầu này.");
    }

    const expMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
    const isExpired =
      row.status === "approved" && expMs !== null && !Number.isNaN(expMs) && expMs <= Date.now();
    const effectiveStatus = isExpired ? "expired" : row.status;

    return {
      id: Number(row.id),
      requestCode: row.request_code,
      status: effectiveStatus,
      requestedTier: row.requested_tier,
      grantedTier: row.granted_tier,
      scopeMode: row.scope_mode,
      expiresAt: row.expires_at,
      reviewedByName: row.reviewed_by_name,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      grantedPassToken:
        row.status === "approved" && !isExpired ? row.granted_pass_token : null,
    };
  }

  /** Danh sách yêu cầu cấp quyền xem hồ sơ QR dành cho Ban quản trị HTX. */
  async list(query: ListTraceAccessRequestsQueryDto, user: AuthUser) {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safePageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
    if (!isStaffInCuneCoopScope(user, true)) {
      return { data: [], total: 0, pendingCount: 0, activeCount: 0, page: safePage, pageSize: safePageSize };
    }
    const offset = (safePage - 1) * safePageSize;

    const params: unknown[] = [];
    const conds: string[] = [];
    const communeCond = this.buildReviewerCommuneSqlFilter("r", user);
    if (communeCond) {
      conds.push(communeCond);
    }

    if (query.status === "active") {
      conds.push(`r.status = 'approved' AND r.expires_at > now()`);
    } else if (query.status === "expired") {
      conds.push(`r.status = 'approved' AND r.expires_at <= now()`);
    } else if (query.status) {
      params.push(query.status);
      conds.push(`r.status = $${params.length}`);
    }

    if (query.requestedTier) {
      params.push(query.requestedTier);
      conds.push(`r.requested_tier = $${params.length}`);
    }

    if (query.q && query.q.trim()) {
      params.push(`%${query.q.trim()}%`);
      const p = `$${params.length}`;
      conds.push(
        `(r.request_code ILIKE ${p} OR r.requester_name ILIKE ${p} OR r.organization ILIKE ${p} OR r.contact_phone ILIKE ${p} OR r.scanned_code ILIKE ${p} OR COALESCE(r.resolved_lot_code, '') ILIKE ${p} OR COALESCE(r.puc_code, '') ILIKE ${p})`,
      );
    }

    const whereSql = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const statsWhereSql = communeCond ? `WHERE ${communeCond}` : "";

    const [rowsRes, countRes, statsRes] = await Promise.all([
      this.db.query<RawTraceRequestRow>(
        `SELECT r.*
         FROM trace_access_requests r
         ${whereSql}
         ORDER BY (CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END), r.created_at DESC, r.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, safePageSize, offset],
      ),
      this.db.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM trace_access_requests r ${whereSql}`,
        params,
      ),
      this.db.query<{ pending_count: number; active_count: number }>(
        `SELECT COUNT(*) FILTER (WHERE r.status = 'pending')::int AS pending_count,
                COUNT(*) FILTER (WHERE r.status = 'approved' AND r.expires_at > now())::int AS active_count
         FROM trace_access_requests r
         ${statsWhereSql}`,
      ),
    ]);

    return {
      data: rowsRes.rows.map((r) => this.sanitizeForAdmin(r)),
      total: countRes.rows[0]?.total ?? 0,
      pendingCount: statsRes.rows[0]?.pending_count ?? 0,
      activeCount: statsRes.rows[0]?.active_count ?? 0,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  /** Quản trị viên / Trưởng-Phó HTX phê duyệt và mở khóa quyền xem hồ sơ đánh giá ngay tức thời. */
  async approve(
    id: number,
    user: AuthUser,
    dto: ApproveTraceAccessRequestDto,
    ip?: string,
  ) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền phê duyệt yêu cầu cấp quyền ngoài phạm vi đơn vị.");
    }
    const existingRes = await this.db.query<RawTraceRequestRow>(
      "SELECT * FROM trace_access_requests WHERE id = $1 LIMIT 1",
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) throw notFound("Không tìm thấy yêu cầu cấp quyền.");
    if (!this.isRequestInReviewerScope(user, existing)) {
      throw forbidden("Yêu cầu này nằm ngoài địa bàn xã được phân công quản lý của bạn.");
    }
    if (existing.status !== "pending") {
      throw badRequest("Yêu cầu này đã được xử lý trước đó.");
    }
    if (existing.requester_user_id !== null && Number(existing.requester_user_id) === Number(user.id)) {
      throw forbidden("Không thể tự phê duyệt yêu cầu cấp quyền của chính tài khoản đang đăng nhập.");
    }

    const grantedTier: TraceAccessTier = dto.grantedTier ?? existing.requested_tier;
    const scopeMode: TraceAccessScopeMode = dto.scopeMode ?? existing.scope_mode ?? "record";
    if (
      scopeMode === "coop" &&
      user.role !== "admin" &&
      user.role !== "htx_head" &&
      user.role !== "htx_deputy"
    ) {
      throw forbidden("Chỉ Quản trị viên hoặc Ban giám đốc HTX mới được cấp quyền phạm vi toàn Hợp tác xã.");
    }
    if (
      scopeMode === "coop" &&
      user.assignedCommune?.trim() &&
      !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])
    ) {
      throw forbidden("Tài khoản giới hạn theo địa bàn xã không được cấp quyền phạm vi toàn Hợp tác xã.");
    }
    if (
      scopeMode === "zone" &&
      !existing.puc_code &&
      user.assignedCommune?.trim() &&
      !matchesJurisdiction(user.assignedCommune, [CUNE_ADMIN_LOCATION])
    ) {
      throw forbidden("Không xác định được mã vùng trồng thuộc xã quản lý để mở quyền theo vùng.");
    }
    const durationHours = dto.durationHours && dto.durationHours > 0 ? dto.durationHours : 24;
    const grantedPassToken = generateAlphaNumToken(32);
    const reviewNote = dto.note?.trim() || null;

    const upd = await this.db.query<RawTraceRequestRow>(
      `UPDATE trace_access_requests
       SET status = 'approved',
           granted_tier = $2,
           scope_mode = $3,
           duration_hours = $4,
           granted_pass_token = $5,
           expires_at = now() + ($4::int || ' hours')::interval,
           reviewed_by = $6,
           reviewed_by_name = $7,
           reviewed_by_role = $8,
           review_note = $9,
           reviewed_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [
        id,
        grantedTier,
        scopeMode,
        durationHours,
        grantedPassToken,
        user.id,
        user.fullName,
        user.role,
        reviewNote,
      ],
    );
    const updated = upd.rows[0];
    if (!updated) throw badRequest("Yêu cầu đã được người quản trị khác xử lý.");
    this.db.cache?.invalidateTags(["trace"], true);

    const kindLabel = TARGET_KIND_VN[updated.target_kind] || "Hồ sơ";
    const targetRef = updated.resolved_lot_code || updated.scanned_code;

    if (updated.requester_user_id) {
      await this.notifications.notifyUsers([Number(updated.requester_user_id)], {
        kind: "approval",
        title: `Đã cấp quyền xem hồ sơ đánh giá (${updated.request_code})`,
        body: `${user.fullName} (${ROLE_LABELS_VN[user.role] || user.role}) đã phê duyệt mở ${TIER_LABELS_VN[grantedTier]} trong ${durationHours} giờ cho ${kindLabel} ${targetRef}.${reviewNote ? ` Ghi chú: ${reviewNote}` : ""}`,
        link: `/trace/${encodeURIComponent(updated.scanned_code)}`,
      });
    }

    await this.notifications.notifyRoles(
      [...MANAGEMENT_ROLES],
      {
        kind: "approval",
        title: `Đã duyệt cấp quyền QR ${updated.request_code}`,
        body: `${user.fullName} đã mở ${TIER_LABELS_VN[grantedTier]} (${durationHours} giờ) cho đoàn "${updated.organization}" (${updated.requester_name}).`,
        link: `/admin?section=system&sub=trace-requests&id=${updated.id}`,
      },
      { excludeUserId: user.id },
    );

    await this.audit.write(
      { ip, user },
      {
        action: "Phê duyệt cấp quyền truy xuất đột xuất",
        object: updated.request_code,
        detail: `${updated.requester_name} (${updated.organization}) - Mở ${TIER_LABELS_VN[grantedTier]}, phạm vi: ${scopeMode}, hiệu lực: ${durationHours}h`,
      },
    );

    return this.sanitizeForAdmin(updated);
  }

  /** Từ chối yêu cầu cấp quyền truy xuất đột xuất. */
  async reject(
    id: number,
    user: AuthUser,
    dto: RejectOrRevokeTraceAccessRequestDto,
    ip?: string,
  ) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền từ chối yêu cầu cấp quyền ngoài phạm vi đơn vị.");
    }
    const existingRes = await this.db.query<RawTraceRequestRow>(
      "SELECT * FROM trace_access_requests WHERE id = $1 LIMIT 1",
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) throw notFound("Không tìm thấy yêu cầu cấp quyền.");
    if (!this.isRequestInReviewerScope(user, existing)) {
      throw forbidden("Yêu cầu này nằm ngoài địa bàn xã được phân công quản lý của bạn.");
    }
    const reviewNote = dto.note?.trim() || null;
    const upd = await this.db.query<RawTraceRequestRow>(
      `UPDATE trace_access_requests
       SET status = 'rejected',
           reviewed_by = $2,
           reviewed_by_name = $3,
           reviewed_by_role = $4,
           review_note = $5,
           reviewed_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, user.id, user.fullName, user.role, reviewNote],
    );
    const updated = upd.rows[0];
    if (!updated) {
      throw badRequest("Không tìm thấy yêu cầu đang chờ duyệt tương ứng.");
    }
    this.db.cache?.invalidateTags(["trace"], true);

    if (updated.requester_user_id) {
      await this.notifications.notifyUsers([Number(updated.requester_user_id)], {
        kind: "approval",
        title: `Từ chối yêu cầu cấp quyền QR (${updated.request_code})`,
        body: `${user.fullName} đã từ chối yêu cầu mở quyền xem hồ sơ ${updated.scanned_code}.${reviewNote ? ` Lý do: ${reviewNote}` : ""}`,
        link: `/trace/${encodeURIComponent(updated.scanned_code)}`,
      });
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Từ chối yêu cầu cấp quyền truy xuất",
        object: updated.request_code,
        detail: `${updated.requester_name} (${updated.organization})${reviewNote ? ` - Lý do: ${reviewNote}` : ""}`,
      },
    );

    return this.sanitizeForAdmin(updated);
  }

  /** Thu hồi từ xa quyền xem hồ sơ đã cấp (khóa ngay lập tức trên thiết bị của đoàn công tác). */
  async revoke(
    id: number,
    user: AuthUser,
    dto: RejectOrRevokeTraceAccessRequestDto,
    ip?: string,
  ) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền thu hồi yêu cầu cấp quyền ngoài phạm vi đơn vị.");
    }
    const existingRes = await this.db.query<RawTraceRequestRow>(
      "SELECT * FROM trace_access_requests WHERE id = $1 LIMIT 1",
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) throw notFound("Không tìm thấy yêu cầu cấp quyền.");
    if (!this.isRequestInReviewerScope(user, existing)) {
      throw forbidden("Yêu cầu này nằm ngoài địa bàn xã được phân công quản lý của bạn.");
    }
    const note = dto.note?.trim() || null;
    const upd = await this.db.query<RawTraceRequestRow>(
      `UPDATE trace_access_requests
       SET status = 'revoked',
           granted_pass_token = NULL,
           review_note = COALESCE($5, review_note),
           reviewed_by = $2,
           reviewed_by_name = $3,
           reviewed_by_role = $4,
           reviewed_at = now()
       WHERE id = $1 AND status = 'approved'
       RETURNING *`,
      [id, user.id, user.fullName, user.role, note],
    );
    const updated = upd.rows[0];
    if (!updated) {
      throw badRequest("Yêu cầu này hiện không ở trạng thái đang cấp quyền.");
    }
    this.db.cache?.invalidateTags(["trace"], true);

    if (updated.requester_user_id) {
      await this.notifications.notifyUsers([Number(updated.requester_user_id)], {
        kind: "approval",
        title: `Đã thu hồi quyền xem mở rộng (${updated.request_code})`,
        body: `Phiên quyền xem mở rộng cho hồ sơ ${updated.scanned_code} đã kết thúc theo thao tác của ${user.fullName}.`,
        link: `/trace/${encodeURIComponent(updated.scanned_code)}`,
      });
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Thu hồi quyền truy xuất đột xuất",
        object: updated.request_code,
        detail: `${updated.requester_name} (${updated.organization})${note ? ` - Ghi chú: ${note}` : ""}`,
      },
    );

    return this.sanitizeForAdmin(updated);
  }
}

