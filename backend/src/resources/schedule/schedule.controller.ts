import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateScheduleItemDto, UpdateScheduleItemDto } from "./schedule.dto";
import { ScheduleService } from "./schedule.service";

@Controller("schedule")
export class ScheduleController extends CrudController("schedule", CreateScheduleItemDto, UpdateScheduleItemDto) {
  constructor(service: ScheduleService) {
    super(service);
  }
}
