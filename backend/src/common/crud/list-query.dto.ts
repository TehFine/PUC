import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** Tham số phân trang/tìm kiếm chung. Các tham số lọc riêng của từng tài nguyên được đọc từ query thô. */
export class ListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize = 100;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
