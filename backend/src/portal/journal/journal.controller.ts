import { Body, Controller, Delete, Get, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { CreatePortalJournalDto, ViolationResponseDto } from "./journal.dto";
import { JournalService } from "./journal.service";

/** `/api/portal/{journal,violations}`: nhật ký canh tác và cảnh báo/vi phạm của hộ. */
@Controller("portal")
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Get("journal")
  @Authorize("portal", "read")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post("journal")
  @Authorize("portal", "create")
  create(@Body() dto: CreatePortalJournalDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.create(dto, user, { ip });
  }

  @Delete("journal/:id")
  @Authorize("portal", "create")
  remove(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.remove(id, user, { ip });
  }

  @Get("violations")
  @Authorize("portal", "read")
  violations(@CurrentUser() user: AuthUser) {
    return this.service.violations(user);
  }

  @Post("violations/:id/response")
  @Authorize("portal", "create")
  respond(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: ViolationResponseDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.respond(id, dto, user, { ip });
  }
}
