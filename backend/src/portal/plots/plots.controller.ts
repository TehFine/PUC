import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { PortalPlotsService } from "./plots.service";

/** `GET /api/portal/plots`. */
@Controller("portal")
export class PortalPlotsController {
  constructor(private readonly service: PortalPlotsService) {}

  @Get("plots")
  @Authorize("portal", "read")
  plots(@CurrentUser() user: AuthUser) {
    return this.service.plots(user);
  }
}
