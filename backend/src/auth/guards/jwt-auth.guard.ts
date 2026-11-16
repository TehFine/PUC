import { CanActivate, ExecutionContext, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppCacheService } from "../../common/cache/app-cache.service";
import { unauthorized } from "../../common/errors/app.exception";
import {
  type RequestWithVerifiedToken,
  VERIFIED_TOKEN_CACHE_KEY,
} from "../../common/throttler/app-throttler.guard";
import { DatabaseService } from "../../database/database.service";
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from "../auth.decorators";
import type { Role } from "../permissions";
import { ACCESS_COOKIE, TokensService } from "../tokens.service";

interface UserSessionSnapshot {
  id: number;
  full_name: string;
  username: string;
  email: string | null;
  role: Role;
  status: string;
  village_id: number | null;
  household_id: number | null;
  enterprise_id: number | null;
  assigned_commune: string | null;
  assigned_region: string | null;
  coop_code: string;
  two_factor_enabled: boolean;
  token_version: number;
  session_active: boolean;
  session_expires_ms: number | null;
}

const AUTH_SESSION_CACHE_TTL_MS = 15_000;

/**
 * Yêu cầu đăng nhập cho mọi route trừ route gắn @Public().
 * Gộp truy vấn người dùng và trạng thái phiên (`refresh_tokens`) vào 1 câu SQL duy nhất,
 * kết hợp bộ nhớ đệm L1 trên RAM có Singleflight và tự động xóa tức thì qua `DatabaseService`
 * bất cứ khi nào bảng `users` hoặc `refresh_tokens` có thay đổi (khóa tài khoản, đổi vai trò, thu hồi phiên từ xa).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly inflightLookups = new Map<string, Promise<UserSessionSnapshot | null>>();

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly db: DatabaseService,
    @Optional() private readonly cache?: AppCacheService,
  ) {}

  private queryUserAndSession(userId: number, sessionId?: number): Promise<UserSessionSnapshot | null> {
    const sidParam = sessionId !== undefined ? sessionId : null;
    return this.db
      .query<UserSessionSnapshot>(
        `SELECT u.id, u.full_name, u.username, u.email, u.role, u.status, u.village_id, u.household_id,
                u.enterprise_id, u.assigned_commune, u.assigned_region, u.coop_code,
                u.two_factor_enabled, u.token_version,
                CASE
                  WHEN $2::bigint IS NULL THEN true
                  ELSE EXISTS (
                    SELECT 1 FROM refresh_tokens rt
                    WHERE rt.id = $2::bigint AND rt.user_id = u.id AND rt.revoked_at IS NULL AND rt.expires_at > now()
                  )
                END AS session_active,
                CASE
                  WHEN $2::bigint IS NULL THEN NULL
                  ELSE (
                    SELECT (EXTRACT(EPOCH FROM rt.expires_at) * 1000)::float8
                    FROM refresh_tokens rt
                    WHERE rt.id = $2::bigint AND rt.user_id = u.id AND rt.revoked_at IS NULL
                    LIMIT 1
                  )
                END AS session_expires_ms
         FROM users u
         WHERE u.id = $1`,
        [userId, sidParam],
      )
      .then((res) => res.rows[0] ?? null);
  }

  private loadUserSession(userId: number, sessionId?: number): Promise<UserSessionSnapshot | null> {
    const key = `auth:u:${userId}:s:${sessionId ?? 0}`;
    if (this.cache) {
      return this.cache.getOrLoad(key, AUTH_SESSION_CACHE_TTL_MS, ["auth"], () =>
        this.queryUserAndSession(userId, sessionId),
      );
    }

    const running = this.inflightLookups.get(key);
    if (running) return running;
    const p = this.queryUserAndSession(userId, sessionId).finally(() => {
      this.inflightLookups.delete(key);
    });
    this.inflightLookups.set(key, p);
    return p;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic && !isOptionalAuth) return true;

    const request = context.switchToHttp().getRequest<RequestWithVerifiedToken>();
    const cachedVerified = request[VERIFIED_TOKEN_CACHE_KEY];
    let verified = cachedVerified;
    if (verified === undefined) {
      const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
      verified = token ? await this.tokens.verifyAccessToken(token) : null;
      request[VERIFIED_TOKEN_CACHE_KEY] = verified;
    }
    if (!verified) {
      if (isPublic || isOptionalAuth) return true;
      throw unauthorized();
    }

    const row = await this.loadUserSession(verified.userId, verified.sessionId);
    if (!row || row.status !== "active" || row.token_version !== verified.tokenVersion) {
      if (isPublic || isOptionalAuth) return true;
      throw unauthorized();
    }

    if (verified.sessionId !== undefined) {
      const expiredNow =
        row.session_expires_ms !== null && Number(row.session_expires_ms) <= Date.now();
      if (!row.session_active || expiredNow) {
        if (isPublic || isOptionalAuth) return true;
        throw unauthorized();
      }
    }

    request.user = {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      email: row.email,
      role: row.role,
      villageId: row.village_id !== null && row.village_id !== undefined ? Number(row.village_id) : null,
      householdId: row.household_id !== null && row.household_id !== undefined ? Number(row.household_id) : null,
      enterpriseId: row.enterprise_id !== null && row.enterprise_id !== undefined ? Number(row.enterprise_id) : null,
      assignedCommune: row.assigned_commune ?? null,
      assignedRegion: row.assigned_region ?? null,
      coopCode: row.coop_code || "HTX-CUNE",
      twoFactorEnabled: Boolean(row.two_factor_enabled),
      sessionId: verified.sessionId ?? null,
    };
    return true;
  }
}
