import { Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { RateLimitTier } from "../../common/throttler/rate-limit.policy";
import { CreateAccountDto, UpdateAccountDto } from "./accounts.dto";
import { AccountsService } from "./accounts.service";

@Controller("accounts")
export class AccountsController extends CrudController("accounts", CreateAccountDto, UpdateAccountDto) {
  constructor(private readonly accountsService: AccountsService) {
    super(accountsService);
  }

  @Throttle(RateLimitTier.ACCOUNT_ISSUE)
  @Post(":id/revoke-sessions")
  @HttpCode(200)
  @Authorize("accounts", "update")
  revokeUserSessions(
    @Param("id", ParseRecordIdPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.accountsService.revokeUserSessions(id, user, ip);
  }

  @Throttle(RateLimitTier.ACCOUNT_ISSUE)
  @Post(":id/reset-2fa")
  @HttpCode(200)
  @Authorize("accounts", "update")
  resetTwoFactor(
    @Param("id", ParseRecordIdPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.accountsService.resetTwoFactor(id, user, ip);
  }
}
