import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, Min } from "class-validator";
import { RecordId, IsoDate, OptionalField, OptionalText, Text } from "../../common/validation/fields";
import { OptionalAttachmentId, OptionalNumberIn } from "../common/portal-fields";

/** Hộ dân tự ghi nhật ký canh tác (hộ lấy từ tài khoản đăng nhập, không nhận từ client). Ảnh thực địa bắt buộc. */
export class CreatePortalJournalDto {
  @OptionalField()
  @IsoDate()
  entryOn?: string;

  @Text(30)
  plotCode!: string;

  @Text(100)
  activity!: string;

  @OptionalText(500)
  detail?: string | null;

  /** Id tệp ảnh đại diện đã tải lên qua `POST /api/uploads` với `purpose = journal`. */
  @OptionalField()
  @RecordId()
  photoId?: number;

  /** Danh sách nhiều ảnh hoặc video hiện trường đã tải lên (tối đa 8 tệp). */
  @OptionalField()
  @IsArray()
  @ArrayMaxSize(8, { message: "Tối đa 8 ảnh hoặc video hiện trường cho mỗi bản ghi nhật ký." })
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

/** Hộ báo đã khắc phục cảnh báo / vi phạm nhật ký canh tác (kèm một hoặc nhiều ảnh/video, tải lên với `purpose = violation`). */
export class ViolationResponseDto {
  @Text(1000)
  note!: string;

  @OptionalAttachmentId()
  photoId?: number | null;

  @OptionalField()
  @IsArray()
  @ArrayMaxSize(6, { message: "Tối đa 6 ảnh hoặc video minh chứng khắc phục." })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  photoIds?: number[];
}
