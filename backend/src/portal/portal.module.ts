import { Module } from "@nestjs/common";
import { PortalHarvestModule } from "./harvest/harvest.module";
import { PortalInspectionModule } from "./inspection/inspection.module";
import { PortalJournalModule } from "./journal/journal.module";
import { PortalOverviewModule } from "./overview/overview.module";
import { PortalPlotsModule } from "./plots/plots.module";
import { PortalProfileModule } from "./profile/profile.module";
import { PortalRequestsModule } from "./requests/requests.module";
import { PortalSprayModule } from "./spray/spray.module";
import { PortalStampsModule } from "./stamps/stamps.module";
import { PortalTrainingModule } from "./training/training.module";

@Module({
  imports: [
    PortalOverviewModule,
    PortalProfileModule,
    PortalPlotsModule,
    PortalJournalModule,
    PortalSprayModule,
    PortalInspectionModule,
    PortalHarvestModule,
    PortalStampsModule,
    PortalRequestsModule,
    PortalTrainingModule,
  ],
})
export class PortalModule {}
