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

  @OptionalField()
  enterpriseId?: number;

  @OptionalField()
  contractId?: number;

  @OptionalText(50)
  packhouseCode?: string;

  @OptionalField()
  @NonNegative()
  gradeAPct?: number;

  @OptionalField()
  @NonNegative()
  gradeBPct?: number;

  @OptionalField()
  @NonNegative()
  gradeCPct?: number;

  @OptionalField()
  @NonNegative()
  avgBrix?: number;

  @OptionalText(300)
  treatmentMethod?: string;

  @OptionalText(200)
  transporter?: string;

  @OptionalText(50)
  vehiclePlate?: string;

  @OptionalField()
  temperatureC?: number;

  @OptionalText(50)
  departedAt?: string;

  @OptionalText(50)
  estimatedArrival?: string;
}

export class UpdateHarvestLotDto extends PartialType(CreateHarvestLotDto) {}

export class GenerateItemsDto {
  @Count()
  count!: number;

  @IsIn(["fruit", "box"])
  itemType!: "fruit" | "box";

  @OptionalField()
  grade?: "A" | "B" | "C";

  @OptionalField()
  weightKg?: number;
}
