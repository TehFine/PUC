import { Body, Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import { CreateSprayDto, UpdateSprayDto, VerifySprayDto } from "./spray.dto";
import { SprayService } from "./spray.service";

@Controller("spray")
export class SprayController extends CrudController("spray", CreateSprayDto, UpdateSprayDto) {
  constructor(private readonly sprayService: SprayService) {
    super(sprayService);
  }

  @Post(":id/verify")
  @HttpCode(200)
  @Authorize("approvals", "read")
  verifyRecord(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(VerifySprayDto)) dto: VerifySprayDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.sprayService.verifyRecord(id, dto, user, ip);
  }
}
