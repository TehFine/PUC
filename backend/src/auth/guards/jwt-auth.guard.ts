import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { unauthorized } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { IS_PUBLIC_KEY } from "../auth.decorators";
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
  token_version: number;
}

/**
 * Yêu cầu đăng nhập cho mọi route trừ route gắn @Public().
 * Luôn đọc lại người dùng từ CSDL để đổi vai trò/khóa tài khoản/thu hồi token_version có hiệu lực ngay;
 * gộp các truy vấn đồng thời (inflight coalescing) trong cùng thời điểm để tiết kiệm kết nối pool.
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
        "SELECT id, full_name, username, email, role, status, village_id, household_id, token_version FROM users WHERE id = $1",
        [userId],
      )
      .then((res) => res.rows[0])
      .finally(() => {
        this.inflightUsers.delete(userId);
      });

    this.inflightUsers.set(userId, query);
    return query;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    const verified = token ? await this.tokens.verifyAccessToken(token) : null;
    if (!verified) throw unauthorized();

    const row = await this.loadUser(verified.userId);
    if (!row || row.status !== "active" || row.token_version !== verified.tokenVersion) {
      throw unauthorized();
    }

    request.user = {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      email: row.email,
      role: row.role,
      villageId: row.village_id,
      householdId: row.household_id,
    };
    return true;
  }
}
