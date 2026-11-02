import { Body, Controller, Get, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { CreatePortalApprovalDto } from "./requests.dto";
import { RequestsService } from "./requests.service";

/** `/api/portal/approvals`: danh sách hồ sơ xin duyệt, gửi hồ sơ và hủy hồ sơ chờ duyệt của hộ. */
@Controller("portal/approvals")
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Get()
  @Authorize("portal", "read")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @Authorize("portal", "create")
  create(@Body() dto: CreatePortalApprovalDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.create(dto, user, { ip });
  }

  @Post(":id/cancel")
  @Authorize("portal", "create")
  cancel(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.cancel(id, user, { ip });
  }
}
