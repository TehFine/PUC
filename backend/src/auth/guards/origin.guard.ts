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

    const secFetchSite = request.headers["sec-fetch-site"];
    if (secFetchSite === "cross-site") {
      throw forbidden("Nguồn gửi yêu cầu chéo trang (cross-site) không được phép.");
    }

    const origin = request.headers.origin;
    if (origin) {
      if (!this.allowed.includes(origin)) throw forbidden("Nguồn gửi yêu cầu không được phép.");
      return true;
    }

    const referer = request.headers.referer;
    if (referer) {
      let refererOrigin = "";
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        throw forbidden("Nguồn gửi yêu cầu không được phép.");
      }
      if (!this.allowed.includes(refererOrigin)) {
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
