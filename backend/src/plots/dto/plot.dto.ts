import type { Polygon } from "geojson";
import { Type } from "class-transformer";
import { IsNumber, IsObject, IsOptional, IsString } from "class-validator";

/** Hình học cụ thể (Polygon GeoJSON) được PlotsService kiểm tra kỹ hơn; ở đây chỉ chặn kiểu dữ liệu sai hẳn. */
export class CreatePlotDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() sheet?: string;
  @IsOptional() @IsString() parcel?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() variety?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  year?: number;

  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() sourceRef?: string;

  @IsObject()
  geometry!: Polygon;
}

export class CreateMeasurementDto {
  @IsString()
  plotCode!: string;

  @IsOptional() @IsString() plotId?: string;
  @IsOptional() @IsString() measuredBy?: string;
  @IsOptional() @IsString() note?: string;

  @IsObject()
  geometry!: Polygon;
}
