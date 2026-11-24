import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  Injectable,
  NestInterceptor,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { memoryStorage } from "multer";
import { finalize, type Observable } from "rxjs";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser, OptionalAuth, OptionalCurrentUser, Public } from "../auth/auth.decorators";
import { AppException, badRequest, notFound } from "../common/errors/app.exception";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
import { UploadDto } from "./upload.dto";
import { type AttachmentRow, type UploadPurpose, UploadsService } from "./uploads.service";

/** Giới hạn cứng của multer (lớn hơn UPLOAD_MAX_MB / giới hạn video một chút; kiểm tra chính xác trong service). */
const MULTER_LIMIT_BYTES = 25 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 8;
const MAX_CONCURRENT_UPLOADS_PER_ACTOR = 2;
let activeUploadCount = 0;
const activeUploadsByActor = new Map<string, number>();

/**
 * Chặn số luồng tải tệp đồng thời (toàn cục và theo từng người dùng/IP) TRƯỚC khi `FileInterceptor`
 * nạp bộ đệm 25 MB vào RAM (`memoryStorage()`), chống cạn kiệt bộ nhớ máy chủ (OOM).
 */
@Injectable()
class UploadConcurrencyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const actorKey = req.user?.id
      ? `user:${req.user.id}`
      : `ip:${(req.ip || req.socket?.remoteAddress || "unknown").trim()}`;
    const actorCount = activeUploadsByActor.get(actorKey) ?? 0;
    if (actorCount >= MAX_CONCURRENT_UPLOADS_PER_ACTOR || activeUploadCount >= MAX_CONCURRENT_UPLOADS) {
      throw new AppException(
        429,
        "Máy chủ đang xử lý nhiều tệp tải lên cùng lúc. Vui lòng thử lại sau giây lát.",
        "TOO_MANY_UPLOADS",
      );
    }
    req.setTimeout?.(45_000);
    activeUploadCount += 1;
    activeUploadsByActor.set(actorKey, actorCount + 1);
    return next.handle().pipe(
      finalize(() => {
        activeUploadCount = Math.max(0, activeUploadCount - 1);
        const remaining = (activeUploadsByActor.get(actorKey) ?? 1) - 1;
        if (remaining <= 0) {
          activeUploadsByActor.delete(actorKey);
        } else {
          activeUploadsByActor.set(actorKey, remaining);
        }
      }),
    );
  }
}

const findOr404 = async (service: UploadsService, id: number) => {
  const attachment = await service.find(id);
  if (!attachment) throw notFound();
  return attachment;
};

const buildAttachmentEtag = (attachment: AttachmentRow, totalBytes: number): string => {
  const digest = createHash("sha256")
    .update(`puc-att-etag-v1:${attachment.id}:${attachment.public_token}:${totalBytes}`)
    .digest("hex")
    .slice(0, 24);
  return `"att-${digest}"`;
};

const applySafeFileHeaders = (res: Response, attachment: AttachmentRow, totalBytes: number, precomputedEtag?: string) => {
  res.setHeader("Content-Type", attachment.mime_type);
  if (attachment.mime_type === "application/pdf") {
    res.setHeader("Content-Disposition", 'attachment; filename="tai-lieu-ho-so.pdf"');
  } else {
    res.setHeader("Content-Disposition", "inline");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("ETag", precomputedEtag ?? buildAttachmentEtag(attachment, totalBytes));
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  );
};

function parseByteRange(rangeHeader: string | undefined, totalBytes: number): { start: number; end: number } | "invalid" | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return "invalid";
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid";

  let start: number;
  let end: number;
  if (!rawStart) {
    const suffixLen = Number(rawEnd);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return "invalid";
    start = Math.max(0, totalBytes - suffixLen);
    end = totalBytes - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Math.min(Number(rawEnd), totalBytes - 1) : totalBytes - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= totalBytes || start > end) {
    return "invalid";
  }
  return { start, end };
}

async function streamAttachment(
  uploads: UploadsService,
  attachment: AttachmentRow,
  req: Request,
  res: Response,
): Promise<StreamableFile> {
  const cachedDiskSize = uploads.getVerifiedDiskSize(attachment.id);
  if (cachedDiskSize !== undefined) {
    const cachedEtag = buildAttachmentEtag(attachment, cachedDiskSize);
    if (req.headers["if-none-match"] === cachedEtag) {
      applySafeFileHeaders(res, attachment, cachedDiskSize, cachedEtag);
      res.status(304);
      return new StreamableFile(Buffer.alloc(0));
    }
  }

  const opened = await uploads.openFile(attachment);
  try {
    const total = opened.totalBytes;
    const etag = buildAttachmentEtag(attachment, total);
    applySafeFileHeaders(res, attachment, total, etag);

    if (req.headers["if-none-match"] === etag) {
      await opened.close();
      res.status(304);
      return new StreamableFile(Buffer.alloc(0));
    }

    const range = parseByteRange(req.headers.range, total);
    if (range === "invalid") {
      await opened.close();
      res.status(416).setHeader("Content-Range", `bytes */${total}`);
      return new StreamableFile(Buffer.alloc(0));
    }

    if (range) {
      const chunkLen = range.end - range.start + 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
      res.setHeader("Content-Length", String(chunkLen));
      if (req.method === "HEAD") {
        await opened.close();
        return new StreamableFile(Buffer.alloc(0));
      }
      return new StreamableFile(opened.createStream(range));
    }

    res.setHeader("Content-Length", String(total));
    if (req.method === "HEAD") {
      await opened.close();
      return new StreamableFile(Buffer.alloc(0));
    }
    return new StreamableFile(opened.createStream());
  } catch (err) {
    await opened.close();
    throw err;
  }
}

@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) { }

  /** Tải một tệp lên (multipart/form-data: `file`, `purpose`). Trả về `{ id, url }` để gắn vào bản ghi nghiệp vụ. */
  @Post("uploads")
  @Throttle(RateLimitTier.UPLOAD_WRITE)
  @UseInterceptors(
    UploadConcurrencyInterceptor,
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_LIMIT_BYTES, files: 1 } }),
  )
  async upload(
    @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: false })) file: Express.Multer.File | undefined,
    @Body() dto: UploadDto,
    @CurrentUser() user: AuthUser,
    @Headers("x-upload-sha256") expectedSha256?: string | string[],
  ) {
    return this.uploads.save(file, dto.purpose, user, expectedSha256);
  }

  /**
   * Kiểm tra nhanh theo mã băm SHA-256 xem tệp của chính tài khoản này đã được lưu trên máy chủ chưa
   * (tiết kiệm 99% băng thông khi thử lại từ vùng rẫy sóng 2G/3G chập chờn).
   */
  @Get("uploads/by-hash")
  @Throttle(RateLimitTier.UPLOAD_WRITE)
  async checkByHash(
    @Query("purpose") purpose: string | undefined,
    @Query("sha256") sha256: string | undefined,
    @Query("size") rawSize: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    let sizeBytes: number | undefined;
    if (rawSize !== undefined && rawSize !== "") {
      const parsedSize = Number(rawSize);
      if (!Number.isInteger(parsedSize) || parsedSize <= 0 || parsedSize > MULTER_LIMIT_BYTES) {
        throw badRequest("Kích thước tệp kiểm tra không hợp lệ.");
      }
      sizeBytes = parsedSize;
    }
    return this.uploads.findOwnedByHash(user, (purpose ?? "") as UploadPurpose, sha256, sizeBytes);
  }

  /**
   * Xem tệp nội bộ (bắt buộc đăng nhập, đúng phạm vi hộ/thôn).
   * Cho phép trình duyệt lưu bản đệm riêng tư (`private, no-cache`) nhưng bắt buộc xác thực lại qua ETag (`304 Not Modified`)
   * ở mỗi lần mở trang để tiết kiệm băng thông 3G/4G mà vẫn đảm bảo phân quyền chặt chẽ trên máy dùng chung.
   */
  @SkipThrottle({ burst: true })
  @Throttle(RateLimitTier.MEDIA_READ)
  @Get(["uploads/:id", "uploads/:id/:mediaHint"])
  async download(
    @Param("id", ParseRecordIdPipe) id: number,
    @Param("mediaHint") mediaHint: string | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (mediaHint !== undefined && !/^[A-Za-z0-9._-]{1,40}$/.test(mediaHint)) {
      throw notFound();
    }
    const attachment = await findOr404(this.uploads, id);
    await this.uploads.assertReadable(attachment, user);
    res.setHeader("Cache-Control", "private, no-cache");
    res.setHeader("Vary", "Cookie");
    return streamAttachment(this.uploads, attachment, req, res);
  }

  /** Tệp công khai truy cập bằng token ngẫu nhiên 20 ký tự (chống dò quét ID tuần tự và chặn bản nháp). */
  @Public()
  @OptionalAuth()
  @SkipThrottle({ burst: true })
  @Throttle(RateLimitTier.PUBLIC_MEDIA_READ)
  @Get(["public/files/:token", "public/files/:token/:mediaHint"])
  async publicFile(
    @Param("token") token: string,
    @Param("mediaHint") mediaHint: string | undefined,
    @OptionalCurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (mediaHint !== undefined && !/^[A-Za-z0-9._-]{1,40}$/.test(mediaHint)) {
      throw notFound();
    }
    const attachment = await this.uploads.findPublicByToken(token, user);
    if (!attachment) throw notFound();
    if (attachment.purpose === "news" || attachment.purpose === "catalog") {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    } else {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Vary", "Cookie");
    }
    return streamAttachment(this.uploads, attachment, req, res);
  }
}
