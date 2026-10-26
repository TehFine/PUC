import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { IsoDate, OptionalField, OptionalText, Text } from "../../common/validation/fields";

export class CreateViolationDto {
  @IsIn(["critical", "warning"])
  severity!: "critical" | "warning";

  @Text(300)
  title!: string;

  @Text(200)
  householdLabel!: string;

  @IsoDate()
  detectedOn!: string;

  @OptionalText(40)
  plotCode?: string | null;

  @OptionalText(2000)
  description?: string | null;

  @OptionalField()
  @IsIn(["open", "resolved"])
  status?: "open" | "resolved";
}

export class UpdateViolationDto extends PartialType(CreateViolationDto) {}
