import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export type TraceAccessTier = "enterprise" | "authority";
export type TraceAccessScopeMode = "record" | "zone" | "coop";
export type TraceAccessRequestStatus = "pending" | "approved" | "rejected" | "revoked";

function collapseInlineSpaces(val: unknown): unknown {
  return typeof val === "string" ? val.trim().replace(/\s+/g, " ") : val;
}

function normalizeMultiLineText(val: unknown): unknown {
  return typeof val === "string"
    ? val.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : val;
}

function normalizeOptionalNote(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val !== "string") return val;
  const cleaned = val.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return cleaned === "" ? null : cleaned;
}

export class CreateTraceAccessRequestDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString({ message: "Mã hồ sơ truy xuất không hợp lệ." })
  @MinLength(2, { message: "Mã hồ sơ truy xuất không hợp lệ." })
  @MaxLength(80, { message: "Mã hồ sơ truy xuất không hợp lệ." })
  @Matches(/^[A-Za-z0-9._/-]+$/, { message: "Mã hồ sơ truy xuất không hợp lệ." })
  scannedCode!: string;

  @Transform(({ value }: { value: unknown }) => collapseInlineSpaces(value))
  @IsString({ message: "Vui lòng nhập họ tên người đại diện." })
  @MinLength(2, { message: "Họ tên người đại diện cần tối thiểu 2 ký tự." })
  @MaxLength(120, { message: "Họ tên người đại diện không vượt quá 120 ký tự." })
  @Matches(/^(?=(?:.*\p{L}){2,})[\p{L}\p{N}\s,.'’()-]+$/u, {
    message: "Họ tên người đại diện phải có chữ cái hợp lệ và không chứa ký tự lạ.",
  })
  requesterName!: string;

  @Transform(({ value }: { value: unknown }) => collapseInlineSpaces(value))
  @IsString({ message: "Vui lòng nhập tên đơn vị công tác." })
  @MinLength(2, { message: "Tên đơn vị công tác cần tối thiểu 2 ký tự." })
  @MaxLength(160, { message: "Tên đơn vị công tác không vượt quá 160 ký tự." })
  @Matches(/^(?=(?:.*\p{L}){2,})[\p{L}\p{N}\s,.\-/()&'’"“”]+$/u, {
    message: "Tên đơn vị công tác phải có chữ cái hợp lệ và không chứa ký tự đặc biệt lạ.",
  })
  organization!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().replace(/[\s.-]/g, "") : value,
  )
  @IsString({ message: "Vui lòng nhập số điện thoại liên hệ." })
  @Matches(/^0(?!0{9})[0-9]{9}$/, {
    message: "Số điện thoại liên hệ phải gồm đúng 10 chữ số và bắt đầu bằng số 0.",
  })
  contactPhone!: string;

  @Transform(({ value }: { value: unknown }) => normalizeMultiLineText(value))
  @IsString({ message: "Vui lòng nhập lý do làm việc." })
  @MinLength(5, { message: "Vui lòng nêu rõ lý do làm việc (tối thiểu 5 ký tự)." })
  @MaxLength(500, { message: "Lý do làm việc không vượt quá 500 ký tự." })
  @Matches(/^(?=(?:.*\p{L}){3,})[^\u0000-\u0008\u000B\u000C\u000E-\u001F<>]+$/su, {
    message: "Lý do làm việc cần ghi rõ nghĩa bằng chữ và không chứa thẻ HTML.",
  })
  purpose!: string;

  @IsOptional()
  @IsIn(["enterprise", "authority"], { message: "Mức quyền đề nghị không hợp lệ." })
  requestedTier?: TraceAccessTier;
}

export class ListTraceAccessRequestsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(["pending", "approved", "rejected", "revoked", "active", "expired"])
  status?: string;

  @IsOptional()
  @IsIn(["enterprise", "authority"])
  requestedTier?: TraceAccessTier;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ApproveTraceAccessRequestDto {
  @IsOptional()
  @IsIn(["enterprise", "authority"], { message: "Mức quyền phê duyệt không hợp lệ." })
  grantedTier?: TraceAccessTier;

  @IsOptional()
  @IsIn(["record", "zone", "coop"], { message: "Phạm vi mở quyền không hợp lệ." })
  scopeMode?: TraceAccessScopeMode;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: "Thời hạn cấp quyền không hợp lệ." },
  )
  @Min(0.25, { message: "Thời hạn cấp quyền tối thiểu 15 phút." })
  @Max(336, { message: "Thời hạn cấp quyền tối đa 336 giờ (14 ngày)." })
  durationHours?: number;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalNote(value))
  @IsOptional()
  @IsString({ message: "Ghi chú phản hồi không hợp lệ." })
  @MaxLength(400, { message: "Ghi chú phản hồi không vượt quá 400 ký tự." })
  @Matches(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F<>]*$/s, {
    message: "Ghi chú phản hồi không được chứa thẻ HTML hoặc ký tự điều khiển.",
  })
  note?: string | null;
}

export class RejectOrRevokeTraceAccessRequestDto {
  @Transform(({ value }: { value: unknown }) => normalizeOptionalNote(value))
  @IsOptional()
  @IsString({ message: "Ghi chú phản hồi không hợp lệ." })
  @MaxLength(400, { message: "Ghi chú phản hồi không vượt quá 400 ký tự." })
  @Matches(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F<>]*$/s, {
    message: "Ghi chú phản hồi không được chứa thẻ HTML hoặc ký tự điều khiển.",
  })
  note?: string | null;
}

