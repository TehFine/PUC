import { Module } from "@nestjs/common";
import { HouseholdsModule } from "./households/households.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { MinutesModule } from "./minutes/minutes.module";
import { JournalModule } from "./journal/journal.module";
import { ViolationsModule } from "./violations/violations.module";
import { SprayModule } from "./spray/spray.module";
import { TestingModule } from "./testing/testing.module";
import { HarvestModule } from "./harvest/harvest.module";
import { TrainingModule } from "./training/training.module";
import { PesticidesModule } from "./pesticides/pesticides.module";
import { VarietiesModule } from "./varieties/varieties.module";
import { VillagesModule } from "./villages/villages.module";
import { AccountsModule } from "./accounts/accounts.module";
import { AuditLogModule } from "./audit-log/audit-log.module";

/** Các nhóm dữ liệu nghiệp vụ (mỗi nhóm một module: controller + service + DTO). */
@Module({
  imports: [
    HouseholdsModule,
    ApprovalsModule,
    ScheduleModule,
    MinutesModule,
    JournalModule,
    ViolationsModule,
    SprayModule,
    TestingModule,
    HarvestModule,
    TrainingModule,
    PesticidesModule,
    VarietiesModule,
    VillagesModule,
    AccountsModule,
    AuditLogModule,
  ],
})
export class ResourcesModule {}
