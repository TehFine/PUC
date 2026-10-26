import { IsPositive, IsNumber, Max } from "class-validator";
import { Count, IsoDate, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

/** Hộ dân tự ghi nhật ký canh tác (hộ lấy từ tài khoản đăng nhập, không nhận từ client). */
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
}

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
}

/** Hộ dân gửi hồ sơ xin duyệt / đăng ký vùng trồng. */
export class CreatePortalApprovalDto {
  @Text(120)
  requestType!: string;

  @OptionalField()
  @Count()
  docsCount?: number;
}
