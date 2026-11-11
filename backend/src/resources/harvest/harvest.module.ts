import { Module } from "@nestjs/common";
import { HarvestController, HarvestPlanController } from "./harvest.controller";
import { HarvestService } from "./harvest.service";

@Module({
  controllers: [HarvestPlanController, HarvestController],
  providers: [HarvestService],
})
export class HarvestModule {}
