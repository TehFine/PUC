import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Put, Query } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import {
  CreateFieldAuditPassDto,
  CreateHarvestLotDto,
  GenerateItemsDto,
  NotifyHarvestPlanDto,
  UpdateEndorsementConfigDto,
  UpdateGrowingZoneStatusDto,
  UpdateHarvestLotDto,
  UpsertContributionDto,
  UpsertPlotQuotaDto,
} from "./harvest.dto";
import { HarvestService } from "./harvest.service";

@Controller("harvest/plot-quotas")
export class HarvestPlotQuotasController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("households", "read")
  listQuotas(
    @CurrentUser() user: AuthUser,
    @Query("seasonYear") seasonYear?: string,
    @Query("q") q?: string,
  ) {
    return this.harvestService.listPlotQuotas(
      { seasonYear: seasonYear ? Number(seasonYear) : undefined, q: typeof q === "string" ? q.slice(0, 100) : undefined },
      user,
    );
  }

  @Put()
  @Authorize("harvest", "update")
  upsertQuota(
    @Body(strictPipe(UpsertPlotQuotaDto)) dto: UpsertPlotQuotaDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.upsertPlotQuota(dto, user, ip);
  }
}

@Controller("harvest/plot-signboards")
export class HarvestPlotSignboardsController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("households", "read")
  listSignboards(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.harvestService.listPlotSignboards({ q: typeof q === "string" ? q.slice(0, 100) : undefined }, user);
  }
}

@Controller("harvest/endorsement-config")
export class EndorsementConfigController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("harvest", "read")
  getConfig(@CurrentUser() user: AuthUser) {
    return this.harvestService.getEndorsementConfig(user);
  }

  @Put()
  @Authorize("harvest", "update")
  updateConfig(
    @Body(strictPipe(UpdateEndorsementConfigDto)) dto: UpdateEndorsementConfigDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.updateEndorsementConfig(dto, user, ip);
  }
}

@Controller("field-audit-passes")
export class FieldAuditPassesController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("approvals", "read")
  listPasses(@CurrentUser() user: AuthUser) {
    return this.harvestService.listFieldAuditPasses(user);
  }

  @Post()
  @Authorize("harvest", "update")
  createPass(
    @Body(strictPipe(CreateFieldAuditPassDto)) dto: CreateFieldAuditPassDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.createFieldAuditPass(dto, user, ip);
  }

  @Patch(":id/revoke")
  @Authorize("harvest", "update")
  revokePass(
    @Param("id", ParseRecordIdPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.revokeFieldAuditPass(id, user, ip);
  }
}

@Controller("harvest/incident-trace")
export class HarvestIncidentController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("households", "read")
  traceIncident(
    @CurrentUser() user: AuthUser,
    @Query("plotCode") plotCode?: string,
    @Query("lotCode") lotCode?: string,
  ) {
    return this.harvestService.traceIncident({ plotCode, lotCode }, user);
  }
}

@Controller("harvest/trace-access-logs")
export class HarvestTraceAccessLogsController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("approvals", "read")
  listLogs(
    @CurrentUser() user: AuthUser,
    @Query("lotCode") lotCode?: string,
    @Query("q") q?: string,
    @Query("scopeGranted") scopeGranted?: string,
    @Query("limit") limit?: string,
  ) {
    return this.harvestService.listTraceAccessLogs(
      {
        lotCode: typeof lotCode === "string" ? lotCode.slice(0, 100) : undefined,
        q: typeof q === "string" ? q.slice(0, 100) : undefined,
        scopeGranted,
        limit: limit ? Number(limit) : undefined,
      },
      user,
    );
  }
}

@Controller("growing-zones")
export class GrowingZonesController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("harvest", "read")
  listZones(@CurrentUser() user: AuthUser) {
    return this.harvestService.listGrowingZones(user);
  }

  @Patch(":code")
  @Authorize("harvest", "update")
  updateZoneStatus(
    @Param("code") code: string,
    @Body(strictPipe(UpdateGrowingZoneStatusDto)) dto: UpdateGrowingZoneStatusDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.updateGrowingZoneStatus(code, dto, user, ip);
  }
}

@Controller("harvest-plan")
export class HarvestPlanController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get("household-plots")
  @Authorize("households", "read")
  listHouseholdPlots(
    @Query("householdId", ParseRecordIdPipe) householdId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.harvestService.listHouseholdPlots(householdId, user);
  }

  @Get()
  @Authorize("households", "read")
  listPlan(
    @CurrentUser() user: AuthUser,
    @Query("q") q?: string,
    @Query("status") status?: string,
  ) {
    return this.harvestService.listHarvestPlan(user, {
      q: typeof q === "string" ? q.slice(0, 100) : undefined,
      status: typeof status === "string" ? status.slice(0, 40) : undefined,
    });
  }

  @Post("notify")
  @Authorize("harvest", "update")
  notifyPlan(
    @Body(strictPipe(NotifyHarvestPlanDto)) dto: NotifyHarvestPlanDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.notifyHarvestPlan(dto, user, ip);
  }
}

@Controller("harvest")
export class HarvestController extends CrudController(
  "harvest",
  CreateHarvestLotDto,
  UpdateHarvestLotDto,
) {
  constructor(private readonly harvestService: HarvestService) {
    super(harvestService);
  }

  @Get(":id/items")
  @Authorize("harvest", "read")
  async getItems(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return { data: await this.harvestService.getItems(id, user) };
  }

  @Post(":id/generate-items")
  @Authorize("harvest", "update")
  async generateItems(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(GenerateItemsDto)) dto: GenerateItemsDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return { data: await this.harvestService.generateItems(id, dto, user, ip) };
  }

  @Get(":id/contributions")
  @Authorize("households", "read")
  listContributions(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.harvestService.listContributions(id, user);
  }

  @Post(":id/contributions")
  @Authorize("harvest", "update")
  upsertContribution(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(UpsertContributionDto)) dto: UpsertContributionDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.upsertContribution(id, dto, user, ip);
  }

  @Delete(":id/contributions/:cid")
  @Authorize("harvest", "update")
  removeContribution(
    @Param("id", ParseRecordIdPipe) id: number,
    @Param("cid", ParseRecordIdPipe) cid: number,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.harvestService.removeContribution(id, cid, user, ip);
  }
}
