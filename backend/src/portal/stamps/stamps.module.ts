import { Module } from "@nestjs/common";
import { StampsController } from "./stamps.controller";
import { StampsService } from "./stamps.service";

@Module({
  controllers: [StampsController],
  providers: [StampsService],
})
export class PortalStampsModule {}
