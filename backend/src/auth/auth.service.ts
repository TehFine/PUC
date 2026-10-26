import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import { AppException, badRequest, unauthorized } from "../common/errors/app.exception";
import { AuditService } from "../audit/audit.service";
import type { AppConfig } from "../config/configuration";
import { DatabaseService } from "../database/database.service";
import type { AuthUser } from "./auth-user";
import type { ChangePasswordDto, LoginDto, RegisterDto } from "./dto/auth.dto";
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

  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.refreshTtlDays = config.get("jwt", { infer: true }).refreshTtlDays;
  }

  sessionOf(user: AuthUser): SessionResult {
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        villageId: user.villageId,
        householdId: user.householdId,
      },
      permissions: permissionsFor(user.role),
    };
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<SessionResult & { tokens: IssuedTokens }> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT id, full_name, username, password_hash, role, status, village_id, household_id, failed_login_count, locked_until
       FROM users WHERE username = $1`,
      [dto.username],
    );
    const user = rows[0];

    if (user?.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new AppException(429, "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.", "ACCOUNT_LOCKED");
    }

    const valid = await bcrypt.compare(dto.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) {
      if (user) {
        const failed = user.failed_login_count + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await this.db.query(
          `UPDATE users SET failed_login_count = $2,
             locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
           WHERE id = $1`,
          [user.id, lock ? 0 : failed, lock, LOCK_MINUTES],
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

    await this.db.query(
      "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1",
      [user.id],
    );
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
    const duplicate = new AppException(409, "Số điện thoại này đã được đăng ký. Hãy đăng nhập hoặc liên hệ cán bộ HTX.", "CONFLICT");
    if (dto.villageId) {
      const village = await this.db.query("SELECT 1 FROM villages WHERE id = $1", [dto.villageId]);
      if (village.rowCount === 0) throw badRequest("Thôn đã chọn không tồn tại.");
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      await this.db.query(
        `INSERT INTO users (full_name, username, password_hash, role, status, village_id, register_note)
         VALUES ($1, $2, $3, 'farmer', 'pending', $4, $5)`,
        [dto.fullName, dto.phone, passwordHash, dto.villageId ?? null, dto.note ?? null],
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
    }>(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.status
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
    if (row.expires_at.getTime() < Date.now() || row.status !== "active") throw new RefreshRejected();

    await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
    return this.issueSession(row.user_id, meta);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [
      this.tokens.hashToken(token),
    ]);
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, ip?: string): Promise<void> {
    const { rows } = await this.db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [
      user.id,
    ]);
    if (!(await bcrypt.compare(dto.currentPassword, rows[0].password_hash))) {
      throw badRequest("Mật khẩu hiện tại không đúng.");
    }
    if (dto.currentPassword === dto.newPassword) throw badRequest("Mật khẩu mới phải khác mật khẩu hiện tại.");

    await this.db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      user.id,
      await bcrypt.hash(dto.newPassword, 12),
    ]);
    await this.revokeAllSessions(user.id);
    await this.audit.write({ ip, user }, { action: "Đổi mật khẩu", object: user.username });
  }

  private revokeAllSessions(userId: number) {
    return this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
      userId,
    ]);
  }

  private async issueSession(userId: number, meta: ClientMeta): Promise<IssuedTokens> {
    const refresh = this.tokens.newRefreshToken();
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
