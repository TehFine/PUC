import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateEnterpriseDto, UpdateEnterpriseDto } from "./enterprises.dto";
import { EnterprisesService } from "./enterprises.service";

@Controller("enterprises")
export class EnterprisesController extends CrudController("enterprises", CreateEnterpriseDto, UpdateEnterpriseDto) {
  constructor(service: EnterprisesService) {
    super(service);
  }
}
