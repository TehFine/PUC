import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateMinuteDto, UpdateMinuteDto } from "./minutes.dto";
import { MinutesService } from "./minutes.service";

@Controller("minutes")
export class MinutesController extends CrudController("minutes", CreateMinuteDto, UpdateMinuteDto) {
  constructor(service: MinutesService) {
    super(service);
  }
}
