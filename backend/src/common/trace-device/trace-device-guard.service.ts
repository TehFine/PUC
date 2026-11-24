import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { MANAGEMENT_ROLES } from "../../auth/permissions";
import { computeSessionAgentFingerprint } from "../../auth/security-defense.service";
import type { AppConfig } from "../../config/configuration";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { AppException } from "../errors/app.exception";
import { hasPublicTable } from "../sql/schema-cache";

export const TRACE_DEVICE_COOKIE = "htx_trace_did";
export const TRACE_DEVICE_MAX_STRIKES = 3;
export const TRACE_DEVICE_BLOCK_DURATION_MS = 5 * 60_000; // Tạm khóa 5 phút (300 giây)
export const TRACE_DEVICE_STRIKE_WINDOW_MS = 15 * 60_000; // Cửa sổ ghi nhận cố tình gửi lặp 15 phút

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ALERT_COOLDOWN_MS = 5 * 60_000;
const MAX_MEMORY_ENTRIES = 10_000;
const DEVICE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

interface DeviceGuardMemoryEntry {
  strikeCount: number;
  windowStartedAt: number;
  blockedUntil: number | null;
  updatedAt: number;
}

export interface ResolvedTraceDevice {
  deviceId: string;
  cookieKey: string;
  userKey: string | null;
  ipUaKey: string;
  hadValidCookie: boolean;
  strictCookieLess: boolean;
  ip: string;
  userAgent: string | undefined;
}

function normalizeIp(ip: string | undefined): string {
  const raw = (ip || "local").trim().toLowerCase();
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function readUserAgent(req: Request): string | undefined {
  const raw = req.headers["user-agent"];
  const str = Array.isArray(raw) ? raw[0] : raw;
  return typeof str === "string" && str.trim() ? str.trim().slice(0, 250) : undefined;
}

function generateDeviceId(len = 24): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += DEVICE_ID_ALPHABET[bytes[i]! % DEVICE_ID_ALPHABET.length];
  }
  return out;
}

function formatRemainingDurationVi(totalSeconds: number): string {
  const safe = Math.max(1, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins <= 0) {
    return `${secs} giây`;
  }
  if (secs === 0) {
    return `${mins} phút`;
  }
  return `${mins} phút ${secs} giây`;
}

function formatExpiryShortVi(expiresAt: Date | string | null | undefined): string | null {
  if (!expiresAt) return null;
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

@Injectable()
export class TraceDeviceGuardService {
  private readonly logger = new Logger(TraceDeviceGuardService.name);
  private readonly secret: string;
  private readonly cookieSecure: boolean;
  private readonly isTest: boolean;
  private readonly guardMap = new Map<string, DeviceGuardMemoryEntry>();
  private readonly lastAlertAt = new Map<string, number>();
  private hydratedFromDb = false;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    this.secret = config.get("jwt", { infer: true }).accessSecret;
    this.cookieSecure = config.get("cookieSecure", { infer: true });
    this.isTest = config.get("nodeEnv", { infer: true }) === "test";
  }

  /** Hỗ trợ kiểm thử tự động tua nhanh thời gian hết hạn khóa 5 phút mà không cần chờ thực tế. */
  async expireActiveBlocksForTest(): Promise<void> {
    if (!this.isTest) return;
    const past = Date.now() - 1000;
    for (const [, rec] of this.guardMap) {
      if (rec.blockedUntil !== null) {
        rec.blockedUntil = past;
      }
    }
    if (await hasPublicTable(this.db, "trace_device_guards")) {
      await this.db.query(
        "UPDATE trace_device_guards SET blocked_until = now() - interval '1 second' WHERE blocked_until IS NOT NULL",
      );
    }
  }

  private signDeviceId(deviceId: string): string {
    const mac = createHmac("sha256", this.secret)
      .update(`puc-trace-did:v1:${deviceId}`, "utf8")
      .digest("hex")
      .slice(0, 32);
    return `td1.${deviceId}.${mac}`;
  }

  private verifyDeviceCookie(rawCookie: unknown): string | null {
    if (typeof rawCookie !== "string" || rawCookie.length < 40 || rawCookie.length > 120) {
      return null;
    }
    const match = /^td1\.([A-Za-z0-9]{20,36})\.([0-9a-f]{32})$/.exec(rawCookie.trim());
    if (!match) return null;
    const [, deviceId, providedMac] = match;
    if (!deviceId || !providedMac) return null;
    const expectedMac = createHmac("sha256", this.secret)
      .update(`puc-trace-did:v1:${deviceId}`, "utf8")
      .digest("hex")
      .slice(0, 32);
    try {
      const bufA = Buffer.from(providedMac, "hex");
      const bufB = Buffer.from(expectedMac, "hex");
      if (bufA.length !== 16 || bufB.length !== 16) return null;
      return timingSafeEqual(bufA, bufB) ? deviceId : null;
    } catch {
      return null;
    }
  }

  private pruneMemory(now: number): void {
    if (this.guardMap.size <= MAX_MEMORY_ENTRIES) return;
    for (const [k, v] of this.guardMap) {
      const blockExpired = v.blockedUntil === null || v.blockedUntil <= now;
      const windowExpired = now - v.updatedAt > TRACE_DEVICE_STRIKE_WINDOW_MS;
      if (blockExpired && windowExpired) {
        this.guardMap.delete(k);
      }
    }
    if (this.guardMap.size > MAX_MEMORY_ENTRIES) {
      const oldest = this.guardMap.keys().next().value;
      if (oldest !== undefined) this.guardMap.delete(oldest);
    }
  }

  private async ensureHydrated(): Promise<void> {
    if (this.hydratedFromDb) return;
    this.hydratedFromDb = true;
    try {
      if (!(await hasPublicTable(this.db, "trace_device_guards"))) return;
      const res = await this.db.query<{
        device_key: string;
        strike_count: number;
        window_started_at: Date | string;
        blocked_until: Date | string | null;
        updated_at: Date | string;
      }>(
        `SELECT device_key, strike_count, window_started_at, blocked_until, updated_at
         FROM trace_device_guards
         WHERE (blocked_until IS NOT NULL AND blocked_until > now())
            OR updated_at >= now() - interval '15 minutes'
         LIMIT 5000`,
      );
      for (const r of res.rows) {
        this.guardMap.set(r.device_key, {
          strikeCount: Number(r.strike_count) || 0,
          windowStartedAt: new Date(r.window_started_at).getTime(),
          blockedUntil: r.blocked_until ? new Date(r.blocked_until).getTime() : null,
          updatedAt: new Date(r.updated_at).getTime(),
        });
      }
    } catch (err) {
      this.logger.warn(`Không thể nạp bộ đệm trace_device_guards: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async persistEntry(key: string, entry: DeviceGuardMemoryEntry, reason: string | null): Promise<void> {
    try {
      if (!(await hasPublicTable(this.db, "trace_device_guards"))) return;
      await this.db.query(
        `INSERT INTO trace_device_guards (device_key, strike_count, window_started_at, blocked_until, last_reason, updated_at)
         VALUES ($1, $2, to_timestamp($3 / 1000.0), $4::timestamptz, $5, now())
         ON CONFLICT (device_key) DO UPDATE
         SET strike_count = EXCLUDED.strike_count,
             window_started_at = EXCLUDED.window_started_at,
             blocked_until = EXCLUDED.blocked_until,
             last_reason = EXCLUDED.last_reason,
             updated_at = now()`,
        [
          key,
          entry.strikeCount,
          entry.windowStartedAt,
          entry.blockedUntil ? new Date(entry.blockedUntil).toISOString() : null,
          reason,
        ],
      );
    } catch (err) {
      this.logger.warn(`Lỗi ghi trace_device_guards: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  resolveDevice(req: Request, res?: Response, user?: AuthUser): ResolvedTraceDevice {
    const cookies = (req.cookies ?? {}) as Record<string, unknown>;
    const verifiedId = this.verifyDeviceCookie(cookies[TRACE_DEVICE_COOKIE]);
    const hadValidCookie = verifiedId !== null;
    const deviceId = verifiedId ?? generateDeviceId(24);
    const targetRes = res ?? req.res;

    if (!hadValidCookie && targetRes && !targetRes.headersSent) {
      targetRes.cookie(TRACE_DEVICE_COOKIE, this.signDeviceId(deviceId), {
        httpOnly: true,
        secure: this.cookieSecure,
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_MS,
      });
    }

    const ip = normalizeIp(req.ip);
    const userAgent = readUserAgent(req);
    const uaFp = computeSessionAgentFingerprint(userAgent);
    const strictCookieLess = !this.isTest || process.env.TRACE_DEVICE_STRICT_NO_COOKIE === "true";

    return {
      deviceId,
      cookieKey: `dev:${deviceId}`,
      userKey: user?.id ? `uid:${user.id}` : null,
      ipUaKey: `ipua:${ip}|${uaFp}`,
      hadValidCookie,
      strictCookieLess,
      ip,
      userAgent,
    };
  }

  private getActiveBlockUntil(key: string, now: number): number | null {
    const rec = this.guardMap.get(key);
    if (!rec || rec.blockedUntil === null) return null;
    if (rec.blockedUntil <= now) {
      rec.blockedUntil = null;
      rec.strikeCount = 0;
      rec.updatedAt = now;
      return null;
    }
    return rec.blockedUntil;
  }

  /**
   * Kiểm tra thiết bị có đang trong thời gian tạm khóa 5 phút hay không.
   * Áp dụng thống nhất trên cả cổng đọc hồ sơ QR và cổng gửi yêu cầu cấp quyền.
   */
  async assertNotBlocked(req: Request, res?: Response, user?: AuthUser): Promise<ResolvedTraceDevice> {
    await this.ensureHydrated();
    const device = this.resolveDevice(req, res, user);
    const now = Date.now();

    const keysToCheck: string[] = [];
    if (device.hadValidCookie) {
      keysToCheck.push(device.cookieKey);
    }
    if (device.userKey) {
      keysToCheck.push(device.userKey);
    }
    if (!device.hadValidCookie && !device.userKey && device.strictCookieLess) {
      keysToCheck.push(device.ipUaKey);
    }

    let maxBlockedUntil: number | null = null;
    for (const k of keysToCheck) {
      const until = this.getActiveBlockUntil(k, now);
      if (until !== null && (maxBlockedUntil === null || until > maxBlockedUntil)) {
        maxBlockedUntil = until;
      }
    }

    if (maxBlockedUntil !== null) {
      const retryAfterSeconds = Math.max(1, Math.ceil((maxBlockedUntil - now) / 1000));
      const remainLabel = formatRemainingDurationVi(retryAfterSeconds);
      throw new AppException(
        429,
        `Thiết bị đang tạm khóa truy cập do gửi lặp yêu cầu quá 3 lần. Vui lòng thử lại sau ${remainLabel}.`,
        "TRACE_DEVICE_BLOCKED",
        {
          retryAfterSeconds,
          blockedUntil: new Date(maxBlockedUntil).toISOString(),
        },
      );
    }

    return device;
  }

  async resetDeviceStrikes(device: ResolvedTraceDevice): Promise<void> {
    const primaryKey = device.hadValidCookie
      ? device.cookieKey
      : device.userKey ?? (device.strictCookieLess ? device.ipUaKey : device.cookieKey);
    const existing = this.guardMap.get(primaryKey);
    if (!existing || (existing.strikeCount === 0 && existing.blockedUntil === null)) {
      return;
    }
    const resetEntry: DeviceGuardMemoryEntry = {
      strikeCount: 0,
      windowStartedAt: Date.now(),
      blockedUntil: null,
      updatedAt: Date.now(),
    };
    this.guardMap.set(primaryKey, resetEntry);
    await this.persistEntry(primaryKey, resetEntry, null);
  }

  /**
   * Ghi nhận hành vi cố tình gửi lại yêu cầu khi thiết bị đang có yêu cầu chờ duyệt hoặc còn thời hạn xem:
   * - Lần 1 & Lần 2: cảnh báo ngắn gọn, rõ ràng (1/3, 2/3).
   * - Lần 3: tạm khóa thiết bị 5 phút trên toàn bộ trang truy xuất QR.
   */
  async recordDuplicateAttemptAndThrow(params: {
    device: ResolvedTraceDevice;
    user?: AuthUser;
    existingStatus: "pending" | "approved";
    requestCode: string;
    expiresAt: Date | string | null;
    scannedCode: string;
  }): Promise<never> {
    await this.ensureHydrated();
    const now = Date.now();
    this.pruneMemory(now);

    const { device, existingStatus, requestCode, expiresAt } = params;
    const strikeKey = device.hadValidCookie
      ? device.cookieKey
      : device.userKey ?? (device.strictCookieLess ? device.ipUaKey : device.cookieKey);

    const prev = this.guardMap.get(strikeKey);
    const isFreshWindow = !prev || now - prev.windowStartedAt > TRACE_DEVICE_STRIKE_WINDOW_MS;
    const nextStrike = isFreshWindow ? 1 : prev.strikeCount + 1;
    const windowStartedAt = isFreshWindow ? now : prev.windowStartedAt;

    if (nextStrike < TRACE_DEVICE_MAX_STRIKES) {
      const warnEntry: DeviceGuardMemoryEntry = {
        strikeCount: nextStrike,
        windowStartedAt,
        blockedUntil: null,
        updatedAt: now,
      };
      this.guardMap.set(strikeKey, warnEntry);
      await this.persistEntry(strikeKey, warnEntry, `warn_${nextStrike}_${requestCode}`);

      const expLabel = formatExpiryShortVi(expiresAt);
      const expiresIso = expiresAt ? new Date(expiresAt).toISOString() : null;

      const message =
        nextStrike === 1
          ? existingStatus === "pending"
            ? `Thiết bị đã gửi yêu cầu (${requestCode}) và đang chờ duyệt. Mỗi thiết bị chỉ gửi 1 lần, nhắc nhở 1/3 (quá 3 lần sẽ tạm khóa 5 phút).`
            : `Thiết bị còn thời hạn xem hồ sơ${expLabel ? ` đến ${expLabel}` : ""}. Hết hạn mới được yêu cầu lại, nhắc nhở 1/3 (quá 3 lần sẽ tạm khóa 5 phút).`
          : existingStatus === "pending"
            ? `Nhắc nhở 2/3: Yêu cầu ${requestCode} đang chờ duyệt. Nếu tiếp tục gửi thêm 1 lần nữa, thiết bị sẽ tạm khóa 5 phút.`
            : `Nhắc nhở 2/3: Quyền xem hồ sơ vẫn còn hiệu lực${expLabel ? ` đến ${expLabel}` : ""}. Nếu gửi thêm 1 lần nữa, thiết bị sẽ tạm khóa 5 phút.`;

      throw new AppException(429, message, "TRACE_REQUEST_WARNING", {
        strike: nextStrike,
        maxStrikes: TRACE_DEVICE_MAX_STRIKES,
        existingStatus,
        requestCode,
        expiresAt: expiresIso,
      });
    }

    // Lần cố tình thứ 3 -> Tạm khóa thiết bị 5 phút (300 giây)
    const blockedUntil = now + TRACE_DEVICE_BLOCK_DURATION_MS;
    const retryAfterSeconds = Math.ceil(TRACE_DEVICE_BLOCK_DURATION_MS / 1000);
    const lockEntry: DeviceGuardMemoryEntry = {
      strikeCount: 0,
      windowStartedAt: now,
      blockedUntil,
      updatedAt: now,
    };

    const keysToLock = new Set<string>([strikeKey, device.cookieKey]);
    if (device.userKey) {
      keysToLock.add(device.userKey);
    }
    if (!device.hadValidCookie && device.strictCookieLess) {
      keysToLock.add(device.ipUaKey);
    }

    for (const k of keysToLock) {
      this.guardMap.set(k, { ...lockEntry });
      await this.persistEntry(k, lockEntry, `blocked_5m_${requestCode}`);
    }

    const lastAlert = this.lastAlertAt.get(strikeKey);
    if (lastAlert === undefined || now - lastAlert >= ALERT_COOLDOWN_MS) {
      this.lastAlertAt.set(strikeKey, now);
      await this.audit.write(
        { ip: device.ip, user: params.user },
        {
          action: "Tạm khóa thiết bị 5 phút do gửi lặp yêu cầu QR",
          object: requestCode,
          detail: `Thiết bị cố tình gửi lặp 3 lần khi yêu cầu ${requestCode} đang ở trạng thái ${existingStatus} (mã quét: ${params.scannedCode}).`,
        },
      );

      await this.notifications.notifyRoles([...MANAGEMENT_ROLES], {
        kind: "system",
        title: `Tạm khóa 5 phút thiết bị gửi lặp yêu cầu QR (${requestCode})`,
        body: `Một thiết bị tại IP ${device.ip} cố tình gửi lặp yêu cầu cấp quyền 3 lần liên tiếp khi mã ${requestCode} còn hiệu lực. Hệ thống đã tạm khóa thiết bị 5 phút.`,
        link: `/admin?section=system&sub=trace-requests`,
      });
    }

    throw new AppException(
      429,
      "Thiết bị tạm khóa truy cập 5 phút do cố tình gửi lặp yêu cầu quá 3 lần. Vui lòng thử lại sau 5 phút.",
      "TRACE_DEVICE_BLOCKED",
      {
        retryAfterSeconds,
        blockedUntil: new Date(blockedUntil).toISOString(),
        strike: TRACE_DEVICE_MAX_STRIKES,
        maxStrikes: TRACE_DEVICE_MAX_STRIKES,
        existingStatus,
        requestCode,
      },
    );
  }
}
