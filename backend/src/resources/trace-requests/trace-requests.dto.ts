import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
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

export class CreateTraceAccessRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9._/-]+$/, { message: "Mã hồ sơ truy xuất không hợp lệ." })
  scannedCode!: string;

  @IsString()
  @MinLength(2, { message: "Vui lòng nhập họ tên người đại diện." })
  @MaxLength(120)
  requesterName!: string;

  @IsString()
  @MinLength(2, { message: "Vui lòng nhập tên đoàn công tác, công ty hoặc cơ quan." })
  @MaxLength(160)
  organization!: string;

  @IsString()
  @MinLength(8, { message: "Số điện thoại liên hệ cần từ 8 đến 20 ký tự." })
  @MaxLength(20)
  @Matches(/^[0-9+() .-]{8,20}$/, { message: "Số điện thoại liên hệ không hợp lệ." })
  contactPhone!: string;

  @IsString()
  @MinLength(5, { message: "Vui lòng nêu rõ lý do hoặc nội dung kiểm tra đánh giá." })
  @MaxLength(500)
  purpose!: string;

  @IsOptional()
  @IsIn(["enterprise", "authority"])
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
  @IsIn(["enterprise", "authority"])
  grantedTier?: TraceAccessTier;

  @IsOptional()
  @IsIn(["record", "zone", "coop"])
  scopeMode?: TraceAccessScopeMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(336)
  durationHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string | null;
}

export class RejectOrRevokeTraceAccessRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string | null;
}

