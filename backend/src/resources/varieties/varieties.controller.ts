import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateVarietyDto, UpdateVarietyDto } from "./varieties.dto";
import { VarietiesService } from "./varieties.service";

@Controller("varieties")
export class VarietiesController extends CrudController("varieties", CreateVarietyDto, UpdateVarietyDto) {
  constructor(service: VarietiesService) {
    super(service);
  }
}
