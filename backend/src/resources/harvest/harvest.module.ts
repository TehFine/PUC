import { Module } from "@nestjs/common";
import {
  EndorsementConfigController,
  FieldAuditPassesController,
  GrowingZonesController,
  HarvestController,
  HarvestIncidentController,
  HarvestPlanController,
  HarvestPlotQuotasController,
  HarvestPlotSignboardsController,
  HarvestTraceAccessLogsController,
} from "./harvest.controller";
import { HarvestService } from "./harvest.service";

@Module({
  controllers: [
    HarvestPlotQuotasController,
    HarvestPlotSignboardsController,
    EndorsementConfigController,
    FieldAuditPassesController,
    HarvestIncidentController,
    HarvestTraceAccessLogsController,
    GrowingZonesController,
    HarvestPlanController,
    HarvestController,
  ],
  providers: [HarvestService],
})
export class HarvestModule {}
