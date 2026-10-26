import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsOptional } from "class-validator";
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
  mrlMgKg?: number | null;

  @IsOptional()
  @Count()
  isolationDays?: number | null;

  @IsIn(["allowed", "banned", "restricted"])
  status!: "allowed" | "banned" | "restricted";
}

export class UpdatePesticideDto extends PartialType(CreatePesticideDto) {}
