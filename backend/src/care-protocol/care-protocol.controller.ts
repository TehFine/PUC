import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { Authorize, CurrentUser } from "../auth/auth.decorators";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
import {
  CareProtocolListQueryDto,
  ConfigurePlotCarePlanDto,
  DeclareCareMilestoneDto,
} from "./care-protocol.dto";
import { CareProtocolService } from "./care-protocol.service";

/** `/api/portal/care-protocol`: Lộ trình & khai báo mốc quy trình chăm sóc 2026-2027 dành cho hộ nông dân. */
@Controller("portal/care-protocol")
export class PortalCareProtocolController {
  constructor(private readonly service: CareProtocolService) {}

  @Get()
  @Authorize("portal", "read")
  list(@CurrentUser() user: AuthUser) {
    return this.service.portalListPlans(user);
  }

  @Post("configure")
  @HttpCode(200)
  @Authorize("portal", "create")
  configure(@Body() dto: ConfigurePlotCarePlanDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.portalConfigurePlan(dto, user, { ip });
  }

  @Post("declare")
  @Authorize("portal", "create")
  declare(@Body() dto: DeclareCareMilestoneDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.portalDeclareMilestone(dto, user, { ip });
  }
}

/** `/api/care-protocol`: Giám sát tiến độ, thiết lập hộ và quét cảnh báo quy trình 2026-2027 dành cho cán bộ quản trị. */
@Controller("care-protocol")
export class AdminCareProtocolController {
  constructor(
    private readonly service: CareProtocolService,
    private readonly audit: AuditService,
  ) {}

  @Get("catalog")
  @Authorize("journal", "read")
  catalog() {
    return this.service.getCatalog();
  }

  @Get()
  @Authorize("journal", "read")
  listRoot(@Query() query: CareProtocolListQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.adminListPlans(query, user);
  }

  @Get("plans")
  @Authorize("journal", "read")
  listPlans(@Query() query: CareProtocolListQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.adminListPlans(query, user);
  }

  @Post("configure")
  @HttpCode(200)
  @Authorize("journal", "create")
  configureRoot(@Body() dto: ConfigurePlotCarePlanDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.adminConfigurePlan(dto, user, { ip });
  }

  @Post("plans/configure")
  @HttpCode(200)
  @Authorize("journal", "create")
  configurePlan(@Body() dto: ConfigurePlotCarePlanDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.adminConfigurePlan(dto, user, { ip });
  }

  @Post("scan")
  @HttpCode(200)
  @Throttle(RateLimitTier.PROTOCOL_SCAN)
  @Authorize("violations", "create")
  async scanNow(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    const result = await this.service.scanAndNotifyAllPlans(user);
    await this.audit.write(
      { ip, user },
      {
        action: "Quét tiến độ lộ trình chăm sóc",
        object: "Quy trình 2026-2027",
        detail: `Đã quét ${result.scanned} lộ trình, phát sinh ${result.criticalViolations} vi phạm quá hạn và ${result.overdueWarnings} cảnh báo trễ`,
      },
    );
    return result;
  }

  @Get("plans/:id")
  @Authorize("journal", "read")
  planDetail(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.adminGetPlanDetail(id, user);
  }

  @Get(":id")
  @Authorize("journal", "read")
  detailRoot(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.adminGetPlanDetail(id, user);
  }
}
