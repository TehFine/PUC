import { Module } from "@nestjs/common";
import { PortalTranslateController } from "./translate.controller";
import { PortalTranslateService } from "./translate.service";

@Module({
  controllers: [PortalTranslateController],
  providers: [PortalTranslateService],
  exports: [PortalTranslateService],
})
export class PortalTranslateModule {}

