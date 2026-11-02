import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ActivatePortalStampDto } from "./stamps.dto";
import { StampsService } from "./stamps.service";

/** `/api/portal/stamps`: danh sách đợt cấp tem và kích hoạt tem dán quả của hộ. */
@Controller("portal/stamps")
export class StampsController {
  constructor(private readonly service: StampsService) {}

  @Get()
  @Authorize("portal", "read")
  stamps(@CurrentUser() user: AuthUser) {
    return this.service.stamps(user);
  }

  @Post("activate")
  @Authorize("portal", "create")
  activate(@Body() dto: ActivatePortalStampDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.activate(dto, user, { ip });
  }
}
