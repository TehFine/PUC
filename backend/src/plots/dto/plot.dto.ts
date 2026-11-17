import type { Polygon } from "geojson";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** Hình học cụ thể (Polygon GeoJSON) được PlotsService kiểm tra kỹ hơn; ở đây chỉ chặn kiểu dữ liệu sai hẳn. */
export class CreatePlotDto {
  @IsOptional() @IsString() @MaxLength(64) code?: string;
  @IsOptional() @IsString() @MaxLength(24) sheet?: string;
  @IsOptional() @IsString() @MaxLength(24) parcel?: string;
  @IsOptional() @IsString() @MaxLength(160) owner?: string;
  @IsOptional() @IsString() @MaxLength(100) village?: string;
  @IsOptional() @IsString() @MaxLength(64) zone?: string;
  @IsOptional() @IsString() @MaxLength(120) variety?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  householdId?: number;

  @IsOptional() @IsString() @MaxLength(40) source?: string;
  @IsOptional() @IsString() @MaxLength(32) status?: string;
  @IsOptional() @IsString() @MaxLength(240) sourceRef?: string;

  @IsObject()
  geometry!: Polygon;
}

export class CreateMeasurementDto {
  @IsString()
  @MaxLength(64)
  plotCode!: string;

  @IsOptional() @IsString() @MaxLength(64) plotId?: string;
  @IsOptional() @IsString() @MaxLength(120) measuredBy?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;

  @IsObject()
  geometry!: Polygon;
}

export class UpdatePlotGeometryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsObject()
  geometry!: Polygon;

  @IsOptional()
  @IsBoolean()
  updateArea?: boolean;
}
