import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, Optional } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { Response } from "express";
import { NotificationsService } from "../../notifications/notifications.service";
import { RateLimitException } from "../throttler/rate-limit.policy";
import { AppException, ValidationException } from "./app.exception";

const INTERNAL_ERROR_MESSAGE = "Không xử lý được yêu cầu. Vui lòng thử lại.";

const PG_MESSAGES: Record<string, { status: number; message: string }> = {
  "23505": { status: 409, message: "Dữ liệu đã tồn tại (trùng giá trị duy nhất)." },
  "23503": { status: 409, message: "Bản ghi liên quan không tồn tại hoặc đang được sử dụng." },
  "23514": { status: 400, message: "Dữ liệu vi phạm ràng buộc của hệ thống." },
  "23502": { status: 400, message: "Thiếu dữ liệu bắt buộc." },
  "22P02": { status: 400, message: "Giá trị không đúng định dạng." },
  "22007": { status: 400, message: "Ngày giờ không hợp lệ." },
  "22008": { status: 400, message: "Ngày giờ nằm ngoài phạm vi hợp lệ." },
  "22003": { status: 400, message: "Giá trị số nằm ngoài phạm vi cho phép." },
  "22001": { status: 400, message: "Chuỗi dữ liệu vượt quá độ dài cho phép." },
  "22021": { status: 400, message: "Chuỗi ký tự chứa mã hóa không hợp lệ." },
  "54000": { status: 400, message: "Dữ liệu vượt quá giới hạn xử lý của truy vấn." },
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
  retryAfterSeconds?: number;
}

/** Chuẩn hóa mọi lỗi về dạng `{ error, code, details? }` mà frontend đang dùng. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");
  private recentInternalErrors: number[] = [];
  private lastInternalAlertAt = 0;

  constructor(@Optional() private readonly notifications?: NotificationsService) { }

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      if (!response.writableEnded) response.end();
      return;
    }
    const { status, body } = this.toResponse(exception);
    if (status >= 500) {
      this.recordInternalError();
    }
    if (status === 429 && body.retryAfterSeconds && !response.getHeader("Retry-After")) {
      response.setHeader("Retry-After", String(body.retryAfterSeconds));
    }
    response.status(status).json(body);
  }

  private recordInternalError(): void {
    if (!this.notifications) return;
    const now = Date.now();
    this.recentInternalErrors = this.recentInternalErrors.filter((ts) => now - ts <= 120_000);
    this.recentInternalErrors.push(now);
    if (this.recentInternalErrors.length >= 3 && now - this.lastInternalAlertAt >= 30 * 60_000) {
      this.lastInternalAlertAt = now;
      this.recentInternalErrors = [];
      void this.notifications.notifyRoles(["admin", "htx_head", "support_specialist", "htx_officer"], {
        kind: "system",
        title: "[KHẨN] Phát hiện sự cố lỗi máy chủ nội bộ (500)",
        body: "Hệ thống vừa ghi nhận nhiều lỗi xử lý 500 liên tiếp. Vui lòng kiểm tra trạng thái dịch vụ trong Quản trị hệ thống.",
        link: "/admin?section=system",
      });
    }
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof ValidationException) {
      return {
        status: 400,
        body: { error: exception.message, code: exception.code, details: exception.details },
      };
    }
    // Lỗi máy chủ (>= 500) dù được ném dưới dạng HttpException cũng không trả nguyên văn thông điệp gốc
    // (có thể chứa chi tiết nội bộ như tên bảng, đường dẫn, cấu hình); chỉ ghi log phía máy chủ.
    if (exception instanceof HttpException && exception.getStatus() >= 500) {
      this.logger.error(exception.stack ?? exception.message);
      return { status: exception.getStatus(), body: { error: INTERNAL_ERROR_MESSAGE, code: "INTERNAL" } };
    }
    if (exception instanceof AppException) {
      return { status: exception.getStatus(), body: { error: exception.message, code: exception.code } };
    }
    if (exception instanceof RateLimitException) {
      return {
        status: 429,
        body: {
          error: exception.message,
          code: "RATE_LIMITED",
          retryAfterSeconds: exception.retryAfterSeconds,
        },
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: 429,
        body: {
          error: "Thao tác quá nhanh. Vui lòng thử lại sau.",
          code: "RATE_LIMITED",
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return { status, body: { error: "Không tìm thấy đường dẫn.", code: "NOT_FOUND" } };
      if (status === 413) {
        return {
          status: 413,
          body: { error: "Dữ liệu hoặc tệp tải lên vượt quá dung lượng cho phép.", code: "PAYLOAD_TOO_LARGE" },
        };
      }
      const rawMsg = exception.message || "";
      let localizedMsg = rawMsg;
      if (/file too large/i.test(rawMsg)) {
        localizedMsg = "Dữ liệu hoặc tệp tải lên vượt quá dung lượng cho phép.";
      } else if (/unexpected field/i.test(rawMsg)) {
        localizedMsg = "Trường tệp tải lên không hợp lệ.";
      } else if (/too many files/i.test(rawMsg)) {
        localizedMsg = "Số lượng tệp tải lên vượt quá giới hạn cho phép.";
      } else if (/multipart:\s*boundary not found/i.test(rawMsg)) {
        localizedMsg = "Định dạng dữ liệu biểu mẫu tải lên không hợp lệ.";
      }
      return { status, body: { error: localizedMsg, code: STATUS_CODES[status] ?? "ERROR" } };
    }

    if ((exception as { name?: string })?.name === "MulterError") {
      const multerCode = (exception as { code?: string }).code;
      if (multerCode === "LIMIT_FILE_SIZE") {
        return {
          status: 413,
          body: { error: "Dữ liệu hoặc tệp tải lên vượt quá dung lượng cho phép.", code: "PAYLOAD_TOO_LARGE" },
        };
      }
      return {
        status: 400,
        body: { error: "Trường hoặc số lượng tệp tải lên không hợp lệ.", code: "BAD_REQUEST" },
      };
    }

    // Lỗi URL mã hóa phần trăm sai hoặc lỗi 4xx từ tầng Express / body-parser (không đẩy nhầm thành 500).
    if (exception instanceof URIError) {
      return { status: 400, body: { error: "Đường dẫn yêu cầu không hợp lệ.", code: "BAD_REQUEST" } };
    }
    const type = (exception as { type?: string })?.type;
    if (type === "entity.too.large") {
      return { status: 413, body: { error: "Dữ liệu gửi lên quá lớn.", code: "PAYLOAD_TOO_LARGE" } };
    }
    if (
      type === "entity.parse.failed" ||
      type === "charset.unsupported" ||
      type === "encoding.unsupported" ||
      type === "request.aborted" ||
      exception instanceof SyntaxError
    ) {
      return { status: 400, body: { error: "Dữ liệu gửi lên không hợp lệ.", code: "BAD_REQUEST" } };
    }
    const rawExpressStatus = Number(
      (exception as { status?: number; statusCode?: number })?.status ??
      (exception as { statusCode?: number })?.statusCode ??
      0,
    );
    if (Number.isInteger(rawExpressStatus) && rawExpressStatus >= 400 && rawExpressStatus < 500) {
      return {
        status: rawExpressStatus,
        body: {
          error: "Yêu cầu không hợp lệ.",
          code: STATUS_CODES[rawExpressStatus] ?? "BAD_REQUEST",
        },
      };
    }

    const pgCode = (exception as { code?: string })?.code;
    if (pgCode && PG_MESSAGES[pgCode]) {
      const { status, message } = PG_MESSAGES[pgCode];
      return {
        status,
        body: {
          error: message,
          code: status === 409 ? "CONFLICT" : STATUS_CODES[status] ?? "BAD_REQUEST",
        },
      };
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return { status: 500, body: { error: INTERNAL_ERROR_MESSAGE, code: "INTERNAL" } };
  }
}
