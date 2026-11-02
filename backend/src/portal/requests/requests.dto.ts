import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsPositive } from "class-validator";
import { Count, OptionalField, OptionalText, Text } from "../../common/validation/fields";

/** Hộ dân gửi hồ sơ xin duyệt / đăng ký vùng trồng. */
export class CreatePortalApprovalDto {
  @Text(120)
  requestType!: string;

  @OptionalText(1000)
  note?: string | null;

  @OptionalText(30)
  plotCode?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  attachmentIds?: number[];

  @OptionalField()
  @Count()
  docsCount?: number;
}
