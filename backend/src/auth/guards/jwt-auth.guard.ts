import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { unauthorized } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from "../auth.decorators";
import type { Role } from "../permissions";
import { ACCESS_COOKIE, TokensService } from "../tokens.service";

interface UserRow {
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
}

/**
 * Yêu cầu đăng nhập cho mọi route trừ route gắn @Public().
 * Luôn đọc lại người dùng và trạng thái phiên (sid) từ CSDL để đổi vai trò/phạm vi, khóa tài khoản,
 * hoặc đăng xuất từ xa từng thiết bị có hiệu lực tức thì.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly inflightUsers = new Map<number, Promise<UserRow | undefined>>();

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly db: DatabaseService,
  ) {}

  private loadUser(userId: number): Promise<UserRow | undefined> {
    const running = this.inflightUsers.get(userId);
    if (running) return running;

    const query = this.db
      .query<UserRow>(
        `SELECT id, full_name, username, email, role, status, village_id, household_id,
                enterprise_id, assigned_commune, assigned_region, coop_code, two_factor_enabled, token_version
         FROM users WHERE id = $1`,
        [userId],
      )
      .then((res) => res.rows[0])
      .finally(() => {
        this.inflightUsers.delete(userId);
      });

    this.inflightUsers.set(userId, query);
    return query;
  }

  private async isSessionActive(sessionId: number, userId: number): Promise<boolean> {
    const res = await this.db.query<{ id: number }>(
      `SELECT id FROM refresh_tokens
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
       LIMIT 1`,
      [sessionId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic && !isOptionalAuth) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    const verified = token ? await this.tokens.verifyAccessToken(token) : null;
    if (!verified) {
      if (isPublic || isOptionalAuth) return true;
      throw unauthorized();
    }

    const row = await this.loadUser(verified.userId);
    if (!row || row.status !== "active" || row.token_version !== verified.tokenVersion) {
      if (isPublic || isOptionalAuth) return true;
      throw unauthorized();
    }

    if (verified.sessionId !== undefined) {
      const active = await this.isSessionActive(verified.sessionId, row.id);
      if (!active) {
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
