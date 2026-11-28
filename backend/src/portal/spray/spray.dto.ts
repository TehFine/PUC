import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Min } from "class-validator";
import { IsoDate, OptionalField, OptionalText, RecordId } from "../../common/validation/fields";
import { OptionalNumberIn } from "../common/portal-fields";

/** Hộ dân tự ghi nhật ký phun thuốc. Thời gian cách ly và kết quả MRL do hệ thống suy ra từ danh mục thuốc. */
export class CreatePortalSprayDto {
  @OptionalField()
  @IsoDate()
  sprayedOn?: string;

  @RecordId()
  pesticideId!: number;

  @OptionalText(200)
  source?: string | null;

  @OptionalText(100)
  dose?: string | null;

  @OptionalNumberIn(0.01, 1000)
  areaHa?: number | null;

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

  @OptionalNumberIn(-90, 90)
  latitude?: number | null;

  @OptionalNumberIn(-180, 180)
  longitude?: number | null;

  @OptionalNumberIn(0, 50_000)
  gpsAccuracyM?: number | null;

  @OptionalField()
  @IsIn(["in_app_camera", "camera", "upload"])
  captureSource?: "in_app_camera" | "camera" | "upload";

  @OptionalText(64)
  clientCapturedAt?: string | null;

  @OptionalText(240)
  timeAnchorToken?: string | null;

  @OptionalNumberIn(0, 30 * 86_400_000)
  monotonicElapsedMs?: number | null;

  @OptionalField()
  @IsBoolean()
  offlineQueued?: boolean;

  @OptionalText(120)
  signboardQrToken?: string | null;

  @OptionalText(250)
  lateReason?: string | null;
}
