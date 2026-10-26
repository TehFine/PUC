import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateAccountDto, UpdateAccountDto } from "./accounts.dto";
import { AccountsService } from "./accounts.service";

@Controller("accounts")
export class AccountsController extends CrudController("accounts", CreateAccountDto, UpdateAccountDto) {
  constructor(service: AccountsService) {
    super(service);
  }
}
