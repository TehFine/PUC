import { Body, Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import { CreateJournalDto, UpdateJournalDto, VerifyJournalDto } from "./journal.dto";
import { JournalService } from "./journal.service";

@Controller("journal")
export class JournalController extends CrudController("journal", CreateJournalDto, UpdateJournalDto) {
  constructor(private readonly journalService: JournalService) {
    super(journalService);
  }

  @Post(":id/verify")
  @HttpCode(200)
  @Authorize("approvals", "read")
  verifyEntry(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(VerifyJournalDto)) dto: VerifyJournalDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.journalService.verifyEntry(id, dto, user, ip);
  }
}
