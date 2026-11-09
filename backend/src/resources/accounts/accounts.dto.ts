import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import type { Role } from "../../auth/permissions";
import { OptionalField, RecordId, Text } from "../../common/validation/fields";

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

  @IsString()
  @MinLength(8, { message: "Mật khẩu cần tối thiểu 8 ký tự." })
  @MaxLength(200)
  @Matches(/[A-Za-z]/, { message: "Mật khẩu cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu cần có chữ số." })
  password!: string;

  @IsIn(["admin", "htx_officer", "inspector", "village_officer", "farmer"])
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
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {}
