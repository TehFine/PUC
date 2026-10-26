import { PartialType } from "@nestjs/mapped-types";
import { Count, NonNegative, OptionalField, OptionalText, Text } from "../../common/validation/fields";

export class CreateVillageDto {
  @Text(100)
  name!: string;

  @OptionalText(100)
  leader?: string | null;

  @OptionalField()
  @Count()
  householdCount?: number;

  @OptionalField()
  @Count()
  plotCount?: number;

  @OptionalField()
  @NonNegative()
  areaHa?: number;
}

export class UpdateVillageDto extends PartialType(CreateVillageDto) {}
