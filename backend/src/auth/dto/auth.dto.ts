import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";
import { OptionalText, RecordId, Text } from "../../common/validation/fields";

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "Mật khẩu mới cần tối thiểu 8 ký tự." })
  @MaxLength(200)
  @Matches(/[A-Za-z]/, { message: "Mật khẩu mới cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu mới cần có chữ số." })
  newPassword!: string;
}

/** Hộ dân tự đăng ký: luôn tạo tài khoản vai trò nông dân ở trạng thái chờ duyệt (không nhận vai trò từ client). */
export class RegisterDto {
  @Text(100)
  fullName!: string;

  /** Số điện thoại di động 10 số, dùng làm tên đăng nhập. */
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.replace(/[\s.-]/g, "") : value))
  @IsString()
  @Matches(/^0[0-9]{9}$/, { message: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0." })
  phone!: string;

  @IsString()
  @MinLength(8, { message: "Mật khẩu cần tối thiểu 8 ký tự." })
  @MaxLength(200)
  @Matches(/[A-Za-z]/, { message: "Mật khẩu cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu cần có chữ số." })
  password!: string;

  @IsOptional()
  @RecordId()
  villageId?: number | null;

  /** Mã hộ hoặc thông tin giúp cán bộ đối chiếu. */
  @OptionalText(300)
  note?: string | null;
}
