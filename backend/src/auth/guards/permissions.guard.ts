import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { forbidden, unauthorized } from "../../common/errors/app.exception";
import { PERMISSION_KEY, RequiredPermission } from "../auth.decorators";
import { can } from "../permissions";

/** Kiểm tra quyền theo ma trận vai trò × tài nguyên × hành động khai báo bằng @Authorize(). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw unauthorized();
    if (!can(user.role, required.resource, required.action)) throw forbidden();
    return true;
  }
}
