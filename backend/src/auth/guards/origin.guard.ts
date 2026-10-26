import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import type { AppConfig } from "../../config/configuration";
import { forbidden } from "../../common/errors/app.exception";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Chặn CSRF: yêu cầu thay đổi dữ liệu có header Origin phải thuộc danh sách cho phép. */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: string[];

  constructor(config: ConfigService<AppConfig, true>) {
    this.allowed = config.get("corsOrigins", { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    const origin = request.headers.origin;
    if (origin && !this.allowed.includes(origin)) throw forbidden("Nguồn gửi yêu cầu không được phép.");
    return true;
  }
}
