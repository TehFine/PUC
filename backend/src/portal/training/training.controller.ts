import { Controller, Get, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { TrainingService } from "./training.service";

/** `/api/portal/training`: danh sách khóa tập huấn, đăng ký và hủy đăng ký của hộ. */
@Controller("portal/training")
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Get()
  @Authorize("portal", "read")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post(":id/register")
  @Authorize("portal", "create")
  register(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.register(id, user, { ip });
  }

  @Post(":id/cancel")
  @Authorize("portal", "create")
  cancel(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.cancel(id, user, { ip });
  }
}
