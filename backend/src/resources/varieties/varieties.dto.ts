import { PartialType } from "@nestjs/mapped-types";
import { OptionalText, Text } from "../../common/validation/fields";

export class CreateVarietyDto {
  @Text(100)
  name!: string;

  @OptionalText(100)
  origin?: string | null;

  @OptionalText(50)
  weightRange?: string | null;

  @OptionalText(50)
  harvestYears?: string | null;

  @OptionalText(1000)
  description?: string | null;
}

export class UpdateVarietyDto extends PartialType(CreateVarietyDto) {}
