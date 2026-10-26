import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { CookieOptions, Response } from "express";
import type { AppConfig } from "../config/configuration";

export const ACCESS_COOKIE = "htx_access";
export const REFRESH_COOKIE = "htx_refresh";

@Injectable()
export class TokensService {
  private readonly jwtConfig: AppConfig["jwt"];
  private readonly cookieSecure: boolean;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.jwtConfig = config.get("jwt", { infer: true });
    this.cookieSecure = config.get("cookieSecure", { infer: true });
  }

  signAccessToken(userId: number): Promise<string> {
    return this.jwt.signAsync({}, { subject: String(userId) });
  }

  /** Trả về id người dùng nếu token hợp lệ, ngược lại null. */
  async verifyAccessToken(token: string): Promise<number | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
      const id = Number(payload.sub);
      return Number.isInteger(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  /** Refresh token là chuỗi ngẫu nhiên; chỉ lưu băm SHA-256 trong CSDL. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(48).toString("base64url");
    return { token, hash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private baseCookie(): CookieOptions {
    return { httpOnly: true, secure: this.cookieSecure, sameSite: "lax" };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...this.baseCookie(),
      path: "/",
      maxAge: this.jwtConfig.accessTtlMin * 60 * 1000,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.baseCookie(),
      path: "/api/auth",
      maxAge: this.jwtConfig.refreshTtlDays * 24 * 60 * 60 * 1000,
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.baseCookie(), path: "/" });
    res.clearCookie(REFRESH_COOKIE, { ...this.baseCookie(), path: "/api/auth" });
  }
}
