import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthUser } from "../auth/auth-user";
import { Authorize, CurrentUser } from "../auth/auth.decorators";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
import { ApproveRegistrationDto } from "./registrations.dto";
import { RegistrationsService } from "./registrations.service";

/** Duyệt đăng ký hộ dân: `/api/registrations*` (quản trị viên và cán bộ HTX). */
@Controller("registrations")
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) { }

  @Get()
  @Authorize("registrations", "read")
  list(@CurrentUser() user: AuthUser) {
    return this.service.listPending(user);
  }

  @Get("households")
  @Authorize("registrations", "read")
  households(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.service.availableHouseholds(typeof q === "string" ? q.slice(0, 100) : undefined, user);
  }

  @Throttle(RateLimitTier.ACCOUNT_ISSUE)
  @Post(":id/approve")
  @HttpCode(200)
  @Authorize("registrations", "update")
  approve(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: ApproveRegistrationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.approve(id, dto.householdId, user, ip);
  }

  @Throttle(RateLimitTier.ACCOUNT_ISSUE)
  @Post(":id/reject")
  @HttpCode(200)
  @Authorize("registrations", "delete")
  reject(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.reject(id, user, ip);
  }

  @Get("password-resets")
  @Authorize("registrations", "read")
  listPasswordResets(@CurrentUser() user: AuthUser) {
    return this.service.listPasswordResets(user);
  }

  @Throttle(RateLimitTier.ACCOUNT_ISSUE)
  @Post("password-resets/:id/approve")
  @HttpCode(200)
  @Authorize("registrations", "update")
  approvePasswordReset(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.approvePasswordReset(id, user, ip);
  }

  @Throttle(RateLimitTier.ACCOUNT_ISSUE)
  @Post("password-resets/:id/reject")
  @HttpCode(200)
  @Authorize("registrations", "delete")
  rejectPasswordReset(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.rejectPasswordReset(id, user, ip);
  }
}
