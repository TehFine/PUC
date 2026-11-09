import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import { AppException, badRequest, unauthorized } from "../common/errors/app.exception";
import { AuditService } from "../audit/audit.service";
import type { AppConfig } from "../config/configuration";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthUser } from "./auth-user";
import type {
  ChangePasswordDto,
  ForgotPasswordCccdDto,
  ForgotPasswordRequestDto,
  GoogleLoginDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
} from "./dto/auth.dto";
import { permissionsFor, type Action, type Role } from "./permissions";
import { TokensService } from "./tokens.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const REUSE_GRACE_MS = 10_000;
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
  failed_login_count: number;
  locked_until: Date | null;
}

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionResult {
  user: AuthUser;
  permissions: Record<string, Action[]>;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly refreshTtlDays: number;
  private readonly isProduction: boolean;
  private readonly googleClientId?: string;

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
      },
      permissions: permissionsFor(user.role),
    };
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<SessionResult & { tokens: IssuedTokens }> {
    const cleanUsername = dto.username.trim();
    // Chỉ khớp đúng tên đăng nhập: không có bí danh theo vai trò, không đăng nhập bằng số điện thoại của hộ.
    const { rows } = await this.db.query<UserRow>(
      `SELECT u.id, u.full_name, u.username, u.email, u.password_hash, u.role, u.status, u.village_id, u.household_id, u.failed_login_count, u.locked_until
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
       SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
       WHERE id = $1 AND (locked_until IS NULL OR locked_until <= now())`,
      [user.id],
    );
    if (unlocked.rowCount === 0) {
      throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }
    const tokens = await this.issueSession(user.id, meta);
    await this.audit.write(
      { ip: meta.ip },
      { action: "Đăng nhập", object: user.username },
      { id: user.id, name: user.full_name },
    );

    const authUser: AuthUser = {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      email: user.email,
      role: user.role,
      villageId: user.village_id,
      householdId: user.household_id,
    };
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
    if (!this.isProduction) {
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

  async loginWithGoogle(dto: GoogleLoginDto, meta: ClientMeta): Promise<SessionResult & { tokens: IssuedTokens }> {
    let user: UserRow | undefined;

    if (dto.credential) {
      const { email } = await this.verifyGoogleIdToken(dto.credential);
      const { rows } = await this.db.query<UserRow>(
        `SELECT u.id, u.full_name, u.username, u.email, u.password_hash, u.role, u.status, u.village_id, u.household_id, u.failed_login_count, u.locked_until
         FROM users u
         WHERE LOWER(u.email) = $1 OR (LOWER(u.username) = $1 AND position('@' in u.username) > 0)
         LIMIT 1`,
        [email],
      );
      user = rows[0];
    } else if (!this.isProduction && !this.googleClientId) {
      // Chế độ trải nghiệm nhanh trên môi trường dev/demo (khi chưa cấu hình GOOGLE_CLIENT_ID):
      // cho phép chọn tài khoản hộ nông dân theo email liên kết, tuyệt đối không cấp quyền quản trị viên.
      if (dto.email) {
        const cleanEmail = dto.email.trim().toLowerCase();
        const { rows } = await this.db.query<UserRow>(
          `SELECT u.id, u.full_name, u.username, u.email, u.password_hash, u.role, u.status, u.village_id, u.household_id, u.failed_login_count, u.locked_until
           FROM users u
           WHERE u.role = 'farmer' AND (LOWER(u.email) = $1 OR LOWER(u.username) = $1)
           LIMIT 1`,
          [cleanEmail],
        );
        user = rows[0];
      } else {
        const { rows } = await this.db.query<UserRow>(
          `SELECT u.id, u.full_name, u.username, u.email, u.password_hash, u.role, u.status, u.village_id, u.household_id, u.failed_login_count, u.locked_until
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
      throw unauthorized("Địa chỉ email Google này chưa được liên kết với tài khoản hộ nông dân nào trong hệ thống HTX Cư Né.");
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
      "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1",
      [user.id],
    );
    const tokens = await this.issueSession(user.id, meta);
    await this.audit.write(
      { ip: meta.ip },
      { action: "Đăng nhập bằng Google", object: user.username },
      { id: user.id, name: user.full_name },
    );

    const authUser: AuthUser = {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      email: user.email,
      role: user.role,
      villageId: user.village_id,
      householdId: user.household_id,
    };
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
      locked_until: Date | null;
    }>(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.status, u.locked_until
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
    if (
      row.expires_at.getTime() < Date.now() ||
      row.status !== "active" ||
      (row.locked_until && row.locked_until.getTime() > Date.now())
    ) {
      throw new RefreshRejected();
    }

    const revoked = await this.db.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
      [row.id],
    );
    if (revoked.rowCount === 0) {
      throw new RefreshRejected();
    }
    return this.issueSession(row.user_id, meta);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [
      this.tokens.hashToken(token),
    ]);
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
    const nextEmail = dto.email !== undefined ? dto.email : (user.email ?? null);

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
   * Khôi phục mật khẩu tức thì cho hộ dân bằng cách đối chiếu tên đăng nhập / số điện thoại
   * với số CCCD 12 chữ số trong hồ sơ hộ đã đăng ký với HTX.
   */
  async resetPasswordWithCccd(dto: ForgotPasswordCccdDto, meta: ClientMeta): Promise<{ ok: true; mode: "instant" }> {
    const cleanUsername = dto.username.trim();
    const cleanCccd = dto.cccd.trim();
    const passwordHashPromise = bcrypt.hash(dto.newPassword, 12);

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
              COALESCE(h1.cccd, h2.cccd) AS household_cccd
       FROM users u
       LEFT JOIN households h1 ON h1.id = u.household_id
       LEFT JOIN households h2 ON u.household_id IS NULL AND h2.phone = u.username
       WHERE u.username = $1
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

    if (!user || !user.household_cccd || user.household_cccd !== cleanCccd) {
      if (user) {
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
        await this.audit.write(
          { ip: meta.ip },
          { action: "Khôi phục mật khẩu bằng CCCD thất bại", object: user.username },
          { id: user.id, name: user.full_name },
        );
        if (!user.household_cccd) {
          throw badRequest(
            "Tài khoản này chưa gắn với hồ sơ hộ có số CCCD. Vui lòng chuyển sang mục Gửi yêu cầu nhờ cán bộ HTX duyệt.",
          );
        }
      }
      throw badRequest(
        "Số điện thoại/tên đăng nhập hoặc số CCCD 12 chữ số không khớp với hồ sơ hộ trong hệ thống.",
      );
    }

    if (user.status === "pending") {
      throw new AppException(
        403,
        "Tài khoản đang chờ cán bộ HTX duyệt đăng ký ban đầu. Vui lòng quay lại sau khi được thông báo.",
        "ACCOUNT_PENDING",
      );
    }
    if (user.status !== "active") {
      throw new AppException(
        403,
        "Tài khoản đang bị khóa bởi quản trị viên. Vui lòng gửi yêu cầu nhờ cán bộ HTX duyệt.",
        "ACCOUNT_DISABLED",
      );
    }

    const updated = await this.db.query(
      `UPDATE users
       SET password_hash = $2, failed_login_count = 0, locked_until = NULL
       WHERE id = $1 AND (locked_until IS NULL OR locked_until <= now())`,
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
   * Mật khẩu mới được băm ngay khi lưu, khi cán bộ duyệt sẽ áp dụng trực tiếp.
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
      status: string;
    }>("SELECT id, full_name, username, status FROM users WHERE username = $1 LIMIT 1", [cleanUsername]);
    const user = rows[0];
    const passwordHash = await passwordHashPromise;

    if (!user) {
      throw badRequest(
        "Không tìm thấy tài khoản với số điện thoại hoặc tên đăng nhập này. Nếu chưa có tài khoản, vui lòng chọn Đăng ký.",
      );
    }
    if (user.status === "pending") {
      throw new AppException(
        403,
        "Tài khoản này đang chờ cán bộ HTX duyệt đăng ký ban đầu.",
        "ACCOUNT_PENDING",
      );
    }

    const existing = await this.db.query<{ id: number }>(
      "SELECT id FROM password_reset_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1",
      [user.id],
    );
    if (existing.rows[0]) {
      await this.db.query(
        `UPDATE password_reset_requests
         SET full_name = $2, new_password_hash = $3, note = $4, request_ip = $5, created_at = now()
         WHERE id = $1`,
        [existing.rows[0].id, cleanFullName, passwordHash, cleanNote, meta.ip ?? null],
      );
    } else {
      await this.db.query(
        `INSERT INTO password_reset_requests (user_id, username, full_name, new_password_hash, note, status, request_ip)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [user.id, user.username, cleanFullName, passwordHash, cleanNote, meta.ip ?? null],
      );
    }

    await this.notifications.notifyRoles(["admin", "htx_officer"], {
      kind: "system",
      title: `Yêu cầu cấp lại mật khẩu: ${cleanFullName} (${user.username})`,
      body: cleanNote ? `Ghi chú: ${cleanNote}` : "Chờ cán bộ HTX đối chiếu và phê duyệt.",
      link: "/admin?section=registrations",
    });

    await this.audit.write(
      { ip: meta.ip },
      { action: "Gửi yêu cầu cấp lại mật khẩu", object: user.username, detail: cleanNote ?? undefined },
      { id: user.id, name: cleanFullName },
    );

    return { ok: true, mode: "request" };
  }

  private revokeAllSessions(userId: number) {
    return this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
      userId,
    ]);
  }

  private async issueSession(userId: number, meta: ClientMeta): Promise<IssuedTokens> {
    const refresh = this.tokens.newRefreshToken();
    await this.db.query(
      `DELETE FROM refresh_tokens
       WHERE user_id = $1 AND (expires_at < now() OR revoked_at < now() - interval '1 day')`,
      [userId],
    );
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
      [userId, refresh.hash, this.refreshTtlDays, meta.userAgent?.slice(0, 300) ?? null, meta.ip ?? null],
    );
    return { accessToken: await this.tokens.signAccessToken(userId), refreshToken: refresh.token };
  }
}

/** Refresh token không dùng được; controller bắt lỗi này để xóa cookie rồi trả 401. */
export class RefreshRejected extends AppException {
  constructor() {
    super(401, "Chưa đăng nhập hoặc phiên đã hết hạn.", "UNAUTHORIZED");
  }
}
