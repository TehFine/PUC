import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { unauthorized } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { IS_PUBLIC_KEY } from "../auth.decorators";
import type { Role } from "../permissions";
import { ACCESS_COOKIE, TokensService } from "../tokens.service";

/**
 * Yêu cầu đăng nhập cho mọi route trừ route gắn @Public().
 * Luôn đọc lại người dùng từ CSDL để đổi vai trò/khóa tài khoản có hiệu lực ngay.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    const userId = token ? await this.tokens.verifyAccessToken(token) : null;
    if (!userId) throw unauthorized();

    const { rows } = await this.db.query<{
      id: number;
      full_name: string;
      username: string;
      role: Role;
      status: string;
      village_id: number | null;
      household_id: number | null;
    }>("SELECT id, full_name, username, role, status, village_id, household_id FROM users WHERE id = $1", [userId]);

    const row = rows[0];
    if (!row || row.status !== "active") throw unauthorized();

    request.user = {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      role: row.role,
      villageId: row.village_id,
      householdId: row.household_id,
    };
    return true;
  }
}
