import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateHarvestLotDto, UpdateHarvestLotDto } from "./harvest.dto";
import { HarvestService } from "./harvest.service";

@Controller("harvest")
export class HarvestController extends CrudController("harvest", CreateHarvestLotDto, UpdateHarvestLotDto) {
  constructor(service: HarvestService) {
    super(service);
  }
}
