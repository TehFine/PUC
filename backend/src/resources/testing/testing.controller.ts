import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateLabTestDto, UpdateLabTestDto } from "./testing.dto";
import { TestingService } from "./testing.service";

@Controller("testing")
export class TestingController extends CrudController("testing", CreateLabTestDto, UpdateLabTestDto) {
  constructor(service: TestingService) {
    super(service);
  }
}
