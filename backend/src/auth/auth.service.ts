import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import { AuditService } from "../audit/audit.service";
import {
  buildOtpAuthUrl,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
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
import { permissionsFor, type Action, type Role } from "./permissions";
import { TokensService } from "./tokens.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const REUSE_GRACE_MS = 10_000;
const OTP_CHALLENGE_TTL_MIN = 5;
const MAX_OTP_CHALLENGE_ATTEMPTS = 5;
// Băm giả để thời gian phản hồi không lộ việc tài khoản có tồn tại hay không.
const DUMMY_HASH = bcrypt.hashSync("không-phải-mật-khẩu-thật", 10);

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
  }

  private static readonly USER_AUTH_COLUMNS = `
    u.id, u.full_name, u.username, u.email, u.password_hash, u.role, u.status,
    u.village_id, u.household_id, u.enterprise_id, u.assigned_commune, u.assigned_region,
    u.coop_code, u.two_factor_enabled, u.two_factor_secret, u.two_factor_backup_codes,
    u.failed_login_count, u.locked_until, u.token_version
  `;

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
    await this.db.query(
      `DELETE FROM auth_otp_challenges
       WHERE user_id = $1 AND (expires_at < now() OR consumed_at IS NOT NULL)`,
      [user.id],
    );
    await this.db.query(
      `INSERT INTO auth_otp_challenges (challenge_token_hash, user_id, auth_method, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5, $6)`,
      [tokenHash, user.id, authMethod, OTP_CHALLENGE_TTL_MIN, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
    );
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
    const cleanUsername = dto.username.trim();
    // Chỉ khớp đúng tên đăng nhập: không có bí danh theo vai trò, không đăng nhập bằng số điện thoại của hộ.
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${AuthService.USER_AUTH_COLUMNS}
       FROM users u
       WHERE u.username = $1`,
      [cleanUsername],
    );
    const user = rows[0];

    if (user?.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    const valid = await bcrypt.compare(dto.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) {
      if (user) {
        // Chỉ khóa tạm hành vi đăng nhập mới (locked_until), KHÔNG hủy các phiên hợp lệ đang hoạt động của quản trị viên/cán bộ.
        await this.db.query(
          `UPDATE users
           SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
               locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
           WHERE id = $1`,
          [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
        );
        await this.audit.write(
          { ip: meta.ip },
          { action: "Đăng nhập thất bại", object: user.username },
          { id: user.id, name: user.full_name },
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

    const unlocked = await this.db.query(
      `UPDATE users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = CASE WHEN two_factor_enabled THEN last_login_at ELSE now() END
       WHERE id = $1 AND (locked_until IS NULL OR locked_until <= now())`,
      [user.id],
    );
    if (unlocked.rowCount === 0) {
      throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    if (user.two_factor_enabled && user.two_factor_secret) {
      return this.createOtpChallenge(user, "password", meta);
    }

    const tokens = await this.issueSession(user.id, meta, user.token_version);
    await this.audit.write(
      { ip: meta.ip },
      { action: "Đăng nhập", object: user.username },
      { id: user.id, name: user.full_name },
    );

    const authUser = this.rowToAuthUser(user, tokens.sessionId);
    return { ...this.sessionOf(authUser), tokens };
  }

  private async verifyGoogleIdToken(credential: string): Promise<{ email: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      if (!res.ok) {
        throw unauthorized("Token đăng nhập Google không hợp lệ hoặc đã hết hạn.");
      }
      const payload = (await res.json()) as {
        iss?: string;
        aud?: string;
        exp?: string;
        email?: string;
        email_verified?: string | boolean;
      };
      if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
        throw unauthorized("Nguồn phát hành token Google không hợp lệ.");
      }
      if (!this.googleClientId) {
        throw unauthorized("Chức năng đăng nhập Google chưa được cấu hình (thiếu GOOGLE_CLIENT_ID).");
      }
      if (payload.aud !== this.googleClientId) {
        throw unauthorized("Token Google không khớp ứng dụng (client_id).");
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

    if (dto.credential) {
      const { email } = await this.verifyGoogleIdToken(dto.credential);
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

    await this.db.query(
      "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = CASE WHEN two_factor_enabled THEN last_login_at ELSE now() END WHERE id = $1",
      [user.id],
    );

    if (user.two_factor_enabled && user.two_factor_secret) {
      return this.createOtpChallenge(user, "google", meta);
    }

    const tokens = await this.issueSession(user.id, meta, user.token_version);
    await this.audit.write(
      { ip: meta.ip },
      { action: "Đăng nhập bằng Google", object: user.username },
      { id: user.id, name: user.full_name },
    );

    const authUser = this.rowToAuthUser(user, tokens.sessionId);
    return { ...this.sessionOf(authUser), tokens };
  }

  /**
   * Hộ dân tự đăng ký. Tài khoản luôn là nông dân, trạng thái `pending`, chưa gắn hộ nên chưa đăng nhập
   * được cho tới khi cán bộ HTX duyệt và gắn vào một hộ (xem RegistrationsService).
   */
  async register(dto: RegisterDto, meta: ClientMeta): Promise<{ status: "pending" }> {
    const duplicate = new AppException(409, "Số điện thoại hoặc email này đã được đăng ký. Hãy đăng nhập hoặc liên hệ cán bộ HTX.", "CONFLICT");
    if (dto.villageId) {
      const village = await this.db.query("SELECT 1 FROM villages WHERE id = $1", [dto.villageId]);
      if (village.rowCount === 0) throw badRequest("Thôn đã chọn không tồn tại.");
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const cleanEmail = dto.email?.trim().toLowerCase() || null;
    if (cleanEmail) {
      if (SYNTHETIC_EMAIL_RE.test(cleanEmail)) {
        throw badRequest("Địa chỉ email không hợp lệ.");
      }
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
        [dto.fullName, dto.phone, cleanEmail, passwordHash, dto.villageId ?? null, dto.note ?? null],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw duplicate;
      throw error;
    }
    await this.audit.write({ ip: meta.ip }, { action: "Đăng ký tài khoản (chờ duyệt)", object: dto.phone }, { id: null, name: dto.fullName });
    return { status: "pending" };
  }

  /** Xoay vòng refresh token. Ném 401 (kèm `clear` để controller xóa cookie) khi token không dùng được. */
  async refresh(token: string | undefined, meta: ClientMeta): Promise<IssuedTokens> {
    if (!token) throw new RefreshRejected();

    const { rows } = await this.db.query<{
      id: number;
      user_id: number;
      expires_at: Date;
      revoked_at: Date | null;
      status: string;
      token_version: number;
    }>(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.status, u.token_version
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [this.tokens.hashToken(token)],
    );
    const row = rows[0];
    if (!row) throw new RefreshRejected();

    if (row.revoked_at) {
      // Token đã dùng rồi mà vẫn được gửi lại: có thể bị đánh cắp -> thu hồi toàn bộ phiên.
      if (Date.now() - row.revoked_at.getTime() > REUSE_GRACE_MS) {
        await this.revokeAllSessions(row.user_id);
      }
      throw new RefreshRejected();
    }
    if (row.expires_at.getTime() < Date.now() || row.status !== "active") {
      throw new RefreshRejected();
    }

    const revoked = await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
      [row.id],
    );
    if (revoked.rowCount === 0) {
      throw new RefreshRejected();
    }
    return this.issueSession(row.user_id, meta, row.token_version);
  }

  async logout(refreshToken: string | undefined, accessToken?: string): Promise<void> {
    let revokedBySession = false;
    let legacyUserId: number | null = null;

    if (refreshToken) {
      const res = await this.db.query<{ id: number }>(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id",
        [this.tokens.hashToken(refreshToken)],
      );
      if ((res.rowCount ?? 0) > 0) revokedBySession = true;
    }

    if (accessToken) {
      const verified = await this.tokens.verifyAccessToken(accessToken);
      if (verified?.sessionId) {
        await this.db.query(
          "UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
          [verified.sessionId, verified.userId],
        );
        revokedBySession = true;
      } else if (verified?.userId) {
        legacyUserId = verified.userId;
      }
    }

    if (!revokedBySession && legacyUserId) {
      await this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [legacyUserId]);
    }
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, ip?: string): Promise<void> {
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

    if (!(await bcrypt.compare(dto.currentPassword, current.password_hash))) {
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
    if (dto.currentPassword === dto.newPassword) throw badRequest("Mật khẩu mới phải khác mật khẩu hiện tại.");

    const updated = await this.db.query(
      `UPDATE users
       SET password_hash = $2, failed_login_count = 0, locked_until = NULL
       WHERE id = $1 AND (locked_until IS NULL OR locked_until <= now())`,
      [user.id, await bcrypt.hash(dto.newPassword, 12)],
    );
    if (updated.rowCount === 0) {
      throw new AppException(429, "Tài khoản tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }
    await this.revokeAllSessions(user.id);
    await this.audit.write({ ip, user }, { action: "Đổi mật khẩu", object: user.username });
  }

  /** Tự cập nhật họ tên hiển thị và email Google liên kết của tài khoản đang đăng nhập. */
  async updateProfile(user: AuthUser, dto: UpdateProfileDto, ip?: string): Promise<SessionResult> {
    const nextName = dto.fullName !== undefined ? dto.fullName.trim() : user.fullName;
    if (!nextName) throw badRequest("Họ và tên không được để trống.");
    const currentEmail = user.email ? user.email.trim().toLowerCase() : null;
    const nextEmail = dto.email !== undefined ? dto.email : currentEmail;
    const emailChanged = dto.email !== undefined && nextEmail !== currentEmail;

    if (emailChanged) {
      if (nextEmail && SYNTHETIC_EMAIL_RE.test(nextEmail)) {
        throw badRequest("Không được liên kết địa chỉ email giả định tự sinh.");
      }
      if (!dto.currentPassword) {
        throw badRequest("Vui lòng nhập mật khẩu hiện tại để xác nhận thay đổi hoặc gỡ địa chỉ email liên kết.");
      }
      const { rows } = await this.db.query<{
        password_hash: string;
        locked_until: Date | null;
      }>("SELECT password_hash, locked_until FROM users WHERE id = $1", [user.id]);
      const current = rows[0];
      if (!current) throw unauthorized();
      if (current.locked_until && current.locked_until.getTime() > Date.now()) {
        throw new AppException(429, "Tài khoản tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
      }
      if (!(await bcrypt.compare(dto.currentPassword, current.password_hash))) {
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
        throw badRequest("Mật khẩu hiện tại không đúng.");
      }
      if (nextEmail && dto.googleCredential) {
        const verifiedGoogle = await this.verifyGoogleIdToken(dto.googleCredential);
        if (verifiedGoogle.email !== nextEmail) {
          throw badRequest("Email trong Google Token không trùng khớp với địa chỉ email bạn muốn liên kết.");
        }
      }
      if (nextEmail) {
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

    await this.audit.write(
      { ip, user },
      {
        action: "Cập nhật hồ sơ cá nhân",
        object: user.username,
        detail: nextEmail ? `Email: ${nextEmail}` : "Gỡ liên kết email",
      },
    );

    return this.sessionOf({
      ...user,
      fullName: nextName,
      email: nextEmail,
    });
  }

  /**
   * Khôi phục mật khẩu tức thì chỉ dành riêng cho tài khoản nông hộ đã gắn hồ sơ hộ (`role = 'farmer'` & `household_id IS NOT NULL`)
   * thông qua số CCCD 12 chữ số của chính hộ đó; tuyệt đối không áp dụng cho quản trị viên/cán bộ và không suy diễn theo SĐT.
   */
  async resetPasswordWithCccd(dto: ForgotPasswordCccdDto, meta: ClientMeta): Promise<{ ok: true; mode: "instant" }> {
    const cleanUsername = dto.username.trim();
    const cleanCccd = dto.cccd.trim();
    const passwordHashPromise = bcrypt.hash(dto.newPassword, 12);
    const genericMismatchMessage =
      "Số điện thoại/tên đăng nhập hoặc số CCCD 12 chữ số không khớp với hồ sơ hộ nông dân đang hoạt động.";

    const { rows } = await this.db.query<{
      id: number;
      full_name: string;
      username: string;
      role: Role;
      status: string;
      failed_login_count: number;
      locked_until: Date | null;
      household_cccd: string | null;
    }>(
      `SELECT u.id, u.full_name, u.username, u.role, u.status,
              u.failed_login_count, u.locked_until,
              h1.cccd AS household_cccd
       FROM users u
       JOIN households h1 ON h1.id = u.household_id
       WHERE u.username = $1
         AND u.role = 'farmer'
         AND u.household_id IS NOT NULL
       LIMIT 1`,
      [cleanUsername],
    );
    const user = rows[0];
    const passwordHash = await passwordHashPromise;

    if (user?.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new AppException(
        429,
        "Tài khoản đang tạm khóa do xác thực sai nhiều lần. Vui lòng thử lại sau 15 phút hoặc gửi yêu cầu nhờ cán bộ HTX duyệt.",
        "ACCOUNT_LOCKED",
      );
    }

    if (!user || !user.household_cccd || user.household_cccd !== cleanCccd || user.status !== "active") {
      if (user) {
        // Chỉ đặt locked_until cho lần đăng nhập/khôi phục tiếp theo, không hủy phiên đang online của người dùng thật.
        await this.db.query(
          `UPDATE users
           SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
               locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
           WHERE id = $1`,
          [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
        );
        await this.audit.write(
          { ip: meta.ip },
          { action: "Khôi phục mật khẩu bằng CCCD thất bại", object: user.username },
          { id: user.id, name: user.full_name },
        );
      }
      throw badRequest(genericMismatchMessage);
    }

    const updated = await this.db.query(
      `UPDATE users
       SET password_hash = $2, failed_login_count = 0, locked_until = NULL
       WHERE id = $1 AND role = 'farmer' AND (locked_until IS NULL OR locked_until <= now())`,
      [user.id, passwordHash],
    );
    if (updated.rowCount === 0) {
      throw new AppException(
        429,
        "Tài khoản đang tạm khóa do xác thực sai nhiều lần. Vui lòng thử lại sau.",
        "ACCOUNT_LOCKED",
      );
    }

    await this.db.query("DELETE FROM password_reset_requests WHERE user_id = $1 AND status = 'pending'", [user.id]);
    await this.revokeAllSessions(user.id);
    await this.audit.write(
      { ip: meta.ip },
      { action: "Đặt lại mật khẩu (xác minh CCCD)", object: user.username },
      { id: user.id, name: user.full_name },
    );

    return { ok: true, mode: "instant" };
  }

  /**
   * Gửi yêu cầu cấp lại mật khẩu chờ Cán bộ HTX / Quản trị viên duyệt.
   * Không tiết lộ trạng thái tồn tại của tài khoản và không cho phép ghi đè mật khẩu của yêu cầu đang chờ duyệt còn hiệu lực.
   */
  async requestPasswordReset(dto: ForgotPasswordRequestDto, meta: ClientMeta): Promise<{ ok: true; mode: "request" }> {
    const cleanUsername = dto.username.trim();
    const cleanFullName = dto.fullName.trim();
    const cleanNote = dto.note?.trim() || null;
    const passwordHashPromise = bcrypt.hash(dto.newPassword, 12);

    const { rows } = await this.db.query<{
      id: number;
      full_name: string;
      username: string;
      role: Role;
      status: string;
    }>("SELECT id, full_name, username, role, status FROM users WHERE username = $1 LIMIT 1", [cleanUsername]);
    const user = rows[0];
    const passwordHash = await passwordHashPromise;

    if (!user || user.status === "pending") {
      return { ok: true, mode: "request" };
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
      // Giữ nguyên new_password_hash ban đầu để ngăn người lạ ghi đè mật khẩu ngay trước khi cán bộ bấm duyệt.
      return { ok: true, mode: "request" };
    }

    await this.db.query(
      `INSERT INTO password_reset_requests (user_id, username, full_name, new_password_hash, note, status, request_ip, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, now() + interval '24 hours')`,
      [user.id, user.username, cleanFullName, passwordHash, cleanNote, meta.ip ?? null],
    );

    const recipientRoles = user.role === "farmer" && user.status === "active" ? ["admin", "htx_officer"] : ["admin"];
    await this.notifications.notifyRoles(recipientRoles, {
      kind: "system",
      title: `Yêu cầu cấp lại mật khẩu: ${cleanFullName} (${user.username})`,
      body: cleanNote ? `Ghi chú: ${cleanNote}` : "Chờ đối chiếu và phê duyệt.",
      link: "/admin?section=registrations",
    });

    await this.audit.write(
      { ip: meta.ip },
      { action: "Gửi yêu cầu cấp lại mật khẩu", object: user.username, detail: cleanNote ?? undefined },
      { id: user.id, name: cleanFullName },
    );

    return { ok: true, mode: "request" };
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
    if (row.status !== "active" || !row.two_factor_enabled || !row.two_factor_secret) {
      throw unauthorized("Tài khoản không khả dụng cho xác thực 2 lớp.");
    }

    const cleanCode = dto.code.replace(/[\s-]/g, "").toUpperCase();
    let verified = false;
    let usedBackupCode = false;
    let remainingBackupHashes: string[] | null = null;

    if (/^[0-9]{6}$/.test(cleanCode)) {
      verified = verifyTotpCode(row.two_factor_secret, cleanCode, 1);
    } else if (/^[0-9A-Z]{8}$/.test(cleanCode)) {
      const candidateHash = hashBackupCode(cleanCode);
      const storedHashes = Array.isArray(row.two_factor_backup_codes)
        ? row.two_factor_backup_codes.filter((x): x is string => typeof x === "string")
        : [];
      const idx = storedHashes.indexOf(candidateHash);
      if (idx !== -1) {
        verified = true;
        usedBackupCode = true;
        remainingBackupHashes = storedHashes.filter((_, i) => i !== idx);
      }
    }

    if (!verified) {
      await this.db.query(
        `UPDATE auth_otp_challenges
         SET attempts = attempts + 1,
             consumed_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE consumed_at END
         WHERE id = $1`,
        [row.challenge_id, MAX_OTP_CHALLENGE_ATTEMPTS],
      );
      await this.audit.write(
        { ip: meta.ip },
        { action: "Xác thực OTP bước 2 thất bại", object: row.username },
        { id: row.id, name: row.full_name },
      );
      throw unauthorized("Mã xác thực OTP không đúng. Vui lòng kiểm tra lại ứng dụng xác thực.");
    }

    const consumed = await this.db.query(
      `UPDATE auth_otp_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
      [row.challenge_id],
    );
    if (consumed.rowCount === 0) {
      throw unauthorized("Phiên xác thực OTP đã được sử dụng. Vui lòng đăng nhập lại.");
    }

    if (usedBackupCode && remainingBackupHashes !== null) {
      await this.db.query(
        `UPDATE users SET last_login_at = now(), two_factor_backup_codes = $2::jsonb WHERE id = $1`,
        [row.id, JSON.stringify(remainingBackupHashes)],
      );
    } else {
      await this.db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [row.id]);
    }

    const tokens = await this.issueSession(row.id, meta, row.token_version);
    await this.audit.write(
      { ip: meta.ip },
      {
        action: usedBackupCode ? "Đăng nhập 2 lớp (mã dự phòng)" : "Đăng nhập 2 lớp (OTP)",
        object: row.username,
      },
      { id: row.id, name: row.full_name },
    );

    const authUser = this.rowToAuthUser(row, tokens.sessionId);
    return { ...this.sessionOf(authUser), tokens };
  }

  /** Khởi tạo khóa bí mật TOTP mới để người dùng quét mã QR trên ứng dụng xác thực trước khi kích hoạt. */
  async setupTwoFactor(user: AuthUser) {
    const secret = generateTotpSecret();
    await this.db.query(`UPDATE users SET two_factor_pending_secret = $2 WHERE id = $1`, [user.id, secret]);
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

  /** Xác nhận mã TOTP 6 chữ số đầu tiên và bật xác thực 2 lớp kèm bộ 8 mã dự phòng. */
  async enableTwoFactor(user: AuthUser, dto: EnableTwoFactorDto, ip?: string) {
    const { rows } = await this.db.query<{ two_factor_pending_secret: string | null }>(
      `SELECT two_factor_pending_secret FROM users WHERE id = $1`,
      [user.id],
    );
    const pending = rows[0]?.two_factor_pending_secret;
    if (!pending) {
      throw badRequest("Chưa khởi tạo khóa xác thực 2 lớp. Vui lòng bấm tạo mã QR thiết lập trước.");
    }
    if (!verifyTotpCode(pending, dto.code, 1)) {
      throw badRequest("Mã OTP 6 chữ số không khớp. Vui lòng kiểm tra thời gian trên thiết bị và nhập lại.");
    }

    const { plainCodes, hashedCodes } = generateBackupCodes(8);
    await this.db.query(
      `UPDATE users
       SET two_factor_enabled = true,
           two_factor_secret = $2,
           two_factor_pending_secret = NULL,
           two_factor_backup_codes = $3::jsonb
       WHERE id = $1`,
      [user.id, pending, JSON.stringify(hashedCodes)],
    );
    await this.audit.write({ ip, user }, { action: "Bật xác thực 2 lớp (OTP)", object: user.username });
    return { ok: true as const, enabled: true as const, backupCodes: plainCodes };
  }

  /** Tắt xác thực 2 lớp sau khi đối chiếu mật khẩu hiện tại hoặc mã OTP 6 chữ số đang hiệu lực. */
  async disableTwoFactor(user: AuthUser, dto: DisableTwoFactorDto, ip?: string) {
    const { rows } = await this.db.query<{
      password_hash: string;
      two_factor_enabled: boolean;
      two_factor_secret: string | null;
    }>(`SELECT password_hash, two_factor_enabled, two_factor_secret FROM users WHERE id = $1`, [user.id]);
    const row = rows[0];
    if (!row) throw unauthorized();
    if (!row.two_factor_enabled) {
      return { ok: true as const };
    }

    let confirmed = false;
    if (dto.code && row.two_factor_secret && verifyTotpCode(row.two_factor_secret, dto.code, 1)) {
      confirmed = true;
    } else if (dto.currentPassword && (await bcrypt.compare(dto.currentPassword, row.password_hash))) {
      confirmed = true;
    }
    if (!confirmed) {
      throw badRequest("Vui lòng nhập đúng mật khẩu hiện tại hoặc mã OTP 6 chữ số để tắt xác thực 2 lớp.");
    }

    await this.db.query(
      `UPDATE users
       SET two_factor_enabled = false,
           two_factor_secret = NULL,
           two_factor_pending_secret = NULL,
           two_factor_backup_codes = '[]'::jsonb
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
       SET revoked_at = now()
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
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id],
      );
      return { ok: true as const, revokedCount: res.rowCount ?? 0 };
    }
    const res = await this.db.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
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
      this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]),
    ]);
  }

  private async issueSession(userId: number, meta: ClientMeta, knownTokenVersion?: number): Promise<IssuedTokens> {
    const refresh = this.tokens.newRefreshToken();
    let tokenVersion = knownTokenVersion;
    if (tokenVersion === undefined) {
      const vRes = await this.db.query<{ token_version: number }>("SELECT token_version FROM users WHERE id = $1", [
        userId,
      ]);
      tokenVersion = vRes.rows[0]?.token_version ?? 0;
    }
    await this.db.query(
      `DELETE FROM refresh_tokens
       WHERE user_id = $1 AND (expires_at < now() OR revoked_at < now() - interval '1 day')`,
      [userId],
    );
    const ins = await this.db.query<{ id: number }>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip, last_used_at)
       VALUES ($1, $2, now() + make_interval(days => $3), $4, $5, now())
       RETURNING id`,
      [userId, refresh.hash, this.refreshTtlDays, meta.userAgent?.slice(0, 300) ?? null, meta.ip ?? null],
    );
    const sessionId = Number(ins.rows[0].id);
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
