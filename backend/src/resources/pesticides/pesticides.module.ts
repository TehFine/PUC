import { Module } from "@nestjs/common";
import { PesticidesController } from "./pesticides.controller";
import { PesticidesService } from "./pesticides.service";

@Module({
  controllers: [PesticidesController],
  providers: [PesticidesService],
})
export class PesticidesModule {}
