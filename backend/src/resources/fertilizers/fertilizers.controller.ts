import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateFertilizerDto, UpdateFertilizerDto } from "./fertilizers.dto";
import { FertilizersService } from "./fertilizers.service";

@Controller("fertilizers")
export class FertilizersController extends CrudController(
  "fertilizers",
  CreateFertilizerDto,
  UpdateFertilizerDto,
) {
  constructor(service: FertilizersService) {
    super(service);
  }
}
