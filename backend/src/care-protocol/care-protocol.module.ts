import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AdminCareProtocolController, PortalCareProtocolController } from "./care-protocol.controller";
import { CareProtocolMonitorService } from "./care-protocol.monitor";
import { CareProtocolService } from "./care-protocol.service";

@Module({
  imports: [AuditModule, UploadsModule, NotificationsModule],
  controllers: [PortalCareProtocolController, AdminCareProtocolController],
  providers: [CareProtocolService, CareProtocolMonitorService],
  exports: [CareProtocolService],
})
export class CareProtocolModule {}

