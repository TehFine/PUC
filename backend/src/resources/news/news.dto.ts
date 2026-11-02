import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsIn, IsObject, IsOptional, Matches } from "class-validator";
import { IsoDate, OptionalField, OptionalText, Text } from "../../common/validation/fields";
import { SAFE_URL } from "../shared/state";

export class CreateNewsArticleDto {
  @OptionalText(120)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "Slug chỉ gồm chữ thường, chữ số và dấu gạch ngang.",
  })
  slug?: string;

  @IsIn(["visit", "training", "protection", "farming"])
  category!: "visit" | "training" | "protection" | "farming";

  @Text(300)
  title!: string;

  @Text(1000)
  excerpt!: string;

  @IsObject()
  content!: Record<string, unknown>;

  @Text(150)
  author!: string;

  @OptionalText(500)
  @Matches(SAFE_URL, { message: "Đường dẫn ảnh không hợp lệ." })
  imageUrl?: string | null;

  @OptionalText(300)
  imageAlt?: string | null;

  @OptionalText(50)
  readTime?: string | null;

  @OptionalField()
  @IsBoolean()
  featured?: boolean;

  @OptionalField()
  @IsIn(["draft", "published"])
  status?: "draft" | "published";

  @IsOptional()
  @IsoDate()
  publishedOn?: string | null;
}

export class UpdateNewsArticleDto extends PartialType(CreateNewsArticleDto) {}
