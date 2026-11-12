import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { SystemAlertsController } from "./system-alerts.controller";
import { SystemAlertsService } from "./system-alerts.service";

@Global()
@Module({
  controllers: [NotificationsController, SystemAlertsController],
  providers: [NotificationsService, SystemAlertsService],
  exports: [NotificationsService, SystemAlertsService],
})
export class NotificationsModule {}
