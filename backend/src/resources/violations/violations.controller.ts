import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateViolationDto, UpdateViolationDto } from "./violations.dto";
import { ViolationsService } from "./violations.service";

@Controller("violations")
export class ViolationsController extends CrudController("violations", CreateViolationDto, UpdateViolationDto) {
  constructor(service: ViolationsService) {
    super(service);
  }
}
