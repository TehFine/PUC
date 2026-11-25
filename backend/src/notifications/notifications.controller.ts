import { Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser } from "../auth/auth.decorators";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
import { NotificationsService } from "./notifications.service";

const SSE_HEARTBEAT_MS = 15_000;

function writeSseChunk(res: Response, chunk: string): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(chunk);
  (res as Response & { flush?: () => void }).flush?.();
}

/** Thông báo của chính người đang đăng nhập (mọi vai trò), bao gồm kênh đẩy thời gian thực SSE. */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user);
  }

  @Get("stream")
  @SkipThrottle({ burst: true })
  @Throttle(RateLimitTier.AUTH_SESSION)
  stream(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): void {
    req.socket?.setNoDelay(true);
    res.socket?.setNoDelay(true);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    writeSseChunk(res, ": connected\n\n");

    let closed = false;
    let unsubscribe = () => {};
    const heartbeat = setInterval(() => {
      writeSseChunk(res, ": ping\n\n");
    }, SSE_HEARTBEAT_MS);
    heartbeat.unref?.();

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    };

    unsubscribe = this.notifications.subscribeUserStream(
      user.id,
      user.role,
      (event) => {
        writeSseChunk(res, `data: ${JSON.stringify(event)}\n\n`);
      },
      {
        sessionId: user.sessionId ?? null,
        onEvict: cleanup,
      },
    );

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
