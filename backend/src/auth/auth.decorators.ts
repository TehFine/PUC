import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "./auth-user";
import type { Action, ResourceKey } from "./permissions";

export const IS_PUBLIC_KEY = "auth:public";
export const PERMISSION_KEY = "auth:permission";

export interface RequiredPermission {
  resource: ResourceKey;
  action: Action;
}

/** Bỏ qua yêu cầu đăng nhập cho route này (đăng nhập, làm mới phiên, health…). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Yêu cầu vai trò của người dùng có quyền `action` trên `resource` (theo ma trận trong permissions.ts). */
export const Authorize = (resource: ResourceKey, action: Action) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest<Request>().user as AuthUser;
});
