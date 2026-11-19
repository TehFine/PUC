import { Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser } from "../auth/auth.decorators";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { NotificationsService } from "./notifications.service";

const SSE_HEARTBEAT_MS = 25_000;

/** Thông báo của chính người đang đăng nhập (mọi vai trò), bao gồm kênh đẩy thời gian thực SSE. */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user);
  }

  @Get("stream")
  @SkipThrottle()
  stream(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): void {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(": connected\n\n");

    const unsubscribe = this.notifications.subscribeUserStream(user.id, user.role, (event) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) return;
      res.write(": ping\n\n");
    }, SSE_HEARTBEAT_MS);
    heartbeat.unref?.();

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
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
