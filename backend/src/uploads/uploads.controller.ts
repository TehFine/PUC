import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  ParseFilePipeBuilder,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { memoryStorage } from "multer";
import { finalize, type Observable } from "rxjs";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser, Public } from "../auth/auth.decorators";
import { AppException, notFound } from "../common/errors/app.exception";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { UploadDto } from "./upload.dto";
import { type AttachmentRow, UploadsService } from "./uploads.service";

/** Giới hạn cứng của multer (lớn hơn UPLOAD_MAX_MB / giới hạn video một chút; kiểm tra chính xác trong service). */
const MULTER_LIMIT_BYTES = 25 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 6;
let activeUploadCount = 0;

/**
 * Chặn số luồng tải tệp đồng thời TRƯỚC khi `FileInterceptor` nạp bộ đệm 25 MB vào RAM (`memoryStorage()`),
 * chống cạn kiệt bộ nhớ máy chủ (OOM).
 */
@Injectable()
class UploadConcurrencyInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (activeUploadCount >= MAX_CONCURRENT_UPLOADS) {
      throw new AppException(
        429,
        "Máy chủ đang xử lý nhiều tệp tải lên cùng lúc. Vui lòng thử lại sau giây lát.",
        "TOO_MANY_UPLOADS",
      );
    }
    activeUploadCount += 1;
    return next.handle().pipe(
      finalize(() => {
        activeUploadCount = Math.max(0, activeUploadCount - 1);
      }),
    );
  }
}

const findOr404 = async (service: UploadsService, id: number) => {
  const attachment = await service.find(id);
  if (!attachment) throw notFound();
  return attachment;
};

const applySafeFileHeaders = (res: Response, attachment: AttachmentRow, totalBytes: number) => {
  res.setHeader("Content-Type", attachment.mime_type);
  if (attachment.mime_type === "application/pdf") {
    res.setHeader("Content-Disposition", 'attachment; filename="tai-lieu-ho-so.pdf"');
  } else {
    res.setHeader("Content-Disposition", "inline");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("ETag", `"att-${attachment.public_token}-${totalBytes}"`);
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
  const opened = await uploads.openFile(attachment);
  const total = opened.totalBytes;
  applySafeFileHeaders(res, attachment, total);

  const etag = `"att-${attachment.public_token}-${total}"`;
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
    return new StreamableFile(opened.createStream(range));
  }

  res.setHeader("Content-Length", String(total));
  return new StreamableFile(opened.createStream());
}

@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Tải một tệp lên (multipart/form-data: `file`, `purpose`). Trả về `{ id, url }` để gắn vào bản ghi nghiệp vụ. */
  @Post("uploads")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    UploadConcurrencyInterceptor,
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_LIMIT_BYTES, files: 1 } }),
  )
  async upload(
    @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: false })) file: Express.Multer.File | undefined,
    @Body() dto: UploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploads.save(file, dto.purpose, user);
  }

  /** Xem tệp nội bộ (bắt buộc đăng nhập, đúng phạm vi hộ/thôn, không lưu bộ đệm trình duyệt dùng chung). */
  @Get("uploads/:id")
  async download(
    @Param("id", ParseRecordIdPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await findOr404(this.uploads, id);
    await this.uploads.assertReadable(attachment, user);
    res.setHeader("Cache-Control", "private, no-store");
    return streamAttachment(this.uploads, attachment, req, res);
  }

  /** Tệp công khai truy cập bằng token ngẫu nhiên 20 ký tự (chống dò quét ID tuần tự và chặn bản nháp). */
  @Public()
  @Get("public/files/:token")
  async publicFile(
    @Param("token") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await this.uploads.findPublicByToken(token);
    if (!attachment) throw notFound();
    if (attachment.purpose === "news" || attachment.purpose === "catalog") {
      res.setHeader("Cache-Control", "public, max-age=86400");
    } else {
      res.setHeader("Cache-Control", "private, no-store");
    }
    return streamAttachment(this.uploads, attachment, req, res);
  }
}
