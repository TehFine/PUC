import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsInt, IsNumber, IsPositive, Max, Min } from "class-validator";
import {
  Count,
  IsoDate,
  NonNegative,
  OptionalField,
  OptionalIsoDate,
  OptionalText,
  RecordId,
  Text,
} from "../../common/validation/fields";

export class CreateHarvestLotDto {
  @Text(40)
  code!: string;

  @OptionalText(120)
  variety?: string | null;

  @IsoDate()
  harvestedOn!: string;

  @OptionalIsoDate()
  packedOn?: string | null;

  @OptionalIsoDate()
  exportedOn?: string | null;

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

  @IsIn(["exported", "delivered", "in_transit", "sampling", "revoked"])
  status!: "exported" | "delivered" | "in_transit" | "sampling" | "revoked";

  @OptionalText(300)
  revokedReason?: string | null;

  @OptionalField()
  @RecordId()
  enterpriseId?: number;

  @OptionalField()
  @RecordId()
  contractId?: number;

  @OptionalText(50)
  packhouseCode?: string;

  @OptionalText(200)
  packhouseName?: string | null;

  @OptionalText(300)
  packhouseAddress?: string | null;

  @OptionalText(100)
  phytosanitaryCertNo?: string | null;

  @OptionalIsoDate()
  phytosanitaryIssuedOn?: string | null;

  @OptionalField()
  @NonNegative()
  @Max(100)
  gradeAPct?: number;

  @OptionalField()
  @NonNegative()
  @Max(100)
  gradeBPct?: number;

  @OptionalField()
  @NonNegative()
  @Max(100)
  gradeCPct?: number;

  @OptionalField()
  @NonNegative()
  @Max(100)
  avgBrix?: number;

  @OptionalText(300)
  treatmentMethod?: string;

  @OptionalText(200)
  transporter?: string;

  @OptionalText(50)
  vehiclePlate?: string;

  @OptionalField()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-50)
  @Max(60)
  temperatureC?: number;

  @OptionalText(50)
  departedAt?: string;

  @OptionalText(50)
  estimatedArrival?: string;
}

export class UpdateHarvestLotDto extends PartialType(CreateHarvestLotDto) {}

export class GenerateItemsDto {
  @IsInt()
  @Min(1)
  @Max(2000)
  count!: number;

  @IsIn(["fruit", "box"])
  itemType!: "fruit" | "box";

  @OptionalField()
  @IsIn(["A", "B", "C"])
  grade?: "A" | "B" | "C";

  @OptionalField()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(1000)
  weightKg?: number;
}

export class UpsertContributionDto {
  @RecordId()
  householdId!: number;

  @OptionalText(50)
  plotCode?: string | null;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(500_000)
  weightKg!: number;
}

export class UpdateGrowingZoneStatusDto {
  @IsIn(["active", "suspended", "revoked", "pending"])
  status!: "active" | "suspended" | "revoked" | "pending";

  @OptionalText(300)
  statusNote?: string | null;
}

export class NotifyHarvestPlanDto {
  @RecordId()
  householdId!: number;

  @Text(50)
  plotCode!: string;

  @IsoDate()
  harvestDate!: string;

  @OptionalField()
  @NonNegative()
  @Max(500_000)
  estimatedYieldKg?: number;

  @OptionalText(400)
  note?: string;
}
