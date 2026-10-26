import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value));

/** Chuỗi bắt buộc, đã cắt khoảng trắng đầu/cuối, không rỗng. */
export const Text = (max = 200) => applyDecorators(trim(), IsString(), IsNotEmpty(), MaxLength(max));

/** Chuỗi tùy chọn (cho phép null/bỏ trống). */
export const OptionalText = (max = 500) => applyDecorators(IsOptional(), trim(), IsString(), MaxLength(max));

/** Ngày dạng YYYY-MM-DD và phải là ngày có thật. */
export const IsoDate = () =>
  applyDecorators(Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Ngày phải có dạng YYYY-MM-DD." }), IsISO8601({ strict: true }));

export const NonNegative = () => applyDecorators(IsNumber({ allowNaN: false, allowInfinity: false }), Min(0));
export const Count = () => applyDecorators(IsInt(), Min(0));
export const RecordId = () => applyDecorators(IsInt(), IsPositive());
export const OneOf = (values: readonly string[]) => IsIn(values);

/** Trường có thể bỏ qua (undefined) nhưng nếu gửi thì không được null. */
export const OptionalField = () => ValidateIf((_object, value) => value !== undefined);
