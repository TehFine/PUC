import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "./auth-user";
import type { Action, ResourceKey } from "./permissions";

export const IS_PUBLIC_KEY = "auth:public";
export const IS_OPTIONAL_AUTH_KEY = "auth:optional";
export const PERMISSION_KEY = "auth:permission";

export interface RequiredPermission {
  resource: ResourceKey;
  action: Action;
}

/** Bỏ qua yêu cầu đăng nhập cho route này (đăng nhập, làm mới phiên, health…). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Cho phép truy cập công khai nhưng vẫn giải mã phiên đăng nhập (nếu có cookie hợp lệ) để phân cấp dữ liệu. */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

/** Yêu cầu vai trò của người dùng có quyền `action` trên `resource` (theo ma trận trong permissions.ts). */
export const Authorize = (resource: ResourceKey, action: Action) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest<Request>().user as AuthUser;
});

export const OptionalCurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser | undefined => {
  return context.switchToHttp().getRequest<Request>().user;
});
