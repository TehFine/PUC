import { Module } from "@nestjs/common";
import { FertilizersController } from "./fertilizers.controller";
import { FertilizersService } from "./fertilizers.service";

@Module({
  controllers: [FertilizersController],
  providers: [FertilizersService],
})
export class FertilizersModule {}
