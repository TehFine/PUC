import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateSprayDto, UpdateSprayDto } from "./spray.dto";
import { SprayService } from "./spray.service";

@Controller("spray")
export class SprayController extends CrudController("spray", CreateSprayDto, UpdateSprayDto) {
  constructor(service: SprayService) {
    super(service);
  }
}
