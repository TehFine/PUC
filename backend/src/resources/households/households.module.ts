import { Module } from "@nestjs/common";
import { DeletionRequestsModule } from "../deletion-requests/deletion-requests.module";
import { HouseholdsController } from "./households.controller";
import { HouseholdsService } from "./households.service";

@Module({
  imports: [DeletionRequestsModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
})
export class HouseholdsModule {}
