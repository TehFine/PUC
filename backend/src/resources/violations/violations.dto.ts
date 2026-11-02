import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsOptional } from "class-validator";
import { IsoDate, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateViolationDto {
  @IsIn(["critical", "warning"])
  severity!: "critical" | "warning";

  @Text(300)
  title!: string;

  @OptionalText(200)
  householdLabel?: string;

  @IsOptional()
  @RecordId()
  householdId?: number | null;

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

export class ResolveViolationDto {
  @Text(2000)
  resolutionNotes!: string;
}
