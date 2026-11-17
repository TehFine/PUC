import { createHash } from "crypto";
import { ExecutionContext, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  normalizeIp,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../../auth/auth.decorators";
import { ACCESS_COOKIE, TokensService, type VerifiedAccessToken } from "../../auth/tokens.service";
import { RateLimitException } from "./rate-limit.policy";

export const VERIFIED_TOKEN_CACHE_KEY = Symbol("puc.verifiedAccessToken");

export type RequestWithVerifiedToken = Request & {
  [VERIFIED_TOKEN_CACHE_KEY]?: VerifiedAccessToken | null;
};

/**
 * Guard giới hạn tần suất đa tầng toàn hệ thống:
 * 1. Trên các route `@Public()` (đăng nhập, đăng ký, quên mật khẩu, tra cứu QR công khai):
 *    luôn định danh theo địa chỉ IP chuẩn hóa (`ip:<addr>`, gộp dải IPv6 `/64`) để chống xoay vòng tài khoản né giới hạn.
 * 2. Trên các route nghiệp vụ yêu cầu đăng nhập:
 *    xác thực chữ ký số JWT `htx_access` ngay trên RAM (không chạm CSDL) để định danh riêng theo từng người dùng (`user:<id>`),
 *    giúp nhiều nông hộ dùng chung mạng 4G CGNAT / Wi-Fi HTX hoặc đi qua Vercel rewrite proxy không chèn ép bộ đếm của nhau,
 *    đồng thời chặn kẻ dùng tài khoản hợp lệ xoay proxy IP để lách giới hạn.
 * 3. Chuẩn hóa phản hồi `429` kèm header chuẩn RFC 9110 `Retry-After` cho mọi tầng (`burst`, `write`, `default`).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Optional() private readonly tokens?: TokensService,
  ) {
    super(options, storageService, reflector);
  }

  private resolveNormalizedIp(req: Record<string, unknown>): string {
    const rawIp =
      (typeof req.ip === "string" && req.ip.trim()) ||
      (typeof (req.socket as { remoteAddress?: unknown } | undefined)?.remoteAddress === "string"
        ? ((req.socket as { remoteAddress: string }).remoteAddress || "").trim()
        : "") ||
      "unknown";
    const normalized = normalizeIp(rawIp, this.ipv6SubnetPrefix);
    return normalized || "unknown";
  }

  protected override async getTracker(req: Record<string, unknown>, context?: ExecutionContext): Promise<string> {
    const clientIp = this.resolveNormalizedIp(req);

    const isPublicRoute = context
      ? this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])
      : false;

    if (isPublicRoute || !this.tokens) {
      return `ip:${clientIp}`;
    }

    const expressReq = req as unknown as RequestWithVerifiedToken;
    let verified = expressReq[VERIFIED_TOKEN_CACHE_KEY];
    if (verified === undefined) {
      const rawCookie = expressReq.cookies?.[ACCESS_COOKIE];
      const token =
        typeof rawCookie === "string" && rawCookie.length >= 16 && rawCookie.length <= 4096 ? rawCookie : undefined;
      verified = token ? await this.tokens.verifyAccessToken(token) : null;
      expressReq[VERIFIED_TOKEN_CACHE_KEY] = verified;
    }

    if (verified) {
      return `user:${verified.userId}`;
    }
    return `ip:${clientIp}`;
  }

  protected override generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name === "burst") {
      return createHash("sha256").update(`global-burst:${suffix}`).digest("hex");
    }
    if (name === "write") {
      return createHash("sha256").update(`global-write:${suffix}`).digest("hex");
    }
    const routePrefix = `${context.getClass().name}:${context.getHandler().name}:${name}`;
    return createHash("sha256").update(`${routePrefix}:${suffix}`).digest("hex");
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(throttlerLimitDetail.timeToBlockExpire || throttlerLimitDetail.timeToExpire || 1),
    );
    this.setResponseHeader(res, "Retry-After", retryAfterSeconds);
    this.setResponseHeader(res, "X-RateLimit-Limit", throttlerLimitDetail.limit);
    this.setResponseHeader(res, "X-RateLimit-Remaining", 0);
    this.setResponseHeader(res, "X-RateLimit-Reset", retryAfterSeconds);
    throw new RateLimitException(retryAfterSeconds);
  }
}

