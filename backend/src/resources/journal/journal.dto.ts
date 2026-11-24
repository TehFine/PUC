import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import { IsoDate, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateJournalDto {
  @IsoDate()
  entryOn!: string;

  @RecordId()
  @Max(Number.MAX_SAFE_INTEGER)
  householdId!: number;

  @Text(40)
  plotCode!: string;

  @Text(100)
  activity!: string;

  @OptionalText(500)
  detail?: string | null;

  @OptionalText(100)
  recorder?: string | null;

  @OptionalField()
  @IsBoolean()
  hasPhoto?: boolean;

  @IsOptional()
  @RecordId()
  @Max(Number.MAX_SAFE_INTEGER)
  photoId?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: "Tối đa 8 ảnh hoặc video hiện trường cho mỗi nhật ký." })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  photoIds?: number[];

  @OptionalText(250)
  lateReason?: string | null;
}

export class UpdateJournalDto extends PartialType(CreateJournalDto) {}

export class VerifyJournalDto {
  @IsBoolean()
  verified!: boolean;
}
