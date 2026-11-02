import { Body, Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import { CreateViolationDto, ResolveViolationDto, UpdateViolationDto } from "./violations.dto";
import { ViolationsService } from "./violations.service";

@Controller("violations")
export class ViolationsController extends CrudController("violations", CreateViolationDto, UpdateViolationDto) {
  constructor(private readonly violations: ViolationsService) {
    super(violations);
  }

  @Post(":id/resolve")
  @HttpCode(200)
  @Authorize("violations", "update")
  resolve(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(ResolveViolationDto)) dto: ResolveViolationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.violations.resolve(id, dto, user, ip);
  }
}
