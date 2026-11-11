import { Body, Controller, Delete, Get, Ip, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import {
  CreateHarvestLotDto,
  GenerateItemsDto,
  NotifyHarvestPlanDto,
  UpdateHarvestLotDto,
  UpsertContributionDto,
} from "./harvest.dto";
import { HarvestService } from "./harvest.service";

@Controller("harvest-plan")
export class HarvestPlanController {
  constructor(private readonly harvestService: HarvestService) {}

  @Get()
  @Authorize("harvest", "read")
  listPlan(
    @CurrentUser() user: AuthUser,
    @Query("q") q?: string,
    @Query("status") status?: string,
  ) {
    return this.harvestService.listHarvestPlan(user, { q, status });
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
  async getItems(@Param("id", ParseRecordIdPipe) id: number) {
    return { data: await this.harvestService.getItems(id) };
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
  @Authorize("harvest", "read")
  listContributions(@Param("id", ParseRecordIdPipe) id: number) {
    return this.harvestService.listContributions(id);
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
