import { Module } from "@nestjs/common";
import { PortalPlotsController } from "./plots.controller";
import { PortalPlotsService } from "./plots.service";

@Module({
  controllers: [PortalPlotsController],
  providers: [PortalPlotsService],
})
export class PortalPlotsModule {}
