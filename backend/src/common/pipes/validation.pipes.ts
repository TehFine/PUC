import { PipeTransform, Type, ValidationError, ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import { notFound, ValidationDetail, ValidationException } from "../errors/app.exception";

// Thông báo mặc định của class-validator luôn bắt đầu bằng tên trường; thông báo tùy biến (đã là tiếng Việt) giữ nguyên.
const DEFAULT_MESSAGES: Record<string, string> = {
  isNotEmpty: "Không được để trống.",
  isString: "Phải là chuỗi ký tự.",
  maxLength: "Quá dài.",
  minLength: "Quá ngắn.",
  isInt: "Phải là số nguyên.",
  isNumber: "Phải là số hợp lệ.",
  isPositive: "Phải lớn hơn 0.",
  min: "Giá trị quá nhỏ.",
  max: "Giá trị quá lớn.",
  isIn: "Giá trị không nằm trong danh sách cho phép.",
  isBoolean: "Phải là true hoặc false.",
  isObject: "Phải là một đối tượng.",
  isISO8601: "Ngày không hợp lệ.",
  matches: "Định dạng không hợp lệ.",
};

function localize(rule: string, message: string, property: string, path: string): string {
  if (rule === "whitelistValidation") return `Trường "${path}" không được phép gửi lên.`;
  return message.startsWith(property) ? (DEFAULT_MESSAGES[rule] ?? message) : message;
}

function flatten(errors: ValidationError[], parent = ""): ValidationDetail[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([rule, message]) => ({
      path,
      message: localize(rule, message, error.property, path),
    }));
    return [...own, ...flatten(error.children ?? [], path)];
  });
}

const exceptionFactory = (errors: ValidationError[]) => new ValidationException(flatten(errors));

/** Body: loại bỏ và từ chối trường lạ (chống mass assignment). */
export const strictPipe = (expectedType?: Type<unknown>) =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    expectedType,
    exceptionFactory,
  });

/** Body: bỏ qua trường lạ thay vì báo lỗi (dùng cho payload do bản đồ gửi kèm thuộc tính phụ). */
export const lenientPipe = (expectedType?: Type<unknown>) =>
  new ValidationPipe({ whitelist: true, transform: true, expectedType, exceptionFactory });

/**
 * Pipe toàn cục: body/param kiểm tra chặt; query giữ nguyên tham số lạ
 * (bộ lọc theo từng tài nguyên được đọc từ query thô).
 */
export class AppValidationPipe implements PipeTransform {
  private readonly strict = strictPipe();
  private readonly loose = new ValidationPipe({ transform: true, exceptionFactory });

  transform(value: unknown, metadata: ArgumentMetadata) {
    return (metadata.type === "query" ? this.loose : this.strict).transform(value, metadata);
  }
}

/** Id bản ghi: chuỗi số hợp lệ, ngược lại coi như không tìm thấy. */
export class ParseRecordIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^\d{1,15}$/.test(value)) throw notFound();
    return Number(value);
  }
}
