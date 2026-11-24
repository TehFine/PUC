import { Body, Controller, Delete, Get, Ip, Param, Post, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { RateLimitTier } from "../../common/throttler/rate-limit.policy";
import { ReportsService } from "../../resources/reports/reports.module";
import { CreatePortalJournalDto, ViolationResponseDto } from "./journal.dto";
import { JournalService } from "./journal.service";

/** `/api/portal/{journal,violations,logbook-report}`: nhật ký canh tác, xuất sổ nhật ký và cảnh báo/vi phạm của hộ. */
@Controller("portal")
export class JournalController {
  constructor(
    private readonly service: JournalService,
    private readonly reports: ReportsService,
  ) {}

  @Get("journal")
  @Authorize("portal", "read")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Get("logbook-report")
  @Throttle(RateLimitTier.REPORT_EXPORT)
  @Authorize("portal", "read")
  async logbookReport(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    return this.reports.getFarmerOwnLogbookReport(query, user, ip);
  }

  @Post("journal")
  @Authorize("portal", "create")
  create(@Body() dto: CreatePortalJournalDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.create(dto, user, { ip });
  }

  @Delete("journal/:id")
  @Authorize("portal", "create")
  remove(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.remove(id, user, { ip });
  }

  @Get("violations")
  @Authorize("portal", "read")
  violations(@CurrentUser() user: AuthUser) {
    return this.service.violations(user);
  }

  @Post("violations/:id/response")
  @Authorize("portal", "create")
  respond(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: ViolationResponseDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.respond(id, dto, user, { ip });
  }
}
