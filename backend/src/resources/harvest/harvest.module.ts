import { Module } from "@nestjs/common";
import {
  GrowingZonesController,
  HarvestController,
  HarvestIncidentController,
  HarvestPlanController,
  HarvestTraceAccessLogsController,
} from "./harvest.controller";
import { HarvestService } from "./harvest.service";

@Module({
  controllers: [
    HarvestIncidentController,
    HarvestTraceAccessLogsController,
    GrowingZonesController,
    HarvestPlanController,
    HarvestController,
  ],
  providers: [HarvestService],
})
export class HarvestModule {}
