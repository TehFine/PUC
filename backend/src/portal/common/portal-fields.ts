import { applyDecorators } from "@nestjs/common";
import { IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from "class-validator";

/** Id tệp đính kèm tùy chọn (cho phép bỏ trống hoặc null). */
export const OptionalAttachmentId = () => applyDecorators(IsOptional(), IsInt(), IsPositive());

/** Số thực hữu hạn trong khoảng [min, max]. */
export const NumberIn = (min: number, max: number) =>
  applyDecorators(IsNumber({ allowNaN: false, allowInfinity: false }), Min(min), Max(max));

/** Số thực tùy chọn trong khoảng [min, max] (cho phép bỏ trống hoặc null). */
export const OptionalNumberIn = (min: number, max: number) => applyDecorators(IsOptional(), NumberIn(min, max));
