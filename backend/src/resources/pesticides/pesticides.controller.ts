import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreatePesticideDto, UpdatePesticideDto } from "./pesticides.dto";
import { PesticidesService } from "./pesticides.service";

@Controller("pesticides")
export class PesticidesController extends CrudController("pesticides", CreatePesticideDto, UpdatePesticideDto) {
  constructor(service: PesticidesService) {
    super(service);
  }
}
