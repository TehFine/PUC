import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateApprovalDto, UpdateApprovalDto } from "./approvals.dto";
import { ApprovalsService } from "./approvals.service";

@Controller("approvals")
export class ApprovalsController extends CrudController("approvals", CreateApprovalDto, UpdateApprovalDto) {
  constructor(service: ApprovalsService) {
    super(service);
  }
}
