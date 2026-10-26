import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateVillageDto, UpdateVillageDto } from "./villages.dto";
import { VillagesService } from "./villages.service";

@Controller("villages")
export class VillagesController extends CrudController("villages", CreateVillageDto, UpdateVillageDto) {
  constructor(service: VillagesService) {
    super(service);
  }
}
