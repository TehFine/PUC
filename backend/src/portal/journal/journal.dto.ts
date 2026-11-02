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

  /** Id tệp ảnh đã tải lên qua `POST /api/uploads` với `purpose = journal`. */
  @RecordId()
  photoId!: number;

  @OptionalNumberIn(-90, 90)
  latitude?: number | null;

  @OptionalNumberIn(-180, 180)
  longitude?: number | null;
}

/** Hộ báo đã khắc phục cảnh báo / vi phạm nhật ký canh tác (kèm ảnh tùy chọn, tải lên với `purpose = violation`). */
export class ViolationResponseDto {
  @Text(1000)
  note!: string;

  @OptionalAttachmentId()
  photoId?: number | null;
}
