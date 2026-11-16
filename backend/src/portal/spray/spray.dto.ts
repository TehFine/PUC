import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from "class-validator";
import { IsoDate, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

/** Hộ dân tự ghi nhật ký phun thuốc. Thời gian cách ly và kết quả MRL do hệ thống suy ra từ danh mục thuốc. */
export class CreatePortalSprayDto {
  @OptionalField()
  @IsoDate()
  sprayedOn?: string;

  @RecordId()
  pesticideId!: number;

  @OptionalText(200)
  source?: string | null;

  @Text(100)
  dose!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(1000)
  areaHa!: number;

  @OptionalText(30)
  plotCode?: string | null;

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
