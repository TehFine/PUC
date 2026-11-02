import { Body, Controller, Get, Ip, Param, Patch } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe, strictPipe } from "../../common/pipes/validation.pipes";
import {
  CreateTrainingCourseDto,
  UpdateRegistrationStatusDto,
  UpdateTrainingCourseDto,
} from "./training.dto";
import { TrainingService } from "./training.service";

@Controller("training")
export class TrainingController extends CrudController(
  "training",
  CreateTrainingCourseDto,
  UpdateTrainingCourseDto,
) {
  constructor(private readonly training: TrainingService) {
    super(training);
  }

  @Get(":id/registrations")
  @Authorize("training-registrations", "read")
  listRegistrations(@Param("id", ParseRecordIdPipe) id: number) {
    return this.training.listRegistrations(id);
  }

  @Patch(":id/registrations/:rid")
  @Authorize("training-registrations", "update")
  updateRegistration(
    @Param("id", ParseRecordIdPipe) id: number,
    @Param("rid", ParseRecordIdPipe) rid: number,
    @Body(strictPipe(UpdateRegistrationStatusDto)) dto: UpdateRegistrationStatusDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.training.updateRegistration(id, rid, dto, user, ip);
  }
}
