import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateHouseholdDto, UpdateHouseholdDto } from "./households.dto";
import { HouseholdsService } from "./households.service";

@Controller("households")
export class HouseholdsController extends CrudController("households", CreateHouseholdDto, UpdateHouseholdDto) {
  constructor(service: HouseholdsService) {
    super(service);
  }
}
