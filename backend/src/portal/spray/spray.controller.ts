import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CreatePortalSprayDto } from "./spray.dto";
import { SprayService } from "./spray.service";

/** `/api/portal/spray`: nhật ký phun thuốc của hộ. */
@Controller("portal/spray")
export class SprayController {
  constructor(private readonly service: SprayService) {}

  @Get()
  @Authorize("portal", "read")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @Authorize("portal", "create")
  create(@Body() dto: CreatePortalSprayDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.create(dto, user, { ip });
  }
}
