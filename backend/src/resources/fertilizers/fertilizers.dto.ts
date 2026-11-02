import { PartialType } from "@nestjs/mapped-types";
import { IsIn, Matches } from "class-validator";
import { OptionalField, OptionalText, Text } from "../../common/validation/fields";
import { SAFE_URL } from "../shared/state";

export class CreateFertilizerDto {
  @Text(150)
  name!: string;

  @IsIn(["organic", "npk", "foliar", "microbial", "restricted"])
  category!: "organic" | "npk" | "foliar" | "microbial" | "restricted";

  @Text(300)
  formula!: string;

  @Text(200)
  manufacturer!: string;

  @Text(200)
  dosage!: string;

  @Text(200)
  applicationMethod!: string;

  @Text(200)
  timing!: string;

  @OptionalField()
  @IsIn(["encouraged", "allowed", "warning"])
  status?: "encouraged" | "allowed" | "warning";

  @OptionalText(500)
  @Matches(SAFE_URL, { message: "Đường dẫn ảnh không hợp lệ." })
  imageUrl?: string | null;

  @OptionalText(2000)
  description?: string | null;
}

export class UpdateFertilizerDto extends PartialType(CreateFertilizerDto) {}
