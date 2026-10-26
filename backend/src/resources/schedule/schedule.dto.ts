import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { Count, IsoDate, OptionalField, Text } from "../../common/validation/fields";

export class CreateScheduleItemDto {
  @IsoDate()
  scheduledOn!: string;

  @Text(200)
  title!: string;

  @Text(100)
  officer!: string;

  @OptionalField()
  @Count()
  plotCount?: number;

  @IsIn(["periodic", "sudden", "recheck"])
  kind!: "periodic" | "sudden" | "recheck";
}

export class UpdateScheduleItemDto extends PartialType(CreateScheduleItemDto) {}
