import { randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import { AuditService } from "../audit/audit.service";
import { buildTwoFactorKeyring, isSealed, openString, sealString, type TwoFactorKeyring } from "../common/crypto/secret-box";
import {
  buildOtpAuthUrl,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  hashBackupCode,
  hashBackupCodeV2,
  verifyTotpCode,
} from "../common/crypto/totp";
import { AppException, badRequest, notFound, unauthorized } from "../common/errors/app.exception";
import type { AppConfig } from "../config/configuration";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthUser } from "./auth-user";
import type {
  ChangePasswordDto,
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  ForgotPasswordCccdDto,
  ForgotPasswordRequestDto,
  GoogleLoginDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
  VerifyOtpChallengeDto,
} from "./dto/auth.dto";
import { isManagementRole, permissionsFor, type Action, type Role } from "./permissions";
import { TokensService } from "./tokens.service";

const MAX_FAILED_LOGINS = 5;
const GLOBAL_DB_LOCK_FAILED_LOGINS = 50;
const LOCK_MINUTES = 15;
const REUSE_GRACE_MS = 2_000;
const MAX_ACTIVE_SESSIONS_PER_USER = 10;
const MAX_SESSION_FAMILY_DAYS = 30;
const OTP_CHALLENGE_TTL_MIN = 5;
const MAX_OTP_CHALLENGE_ATTEMPTS = 5;
/** Ngưỡng nhập sai OTP cấp người dùng (cộng dồn qua mọi phiên thử thách); mỗi lần chạm ngưỡng khóa lâu gấp đôi. */
const MAX_OTP_USER_FAILURES = 5;
const OTP_LOCK_MAX_MINUTES = 1440;
const MAX_PASSWORD_UTF8_BYTES = 72;
const CCCD_MAX_FAILED_ATTEMPTS = 3;
const CCCD_IP_MAX_FAILED_ATTEMPTS = 10;
const CCCD_LOCK_TIERS_MINUTES = [30, 120, 1440] as const;
const MAX_TRACKED_RATE_KEYS = 10_000;
/** Khi vượt trần, dọn xuống còn 90% để không phải sắp xếp lại toàn bộ bảng ở mỗi lần ghi nhận lỗi. */
const PRUNE_TARGET_RATE_KEYS = Math.floor(MAX_TRACKED_RATE_KEYS * 0.9);
const ANONYMOUS_AUDIT_ACTOR = { id: null, name: "Khách (chưa xác thực)" } as const;

// Băm giả để thời gian phản hồi không lộ việc tài khoản có tồn tại hay không.
const DUMMY_HASH = bcrypt.hashSync("không-phải-mật-khẩu-thật", 12);

function normalizePasswordInput(raw: string): string {
  const normalized = raw.normalize("NFC");
  if (Buffer.byteLength(normalized, "utf8") > MAX_PASSWORD_UTF8_BYTES) {
    throw badRequest("Mật khẩu tối đa 72 byte UTF-8.");
  }
  return normalized;
}

function normalizePersonName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function constantTimeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface LoginAttemptBucket {
  failures: number;
  lockedUntil: number;
  updatedAt: number;
}

interface CccdCooldownBucket {
  failures: number;
  tier: number;
  lockedUntil: number;
  updatedAt: number;
}

interface UserRow {
  id: number;
  full_name: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: Role;
  status: string;
  village_id: number | null;
  household_id: number | null;
  enterprise_id: number | null;
  assigned_commune: string | null;
  assigned_region: string | null;
  coop_code: string;
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  two_factor_backup_codes: unknown;
  two_factor_last_used_step: string | number | null;
  two_factor_failed_count: number;
  failed_login_count: number;
  locked_until: Date | null;
  token_version: number;
}

const SYNTHETIC_EMAIL_RE = /(?:^nongho\.[0-9]+@gmail\.com$|\.htxcune@gmail\.com$)/i;

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionResult {
  user: AuthUser;
  permissions: Record<string, Action[]>;
}

export interface MfaChallengeResult {
  mfaRequired: true;
  challengeToken: string;
  username: string;
  fullName: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId?: number;
}

export type LoginOutcome = (SessionResult & { tokens: IssuedTokens }) | MfaChallengeResult;

@Injectable()
export class AuthService {
  private readonly refreshTtlDays: number;
  private readonly isProduction: boolean;
  private readonly googleClientId?: string;
  private readonly allowDevDemoLogin: boolean;
  private readonly loginFailuresByIpUser = new Map<string, LoginAttemptBucket>();
  private readonly cccdCooldownByKey = new Map<string, CccdCooldownBucket>();
  private readonly twoFactorKeys: TwoFactorKeyring;

  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.refreshTtlDays = config.get("jwt", { infer: true }).refreshTtlDays;
    this.isProduction = config.get("isProduction", { infer: true });
    this.googleClientId = config.get("googleClientId", { infer: true });
    this.allowDevDemoLogin = config.get("allowDevDemoLogin", { infer: true });
    this.twoFactorKeys = buildTwoFactorKeyring({
      totpEncryptionKey: config.get("totpEncryptionKey", { infer: true }),
      jwtAccessSecret: config.get("jwt", { infer: true }).accessSecret,
    });
  }

  private static readonly USER_AUTH_COLUMNS = `
    u.id, u.full_name, u.username, u.email, u.password_hash, u.role, u.status,
    u.village_id, u.household_id, u.enterprise_id, u.assigned_commune, u.assigned_region,
    u.coop_code, u.two_factor_enabled, u.two_factor_secret, u.two_factor_backup_codes,
    u.two_factor_last_used_step, u.two_factor_failed_count, u.failed_login_count, u.locked_until, u.token_version
  `;

  private loginPairKey(ip: string | undefined, username: string): string {
    const cleanIp = (ip || "unknown").trim().toLowerCase();
    const cleanUser = username.normalize("NFC").trim().toLowerCase();
    return `${cleanIp}|${cleanUser}`;
  }

  /**
   * Giới hạn bộ nhớ của bảng đếm lỗi: ưu tiên xóa mục hết hạn, rồi mục chưa bị khóa cũ nhất; chỉ khi toàn bộ còn lại
   * đang bị khóa mới xóa mục sắp hết hạn khóa nhất. Kẻ tấn công không thể xả khóa của nạn nhân bằng cách bơm khóa mới.
   */
  private pruneMap<T extends { updatedAt: number; lockedUntil: number }>(map: Map<string, T>, maxAgeMs: number): void {
    if (map.size <= MAX_TRACKED_RATE_KEYS) return;
    const now = Date.now();
    for (const [k, v] of map) {
      if (v.lockedUntil <= now && now - v.updatedAt > maxAgeMs) {
        map.delete(k);
      }
    }
    if (map.size <= PRUNE_TARGET_RATE_KEYS) return;

    const unlocked = [...map].filter(([, v]) => v.lockedUntil <= now).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (const [k] of unlocked) {
      if (map.size <= PRUNE_TARGET_RATE_KEYS) return;
      map.delete(k);
    }

    if (map.size <= MAX_TRACKED_RATE_KEYS) return;
    const locked = [...map].sort((a, b) => a[1].lockedUntil - b[1].lockedUntil);
    for (const [k] of locked) {
      if (map.size <= MAX_TRACKED_RATE_KEYS) return;
      map.delete(k);
    }
  }

  private isLoginPairLocked(ip: string | undefined, username: string): boolean {
    const key = this.loginPairKey(ip, username);
    const bucket = this.loginFailuresByIpUser.get(key);
    if (!bucket) return false;
    const now = Date.now();
    if (bucket.lockedUntil > now) return true;
    if (now - bucket.updatedAt > LOCK_MINUTES * 60_000) {
      this.loginFailuresByIpUser.delete(key);
    }
    return false;
  }

  private recordLoginPairFailure(ip: string | undefined, username: string): void {
    const key = this.loginPairKey(ip, username);
    const now = Date.now();
    const existing = this.loginFailuresByIpUser.get(key);
    if (existing && existing.lockedUntil > now) {
      this.loginFailuresByIpUser.set(key, {
        failures: 0,
        lockedUntil: existing.lockedUntil,
        updatedAt: now,
      });
      return;
    }
    const baseFailures =
      existing && now - existing.updatedAt <= LOCK_MINUTES * 60_000
        ? existing.failures
        : 0;
    const nextFailures = baseFailures + 1;
    const shouldLock = nextFailures >= MAX_FAILED_LOGINS;
    this.loginFailuresByIpUser.set(key, {
      failures: shouldLock ? 0 : nextFailures,
      lockedUntil: shouldLock ? now + LOCK_MINUTES * 60_000 : 0,
      updatedAt: now,
    });
    this.pruneMap(this.loginFailuresByIpUser, LOCK_MINUTES * 60_000);
  }

  private clearLoginPairFailures(ip: string | undefined, username: string): void {
    this.loginFailuresByIpUser.delete(this.loginPairKey(ip, username));
  }

  private isCccdResetLocked(ip: string | undefined, username: string, userId?: number): boolean {
    const now = Date.now();
    const cleanIp = (ip || "unknown").trim().toLowerCase();
    const cleanUser = username.normalize("NFC").trim().toLowerCase();
    const keys = [`pair:${cleanIp}|${cleanUser}`, `ip:${cleanIp}`];
    if (userId !== undefined) {
      keys.push(`acct:${userId}`);
    } else {
      keys.push(`uname:${cleanUser}`);
    }
    for (const k of keys) {
      const bucket = this.cccdCooldownByKey.get(k);
      if (bucket && bucket.lockedUntil > now) return true;
    }
    return false;
  }

  private bumpCccdBucket(key: string, threshold: number, now: number): number {
    const prev = this.cccdCooldownByKey.get(key);
    const stale = prev ? now - prev.updatedAt > 24 * 60 * 60_000 : true;
    const failures = (stale ? 0 : (prev?.failures ?? 0)) + 1;
    let tier = stale ? 0 : (prev?.tier ?? 0);
    let lockedUntil = prev?.lockedUntil && prev.lockedUntil > now ? prev.lockedUntil : 0;
    let lockMinutes = 0;

    if (failures >= threshold) {
      const tierIdx = Math.min(tier, CCCD_LOCK_TIERS_MINUTES.length - 1);
      lockMinutes = CCCD_LOCK_TIERS_MINUTES[tierIdx];
      lockedUntil = now + lockMinutes * 60_000;
      tier += 1;
      this.cccdCooldownByKey.set(key, { failures: 0, tier, lockedUntil, updatedAt: now });
    } else {
      this.cccdCooldownByKey.set(key, { failures, tier, lockedUntil, updatedAt: now });
    }
    return lockMinutes;
  }

  private recordCccdResetFailure(ip: string | undefined, username: string, userId?: number): number {
    const now = Date.now();
    const cleanIp = (ip || "unknown").trim().toLowerCase();
    const cleanUser = username.normalize("NFC").trim().toLowerCase();
    const pairLock = this.bumpCccdBucket(`pair:${cleanIp}|${cleanUser}`, CCCD_MAX_FAILED_ATTEMPTS, now);
    const ipLock = this.bumpCccdBucket(`ip:${cleanIp}`, CCCD_IP_MAX_FAILED_ATTEMPTS, now);
    const acctLock = this.bumpCccdBucket(
      userId !== undefined ? `acct:${userId}` : `uname:${cleanUser}`,
      CCCD_MAX_FAILED_ATTEMPTS,
      now,
    );
    this.pruneMap(this.cccdCooldownByKey, 24 * 60 * 60_000);
    return Math.max(pairLock, ipLock, acctLock);
  }

  private clearCccdResetFailures(ip: string | undefined, username: string, userId: number): void {
    const cleanIp = (ip || "unknown").trim().toLowerCase();
    const cleanUser = username.normalize("NFC").trim().toLowerCase();
    this.cccdCooldownByKey.delete(`pair:${cleanIp}|${cleanUser}`);
    this.cccdCooldownByKey.delete(`acct:${userId}`);
    this.cccdCooldownByKey.delete(`uname:${cleanUser}`);
  }

  private matchTotpStep(secretBase32: string, rawCode: string, windowSteps = 1, nowMs = Date.now()): number | null {
    const clean = rawCode.replace(/\s+/g, "");
    if (!/^[0-9]{6}$/.test(clean)) return null;
    if (!verifyTotpCode(secretBase32, clean, windowSteps, nowMs)) return null;
    const baseStep = Math.floor(nowMs / 30_000);
    const candidateBuf = Buffer.from(clean, "utf8");
    let matchedStep: number | null = null;
    for (let delta = -windowSteps; delta <= windowSteps; delta++) {
      const step = baseStep + delta;
      const expected = generateTotpCode(secretBase32, step * 30_000);
      const expectedBuf = Buffer.from(expected, "utf8");
      if (expectedBuf.length === candidateBuf.length && timingSafeEqual(expectedBuf, candidateBuf)) {
        matchedStep = step;
      }
    }
    return matchedStep;
  }

  private totpAad(userId: number): string {
    return `puc-totp-secret:${Number(userId)}`;
  }

  /** Mã hóa khóa TOTP bằng khóa chính AES-256-GCM, ràng buộc với id người dùng. */
  private sealTotpSecret(userId: number, secretBase32: string): string {
    return sealString(this.twoFactorKeys.encryptionKeys[0], secretBase32, this.totpAad(userId));
  }

  /**
   * Giải mã khóa TOTP đã lưu; chấp nhận giá trị Base32 dạng rõ cũ (cần mã hóa lại) và bản mã của khóa dự phòng
   * (cần mã hóa lại bằng khóa chính). Trả null khi không giải mã được (sai khóa hoặc dữ liệu bị sửa đổi).
   */
  private openTotpSecret(userId: number, stored: string | null): { secret: string; needsRewrap: boolean } | null {
    if (!stored) return null;
    if (!isSealed(stored)) {
      return /^[A-Z2-7]+=*$/i.test(stored.trim()) ? { secret: stored.trim(), needsRewrap: true } : null;
    }
    const keys = this.twoFactorKeys.encryptionKeys;
    for (let i = 0; i < keys.length; i++) {
      try {
        return { secret: openString(keys[i], stored, this.totpAad(userId)), needsRewrap: i > 0 };
      } catch {
        // Thử khóa kế tiếp trong bộ khóa.
      }
    }
    return null;
  }

  /** Mã hóa lại (lazy migration) khóa TOTP dạng rõ hoặc khóa cũ sau khi người dùng xác thực thành công. */
  private async rewrapTotpSecret(userId: number, previousStored: string, secretBase32: string): Promise<void> {
    await this.db
      .query("UPDATE users SET two_factor_secret = $2 WHERE id = $1 AND two_factor_secret = $3", [
        userId,
        this.sealTotpSecret(userId, secretBase32),
        previousStored,
      ])
      .catch(() => undefined);
  }

  private hashBackupCodeForUser(userId: number, code: string): string {
    return hashBackupCodeV2(this.twoFactorKeys.backupHmacKeys[0], Number(userId), code);
  }

  /** Mọi dạng băm hợp lệ của một mã dự phòng: HMAC v2 theo từng khóa trong bộ khóa và SHA-256 v1 cũ. */
  private backupCodeCandidates(userId: number, code: string): string[] {
    return [
      ...this.twoFactorKeys.backupHmacKeys.map((key) => hashBackupCodeV2(key, Number(userId), code)),
      hashBackupCode(code),
    ];
  }

  /**
   * Ghi nhận nhập sai OTP ở cấp người dùng (không phụ thuộc phiên thử thách). Mỗi lần chạm bội số ngưỡng sẽ đặt
   * `locked_until` với thời gian tăng gấp đôi (15, 30, 60 phút..., tối đa 24 giờ) và vô hiệu các thử thách đang mở.
   */
  private async recordOtpFailure(userId: number): Promise<boolean> {
    const { rows } = await this.db.query<{ locked: boolean }>(
      `UPDATE users
       SET two_factor_failed_count = two_factor_failed_count + 1,
           locked_until = CASE
             WHEN (two_factor_failed_count + 1) % $2::int = 0 THEN GREATEST(
               COALESCE(locked_until, now()),
               now() + make_interval(mins => LEAST(
                 $4::int,
                 $3::int * (2 ^ LEAST(10, ((two_factor_failed_count + 1) / $2::int) - 1))::int
               ))
             )
             ELSE locked_until
           END
       WHERE id = $1
       RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS locked`,
      [userId, MAX_OTP_USER_FAILURES, LOCK_MINUTES, OTP_LOCK_MAX_MINUTES],
    );
    const locked = Boolean(rows[0]?.locked);
    if (locked) {
      await this.db.query(
        "UPDATE auth_otp_challenges SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
        [userId],
      );
    }
    return locked;
  }

  private async assertActiveEnterpriseIfRequired(user: { role: Role; enterprise_id: number | null }): Promise<void> {
    if (user.role !== "enterprise" || !user.enterprise_id) return;
    const { rows } = await this.db.query<{ status: string }>(
      "SELECT status FROM enterprises WHERE id = $1 LIMIT 1",
      [user.enterprise_id],
    );
    if (rows[0]?.status !== "active") {
      throw new AppException(
        403,
        "Đơn vị doanh nghiệp liên kết hiện không còn hiệu lực hoạt động.",
        "ENTERPRISE_INACTIVE",
      );
    }
  }

  private rowToAuthUser(user: UserRow, sessionId?: number | null): AuthUser {
    return {
      id: Number(user.id),
      fullName: user.full_name,
      username: user.username,
      email: user.email,
      role: user.role,
      villageId: user.village_id !== null && user.village_id !== undefined ? Number(user.village_id) : null,
      householdId: user.household_id !== null && user.household_id !== undefined ? Number(user.household_id) : null,
      enterpriseId: user.enterprise_id !== null && user.enterprise_id !== undefined ? Number(user.enterprise_id) : null,
      assignedCommune: user.assigned_commune ?? null,
      assignedRegion: user.assigned_region ?? null,
      coopCode: user.coop_code || "HTX-CUNE",
      twoFactorEnabled: Boolean(user.two_factor_enabled),
      sessionId: sessionId ?? null,
    };
  }

  sessionOf(user: AuthUser): SessionResult {
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email ?? null,
        role: user.role,
        villageId: user.villageId,
        householdId: user.householdId,
        enterpriseId: user.enterpriseId ?? null,
        assignedCommune: user.assignedCommune ?? null,
        assignedRegion: user.assignedRegion ?? null,
        coopCode: user.coopCode || "HTX-CUNE",
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        sessionId: user.sessionId ?? null,
      },
      permissions: permissionsFor(user.role),
    };
  }

  private async createOtpChallenge(
    user: UserRow,
    authMethod: "password" | "google",
    meta: ClientMeta,
  ): Promise<MfaChallengeResult> {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.tokens.hashToken(rawToken);
    // Khóa theo dòng người dùng để hai lượt đăng nhập song song không thể cùng chèn 2 thử thách còn hiệu lực.
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", [user.id]);
      await client.query(`DELETE FROM auth_otp_challenges WHERE user_id = $1`, [user.id]);
      await client.query(
        `INSERT INTO auth_otp_challenges (challenge_token_hash, user_id, auth_method, expires_at, ip, user_agent)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5, $6)`,
        [tokenHash, user.id, authMethod, OTP_CHALLENGE_TTL_MIN, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await this.audit.write(
      { ip: meta.ip },
      { action: "Yêu cầu xác thực 2 lớp (OTP)", object: user.username, detail: `Phương thức bước 1: ${authMethod}` },
      { id: user.id, name: user.full_name },
    );
    return {
      mfaRequired: true,
      challengeToken: rawToken,
      username: user.username,
      fullName: user.full_name,
    };
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<LoginOutcome> {
    const cleanUsername = dto.username.normalize("NFC").trim();
    const cleanPassword = normalizePasswordInput(dto.password);

    if (this.isLoginPairLocked(meta.ip, cleanUsername)) {
      throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    // So khớp tên đăng nhập không phân biệt hoa/thường: không có bí danh theo vai trò, không đăng nhập bằng SĐT của hộ.
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${AuthService.USER_AUTH_COLUMNS}
       FROM users u
       WHERE lower(u.username) = lower($1)`,
      [cleanUsername],
    );
    const user = rows[0];

    if (user?.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    const valid = await bcrypt.compare(cleanPassword, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) {
      this.recordLoginPairFailure(meta.ip, cleanUsername);
      if (user) {
        // Giới hạn khóa tạm theo cặp (IP, tài khoản) ở bộ nhớ; chỉ đặt locked_until toàn cục trong DB khi vượt ngưỡng tấn công phân tán cao.
        await this.db.query(
          `UPDATE users
           SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
               locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
           WHERE id = $1`,
          [user.id, GLOBAL_DB_LOCK_FAILED_LOGINS, LOCK_MINUTES],
        );
        await this.audit.write(
          { ip: meta.ip },
          { action: "Đăng nhập thất bại", object: user.username },
          { id: user.id, name: user.full_name },
        );
      } else {
        await this.audit.write(
          { ip: meta.ip, user: undefined },
          { action: "Đăng nhập thất bại", object: cleanUsername },
          ANONYMOUS_AUDIT_ACTOR,
        );
      }
      throw unauthorized("Sai tài khoản hoặc mật khẩu.");
    }

    if (user.status === "pending") {
      throw new AppException(403, "Tài khoản đang chờ cán bộ HTX duyệt. Vui lòng quay lại sau khi được thông báo.", "ACCOUNT_PENDING");
    }
    if (user.status !== "active") {
      throw new AppException(403, "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.", "ACCOUNT_DISABLED");
    }
    await this.assertActiveEnterpriseIfRequired(user);

    const unlocked = await this.db.query(
      `UPDATE users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = CASE WHEN two_factor_enabled THEN last_login_at ELSE now() END
       WHERE id = $1 AND (locked_until IS NULL OR locked_until <= now())`,
      [user.id],
    );
    if (unlocked.rowCount === 0) {
      throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    this.clearLoginPairFailures(meta.ip, cleanUsername);

    if (user.two_factor_enabled && user.two_factor_secret) {
      return this.createOtpChallenge(user, "password", meta);
    }

    const tokens = await this.issueSession(user.id, meta, user.token_version);
    const authUser = this.rowToAuthUser(user, tokens.sessionId);
    await this.audit.write(
      { ip: meta.ip, user: authUser },
      { action: "Đăng nhập", object: user.username },
    );

    return { ...this.sessionOf(authUser), tokens };
  }

  private async verifyGoogleToken(credential: string): Promise<{ email: string }> {
    return this.verifyGoogleIdToken(credential);
  }

  private async verifyGoogleIdToken(credential: string): Promise<{ email: string }> {
    if (!this.googleClientId) {
      throw unauthorized("Đăng nhập Google chưa được kích hoạt trên hệ thống.");
    }
    const trimmed = typeof credential === "string" ? credential.trim() : "";
    if (!/^[A-Za-z0-9_-]{10,1024}\.[A-Za-z0-9_-]{10,2048}\.[A-Za-z0-9_-]{32,1024}$/.test(trimmed)) {
      throw unauthorized("Token Google không hợp lệ.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      if (!res.ok) {
        throw unauthorized("Token đăng nhập Google không hợp lệ hoặc đã hết hạn.");
      }
      const payload = (await res.json()) as {
        iss?: string;
        aud?: string;
        azp?: string;
        exp?: string;
        email?: string;
        email_verified?: string | boolean;
      };
      if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
        throw unauthorized("Nguồn phát hành token Google không hợp lệ.");
      }
      if (payload.aud !== this.googleClientId) {
        throw unauthorized("Token Google không khớp ứng dụng (client_id).");
      }
      if (payload.azp && payload.azp !== this.googleClientId) {
        throw unauthorized("Token Google không hợp lệ.");
      }
      const expSec = Number(payload.exp ?? 0);
      if (!Number.isFinite(expSec) || expSec * 1000 <= Date.now()) {
        throw unauthorized("Token đăng nhập Google đã hết hạn.");
      }
      const emailVerified = payload.email_verified === true || payload.email_verified === "true";
      if (!payload.email || !emailVerified) {
        throw unauthorized("Tài khoản Google chưa xác minh địa chỉ email.");
      }
      return { email: payload.email.trim().toLowerCase() };
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw unauthorized("Không xác thực được thông tin đăng nhập với Google.");
    } finally {
      clearTimeout(timer);
    }
  }

  async googleConfig() {
    if (this.googleClientId) {
      return {
        mode: "oauth" as const,
        clientId: this.googleClientId,
        demoAccounts: [],
      };
    }
    if (!this.isProduction && this.allowDevDemoLogin) {
      const { rows } = await this.db.query<{
        id: number;
        full_name: string;
        username: string;
        email: string;
        village_name: string | null;
        household_code: string | null;
      }>(
        `SELECT u.id, u.full_name, u.username, u.email,
                v.name AS village_name, h.code AS household_code
         FROM users u
         LEFT JOIN households h ON h.id = u.household_id
         LEFT JOIN villages v ON v.id = COALESCE(u.village_id, h.village_id)
         WHERE u.role = 'farmer' AND u.status = 'active' AND u.household_id IS NOT NULL AND u.email IS NOT NULL
         ORDER BY u.id ASC
         LIMIT 6`,
      );
      return {
        mode: "demo" as const,
        clientId: null,
        demoAccounts: rows.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          username: r.username,
          email: r.email,
          villageName: r.village_name,
          householdCode: r.household_code,
        })),
      };
    }
    return {
      mode: "disabled" as const,
      clientId: null,
      demoAccounts: [],
    };
  }

  async loginWithGoogle(dto: GoogleLoginDto, meta: ClientMeta): Promise<LoginOutcome> {
    let user: UserRow | undefined;
    let attemptedObject = dto.email?.trim().toLowerCase() || "Google OAuth";

    try {
      if (dto.credential) {
        const { email } = await this.verifyGoogleToken(dto.credential);
        attemptedObject = email;
        if (SYNTHETIC_EMAIL_RE.test(email)) {
          throw unauthorized("Địa chỉ email giả định tự sinh không được phép dùng để đăng nhập OAuth.");
        }
        const { rows } = await this.db.query<UserRow>(
          `SELECT ${AuthService.USER_AUTH_COLUMNS}
           FROM users u
           WHERE LOWER(u.email) = $1
             AND u.email IS NOT NULL
           ORDER BY CASE WHEN u.status = 'active' THEN 0 ELSE 1 END, u.id ASC
           LIMIT 1`,
          [email],
        );
        user = rows[0];
      } else if (!this.isProduction && this.allowDevDemoLogin && !this.googleClientId) {
        // Chế độ trải nghiệm nhanh trên môi trường dev nội bộ (chỉ khi bật tường minh ALLOW_DEV_DEMO_LOGIN=true):
        // cho phép chọn tài khoản hộ nông dân theo email liên kết, tuyệt đối không cấp quyền quản trị viên.
        if (dto.email) {
          const cleanEmail = dto.email.trim().toLowerCase();
          attemptedObject = cleanEmail;
          const { rows } = await this.db.query<UserRow>(
            `SELECT ${AuthService.USER_AUTH_COLUMNS}
             FROM users u
             WHERE u.role = 'farmer' AND (LOWER(u.email) = $1 OR LOWER(u.username) = $1)
             LIMIT 1`,
            [cleanEmail],
          );
          user = rows[0];
        } else {
          const { rows } = await this.db.query<UserRow>(
            `SELECT ${AuthService.USER_AUTH_COLUMNS}
             FROM users u
             WHERE u.role = 'farmer' AND u.status = 'active' AND u.household_id IS NOT NULL
             ORDER BY u.id ASC
             LIMIT 1`,
          );
          user = rows[0];
        }
      } else {
        throw unauthorized("Vui lòng cung cấp thông tin xác thực Google hợp lệ.");
      }

      if (!user) {
        throw unauthorized("Địa chỉ email Google này chưa được liên kết với tài khoản nào trong hệ thống HTX Cư Né.");
      }

      if (user.locked_until && user.locked_until.getTime() > Date.now()) {
        throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
      }
      if (user.status === "pending") {
        throw new AppException(403, "Tài khoản đang chờ cán bộ HTX duyệt. Vui lòng quay lại sau khi được thông báo.", "ACCOUNT_PENDING");
      }
      if (user.status !== "active") {
        throw new AppException(403, "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.", "ACCOUNT_DISABLED");
      }
      await this.assertActiveEnterpriseIfRequired(user);
    } catch (error) {
      await this.audit.write(
        { ip: meta.ip, user: undefined },
        {
          action: "Đăng nhập bằng Google thất bại",
          object: user?.username ?? attemptedObject,
          detail: error instanceof Error ? error.message : undefined,
        },
        user ? { id: user.id, name: user.full_name } : ANONYMOUS_AUDIT_ACTOR,
      );
      throw error;
    }

    await this.db.query(
      "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = CASE WHEN two_factor_enabled THEN last_login_at ELSE now() END WHERE id = $1",
      [user.id],
    );

    if (user.two_factor_enabled && user.two_factor_secret) {
      return this.createOtpChallenge(user, "google", meta);
    }

    const tokens = await this.issueSession(user.id, meta, user.token_version);
    const authUser = this.rowToAuthUser(user, tokens.sessionId);
    await this.audit.write(
      { ip: meta.ip, user: authUser },
      { action: "Đăng nhập bằng Google", object: user.username },
    );

    return { ...this.sessionOf(authUser), tokens };
  }

  /**
   * Hộ dân tự đăng ký. Tài khoản luôn là nông dân, trạng thái `pending`, chưa gắn hộ nên chưa đăng nhập
   * được cho tới khi cán bộ HTX duyệt và gắn vào một hộ (xem RegistrationsService).
   */
  async register(dto: RegisterDto, meta: ClientMeta): Promise<{ status: "pending" }> {
    const duplicate = new AppException(409, "Số điện thoại hoặc email này đã được đăng ký. Hãy đăng nhập hoặc liên hệ cán bộ HTX.", "CONFLICT");
    const cleanPhone = dto.phone.trim().toLowerCase();
    const cleanPassword = normalizePasswordInput(dto.password);
    const cleanFullName = dto.fullName.normalize("NFC").trim();

    if (dto.villageId) {
      const village = await this.db.query("SELECT 1 FROM villages WHERE id = $1", [dto.villageId]);
      if (village.rowCount === 0) throw badRequest("Thôn đã chọn không tồn tại.");
    }
    const existingUsername = await this.db.query("SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1", [cleanPhone]);
    if (existingUsername.rowCount && existingUsername.rowCount > 0) {
      throw duplicate;
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 12);
    // Chỉ lưu email khi có Google ID Token hợp lệ chứng minh quyền sở hữu hộp thư. Email thô không kèm credential
    // bị bỏ qua (tương thích client cũ): nếu lưu, khi cán bộ duyệt hộ sẽ mở luôn quyền đăng nhập Google cho email lạ.
    let cleanEmail: string | null = null;
    const requestedEmail = dto.email?.trim().toLowerCase() || null;
    if (requestedEmail && dto.googleCredential) {
      if (SYNTHETIC_EMAIL_RE.test(requestedEmail)) {
        throw badRequest("Địa chỉ email không hợp lệ.");
      }
      const verifiedGoogle = await this.verifyGoogleToken(dto.googleCredential);
      if (verifiedGoogle.email !== requestedEmail) {
        throw badRequest("Email trong Google Token không trùng khớp với địa chỉ email bạn muốn liên kết.");
      }
      cleanEmail = requestedEmail;
    }
    if (cleanEmail) {
      const existingEmail = await this.db.query(
        "SELECT 1 FROM users WHERE LOWER(email) = $1 AND status <> 'pending' LIMIT 1",
        [cleanEmail],
      );
      if (existingEmail.rowCount && existingEmail.rowCount > 0) {
        throw duplicate;
      }
    }
    try {
      await this.db.query(
        `INSERT INTO users (full_name, username, email, password_hash, role, status, village_id, register_note)
         VALUES ($1, $2, $3, $4, 'farmer', 'pending', $5, $6)`,
        [cleanFullName, cleanPhone, cleanEmail, passwordHash, dto.villageId ?? null, dto.note ?? null],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw duplicate;
      throw error;
    }
    await this.audit.write(
      { ip: meta.ip, user: undefined },
      {
        action: "Đăng ký tài khoản (chờ duyệt)",
        object: cleanPhone,
        detail: `Họ tên khai báo: ${cleanFullName}`,
      },
      ANONYMOUS_AUDIT_ACTOR,
    );
    return { status: "pending" };
  }

  /** Xoay vòng refresh token. Ném 401 (kèm `clear` để controller xóa cookie) khi token không dùng được. */
  async refresh(token: string | undefined, meta: ClientMeta): Promise<IssuedTokens> {
    if (!token || typeof token !== "string" || token.length < 16 || token.length > 512) {
      throw new RefreshRejected();
    }

    const { rows } = await this.db.query<{
      id: number;
      user_id: number;
      expires_at: Date;
      revoked_at: Date | null;
      revoked_reason: string | null;
      reuse_handled: boolean;
      family_started_at: Date;
      ip: string | null;
      status: string;
      role: Role;
      enterprise_id: number | null;
      enterprise_status: string | null;
      token_version: number;
      full_name: string;
      username: string;
    }>(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, rt.revoked_reason,
              rt.reuse_handled, rt.family_started_at, rt.ip,
              u.status, u.role, u.enterprise_id, ent.status AS enterprise_status,
              u.token_version, u.full_name, u.username
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       LEFT JOIN enterprises ent ON ent.id = u.enterprise_id
       WHERE rt.token_hash = $1`,
      [this.tokens.hashToken(token)],
    );
    const row = rows[0];
    if (!row) throw new RefreshRejected();

    if (row.revoked_at) {
      if (row.revoked_reason === "logout" || row.revoked_reason === "security") {
        throw new RefreshRejected();
      }
      const withinGrace =
        Date.now() - new Date(row.revoked_at).getTime() <= REUSE_GRACE_MS &&
        Boolean(row.ip) &&
        Boolean(meta.ip) &&
        row.ip === meta.ip;
      if (!withinGrace && !row.reuse_handled) {
        const claimed = await this.db.query<{ id: number }>(
          "UPDATE refresh_tokens SET reuse_handled = true WHERE id = $1 AND reuse_handled = false RETURNING id",
          [row.id],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          await this.revokeAllSessions(row.user_id);
          await this.audit.write(
            { ip: meta.ip },
            {
              action: "Cảnh báo bảo mật",
              object: "Phiên đăng nhập",
              detail: "Phát hiện dùng lại refresh token đã thu hồi; đã thu hồi toàn bộ phiên.",
            },
            { id: row.user_id, name: row.full_name },
          );
        }
      }
      throw new RefreshRejected();
    }

    const familyStartedAt = new Date(row.family_started_at);
    const maxAbsoluteExpires = new Date(familyStartedAt.getTime() + MAX_SESSION_FAMILY_DAYS * 24 * 60 * 60_000);
    const now = Date.now();
    if (maxAbsoluteExpires.getTime() <= now) {
      await this.db.query(
        "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'logout' WHERE id = $1 AND revoked_at IS NULL",
        [row.id],
      );
      throw new RefreshRejected();
    }
    if (
      new Date(row.expires_at).getTime() <= now ||
      row.status !== "active" ||
      (row.role === "enterprise" && row.enterprise_id !== null && row.enterprise_status !== "active")
    ) {
      throw new RefreshRejected();
    }

    const revoked = await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'rotated' WHERE id = $1 AND revoked_at IS NULL",
      [row.id],
    );
    if (revoked.rowCount === 0) {
      throw new RefreshRejected();
    }
    return this.issueSession(row.user_id, meta, row.token_version, familyStartedAt);
  }

  async logout(refreshToken: string | undefined, accessToken?: string): Promise<void> {
    if (refreshToken && typeof refreshToken === "string" && refreshToken.length >= 16 && refreshToken.length <= 512) {
      await this.db.query<{ id: number }>(
        "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'logout' WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id",
        [this.tokens.hashToken(refreshToken)],
      );
    }

    if (accessToken && typeof accessToken === "string" && accessToken.length >= 16 && accessToken.length <= 4096) {
      const verified = await this.tokens.verifyAccessToken(accessToken);
      if (verified?.sessionId) {
        await this.db.query(
          "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'logout' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
          [verified.sessionId, verified.userId],
        );
      }
    }
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, ip?: string): Promise<void> {
    const cleanCurrentPassword = normalizePasswordInput(dto.currentPassword);
    const cleanNewPassword = normalizePasswordInput(dto.newPassword);

    const { rows } = await this.db.query<{
      password_hash: string;
      failed_login_count: number;
      locked_until: Date | null;
    }>("SELECT password_hash, failed_login_count, locked_until FROM users WHERE id = $1", [user.id]);
    const current = rows[0];
    if (!current) throw unauthorized();
    if (current.locked_until && current.locked_until.getTime() > Date.now()) {
      throw new AppException(429, "Tài khoản tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    if (!(await bcrypt.compare(cleanCurrentPassword, current.password_hash))) {
      const { rows: failRows } = await this.db.query<{ locked: boolean }>(
        `UPDATE users
         SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
             locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE id = $1
         RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS locked`,
        [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      if (failRows[0]?.locked) {
        await this.revokeAllSessions(user.id);
      }
      await this.audit.write({ ip, user }, { action: "Đổi mật khẩu thất bại", object: user.username });
      throw badRequest("Mật khẩu hiện tại không đúng.");
    }
    if (cleanCurrentPassword === cleanNewPassword) throw badRequest("Mật khẩu mới phải khác mật khẩu hiện tại.");

    const updated = await this.db.query(
      `UPDATE users
       SET password_hash = $2, failed_login_count = 0, locked_until = NULL
       WHERE id = $1 AND (locked_until IS NULL OR locked_until <= now())`,
      [user.id, await bcrypt.hash(cleanNewPassword, 12)],
    );
    if (updated.rowCount === 0) {
      throw new AppException(429, "Tài khoản tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }
    await this.revokeAllSessions(user.id);
    await this.audit.write({ ip, user }, { action: "Đổi mật khẩu", object: user.username });
  }

  /** Tự cập nhật họ tên hiển thị và email Google liên kết của tài khoản đang đăng nhập. */
  async updateProfile(user: AuthUser, dto: UpdateProfileDto, ip?: string): Promise<SessionResult> {
    const nextName = dto.fullName !== undefined ? dto.fullName.normalize("NFC").trim() : user.fullName;
    if (!nextName) throw badRequest("Họ và tên không được để trống.");

    const { rows: userRows } = await this.db.query<{
      email: string | null;
      password_hash: string;
      locked_until: Date | null;
    }>("SELECT email, password_hash, locked_until FROM users WHERE id = $1", [user.id]);
    const current = userRows[0];
    if (!current) throw unauthorized();

    const currentEmail = current.email ? current.email.trim().toLowerCase() : null;
    const normalizedDtoEmail =
      dto.email === undefined
        ? undefined
        : typeof dto.email === "string"
          ? dto.email.trim().toLowerCase() || null
          : null;
    const nextEmail = normalizedDtoEmail !== undefined ? normalizedDtoEmail : currentEmail;
    const emailChanged = normalizedDtoEmail !== undefined && nextEmail !== currentEmail;

    if (emailChanged) {
      if (nextEmail && SYNTHETIC_EMAIL_RE.test(nextEmail)) {
        throw badRequest("Không được liên kết địa chỉ email giả định tự sinh.");
      }
      if (nextEmail && !dto.googleCredential) {
        throw badRequest("Vui lòng xác thực tài khoản Google để liên kết email.");
      }
      if (!dto.currentPassword) {
        throw badRequest("Vui lòng nhập mật khẩu hiện tại để xác nhận thay đổi hoặc gỡ địa chỉ email liên kết.");
      }
      const cleanCurrentPassword = normalizePasswordInput(dto.currentPassword);
      if (current.locked_until && current.locked_until.getTime() > Date.now()) {
        throw new AppException(429, "Tài khoản tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
      }
      if (!(await bcrypt.compare(cleanCurrentPassword, current.password_hash))) {
        const { rows: failRows } = await this.db.query<{ locked: boolean }>(
          `UPDATE users
           SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
               locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
           WHERE id = $1
           RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS locked`,
          [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
        );
        if (failRows[0]?.locked) {
          await this.revokeAllSessions(user.id);
          await this.audit.write(
            { ip, user },
            {
              action: "Khóa tạm tài khoản",
              object: user.username,
              detail: "Nhập sai mật khẩu hiện tại quá số lần cho phép khi cập nhật hồ sơ.",
            },
          );
        } else {
          await this.audit.write(
            { ip, user },
            {
              action: "Cập nhật hồ sơ cá nhân thất bại",
              object: user.username,
              detail: "Sai mật khẩu hiện tại khi thay đổi email liên kết.",
            },
          );
        }
        throw badRequest("Mật khẩu hiện tại không đúng.");
      }
      if (nextEmail) {
        const verifiedGoogle = await this.verifyGoogleToken(dto.googleCredential!);
        if (verifiedGoogle.email.trim().toLowerCase() !== nextEmail) {
          throw badRequest("Email trong Google Token không trùng khớp với địa chỉ email bạn muốn liên kết.");
        }
        await this.db.query("UPDATE users SET email = NULL WHERE status = 'pending' AND LOWER(email) = $1", [nextEmail]);
      }
    }

    try {
      await this.db.query("UPDATE users SET full_name = $2, email = $3 WHERE id = $1", [user.id, nextName, nextEmail]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppException(409, "Địa chỉ email Google này đã được liên kết với một tài khoản khác.", "CONFLICT");
      }
      throw error;
    }

    if (emailChanged) {
      await this.revokeOtherSessions(user, ip);
    }

    await this.audit.write(
      { ip, user },
      {
        action: "Cập nhật hồ sơ cá nhân",
        object: user.username,
        detail: emailChanged ? (nextEmail ? `Email: ${nextEmail}` : "Gỡ liên kết email") : `Họ tên: ${nextName}`,
      },
    );

    return this.sessionOf({
      ...user,
      fullName: nextName,
      email: nextEmail,
    });
  }

  async verifyCccdForReset(dto: ForgotPasswordCccdDto, meta: ClientMeta): Promise<{ ok: true; mode: "instant" }> {
    return this.resetPasswordWithCccd(dto, meta);
  }

  /**
   * Khôi phục mật khẩu tức thì chỉ dành riêng cho tài khoản nông hộ đã gắn hồ sơ hộ (`role = 'farmer'` & `household_id IS NOT NULL`)
   * thông qua số CCCD 12 chữ số của chính hộ đó; tuyệt đối không áp dụng cho quản trị viên/cán bộ và không suy diễn theo SĐT.
   */
  async resetPasswordWithCccd(dto: ForgotPasswordCccdDto, meta: ClientMeta): Promise<{ ok: true; mode: "instant" }> {
    const cleanUsername = dto.username.normalize("NFC").trim();
    const cleanCccd = dto.cccd.trim();
    const cleanNewPassword = normalizePasswordInput(dto.newPassword);
    const cleanFullName = typeof dto.fullName === "string" ? dto.fullName.normalize("NFC").trim() : "";
    const passwordHashPromise = bcrypt.hash(cleanNewPassword, 12);
    const genericMismatchMessage =
      "Số điện thoại/tên đăng nhập hoặc số CCCD 12 chữ số không khớp với hồ sơ hộ nông dân đang hoạt động.";
    const lockedError = () =>
      new AppException(
        429,
        "Tài khoản đang tạm khóa do xác thực sai nhiều lần. Vui lòng thử lại sau hoặc gửi yêu cầu nhờ cán bộ HTX duyệt.",
        "ACCOUNT_LOCKED",
      );

    const { rows } = await this.db.query<{
      id: number;
      full_name: string;
      username: string;
      role: Role;
      status: string;
      household_id: number | null;
      locked_until: Date | null;
      cccd_reset_locked_until: Date | null;
      household_cccd: string | null;
      household_name: string | null;
    }>(
      `SELECT u.id, u.full_name, u.username, u.role, u.status, u.household_id,
              u.locked_until, u.cccd_reset_locked_until,
              h1.cccd AS household_cccd, h1.name AS household_name
       FROM users u
       LEFT JOIN households h1 ON h1.id = u.household_id
       WHERE lower(u.username) = lower($1)
       LIMIT 1`,
      [cleanUsername],
    );
    const user = rows[0];
    const passwordHash = await passwordHashPromise;
    const now = Date.now();

    // Kiểm tra khóa đồng nhất cho mọi vai trò TRƯỚC khi rẽ nhánh, để phản hồi 400/429 không lộ tài khoản nào là cán bộ/quản trị.
    if (
      this.isCccdResetLocked(meta.ip, cleanUsername, user?.id) ||
      (user?.cccd_reset_locked_until && user.cccd_reset_locked_until.getTime() > now) ||
      (user?.locked_until && user.locked_until.getTime() > now)
    ) {
      throw lockedError();
    }

    // Chỉ nông hộ đang hoạt động đã gắn hồ sơ hộ mới được khôi phục bằng CCCD; vai trò khác luôn bị coi là không khớp.
    const eligible =
      user && user.role === "farmer" && user.household_id !== null && user.status === "active" ? user : null;
    const cccdMatches =
      eligible !== null &&
      Boolean(eligible.household_cccd) &&
      constantTimeEqualStr((eligible.household_cccd ?? "").trim(), cleanCccd);
    const fullNameMatches =
      eligible !== null &&
      cleanFullName.length > 0 &&
      Boolean(eligible.household_name) &&
      normalizePersonName(cleanFullName) === normalizePersonName(eligible.household_name ?? "");

    if (!eligible || !cccdMatches || !fullNameMatches) {
      const lockMinutes = this.recordCccdResetFailure(meta.ip, cleanUsername, user?.id);
      if (user) {
        // Khóa thử lại CCCD lưu ở cột riêng: không chạm users.locked_until nên không chặn đăng nhập mật khẩu/Google của chủ tài khoản thật.
        await this.db.query(
          `UPDATE users
           SET cccd_reset_failed_count = CASE WHEN cccd_reset_failed_count + 1 >= $2 THEN 0 ELSE cccd_reset_failed_count + 1 END,
               cccd_reset_locked_until = CASE
                 WHEN $3::int > 0 OR cccd_reset_failed_count + 1 >= $2
                   THEN GREATEST(COALESCE(cccd_reset_locked_until, now()), now() + make_interval(mins => GREATEST($3::int, $4::int)))
                 ELSE cccd_reset_locked_until
               END
           WHERE id = $1`,
          [user.id, CCCD_MAX_FAILED_ATTEMPTS, lockMinutes, CCCD_LOCK_TIERS_MINUTES[0]],
        );
        await this.audit.write(
          { ip: meta.ip },
          { action: "Khôi phục mật khẩu bằng CCCD thất bại", object: user.username },
          { id: user.id, name: user.full_name },
        );
      } else {
        await this.audit.write(
          { ip: meta.ip, user: undefined },
          { action: "Khôi phục mật khẩu bằng CCCD thất bại", object: cleanUsername },
          ANONYMOUS_AUDIT_ACTOR,
        );
      }
      throw badRequest(genericMismatchMessage);
    }

    const updated = await this.db.query(
      `UPDATE users
       SET password_hash = $2, email = NULL, failed_login_count = 0,
           cccd_reset_failed_count = 0, cccd_reset_locked_until = NULL
       WHERE id = $1 AND role = 'farmer' AND household_id IS NOT NULL AND status = 'active'
         AND (locked_until IS NULL OR locked_until <= now())
         AND (cccd_reset_locked_until IS NULL OR cccd_reset_locked_until <= now())`,
      [eligible.id, passwordHash],
    );
    if (updated.rowCount === 0) {
      throw lockedError();
    }

    this.clearCccdResetFailures(meta.ip, cleanUsername, eligible.id);
    this.clearLoginPairFailures(meta.ip, cleanUsername);
    await this.db.query("DELETE FROM password_reset_requests WHERE user_id = $1 AND status = 'pending'", [eligible.id]);
    await this.revokeAllSessions(eligible.id);
    await this.audit.write(
      { ip: meta.ip },
      { action: "Đặt lại mật khẩu (xác minh CCCD)", object: eligible.username, detail: "Đã thu hồi phiên và gỡ email liên kết OAuth" },
      { id: eligible.id, name: eligible.full_name },
    );

    return { ok: true, mode: "instant" };
  }

  /**
   * Gửi yêu cầu cấp lại mật khẩu chờ Cán bộ HTX / Quản trị viên duyệt.
   * Tuyệt đối không lưu mật khẩu từ phía người gửi ẩn danh và không tiết lộ trạng thái tài khoản.
   */
  async requestPasswordReset(
    dto: ForgotPasswordRequestDto,
    meta: ClientMeta,
  ): Promise<{ ok: true; requested: true; mode: "request"; message: string }> {
    const cleanUsername = dto.username.normalize("NFC").trim();
    const cleanFullName = dto.fullName.normalize("NFC").trim();
    const cleanNote = dto.note?.normalize("NFC").trim() || null;
    const genericResponse = {
      ok: true as const,
      requested: true as const,
      mode: "request" as const,
      message: "Nếu thông tin tài khoản hợp lệ, yêu cầu cấp lại mật khẩu đã được ghi nhận để cán bộ đối chiếu.",
    };

    const { rows } = await this.db.query<{
      id: number;
      full_name: string;
      username: string;
      role: Role;
      status: string;
    }>("SELECT id, full_name, username, role, status FROM users WHERE lower(username) = lower($1) LIMIT 1", [
      cleanUsername,
    ]);
    const user = rows[0];

    if (
      !user ||
      user.status === "pending" ||
      isManagementRole(user.role) ||
      normalizePersonName(cleanFullName) !== normalizePersonName(user.full_name ?? "")
    ) {
      return genericResponse;
    }

    // Hủy tự động các yêu cầu quá hạn trước khi kiểm tra yêu cầu đang chờ duyệt
    await this.db.query(
      "UPDATE password_reset_requests SET status = 'rejected' WHERE user_id = $1 AND status = 'pending' AND expires_at <= now()",
      [user.id],
    );

    const existing = await this.db.query<{ id: number }>(
      "SELECT id FROM password_reset_requests WHERE user_id = $1 AND status = 'pending' AND expires_at > now() LIMIT 1",
      [user.id],
    );
    if (existing.rows[0]) {
      return genericResponse;
    }

    try {
      const ins = await this.db.query<{ id: number }>(
        `INSERT INTO password_reset_requests (user_id, username, full_name, new_password_hash, note, status, request_ip, expires_at)
         VALUES ($1, $2, $3, NULL, $4, 'pending', $5, now() + interval '24 hours')
         ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING
         RETURNING id`,
        [user.id, user.username, cleanFullName, cleanNote, meta.ip ?? null],
      );
      if ((ins.rowCount ?? 0) === 0) {
        return genericResponse;
      }
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return genericResponse;
      }
      throw error;
    }

    const recipientRoles =
      user.role === "farmer" && user.status === "active"
        ? ["admin", "htx_head", "htx_deputy", "support_specialist", "htx_officer"]
        : ["admin", "htx_head", "support_specialist"];
    await this.notifications.notifyRoles(recipientRoles, {
      kind: "system",
      title: `Yêu cầu cấp lại mật khẩu: ${cleanFullName} (${user.username})`,
      body: cleanNote ? `Ghi chú: ${cleanNote}` : "Chờ đối chiếu và phê duyệt.",
      link: "/admin?section=registrations",
    });

    await this.audit.write(
      { ip: meta.ip, user: undefined },
      {
        action: "Gửi yêu cầu cấp lại mật khẩu",
        object: user.username,
        detail: cleanNote ? `Người khai: ${cleanFullName} - Ghi chú: ${cleanNote}` : `Người khai: ${cleanFullName}`,
      },
      ANONYMOUS_AUDIT_ACTOR,
    );

    return genericResponse;
  }

  /** Xác minh mã OTP bước 2 (TOTP 6 chữ số hoặc mã dự phòng một lần) và cấp phiên đăng nhập. */
  async verifyOtpLogin(
    dto: VerifyOtpChallengeDto,
    meta: ClientMeta,
  ): Promise<SessionResult & { tokens: IssuedTokens }> {
    const tokenHash = this.tokens.hashToken(dto.challengeToken.trim());
    const { rows } = await this.db.query<{
      challenge_id: number;
      expires_at: Date;
      attempts: number;
      consumed_at: Date | null;
      auth_method: string;
    } & UserRow>(
      `SELECT c.id AS challenge_id, c.expires_at, c.attempts, c.consumed_at, c.auth_method,
              ${AuthService.USER_AUTH_COLUMNS}
       FROM auth_otp_challenges c
       JOIN users u ON u.id = c.user_id
       WHERE c.challenge_token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (
      !row ||
      row.consumed_at !== null ||
      row.expires_at.getTime() <= Date.now() ||
      row.attempts >= MAX_OTP_CHALLENGE_ATTEMPTS
    ) {
      throw unauthorized("Phiên xác thực OTP đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.");
    }
    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      throw new AppException(429, "Tài khoản tạm khóa do nhập sai mã xác thực nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }
    if (row.status !== "active" || !row.two_factor_enabled || !row.two_factor_secret) {
      throw unauthorized("Tài khoản không khả dụng cho xác thực 2 lớp.");
    }
    await this.assertActiveEnterpriseIfRequired(row);
    const opened = this.openTotpSecret(row.id, row.two_factor_secret);
    if (!opened) {
      throw unauthorized("Không đọc được khóa xác thực 2 lớp của tài khoản. Vui lòng liên hệ quản trị viên để đặt lại.");
    }

    const cleanCode = dto.code.replace(/[\s-]/g, "").toUpperCase();
    let verified = false;
    let usedBackupCode = false;
    let usedTotpStep: number | null = null;
    let replayDetected = false;
    let challengeAlreadyConsumed = false;

    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const lockedChallenge = await client.query<{
        consumed_at: Date | null;
        expires_at: Date;
        attempts: number;
      }>("SELECT consumed_at, expires_at, attempts FROM auth_otp_challenges WHERE id = $1 FOR UPDATE", [
        row.challenge_id,
      ]);
      const curChallenge = lockedChallenge.rows[0];
      if (
        !curChallenge ||
        curChallenge.consumed_at !== null ||
        curChallenge.expires_at.getTime() <= Date.now() ||
        curChallenge.attempts >= MAX_OTP_CHALLENGE_ATTEMPTS
      ) {
        challengeAlreadyConsumed = true;
      } else if (/^[0-9]{6}$/.test(cleanCode)) {
        const matchedStep = this.matchTotpStep(opened.secret, cleanCode, 1);
        const lastUsedStep =
          row.two_factor_last_used_step !== null && row.two_factor_last_used_step !== undefined
            ? Number(row.two_factor_last_used_step)
            : null;
        if (matchedStep !== null && (lastUsedStep === null || matchedStep > lastUsedStep)) {
          // Chiếm bước thời gian nguyên tử: hai yêu cầu song song cùng mã chỉ một yêu cầu thắng.
          const stepClaimed = await client.query(
            `UPDATE users
             SET two_factor_last_used_step = $2
             WHERE id = $1 AND (two_factor_last_used_step IS NULL OR two_factor_last_used_step < $2)`,
            [row.id, matchedStep],
          );
          if ((stepClaimed.rowCount ?? 0) > 0) {
            verified = true;
            usedTotpStep = matchedStep;
          } else {
            replayDetected = true;
          }
        } else if (matchedStep !== null) {
          replayDetected = true;
        }
      } else if (/^[0-9A-Z]{8}$/.test(cleanCode)) {
        // Tiêu thụ mã dự phòng một lần nguyên tử ngay trong SQL (jsonb - text[] kèm điều kiện ?|), trước khi cấp phiên:
        // hai yêu cầu song song dùng cùng một mã thì chỉ đúng một yêu cầu xóa được mã (rowCount = 1), không ghi đè mảng cũ.
        const consumedBackup = await client.query(
          `UPDATE users
           SET two_factor_backup_codes = two_factor_backup_codes - $2::text[]
           WHERE id = $1 AND two_factor_enabled = true AND two_factor_backup_codes ?| $2::text[]`,
          [row.id, this.backupCodeCandidates(row.id, cleanCode)],
        );
        if ((consumedBackup.rowCount ?? 0) > 0) {
          verified = true;
          usedBackupCode = true;
        }
      }

      if (verified) {
        const consumed = await client.query(
          `UPDATE auth_otp_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
          [row.challenge_id],
        );
        if ((consumed.rowCount ?? 0) === 0) {
          await client.query("ROLLBACK");
          challengeAlreadyConsumed = true;
          verified = false;
        } else {
          await client.query("COMMIT");
        }
      } else {
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (challengeAlreadyConsumed) {
      throw unauthorized("Phiên xác thực OTP đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.");
    }

    if (!verified) {
      await this.db.query(
        `UPDATE auth_otp_challenges
         SET attempts = attempts + 1,
             consumed_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE consumed_at END
         WHERE id = $1`,
        [row.challenge_id, MAX_OTP_CHALLENGE_ATTEMPTS],
      );
      const locked = await this.recordOtpFailure(row.id);
      await this.audit.write(
        { ip: meta.ip },
        {
          action: "Xác thực OTP bước 2 thất bại",
          object: row.username,
          detail: locked
            ? "Nhập sai mã quá số lần cho phép; đã khóa tạm tài khoản."
            : replayDetected
              ? "Phát hiện phát lại mã OTP đã sử dụng."
              : undefined,
        },
        { id: row.id, name: row.full_name },
      );
      if (locked) {
        throw new AppException(429, "Tài khoản tạm khóa do nhập sai mã xác thực nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
      }
      if (replayDetected) {
        throw unauthorized("Mã xác thực OTP này đã được sử dụng. Vui lòng đợi mã mới trên ứng dụng xác thực.");
      }
      throw unauthorized("Mã xác thực OTP không đúng hoặc đã được sử dụng. Vui lòng kiểm tra lại ứng dụng xác thực.");
    }

    await this.db.query(`UPDATE users SET last_login_at = now(), two_factor_failed_count = 0 WHERE id = $1`, [row.id]);
    if (usedTotpStep !== null && opened.needsRewrap) {
      await this.rewrapTotpSecret(row.id, row.two_factor_secret, opened.secret);
    }

    const tokens = await this.issueSession(row.id, meta, row.token_version);
    const authUser = this.rowToAuthUser(row, tokens.sessionId);
    await this.audit.write(
      { ip: meta.ip, user: authUser },
      {
        action: usedBackupCode ? "Đăng nhập 2 lớp (mã dự phòng)" : "Đăng nhập 2 lớp (OTP)",
        object: row.username,
      },
    );

    return { ...this.sessionOf(authUser), tokens };
  }

  /** Khởi tạo khóa bí mật TOTP mới để người dùng quét mã QR trên ứng dụng xác thực trước khi kích hoạt. */
  async setupTwoFactor(user: AuthUser) {
    const { rows } = await this.db.query<{ two_factor_enabled: boolean }>(
      `SELECT two_factor_enabled FROM users WHERE id = $1`,
      [user.id],
    );
    if (!rows[0]) throw unauthorized();
    if (rows[0].two_factor_enabled) {
      throw badRequest("Tài khoản đã bật xác thực 2 lớp. Vui lòng tắt xác thực 2 lớp hiện tại trước khi thiết lập lại.");
    }

    const secret = generateTotpSecret();
    // Khóa chờ kích hoạt cũng được mã hóa AES-256-GCM khi lưu.
    const updated = await this.db.query(
      `UPDATE users SET two_factor_pending_secret = $2 WHERE id = $1 AND two_factor_enabled = false`,
      [user.id, this.sealTotpSecret(user.id, secret)],
    );
    if ((updated.rowCount ?? 0) === 0) {
      throw badRequest("Tài khoản đã bật xác thực 2 lớp. Vui lòng tắt xác thực 2 lớp hiện tại trước khi thiết lập lại.");
    }
    const otpauthUrl = buildOtpAuthUrl({
      secret,
      accountName: user.username,
      issuer: "HTX Cu Ne",
    });
    return {
      secret,
      otpauthUrl,
      issuer: "HTX Cu Ne",
      accountName: user.username,
    };
  }

  /** Xác nhận lại mật khẩu hiện tại cùng mã TOTP 6 chữ số đầu tiên rồi bật xác thực 2 lớp kèm bộ 8 mã dự phòng. */
  async enableTwoFactor(user: AuthUser, dto: EnableTwoFactorDto, ip?: string) {
    const { rows } = await this.db.query<{
      password_hash: string;
      locked_until: Date | null;
      two_factor_enabled: boolean;
      two_factor_pending_secret: string | null;
    }>(
      `SELECT password_hash, locked_until, two_factor_enabled, two_factor_pending_secret FROM users WHERE id = $1`,
      [user.id],
    );
    const current = rows[0];
    if (!current) throw unauthorized();
    if (current.two_factor_enabled) {
      throw badRequest("Tài khoản đã bật xác thực 2 lớp. Vui lòng tắt xác thực 2 lớp hiện tại trước khi thiết lập lại.");
    }
    if (current.locked_until && current.locked_until.getTime() > Date.now()) {
      throw new AppException(429, "Tài khoản tạm khóa do nhập sai thông tin xác thực nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    const cleanCurrentPassword = normalizePasswordInput(dto.currentPassword);
    if (!(await bcrypt.compare(cleanCurrentPassword, current.password_hash))) {
      const { rows: failRows } = await this.db.query<{ locked: boolean }>(
        `UPDATE users
         SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
             locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE id = $1
         RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS locked`,
        [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      if (failRows[0]?.locked) {
        await this.revokeAllSessions(user.id);
      }
      await this.audit.write({ ip, user }, { action: "Bật xác thực 2 lớp thất bại", object: user.username, detail: "Sai mật khẩu hiện tại." });
      throw badRequest("Mật khẩu hiện tại không đúng.");
    }

    const pending = this.openTotpSecret(user.id, current.two_factor_pending_secret);
    if (!pending) {
      throw badRequest("Chưa khởi tạo khóa xác thực 2 lớp. Vui lòng bấm tạo mã QR thiết lập trước.");
    }
    const matchedStep = this.matchTotpStep(pending.secret, dto.code, 1);
    if (matchedStep === null) {
      throw badRequest("Mã OTP 6 chữ số không khớp. Vui lòng kiểm tra thời gian trên thiết bị và nhập lại.");
    }

    const { plainCodes, hashedCodes } = generateBackupCodes(8, (code) => this.hashBackupCodeForUser(user.id, code));
    // Ghi nhận bước thời gian vừa dùng để mã kích hoạt không thể phát lại cho đăng nhập bước 2 hoặc tắt 2 lớp.
    const updated = await this.db.query(
      `UPDATE users
       SET two_factor_enabled = true,
           two_factor_secret = $2,
           two_factor_pending_secret = NULL,
           two_factor_backup_codes = $3::jsonb,
           two_factor_last_used_step = $4,
           two_factor_failed_count = 0
       WHERE id = $1 AND two_factor_enabled = false AND two_factor_pending_secret = $5`,
      [
        user.id,
        this.sealTotpSecret(user.id, pending.secret),
        JSON.stringify(hashedCodes),
        matchedStep,
        current.two_factor_pending_secret,
      ],
    );
    if ((updated.rowCount ?? 0) === 0) {
      throw badRequest("Khóa xác thực 2 lớp vừa thay đổi hoặc đã được bật. Vui lòng tải lại và thử lại.");
    }
    await this.revokeOtherSessions(user, ip);
    await this.audit.write({ ip, user }, { action: "Bật xác thực 2 lớp (OTP)", object: user.username });
    return { ok: true as const, enabled: true as const, backupCodes: plainCodes };
  }

  /** Tắt xác thực 2 lớp sau khi đối chiếu mật khẩu hiện tại hoặc mã OTP 6 chữ số đang hiệu lực. */
  async disableTwoFactor(user: AuthUser, dto: DisableTwoFactorDto, ip?: string) {
    const { rows } = await this.db.query<{
      password_hash: string;
      locked_until: Date | null;
      two_factor_enabled: boolean;
      two_factor_secret: string | null;
      two_factor_last_used_step: string | number | null;
    }>(
      `SELECT password_hash, locked_until, two_factor_enabled, two_factor_secret, two_factor_last_used_step
       FROM users WHERE id = $1`,
      [user.id],
    );
    const row = rows[0];
    if (!row) throw unauthorized();
    if (!row.two_factor_enabled) {
      return { ok: true as const };
    }
    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      throw new AppException(429, "Tài khoản tạm khóa do nhập sai thông tin xác thực nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    let confirmed = false;
    if (dto.code && row.two_factor_secret) {
      const opened = this.openTotpSecret(user.id, row.two_factor_secret);
      const matchedStep = opened ? this.matchTotpStep(opened.secret, dto.code, 1) : null;
      const lastUsedStep =
        row.two_factor_last_used_step !== null && row.two_factor_last_used_step !== undefined
          ? Number(row.two_factor_last_used_step)
          : null;
      if (matchedStep !== null && (lastUsedStep === null || matchedStep > lastUsedStep)) {
        const claimed = await this.db.query(
          `UPDATE users
           SET two_factor_last_used_step = $2
           WHERE id = $1 AND (two_factor_last_used_step IS NULL OR two_factor_last_used_step < $2)`,
          [user.id, matchedStep],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          confirmed = true;
        }
      }
      if (!confirmed) {
        // Sai mã OTP khi tắt 2 lớp cũng cộng vào bộ đếm khóa cấp người dùng như bước đăng nhập.
        const locked = await this.recordOtpFailure(user.id);
        if (locked) {
          await this.revokeAllSessions(user.id);
        }
      }
    } else if (dto.currentPassword) {
      const cleanCurrentPassword = normalizePasswordInput(dto.currentPassword);
      if (await bcrypt.compare(cleanCurrentPassword, row.password_hash)) {
        confirmed = true;
      } else {
        const { rows: failRows } = await this.db.query<{ locked: boolean }>(
          `UPDATE users
           SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
               locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
           WHERE id = $1
           RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS locked`,
          [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
        );
        if (failRows[0]?.locked) {
          await this.revokeAllSessions(user.id);
        }
      }
    }
    if (!confirmed) {
      await this.audit.write({ ip, user }, { action: "Tắt xác thực 2 lớp thất bại", object: user.username });
      throw badRequest("Vui lòng nhập đúng mật khẩu hiện tại hoặc mã OTP 6 chữ số chưa sử dụng để tắt xác thực 2 lớp.");
    }

    await this.db.query(
      `UPDATE users
       SET two_factor_enabled = false,
           two_factor_secret = NULL,
           two_factor_pending_secret = NULL,
           two_factor_backup_codes = '[]'::jsonb,
           two_factor_failed_count = 0
       WHERE id = $1`,
      [user.id],
    );
    await this.audit.write({ ip, user }, { action: "Tắt xác thực 2 lớp (OTP)", object: user.username });
    return { ok: true as const };
  }

  /** Danh sách các phiên đăng nhập còn hiệu lực của tài khoản để quản lý & đăng xuất từ xa. */
  async listSessions(user: AuthUser) {
    const { rows } = await this.db.query<{
      id: number;
      ip: string | null;
      user_agent: string | null;
      created_at: Date;
      last_used_at: Date;
      expires_at: Date;
    }>(
      `SELECT id, ip, user_agent, created_at, last_used_at, expires_at
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY (id = COALESCE($2::bigint, -1)) DESC, last_used_at DESC, id DESC
       LIMIT 30`,
      [user.id, user.sessionId ?? null],
    );
    return {
      data: rows.map((r) => ({
        id: Number(r.id),
        ip: r.ip,
        userAgent: r.user_agent,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
        expiresAt: r.expires_at,
        isCurrent: user.sessionId !== undefined && user.sessionId !== null && Number(r.id) === Number(user.sessionId),
      })),
    };
  }

  /** Đăng xuất từ xa một phiên cụ thể theo id (hủy tức thì cả refresh token và access token gắn sid). */
  async revokeSession(user: AuthUser, sessionId: number, ip?: string) {
    const res = await this.db.query<{ ip: string | null; user_agent: string | null }>(
      `UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = 'logout'
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING ip, user_agent`,
      [sessionId, user.id],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw notFound("Phiên đăng nhập không tồn tại hoặc đã kết thúc.");
    }
    await this.audit.write(
      { ip, user },
      {
        action: "Đăng xuất từ xa thiết bị",
        object: `Phiên #${sessionId}`,
        detail: res.rows[0]?.ip ? `IP thiết bị: ${res.rows[0].ip}` : undefined,
      },
    );
    return {
      ok: true as const,
      revokedCurrent: user.sessionId !== undefined && user.sessionId !== null && Number(sessionId) === Number(user.sessionId),
    };
  }

  /** Đăng xuất từ xa toàn bộ các thiết bị khác (giữ lại phiên hiện tại). */
  async revokeOtherSessions(user: AuthUser, ip?: string) {
    if (!user.sessionId) {
      const res = await this.db.query(
        `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id],
      );
      return { ok: true as const, revokedCount: res.rowCount ?? 0 };
    }
    const res = await this.db.query(
      `UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = 'security'
       WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
      [user.id, user.sessionId],
    );
    await this.audit.write(
      { ip, user },
      { action: "Đăng xuất từ xa các thiết bị khác", object: user.username, detail: `${res.rowCount ?? 0} phiên` },
    );
    return { ok: true as const, revokedCount: res.rowCount ?? 0 };
  }

  private async revokeAllSessions(userId: number) {
    await Promise.all([
      this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [userId]),
      this.db.query(
        "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      ),
    ]);
  }

  private async issueSession(
    userId: number,
    meta: ClientMeta,
    knownTokenVersion?: number,
    familyStartedAt?: Date,
  ): Promise<IssuedTokens> {
    const refresh = this.tokens.newRefreshToken();
    let tokenVersion = knownTokenVersion;
    if (tokenVersion === undefined) {
      const vRes = await this.db.query<{ token_version: number }>("SELECT token_version FROM users WHERE id = $1", [
        userId,
      ]);
      tokenVersion = vRes.rows[0]?.token_version ?? 0;
    }
    // Chỉ dọn các dòng hết hạn tự nhiên: giữ refresh token đã thu hồi tới hết TTL để còn phát hiện dùng lại token bị đánh cắp.
    await this.db.query(
      `DELETE FROM refresh_tokens
       WHERE user_id = $1 AND expires_at < now()`,
      [userId],
    );
    const ins = await this.db.query<{ id: number }>(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_started_at, expires_at, user_agent, ip, last_used_at)
       VALUES (
         $1,
         $2,
         COALESCE($6::timestamptz, now()),
         LEAST(
           COALESCE($6::timestamptz, now()) + make_interval(days => $7),
           now() + make_interval(days => $3)
         ),
         $4,
         $5,
         now()
       )
       RETURNING id`,
      [
        userId,
        refresh.hash,
        this.refreshTtlDays,
        meta.userAgent?.slice(0, 300) ?? null,
        meta.ip ?? null,
        familyStartedAt ?? null,
        MAX_SESSION_FAMILY_DAYS,
      ],
    );
    const sessionId = Number(ins.rows[0].id);

    // Giới hạn tối đa 10 phiên đang hoạt động trên mỗi tài khoản; thu hồi các phiên cũ nhất vượt ngưỡng.
    await this.db.query(
      `UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = 'logout'
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
         AND id NOT IN (
           SELECT id
           FROM refresh_tokens
           WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
           ORDER BY last_used_at DESC, id DESC
           LIMIT $2
         )`,
      [userId, MAX_ACTIVE_SESSIONS_PER_USER],
    );

    return {
      accessToken: await this.tokens.signAccessToken(userId, tokenVersion, sessionId),
      refreshToken: refresh.token,
      sessionId,
    };
  }
}

/** Refresh token không dùng được; controller bắt lỗi này để xóa cookie rồi trả 401. */
export class RefreshRejected extends AppException {
  constructor() {
    super(401, "Chưa đăng nhập hoặc phiên đã hết hạn.", "UNAUTHORIZED");
  }
}
