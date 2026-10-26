import { Module } from "@nestjs/common";
import { SprayController } from "./spray.controller";
import { SprayService } from "./spray.service";

@Module({
  controllers: [SprayController],
  providers: [SprayService],
})
export class SprayModule {}
