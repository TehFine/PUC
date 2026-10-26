import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsInt, IsOptional, IsPositive } from "class-validator";
import { Count, IsoDate, OptionalField, OptionalText, Text } from "../../common/validation/fields";

export class CreateTrainingCourseDto {
  @Text(200)
  title!: string;

  @IsOptional()
  @IsoDate()
  heldOn?: string | null;

  @OptionalText(200)
  location?: string | null;

  @OptionalText(100)
  trainer?: string | null;

  @OptionalField()
  @Count()
  enrolled?: number;

  @IsInt()
  @IsPositive()
  capacity!: number;

  @OptionalField()
  @IsBoolean()
  completed?: boolean;
}

export class UpdateTrainingCourseDto extends PartialType(CreateTrainingCourseDto) {}
