import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { InspectionService } from "./inspection.service";

/** Kiểm nghiệm và lịch kiểm tra: `/api/portal/{lab-tests,schedule}`. */
@Controller("portal")
export class InspectionController {
  constructor(private readonly service: InspectionService) {}

  @Get("lab-tests")
  @Authorize("portal", "read")
  labTests(@CurrentUser() user: AuthUser) {
    return this.service.labTests(user);
  }

  @Get("schedule")
  @Authorize("portal", "read")
  schedule(@CurrentUser() user: AuthUser) {
    return this.service.schedule(user);
  }
}
