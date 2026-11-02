import { PartialType } from "@nestjs/mapped-types";
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { OptionalField, OptionalText, Text } from "../../common/validation/fields";
import { SAFE_URL } from "../shared/state";

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

  @IsOptional()
  @IsIn(["export", "native", "premium", "new"])
  category?: "export" | "native" | "premium" | "new" | null;

  @OptionalField()
  @IsIn(["allowed", "encouraged", "trial"])
  status?: "allowed" | "encouraged" | "trial";

  @OptionalText(100)
  fleshColor?: string | null;

  @OptionalText(100)
  seedRate?: string | null;

  @OptionalText(100)
  brix?: string | null;

  @OptionalText(100)
  yieldPerHa?: string | null;

  @OptionalText(500)
  @Matches(SAFE_URL, { message: "Đường dẫn ảnh không hợp lệ." })
  imageUrl?: string | null;

  @OptionalText(500)
  marketPotential?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  morphology?: string[] | null;

  @IsOptional()
  @IsObject()
  farmingTechniques?: Record<string, unknown> | null;
}

export class UpdateVarietyDto extends PartialType(CreateVarietyDto) {}
