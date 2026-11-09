import { Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser } from "../auth/auth.decorators";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { NotificationsService } from "./notifications.service";

/** Thông báo của chính người đang đăng nhập (mọi vai trò). */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user);
  }

  @Post("read-all")
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post("clear-read")
  @HttpCode(200)
  clearRead(@CurrentUser() user: AuthUser) {
    return this.notifications.clearRead(user.id);
  }

  @Delete("read")
  clearReadDelete(@CurrentUser() user: AuthUser) {
    return this.notifications.clearRead(user.id);
  }

  @Post(":id/read")
  @HttpCode(200)
  read(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user.id, id);
  }
}
