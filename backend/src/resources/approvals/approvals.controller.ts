import { Body, Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import { ApproveDto, CreateApprovalDto, RejectDto, UpdateApprovalDto } from "./approvals.dto";
import { ApprovalsService } from "./approvals.service";

@Controller("approvals")
export class ApprovalsController extends CrudController("approvals", CreateApprovalDto, UpdateApprovalDto) {
  constructor(private readonly approvals: ApprovalsService) {
    super(approvals);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @Authorize("approvals", "update")
  approve(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(ApproveDto)) dto: ApproveDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.approvals.review(id, "approved", dto.note, user, ip);
  }

  @Post(":id/reject")
  @HttpCode(200)
  @Authorize("approvals", "update")
  reject(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body(strictPipe(RejectDto)) dto: RejectDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.approvals.review(id, "rejected", dto.note, user, ip);
  }
}
