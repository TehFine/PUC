import { Module } from "@nestjs/common";
import { ReportsModule } from "../../resources/reports/reports.module";
import { JournalController } from "./journal.controller";
import { JournalService } from "./journal.service";

@Module({
  imports: [ReportsModule],
  controllers: [JournalController],
  providers: [JournalService],
})
export class PortalJournalModule {}
