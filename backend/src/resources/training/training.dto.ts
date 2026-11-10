import { OmitType, PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, Matches } from "class-validator";
import { Count, IsoDate, OptionalField, OptionalText, Text } from "../../common/validation/fields";

export class CreateTrainingCourseDto {
  @Text(200)
  title!: string;

  @IsOptional()
  @IsoDate()
  heldOn?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Giờ bắt đầu phải có dạng HH:MM." })
  startsAt?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Giờ kết thúc phải có dạng HH:MM." })
  endsAt?: string | null;

  @OptionalText(200)
  location?: string | null;

  @OptionalText(100)
  trainer?: string | null;

  @OptionalText(2000)
  description?: string | null;

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

export class UpdateTrainingCourseDto extends PartialType(OmitType(CreateTrainingCourseDto, ["enrolled"] as const)) {}

export class UpdateRegistrationStatusDto {
  @IsIn(["registered", "attended", "absent", "cancelled"])
  status!: "registered" | "attended" | "absent" | "cancelled";
}
