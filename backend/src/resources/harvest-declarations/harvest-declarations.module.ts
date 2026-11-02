import { Module } from "@nestjs/common";
import { HarvestDeclarationsController } from "./harvest-declarations.controller";
import { HarvestDeclarationsService } from "./harvest-declarations.service";

@Module({
  controllers: [HarvestDeclarationsController],
  providers: [HarvestDeclarationsService],
})
export class HarvestDeclarationsModule {}
