import { Body, Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ReadOnlyCrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import {
  ConfirmHarvestDeclarationDto,
  RejectHarvestDeclarationDto,
} from "./harvest-declarations.dto";
import { HarvestDeclarationsService } from "./harvest-declarations.service";

@Controller("harvest-declarations")
export class HarvestDeclarationsController extends ReadOnlyCrudController("harvest-declarations") {
  constructor(private readonly declarations: HarvestDeclarationsService) {
    super(declarations);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @Authorize("harvest-declarations", "update")
  confirm(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(ConfirmHarvestDeclarationDto)) dto: ConfirmHarvestDeclarationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.declarations.review(id, "confirmed", dto.note, user, ip);
  }

  @Post(":id/reject")
  @HttpCode(200)
  @Authorize("harvest-declarations", "update")
  reject(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(RejectHarvestDeclarationDto)) dto: RejectHarvestDeclarationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.declarations.review(id, "rejected", dto.note, user, ip);
  }
}
