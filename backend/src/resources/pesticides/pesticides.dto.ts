import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsOptional, Max } from "class-validator";
import { Count, NonNegative, OptionalText, Text } from "../../common/validation/fields";

export class CreatePesticideDto {
  @Text(100)
  name!: string;

  @Text(100)
  activeIngredient!: string;

  @OptionalText(50)
  concentration?: string | null;

  @OptionalText(100)
  manufacturer?: string | null;

  @IsOptional()
  @NonNegative()
  @Max(1_000)
  mrlMgKg?: number | null;

  @IsOptional()
  @Count()
  @Max(365)
  isolationDays?: number | null;

  @IsIn(["allowed", "banned", "restricted"])
  status!: "allowed" | "banned" | "restricted";
}

export class UpdatePesticideDto extends PartialType(CreatePesticideDto) {}
