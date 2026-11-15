import { Module } from "@nestjs/common";
import { CareProtocolModule } from "../../care-protocol/care-protocol.module";
import { OverviewController } from "./overview.controller";
import { OverviewService } from "./overview.service";

@Module({
  imports: [CareProtocolModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class PortalOverviewModule {}
