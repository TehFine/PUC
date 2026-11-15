import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { CookieOptions, Response } from "express";
import type { AppConfig } from "../config/configuration";

export const ACCESS_COOKIE = "htx_access";
export const REFRESH_COOKIE = "htx_refresh";
export const JWT_ISSUER = "puc-krongbuk-api";
export const JWT_AUDIENCE = "puc-krongbuk-client";

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

  signAccessToken(userId: number, tokenVersion = 0, sessionId?: number): Promise<string> {
    const claims: { ver: number; sid?: number } = { ver: tokenVersion };
    if (sessionId !== undefined && Number.isInteger(sessionId) && sessionId > 0) {
      claims.sid = sessionId;
    }
    return this.jwt.signAsync(claims, {
      subject: String(userId),
      algorithm: "HS256",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  /** Trả về id người dùng, phiên bản token và mã phiên (nếu có) khi token hợp lệ, ngược lại null. */
  async verifyAccessToken(
    token: string,
  ): Promise<{ userId: number; tokenVersion: number; sessionId?: number } | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; ver?: number; sid?: number }>(token, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      const userId = Number(payload.sub);
      const tokenVersion = payload.ver === undefined ? 0 : Number(payload.ver);
      if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(tokenVersion) || tokenVersion < 0) {
        return null;
      }
      if (payload.sid !== undefined) {
        const sid = Number(payload.sid);
        if (!Number.isInteger(sid) || sid <= 0) return null;
        return { userId, tokenVersion, sessionId: sid };
      }
      return { userId, tokenVersion };
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
