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
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { IsoDate } from "../common/validation/fields";

export class ConfigurePlotCarePlanDto {
  @IsString()
  @MinLength(1, { message: "Vui lòng chọn thửa đất." })
  @MaxLength(64)
  plotCode!: string;

  @IsIn(["cycle_start", "start_cycle", "current_milestone"], {
    message: "Chế độ thiết lập lộ trình không hợp lệ.",
  })
  mode!: "cycle_start" | "start_cycle" | "current_milestone";

  @IsoDate()
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
  @Max(Number.MAX_SAFE_INTEGER)
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
  @IsoDate()
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
  @MaxLength(150, { each: true })
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
  @Max(Number.MAX_SAFE_INTEGER)
  pesticideId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pesticideDose?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Mã ảnh hiện trường không hợp lệ." })
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  fieldPhotoId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: "Tối đa 8 ảnh hoặc video hiện trường cho mỗi lần khai báo." })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  fieldPhotoIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  invoicePhotoId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: "Tối đa 6 ảnh hóa đơn hoặc bao bì vật tư." })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
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
  @Max(Number.MAX_SAFE_INTEGER)
  householdId?: number;
}
