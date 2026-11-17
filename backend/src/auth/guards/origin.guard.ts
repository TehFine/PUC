import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import type { AppConfig } from "../../config/configuration";
import { forbidden } from "../../common/errors/app.exception";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Chặn CSRF: yêu cầu thay đổi dữ liệu có header Origin/Referer phải thuộc danh sách cho phép. */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: string[];
  private readonly isTest: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    this.allowed = config.get("corsOrigins", { infer: true });
    this.isTest = config.get("nodeEnv", { infer: true }) === "test";
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const rawSecFetchSite = request.headers["sec-fetch-site"];
    const secFetchSites = Array.isArray(rawSecFetchSite)
      ? rawSecFetchSite
      : rawSecFetchSite
        ? [rawSecFetchSite]
        : [];
    if (secFetchSites.some((v) => v.trim().toLowerCase() === "cross-site")) {
      throw forbidden("Nguồn gửi yêu cầu chéo trang (cross-site) không được phép.");
    }

    const rawOrigin = request.headers.origin;
    if (rawOrigin !== undefined) {
      if (typeof rawOrigin !== "string" || !rawOrigin.trim() || rawOrigin.trim().toLowerCase() === "null") {
        throw forbidden("Nguồn gửi yêu cầu không được phép.");
      }
      let normalizedOrigin = "";
      try {
        const parsed = new URL(rawOrigin.trim());
        if (
          (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
          parsed.username !== "" ||
          parsed.password !== "" ||
          (parsed.pathname !== "/" && parsed.pathname !== "") ||
          parsed.search !== "" ||
          parsed.hash !== ""
        ) {
          throw forbidden("Nguồn gửi yêu cầu không được phép.");
        }
        normalizedOrigin = parsed.origin;
      } catch {
        throw forbidden("Nguồn gửi yêu cầu không được phép.");
      }
      if (!normalizedOrigin || normalizedOrigin === "null" || !this.allowed.includes(normalizedOrigin)) {
        throw forbidden("Nguồn gửi yêu cầu không được phép.");
      }
      return true;
    }

    const rawReferer = request.headers.referer;
    if (rawReferer !== undefined) {
      if (typeof rawReferer !== "string" || !rawReferer.trim()) {
        throw forbidden("Nguồn gửi yêu cầu không được phép.");
      }
      let refererOrigin = "";
      try {
        refererOrigin = new URL(rawReferer.trim()).origin;
      } catch {
        throw forbidden("Nguồn gửi yêu cầu không được phép.");
      }
      if (!refererOrigin || refererOrigin === "null" || !this.allowed.includes(refererOrigin)) {
        throw forbidden("Nguồn gửi yêu cầu không được phép.");
      }
      return true;
    }

    if (!this.isTest) {
      if (request.headers.cookie) {
        throw forbidden("Thiếu thông tin nguồn gửi yêu cầu (Origin/Referer).");
      }
      if (!request.headers["x-requested-with"]) {
        throw forbidden("Thiếu thông tin xác thực nguồn gửi yêu cầu.");
      }
    }

    return true;
  }
}
