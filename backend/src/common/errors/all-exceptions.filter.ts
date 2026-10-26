import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { Response } from "express";
import { AppException, ValidationException } from "./app.exception";

const PG_MESSAGES: Record<string, { status: number; message: string }> = {
  "23505": { status: 409, message: "Dữ liệu đã tồn tại (trùng giá trị duy nhất)." },
  "23503": { status: 409, message: "Bản ghi liên quan không tồn tại hoặc đang được sử dụng." },
  "23514": { status: 400, message: "Dữ liệu vi phạm ràng buộc của hệ thống." },
  "23502": { status: 400, message: "Thiếu dữ liệu bắt buộc." },
  "22P02": { status: 400, message: "Giá trị không đúng định dạng." },
  "22007": { status: 400, message: "Ngày giờ không hợp lệ." },
  "22003": { status: 400, message: "Giá trị số nằm ngoài phạm vi cho phép." },
};

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  413: "PAYLOAD_TOO_LARGE",
  429: "RATE_LIMITED",
};

interface ErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

/** Chuẩn hóa mọi lỗi về dạng `{ error, code, details? }` mà frontend đang dùng. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof ValidationException) {
      return {
        status: 400,
        body: { error: exception.message, code: exception.code, details: exception.details },
      };
    }
    if (exception instanceof AppException) {
      return { status: exception.getStatus(), body: { error: exception.message, code: exception.code } };
    }
    if (exception instanceof ThrottlerException) {
      return { status: 429, body: { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau.", code: "RATE_LIMITED" } };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return { status, body: { error: "Không tìm thấy đường dẫn.", code: "NOT_FOUND" } };
      return { status, body: { error: exception.message, code: STATUS_CODES[status] ?? "ERROR" } };
    }

    // Lỗi từ body-parser của Express.
    const type = (exception as { type?: string })?.type;
    if (type === "entity.too.large") {
      return { status: 413, body: { error: "Dữ liệu gửi lên quá lớn.", code: "PAYLOAD_TOO_LARGE" } };
    }
    if (type === "entity.parse.failed" || exception instanceof SyntaxError) {
      return { status: 400, body: { error: "Dữ liệu JSON không hợp lệ.", code: "BAD_REQUEST" } };
    }

    const pgCode = (exception as { code?: string })?.code;
    if (pgCode && PG_MESSAGES[pgCode]) {
      const { status, message } = PG_MESSAGES[pgCode];
      return { status, body: { error: message, code: `DB_${pgCode}` } };
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return { status: 500, body: { error: "Không xử lý được yêu cầu. Vui lòng thử lại.", code: "INTERNAL" } };
  }
}
