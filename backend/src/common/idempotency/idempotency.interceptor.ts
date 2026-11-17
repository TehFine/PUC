import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { finalize, mergeMap, of, type Observable } from "rxjs";
import { AppException, badRequest } from "../errors/app.exception";
import { IdempotencyService } from "./idempotency.service";

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{12,80}$/;
const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "PUT"]);

/** JSON chuẩn hóa (sắp xếp khóa đối tượng) để dấu vân tay không phụ thuộc thứ tự khóa. */
function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 24) {
    throw badRequest("Dữ liệu JSON lồng nhau vượt quá giới hạn cho phép.");
  }
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], depth + 1)}`);
  return `{${entries.join(",")}}`;
}

/** SHA-256 của phương thức, đường dẫn và nội dung yêu cầu: cùng khóa mà khác nội dung thì không được phát lại kết quả cũ. */
export function requestFingerprint(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(`${method}\n${path}\n${canonicalJson(body)}`).digest("hex");
}

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

    const normalizedPath = (req.originalUrl || req.path).slice(0, 200);
    const requestHash = requestFingerprint(method, normalizedPath, (req as { body?: unknown }).body);
    const existing = await this.idempotency.findCompleted(userId, idemKey);
    if (existing) {
      if (existing.method !== method || existing.path !== normalizedPath) {
        throw badRequest("Khóa X-Idempotency-Key đã được dùng cho một thao tác khác.");
      }
      // Bản ghi cũ chưa có dấu vân tay (trước bản vá) vẫn được phát lại để tương thích ngược.
      if (existing.requestHash && existing.requestHash !== requestHash) {
        throw new AppException(
          422,
          "Khóa X-Idempotency-Key đã được dùng với nội dung khác. Vui lòng tạo khóa mới cho bản ghi này.",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      res.status(existing.statusCode);
      res.setHeader("X-Idempotency-Replayed", "true");
      if (existing.bodyOmitted) res.setHeader("X-Idempotency-Body-Omitted", "true");
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
          .saveCompleted(userId, idemKey, method, normalizedPath, statusCode, result, requestHash)
          .catch(() => undefined);
        return result;
      }),
      finalize(() => {
        this.idempotency.releaseInflight(userId, idemKey);
      }),
    );
  }
}

