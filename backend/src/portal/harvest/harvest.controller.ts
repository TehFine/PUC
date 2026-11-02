import { Body, Controller, Delete, Get, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { CreateHarvestDeclarationDto } from "./harvest.dto";
import { HarvestService } from "./harvest.service";

/** `/api/portal/{harvest,harvest-declarations}`: lô thu hoạch và khai báo thu hái của hộ. */
@Controller("portal")
export class HarvestController {
  constructor(private readonly service: HarvestService) {}

  @Get("harvest")
  @Authorize("portal", "read")
  harvest(@CurrentUser() user: AuthUser) {
    return this.service.harvest(user);
  }

  @Get("harvest-declarations")
  @Authorize("portal", "read")
  declarations(@CurrentUser() user: AuthUser) {
    return this.service.declarations(user);
  }

  @Post("harvest-declarations")
  @Authorize("portal", "create")
  createDeclaration(@Body() dto: CreateHarvestDeclarationDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.createDeclaration(dto, user, { ip });
  }

  @Delete("harvest-declarations/:id")
  @Authorize("portal", "create")
  removeDeclaration(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.removeDeclaration(id, user, { ip });
  }
}
