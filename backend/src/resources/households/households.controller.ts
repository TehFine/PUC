import { Body, Controller, HttpCode, Ip, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateHouseholdDto, ImportHouseholdsDto, UpdateHouseholdDto } from "./households.dto";
import { HouseholdsService } from "./households.service";

@Controller("households")
export class HouseholdsController extends CrudController("households", CreateHouseholdDto, UpdateHouseholdDto) {
  constructor(private readonly households: HouseholdsService) {
    super(households);
  }

  /** Nhập danh sách hộ (cập nhật theo `code`): `{ created, updated, errors: [{ row, message }] }`. */
  @Post("import")
  @HttpCode(200)
  @Authorize("households", "create")
  import(@Body() dto: ImportHouseholdsDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.households.import(dto.rows, user, ip);
  }
}
