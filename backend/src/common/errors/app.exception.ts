import { HttpException } from "@nestjs/common";

/** Lỗi nghiệp vụ có mã máy đọc được (`code`) để frontend xử lý. */
export class AppException extends HttpException {
  constructor(
    status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message, status);
  }
}

export interface ValidationDetail {
  path: string;
  message: string;
}

export class ValidationException extends AppException {
  constructor(public readonly details: ValidationDetail[]) {
    super(400, "Dữ liệu không hợp lệ.", "VALIDATION_ERROR");
  }
}

export const badRequest = (message: string) => new AppException(400, message, "BAD_REQUEST");
export const unauthorized = (message = "Chưa đăng nhập hoặc phiên đã hết hạn.") =>
  new AppException(401, message, "UNAUTHORIZED");
export const forbidden = (message = "Bạn không có quyền thực hiện thao tác này.") =>
  new AppException(403, message, "FORBIDDEN");
export const notFound = (message = "Không tìm thấy bản ghi.") => new AppException(404, message, "NOT_FOUND");
