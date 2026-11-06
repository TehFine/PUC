import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { IsoDate, NonNegative, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateContractDto {
  @Text(40)
  code!: string;

  @RecordId()
  enterpriseId!: number;

  @Text(200)
  title!: string;

  @IsoDate()
  signedOn!: string;

  @IsoDate()
  validUntil!: string;

  @OptionalField()
  @NonNegative()
  targetTons?: number;

  @OptionalText(100)
  priceGuarantee?: string | null;

  @OptionalText(100)
  market?: string | null;

  @OptionalField()
  @IsIn(["active", "completed", "expired"])
  status?: "active" | "completed" | "expired";

  @OptionalText(2000)
  notes?: string | null;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}
