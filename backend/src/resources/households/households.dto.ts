import { PartialType } from "@nestjs/mapped-types";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsString, Matches } from "class-validator";
import { Count, NonNegative, OptionalField, RecordId, Text } from "../../common/validation/fields";

export class CreateHouseholdDto {
  @Text(40)
  code!: string;

  @Text(100)
  name!: string;

  @IsString()
  @Matches(/^\d{12}$/, { message: "CCCD gồm đúng 12 chữ số." })
  cccd!: string;

  @IsString()
  @Matches(/^0\d{9,10}$/, { message: "Số điện thoại không hợp lệ." })
  phone!: string;

  @RecordId()
  villageId!: number;

  @OptionalField()
  @Count()
  plotCount?: number;

  @OptionalField()
  @NonNegative()
  areaHa?: number;

  @OptionalField()
  @IsIn(["qualified", "improve", "pending", "violation"])
  status?: "qualified" | "improve" | "pending" | "violation";
}

export class UpdateHouseholdDto extends PartialType(CreateHouseholdDto) {}

/** Số dòng tối đa mỗi lần nhập (giới hạn body 1 MB cũng chặn thêm). */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Nhập danh sách hộ. Từng dòng được kiểm tra riêng theo CreateHouseholdDto trong service
 * để dòng lỗi không làm hỏng cả lô (trả về trong `errors`).
 */
export class ImportHouseholdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}
