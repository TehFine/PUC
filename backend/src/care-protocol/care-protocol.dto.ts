import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ConfigurePlotCarePlanDto {
  @IsString()
  @MinLength(1, { message: "Vui lòng chọn thửa đất." })
  @MaxLength(64)
  plotCode!: string;

  @IsIn(["cycle_start", "start_cycle", "current_milestone"], {
    message: "Chế độ thiết lập lộ trình không hợp lệ.",
  })
  mode!: "cycle_start" | "start_cycle" | "current_milestone";

  @IsString()
  @Matches(ISO_DATE_RE, { message: "Ngày mốc phải có định dạng YYYY-MM-DD." })
  anchorDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  milestoneCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;

  /** Chỉ dành cho quản trị viên / cán bộ HTX khi thiết lập hộ cho nông dân. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  householdId?: number;
}

export class DeclareCareMilestoneDto {
  @IsString()
  @MinLength(1, { message: "Vui lòng chọn thửa đất." })
  @MaxLength(64)
  plotCode!: string;

  @IsString()
  @MinLength(2, { message: "Vui lòng chọn mốc quy trình cần khai báo." })
  @MaxLength(64)
  milestoneCode!: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_RE, { message: "Ngày thực hiện không hợp lệ." })
  performedOn?: string;

  @IsString()
  @MinLength(1, { message: "Vui lòng xác nhận trạng thái cây thực tế tại vườn." })
  @MaxLength(200)
  actualTreeState!: string;

  @IsBoolean()
  followedStandard!: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  selectedProducts!: string[];

  @IsString()
  @MinLength(2, { message: "Vui lòng nhập định lượng hoặc tỷ lệ pha đã thực hiện." })
  @MaxLength(400)
  actualDosage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  extraInputs?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pesticideId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pesticideDose?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Mã ảnh hiện trường không hợp lệ." })
  @Min(1)
  fieldPhotoId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: "Tối đa 8 ảnh hoặc video hiện trường cho mỗi lần khai báo." })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  fieldPhotoIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  invoicePhotoId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: "Tối đa 6 ảnh hóa đơn hoặc bao bì vật tư." })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  invoicePhotoIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  farmerNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  lateReason?: string;
}

export class CareProtocolListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(["all", "overdue", "deviated", "due_now", "on_track", "completed"])
  state?: "all" | "overdue" | "deviated" | "due_now" | "on_track" | "completed";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  householdId?: number;
}
