import { Body, Controller, Get, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { Authorize, CurrentUser } from "../auth/auth.decorators";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { CreateSystemAlertDto } from "./system-alerts.dto";
import { SystemAlertsService } from "./system-alerts.service";

@Controller("system-alerts")
export class SystemAlertsController {
  constructor(private readonly alerts: SystemAlertsService) {}

  @Authorize("accounts", "read")
  @Get()
  list() {
    return this.alerts.listRecent();
  }

  @Authorize("accounts", "create")
  @Post()
  create(@Body() dto: CreateSystemAlertDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.alerts.create(dto, user, ip);
  }

  @Authorize("accounts", "update")
  @Post(":id/resolve")
  @HttpCode(200)
  resolve(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.alerts.resolve(id, user, ip);
  }
}

