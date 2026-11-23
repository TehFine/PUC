import { Body, Controller, Get, Header, HttpCode, Ip, Param, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthUser } from "../../auth/auth-user";
import {
  Authorize,
  CurrentUser,
  OptionalAuth,
  OptionalCurrentUser,
  Public,
} from "../../auth/auth.decorators";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { RateLimitTier } from "../../common/throttler/rate-limit.policy";
import {
  ApproveTraceAccessRequestDto,
  CreateTraceAccessRequestDto,
  ListTraceAccessRequestsQueryDto,
  RejectOrRevokeTraceAccessRequestDto,
} from "./trace-requests.dto";
import { TraceRequestsService } from "./trace-requests.service";

function extractRequestSecret(req: Request, querySecret?: string): string | undefined {
  const headerVal = req.headers["x-trace-req-secret"];
  const raw = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (typeof raw === "string" && raw.trim()) return raw.trim().slice(0, 80);
  if (process.env.NODE_ENV !== "production" && typeof querySecret === "string" && querySecret.trim()) {
    return querySecret.trim().slice(0, 80);
  }
  return undefined;
}

@Controller("public/trace-access-requests")
export class PublicTraceRequestsController {
  constructor(private readonly traceRequests: TraceRequestsService) {}

  @Public()
  @OptionalAuth()
  @Throttle(RateLimitTier.AUTH_FORGOT_PASSWORD)
  @Post()
  @Header("Cache-Control", "no-store")
  create(
    @Body() dto: CreateTraceAccessRequestDto,
    @OptionalCurrentUser() user: AuthUser | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers["user-agent"];
    return this.traceRequests.createPublicRequest(dto, {
      user,
      ip,
      userAgent: typeof ua === "string" ? ua : undefined,
    });
  }

  @Public()
  @OptionalAuth()
  @Throttle(RateLimitTier.PUBLIC_READ)
  @Get(":requestCode/status")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  getStatus(
    @Param("requestCode") requestCode: string,
    @Query("secret") querySecret: string | undefined,
    @OptionalCurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    return this.traceRequests.getPublicRequestStatus(requestCode, {
      user,
      clientSecret: extractRequestSecret(req, querySecret),
    });
  }
}

@Controller("trace-requests")
export class TraceRequestsController {
  constructor(private readonly traceRequests: TraceRequestsService) {}

  @Get()
  @Authorize("trace-requests", "read")
  @Header("Cache-Control", "no-store")
  list(@Query() query: ListTraceAccessRequestsQueryDto, @CurrentUser() user: AuthUser) {
    return this.traceRequests.list(query, user);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @Authorize("trace-requests", "update")
  approve(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: ApproveTraceAccessRequestDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.traceRequests.approve(id, user, dto, ip);
  }

  @Post(":id/reject")
  @HttpCode(200)
  @Authorize("trace-requests", "update")
  reject(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: RejectOrRevokeTraceAccessRequestDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.traceRequests.reject(id, user, dto, ip);
  }

  @Post(":id/revoke")
  @HttpCode(200)
  @Authorize("trace-requests", "delete")
  revoke(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: RejectOrRevokeTraceAccessRequestDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.traceRequests.revoke(id, user, dto, ip);
  }
}

