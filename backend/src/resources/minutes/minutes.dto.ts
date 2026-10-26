import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { IsoDate, Text } from "../../common/validation/fields";

export class CreateMinuteDto {
  @Text(40)
  code!: string;

  @IsoDate()
  heldOn!: string;

  @Text(200)
  location!: string;

  @Text(100)
  officer!: string;

  @IsIn(["pass", "fail", "improve"])
  result!: "pass" | "fail" | "improve";
}

export class UpdateMinuteDto extends PartialType(CreateMinuteDto) {}
