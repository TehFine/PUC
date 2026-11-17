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
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const DANGEROUS_CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

export function cleanTextString(value: string): string {
  return value.normalize("NFC").replace(DANGEROUS_CTRL_RE, "").trim();
}

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === "string" ? cleanTextString(value) : value));

/** Chuỗi bắt buộc, đã cắt khoảng trắng đầu/cuối, không rỗng. */
export const Text = (max = 200) => applyDecorators(trim(), IsString(), IsNotEmpty(), MaxLength(max));

/** Chuỗi tùy chọn (cho phép null/bỏ trống). */
export const OptionalText = (max = 500) => applyDecorators(IsOptional(), trim(), IsString(), MaxLength(max));

/** Ngày dạng YYYY-MM-DD và phải là ngày có thật. */
export const IsoDate = () =>
  applyDecorators(Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Ngày phải có dạng YYYY-MM-DD." }), IsISO8601({ strict: true }));

/** Ngày tùy chọn (cho phép null/rỗng). */
export const OptionalIsoDate = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) => (typeof value === "string" && !value.trim() ? null : value)),
    IsOptional(),
    IsoDate(),
  );

export const NonNegative = (max = 1_000_000_000) =>
  applyDecorators(IsNumber({ allowNaN: false, allowInfinity: false }), Min(0), Max(max));
export const Count = (max = 1_000_000) => applyDecorators(IsInt(), Min(0), Max(max));
export const RecordId = () => applyDecorators(IsInt(), IsPositive(), Max(Number.MAX_SAFE_INTEGER));
export const OneOf = (values: readonly string[]) => IsIn(values);

/** Trường có thể bỏ qua (undefined) nhưng nếu gửi thì không được null. */
export const OptionalField = () => ValidateIf((_object, value) => value !== undefined);
