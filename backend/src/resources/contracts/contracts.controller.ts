import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateContractDto, UpdateContractDto } from "./contracts.dto";
import { ContractsService } from "./contracts.service";

@Controller("contracts")
export class ContractsController extends CrudController("contracts", CreateContractDto, UpdateContractDto) {
  constructor(service: ContractsService) {
    super(service);
  }
}
