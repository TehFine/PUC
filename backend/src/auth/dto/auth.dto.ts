import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
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

export class GoogleLoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  credential?: string;

  /** Email tài khoản Google (chỉ dùng cho trình chọn tài khoản ở chế độ trải nghiệm dev/demo khi chưa cấu hình GOOGLE_CLIENT_ID). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Địa chỉ email Google không hợp lệ." })
  @MaxLength(120)
  email?: string;
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

/** Tự cập nhật họ tên hiển thị và email Google liên kết của tài khoản đang đăng nhập. */
export class UpdateProfileDto {
  @IsOptional()
  @Text(100)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  })
  @IsEmail({}, { message: "Địa chỉ email Google không hợp lệ." })
  @MaxLength(120)
  email?: string | null;

  /** Bắt buộc khi thay đổi hoặc gỡ địa chỉ email liên kết OAuth. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;

  /** Tùy chọn: Google ID Token để xác minh quyền sở hữu hộp thư mới khi liên kết. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  googleCredential?: string;
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

  /** Email Google liên kết (không bắt buộc) để đăng nhập nhanh bằng Google sau khi được duyệt. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  })
  @IsEmail({}, { message: "Địa chỉ email liên kết không hợp lệ." })
  @MaxLength(120)
  email?: string | null;

  /** Mã hộ hoặc thông tin giúp cán bộ đối chiếu. */
  @OptionalText(300)
  note?: string | null;
}

/** Khôi phục mật khẩu tức thì bằng đối chiếu SĐT / tên đăng nhập + số CCCD 12 chữ số của chủ hộ. */
export class ForgotPasswordCccdDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().replace(/^0[0-9\s.-]+$/, (s) => s.replace(/[\s.-]/g, "")) : value,
  )
  @IsString()
  @IsNotEmpty({ message: "Vui lòng nhập số điện thoại hoặc tên đăng nhập." })
  @MaxLength(64)
  username!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.replace(/[\s.-]/g, "") : value))
  @IsString()
  @Matches(/^[0-9]{12}$/, { message: "Số Căn cước công dân (CCCD) gồm đúng 12 chữ số." })
  cccd!: string;

  @IsString()
  @MinLength(8, { message: "Mật khẩu mới cần tối thiểu 8 ký tự." })
  @MaxLength(200)
  @Matches(/[A-Za-z]/, { message: "Mật khẩu mới cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu mới cần có chữ số." })
  newPassword!: string;
}

/** Gửi yêu cầu cấp lại mật khẩu chờ cán bộ HTX / quản trị viên phê duyệt. */
export class ForgotPasswordRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().replace(/^0[0-9\s.-]+$/, (s) => s.replace(/[\s.-]/g, "")) : value,
  )
  @IsString()
  @IsNotEmpty({ message: "Vui lòng nhập số điện thoại hoặc tên đăng nhập." })
  @MaxLength(64)
  username!: string;

  @Text(100)
  fullName!: string;

  @IsString()
  @MinLength(8, { message: "Mật khẩu mới cần tối thiểu 8 ký tự." })
  @MaxLength(200)
  @Matches(/[A-Za-z]/, { message: "Mật khẩu mới cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu mới cần có chữ số." })
  newPassword!: string;

  @OptionalText(300)
  note?: string | null;
}

