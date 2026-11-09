import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Count, NonNegative, OptionalField, RecordId, Text } from "../../common/validation/fields";

export class CreateHouseholdDto {
  @Text(40)
  code!: string;

  @Text(100)
  name!: string;

  @IsString()
  @Matches(/^\d{12}$/, { message: "CCCD gồm đúng 12 chữ số." })
  cccd!: string;

  @IsString()
  @Matches(/^0\d{9,10}$/, { message: "Số điện thoại không hợp lệ." })
  phone!: string;

  @RecordId()
  villageId!: number;

  @OptionalField()
  @Count()
  plotCount?: number;

  @OptionalField()
  @NonNegative()
  areaHa?: number;

  @OptionalField()
  @IsIn(["qualified", "improve", "pending", "violation"])
  status?: "qualified" | "improve" | "pending" | "violation";
}

export class UpdateHouseholdDto extends PartialType(CreateHouseholdDto) {}

/** Số dòng tối đa mỗi lần nhập (giới hạn body 1 MB cũng chặn thêm). */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Nhập danh sách hộ. Từng dòng được kiểm tra riêng theo CreateHouseholdDto trong service
 * để dòng lỗi không làm hỏng cả lô (trả về trong `errors`).
 */
export class ImportHouseholdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}

/** Ban hành hoặc cấp lại tài khoản đăng nhập cho hộ nông dân sau khi quản trị viên đã thiết lập hồ sơ hộ. */
export class IssueHouseholdAccountDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^[0-9A-Za-z._-]{3,64}$/, { message: "Tên đăng nhập gồm 3–64 ký tự chữ, số, . _ -" })
  username?: string;

  @IsString()
  @MinLength(8, { message: "Mật khẩu ban hành cần tối thiểu 8 ký tự." })
  @MaxLength(200)
  @Matches(/[A-Za-z]/, { message: "Mật khẩu cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu cần có chữ số." })
  password!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  })
  @IsEmail({}, { message: "Địa chỉ email Google không hợp lệ." })
  @MaxLength(120)
  email?: string | null;
}
