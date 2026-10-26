import { Controller } from "@nestjs/common";
import { ReadOnlyCrudController } from "../../common/crud/crud-controller.factory";
import { AuditLogService } from "./audit-log.service";

@Controller("audit-log")
export class AuditLogController extends ReadOnlyCrudController("audit-log") {
  constructor(service: AuditLogService) {
    super(service);
  }
}
