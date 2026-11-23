import { Body, Controller, Get, HttpCode, Ip, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthUser } from "../auth/auth-user";
import { Authorize, CurrentUser } from "../auth/auth.decorators";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
import { CreateSystemAlertDto } from "./system-alerts.dto";
import { SystemAlertsService } from "./system-alerts.service";

@Controller("system-alerts")
export class SystemAlertsController {
  constructor(private readonly alerts: SystemAlertsService) {}

  @Authorize("system-alerts", "read")
  @Get()
  list() {
    return this.alerts.listRecent();
  }

  @Authorize("system-alerts", "create")
  @Throttle(RateLimitTier.BULK_MUTATION)
  @Post()
  create(@Body() dto: CreateSystemAlertDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.alerts.create(dto, user, ip);
  }

  @Authorize("system-alerts", "update")
  @Post(":id/resolve")
  @HttpCode(200)
  resolve(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.alerts.resolve(id, user, ip);
  }
}

