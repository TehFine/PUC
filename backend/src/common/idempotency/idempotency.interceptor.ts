import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { finalize, mergeMap, of, type Observable } from "rxjs";
import { AppException, badRequest } from "../errors/app.exception";
import { IdempotencyService } from "./idempotency.service";

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{12,80}$/;
const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "PUT"]);

/**
 * Đảm bảo tính bất biến (Idempotency) khi thiết bị ở vùng sóng yếu tự động gửi lại bản ghi hiện trường:
 * - Nếu gói tin trước đó thực chất đã ghi thành công vào CSDL nhưng rớt mạng trước khi điện thoại nhận phản hồi,
 *   lần đồng bộ lại mang cùng `X-Idempotency-Key` sẽ nhận lại nguyên vẹn kết quả đã lưu mà không tạo bản ghi trùng lặp.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const method = (req.method ?? "GET").toUpperCase();
    if (!IDEMPOTENT_METHODS.has(method)) {
      return next.handle();
    }

    const rawHeader = req.headers["x-idempotency-key"];
    const idemKey = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim();
    if (!idemKey) {
      return next.handle();
    }

    if (!IDEMPOTENCY_KEY_RE.test(idemKey)) {
      throw badRequest("Khóa X-Idempotency-Key không hợp lệ.");
    }

    const userId = req.user?.id;
    if (
      !userId ||
      req.path.startsWith("/api/auth") ||
      req.path.startsWith("/api/uploads")
    ) {
      return next.handle();
    }

    const normalizedPath = req.path.slice(0, 200);
    const existing = await this.idempotency.findCompleted(userId, idemKey);
    if (existing) {
      if (existing.method !== method || existing.path !== normalizedPath) {
        throw badRequest("Khóa X-Idempotency-Key đã được dùng cho một thao tác khác.");
      }
      res.status(existing.statusCode);
      res.setHeader("X-Idempotency-Replayed", "true");
      return of(existing.body);
    }

    if (!this.idempotency.tryAcquireInflight(userId, idemKey)) {
      throw new AppException(
        409,
        "Bản ghi này đang được máy chủ xử lý đồng bộ. Vui lòng đợi trong giây lát.",
        "IDEMPOTENCY_IN_PROGRESS",
      );
    }

    return next.handle().pipe(
      mergeMap(async (result) => {
        const statusCode = res.statusCode >= 200 && res.statusCode < 300 ? res.statusCode : 200;
        await this.idempotency
          .saveCompleted(userId, idemKey, method, normalizedPath, statusCode, result)
          .catch(() => undefined);
        return result;
      }),
      finalize(() => {
        this.idempotency.releaseInflight(userId, idemKey);
      }),
    );
  }
}

