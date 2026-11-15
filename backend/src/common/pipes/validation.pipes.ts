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

const UNSAFE_TEXT_CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

/** Chuẩn hóa Unicode NFC và loại bỏ ký tự NUL / điều khiển độc hại đệ quy trên mọi dữ liệu vào. */
function sanitizeIncomingValue(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.normalize("NFC").replace(UNSAFE_TEXT_CTRL_RE, "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeIncomingValue(item, depth + 1));
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      const cleanKey = key.normalize("NFC").replace(UNSAFE_TEXT_CTRL_RE, "");
      out[cleanKey] = sanitizeIncomingValue(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Pipe toàn cục: body/param kiểm tra chặt; query giữ nguyên tham số lạ
 * (bộ lọc theo từng tài nguyên được đọc từ query thô).
 */
export class AppValidationPipe implements PipeTransform {
  private readonly strict = strictPipe();
  private readonly loose = new ValidationPipe({ transform: true, exceptionFactory });

  transform(value: unknown, metadata: ArgumentMetadata) {
    const cleaned = sanitizeIncomingValue(value);
    return (metadata.type === "query" ? this.loose : this.strict).transform(cleaned, metadata);
  }
}

/** Id bản ghi: chuỗi số nguyên dương hợp lệ (>= 1), ngược lại coi như không tìm thấy. */
export class ParseRecordIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d{0,14}$/.test(value)) throw notFound();
    const num = Number(value);
    if (!Number.isSafeInteger(num) || num < 1) throw notFound();
    return num;
  }
}
