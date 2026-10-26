import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { Count, IsoDate, NonNegative, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateSprayDto {
  @IsoDate()
  sprayedOn!: string;

  @RecordId()
  householdId!: number;

  @RecordId()
  pesticideId!: number;

  @OptionalText(200)
  source?: string | null;

  @Text(100)
  dose!: string;

  @NonNegative()
  areaHa!: number;

  @OptionalField()
  @Count()
  isolationDays?: number;

  @IsIn(["pass", "exceeded"])
  mrlStatus!: "pass" | "exceeded";
}

export class UpdateSprayDto extends PartialType(CreateSprayDto) {}
