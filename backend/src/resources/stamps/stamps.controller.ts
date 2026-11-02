import { Body, Controller, Get, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ReadOnlyCrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import { CreateStampAllocationDto } from "./stamps.dto";
import { StampsService } from "./stamps.service";

@Controller("stamp-allocations")
export class StampsController extends ReadOnlyCrudController("stamps") {
  constructor(private readonly stamps: StampsService) {
    super(stamps);
  }

  @Post()
  @Authorize("stamps", "create")
  allocate(
    @Body(strictPipe(CreateStampAllocationDto)) dto: CreateStampAllocationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.stamps.allocate(dto, user, ip);
  }

  @Post(":id/revoke")
  @HttpCode(200)
  @Authorize("stamps", "update")
  revoke(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.stamps.revoke(id, user, ip);
  }

  @Get(":id/stamps")
  @Authorize("stamps", "read")
  listStamps(@Param("id", ParseRecordIdPipe) id: number) {
    return this.stamps.listStamps(id);
  }
}
