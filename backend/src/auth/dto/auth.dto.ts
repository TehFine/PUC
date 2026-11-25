import {
  buildMessage,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
} from "class-validator";
import { Transform } from "class-transformer";
import { OptionalText, RecordId, Text } from "../../common/validation/fields";

const MAX_PASSWORD_UTF8_BYTES = 72;

/** Chuẩn hóa mật khẩu về Unicode NFC trước khi kiểm tra độ dài byte và băm (dùng chung cho mọi DTO có mật khẩu). */
export const NormalizePassword = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.normalize("NFC") : value));

/** bcrypt chỉ dùng 72 byte đầu: chặn mật khẩu dài hơn để không âm thầm cắt bớt. */
export function MaxPasswordUtf8Bytes(maxBytes = MAX_PASSWORD_UTF8_BYTES) {
  return ValidateBy({
    name: "maxPasswordUtf8Bytes",
    constraints: [maxBytes],
    validator: {
      validate(value: unknown): boolean {
        return typeof value === "string" && Buffer.byteLength(value, "utf8") <= maxBytes;
      },
      defaultMessage: buildMessage(() => `Mật khẩu tối đa ${maxBytes} byte UTF-8.`),
    },
  });
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.normalize("NFC").trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @NormalizePassword()
  @IsString()
  @IsNotEmpty()
  @MaxPasswordUtf8Bytes()
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
  @NormalizePassword()
  @IsString()
  @IsNotEmpty()
  @MaxPasswordUtf8Bytes()
  currentPassword!: string;

  @NormalizePassword()
  @IsString()
  @MinLength(8, { message: "Mật khẩu mới cần tối thiểu 8 ký tự." })
  @MaxPasswordUtf8Bytes()
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
  @NormalizePassword()
  @IsString()
  @MaxPasswordUtf8Bytes()
  currentPassword?: string;

  /** Google ID Token bắt buộc để xác minh quyền sở hữu hộp thư mới khi liên kết. */
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

  @NormalizePassword()
  @IsString()
  @MinLength(8, { message: "Mật khẩu cần tối thiểu 8 ký tự." })
  @MaxPasswordUtf8Bytes()
  @Matches(/[A-Za-z]/, { message: "Mật khẩu cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu cần có chữ số." })
  password!: string;

  @IsOptional()
  @RecordId()
  villageId?: number | null;

  /**
   * Email Google liên kết (không bắt buộc). Chỉ được lưu khi kèm `googleCredential` hợp lệ chứng minh quyền sở hữu
   * hộp thư; gửi email thô không kèm credential vẫn được chấp nhận để tương thích client cũ nhưng bị bỏ qua.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  })
  @IsEmail({}, { message: "Địa chỉ email liên kết không hợp lệ." })
  @MaxLength(120)
  email?: string | null;

  /** Google ID Token xác minh quyền sở hữu `email` khi muốn liên kết ngay lúc đăng ký. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  googleCredential?: string;

  /** Mã hộ hoặc thông tin giúp cán bộ đối chiếu. */
  @OptionalText(300)
  note?: string | null;
}

export { RegisterDto as RegisterFarmerDto };

/** Khôi phục mật khẩu tức thì bằng đối chiếu SĐT / tên đăng nhập + số CCCD 12 chữ số của chủ hộ. */
export class ForgotPasswordCccdDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string"
      ? value.normalize("NFC").trim().replace(/^0[0-9\s.-]+$/, (s) => s.replace(/[\s.-]/g, ""))
      : value,
  )
  @IsString()
  @IsNotEmpty({ message: "Vui lòng nhập số điện thoại hoặc tên đăng nhập." })
  @MaxLength(64)
  username!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.replace(/[\s.-]/g, "") : value))
  @IsString()
  @Matches(/^[0-9]{12}$/, { message: "Số Căn cước công dân (CCCD) gồm đúng 12 chữ số." })
  cccd!: string;

  /** Họ tên chủ hộ đúng như hồ sơ hộ (bắt buộc, đối chiếu cùng CCCD). */
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.normalize("NFC").trim() : value))
  @IsString()
  @IsNotEmpty({ message: "Vui lòng nhập họ tên chủ hộ." })
  @MaxLength(120)
  fullName!: string;

  @NormalizePassword()
  @IsString()
  @MinLength(8, { message: "Mật khẩu mới cần tối thiểu 8 ký tự." })
  @MaxPasswordUtf8Bytes()
  @Matches(/[A-Za-z]/, { message: "Mật khẩu mới cần có chữ cái." })
  @Matches(/[0-9]/, { message: "Mật khẩu mới cần có chữ số." })
  newPassword!: string;
}

export { ForgotPasswordCccdDto as ForgotPasswordVerifyCccdDto };

/** Gửi yêu cầu cấp lại mật khẩu chờ cán bộ HTX / quản trị viên phê duyệt. */
export class ForgotPasswordRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string"
      ? value.normalize("NFC").trim().replace(/^0[0-9\s.-]+$/, (s) => s.replace(/[\s.-]/g, ""))
      : value,
  )
  @IsString()
  @IsNotEmpty({ message: "Vui lòng nhập số điện thoại hoặc tên đăng nhập." })
  @MaxLength(64)
  username!: string;

  @Text(100)
  fullName!: string;

  /** Giữ tùy chọn để tương thích ngược với client cũ; backend tuyệt đối không lưu hoặc áp dụng giá trị này. */
  @IsOptional()
  @NormalizePassword()
  @IsString()
  @MaxPasswordUtf8Bytes()
  newPassword?: string;

  @OptionalText(300)
  note?: string | null;
}

/** Xác minh mã OTP bước 2 (6 chữ số TOTP hoặc mã dự phòng 8 ký tự) sau khi qua bước mật khẩu / Google. */
export class VerifyOtpChallengeDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: "Thiếu mã phiên xác thực bước 2." })
  @MaxLength(200)
  challengeToken!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : value))
  @IsString()
  @Matches(/^(?:[0-9]{6}|[0-9A-Z]{8})$/, {
    message: "Vui lòng nhập mã OTP 6 chữ số từ ứng dụng xác thực hoặc mã dự phòng 8 ký tự.",
  })
  code!: string;
}

/** Kích hoạt xác thực 2 lớp bằng mã OTP 6 chữ số đầu tiên từ ứng dụng xác thực, kèm xác nhận lại mật khẩu hiện tại. */
export class EnableTwoFactorDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.replace(/\s+/g, "") : value))
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: "Mã OTP xác nhận gồm đúng 6 chữ số." })
  code!: string;

  @NormalizePassword()
  @IsString()
  @IsNotEmpty({ message: "Vui lòng nhập mật khẩu hiện tại để bật xác thực 2 lớp." })
  @MaxPasswordUtf8Bytes()
  currentPassword!: string;
}

/** Tắt xác thực 2 lớp (bắt buộc xác nhận đồng thời mật khẩu hiện tại VÀ mã OTP 6 chữ số hoặc mã dự phòng 8 ký tự). */
export class DisableTwoFactorDto {
  @NormalizePassword()
  @IsString()
  @IsNotEmpty({ message: "Vui lòng nhập mật khẩu hiện tại để tắt xác thực 2 lớp." })
  @MaxPasswordUtf8Bytes()
  currentPassword!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : value,
  )
  @IsString()
  @Matches(/^(?:[0-9]{6}|[0-9A-Z]{8})$/, {
    message: "Vui lòng nhập mã OTP 6 chữ số hoặc mã dự phòng 8 ký tự.",
  })
  code!: string;
}


