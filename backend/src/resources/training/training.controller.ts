import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateTrainingCourseDto, UpdateTrainingCourseDto } from "./training.dto";
import { TrainingService } from "./training.service";

@Controller("training")
export class TrainingController extends CrudController("training", CreateTrainingCourseDto, UpdateTrainingCourseDto) {
  constructor(service: TrainingService) {
    super(service);
  }
}
