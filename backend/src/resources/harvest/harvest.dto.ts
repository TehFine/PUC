import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { Count, IsoDate, NonNegative, OptionalField, OptionalText, Text } from "../../common/validation/fields";

export class CreateHarvestLotDto {
  @Text(40)
  code!: string;

  @IsoDate()
  harvestedOn!: string;

  @NonNegative()
  weightTons!: number;

  @OptionalField()
  @Count()
  householdCount?: number;

  @Text(200)
  buyer!: string;

  @Text(100)
  market!: string;

  @OptionalText(100)
  qrCode?: string | null;

  @IsIn(["exported", "delivered", "in_transit", "sampling"])
  status!: "exported" | "delivered" | "in_transit" | "sampling";
}

export class UpdateHarvestLotDto extends PartialType(CreateHarvestLotDto) {}
