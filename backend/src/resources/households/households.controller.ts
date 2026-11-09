import { Body, Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { CreateHouseholdDto, ImportHouseholdsDto, IssueHouseholdAccountDto, UpdateHouseholdDto } from "./households.dto";
import { HouseholdsService } from "./households.service";

@Controller("households")
export class HouseholdsController extends CrudController("households", CreateHouseholdDto, UpdateHouseholdDto) {
  constructor(private readonly households: HouseholdsService) {
    super(households);
  }

  /** Nhập danh sách hộ (cập nhật theo `code`): `{ created, updated, errors: [{ row, message }] }`. */
  @Post("import")
  @Throttle({ default: { limit: process.env.NODE_ENV === "test" ? 1000 : 10, ttl: 60_000 } })
  @HttpCode(200)
  @Authorize("households", "create")
  import(@Body() dto: ImportHouseholdsDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.households.import(dto.rows, user, ip);
  }

  /** Ban hành hoặc cấp lại tài khoản đăng nhập cho hộ nông dân sau khi đã thiết lập hồ sơ hộ. */
  @Post(":id/issue-account")
  @HttpCode(200)
  @Authorize("households", "update")
  issueAccount(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: IssueHouseholdAccountDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.households.issueAccount(id, dto, user, ip);
  }
}
