import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { MaxPasswordUtf8Bytes, NormalizePassword } from "../../auth/dto/auth.dto";
import type { Role } from "../../auth/permissions";
import { OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateAccountDto {
  @Text(100)
  fullName!: string;

  @IsString()
  @Matches(/^[0-9A-Za-z._-]{3,64}$/, { message: "Tên đăng nhập gồm 3–64 ký tự chữ, số, . _ -" })
  username!: string;

  /** Email Google liên kết (tùy chọn) để đăng nhập bằng tài khoản Google. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  })
  @IsEmail({}, { message: "Địa chỉ email không hợp lệ." })
  @MaxLength(120)
  email?: string | null;

  @NormalizePassword()
  @IsString()
  @MinLength(8, { message: "Mật khẩu cần tối thiểu 8 ký tự." })
  @MaxPasswordUtf8Bytes()
  @Matches(/[A-Za-z]/, { message: "Mật khẩu cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu cần có chữ số." })
  password!: string;

  @IsIn(["admin", "htx_officer", "inspector", "village_officer", "enterprise", "farmer"])
  role!: Role;

  @OptionalField()
  @IsIn(["active", "locked"])
  status?: "active" | "locked";

  @IsOptional()
  @RecordId()
  villageId?: number | null;

  /** Hộ mà tài khoản nông dân được xem dữ liệu (mỗi hộ chỉ có một tài khoản). */
  @IsOptional()
  @RecordId()
  householdId?: number | null;

  /** Doanh nghiệp / cơ sở đóng gói gắn với tài khoản vai trò enterprise. */
  @IsOptional()
  @RecordId()
  enterpriseId?: number | null;

  /** Xã được phân công quản lý (cho cán bộ xã, ví dụ: Xã Cư Né). */
  @OptionalText(120)
  assignedCommune?: string | null;

  /** Địa bàn hành chính được giao (cho Chi cục / Thanh tra, ví dụ: Tỉnh Đắk Lắk, Huyện Krông Búk). */
  @OptionalText(120)
  assignedRegion?: string | null;

  /** Mã HTX quản lý (mặc định HTX-CUNE). */
  @OptionalText(40)
  coopCode?: string;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {}
