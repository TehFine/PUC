import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { OverviewService } from "./overview.service";

/** `GET /api/portal/overview`: tổng quan và nhắc việc của hộ đang đăng nhập. */
@Controller("portal")
export class OverviewController {
  constructor(private readonly service: OverviewService) {}

  @Get("overview")
  @Authorize("portal", "read")
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user);
  }
}
