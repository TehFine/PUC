import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, Min } from "class-validator";
import { Count, IsoDate, NonNegative, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateSprayDto {
  @IsoDate()
  sprayedOn!: string;

  @RecordId()
  householdId!: number;

  @RecordId()
  pesticideId!: number;

  @OptionalText(30)
  plotCode?: string | null;

  @OptionalText(200)
  source?: string | null;

  @Text(100)
  dose!: string;

  @NonNegative()
  areaHa!: number;

  @OptionalField()
  @Count()
  isolationDays?: number;

  @OptionalField()
  @IsIn(["pass", "exceeded"])
  mrlStatus?: "pass" | "exceeded";

  @OptionalText(500)
  note?: string | null;

  @IsOptional()
  @RecordId()
  photoId?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: "Tối đa 8 ảnh hoặc video hiện trường cho mỗi lần phun thuốc." })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  photoIds?: number[];

  @OptionalText(250)
  lateReason?: string | null;
}

export class UpdateSprayDto extends PartialType(CreateSprayDto) {}
