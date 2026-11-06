import {
  Body,
  Controller,
  Get,
  Header,
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
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser, Public } from "../auth/auth.decorators";
import { notFound } from "../common/errors/app.exception";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { UploadDto } from "./upload.dto";
import { type AttachmentRow, PUBLIC_PURPOSES, UploadsService } from "./uploads.service";

/** Giới hạn cứng của multer (lớn hơn UPLOAD_MAX_MB / giới hạn video một chút; kiểm tra chính xác trong service). */
const MULTER_LIMIT_BYTES = 25 * 1024 * 1024;

const findOr404 = async (service: UploadsService, id: number) => {
  const attachment = await service.find(id);
  if (!attachment) throw notFound();
  return attachment;
};

const applySafeFileHeaders = (res: Response, attachment: AttachmentRow) => {
  res.setHeader("Content-Type", attachment.mime_type);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("ETag", `"att-${attachment.id}-${attachment.size_bytes}"`);
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
  applySafeFileHeaders(res, attachment);
  const etag = `"att-${attachment.id}-${attachment.size_bytes}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304);
    return new StreamableFile(Buffer.alloc(0));
  }

  const total = attachment.size_bytes;
  const range = parseByteRange(req.headers.range, total);
  if (range === "invalid") {
    res.status(416).setHeader("Content-Range", `bytes */${total}`);
    return new StreamableFile(Buffer.alloc(0));
  }

  if (range) {
    const chunkLen = range.end - range.start + 1;
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
    res.setHeader("Content-Length", String(chunkLen));
    return new StreamableFile(await uploads.open(attachment, range));
  }

  res.setHeader("Content-Length", String(total));
  return new StreamableFile(await uploads.open(attachment));
}

@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Tải một tệp lên (multipart/form-data: `file`, `purpose`). Trả về `{ id, url }` để gắn vào bản ghi nghiệp vụ. */
  @Post("uploads")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_LIMIT_BYTES, files: 1 } }))
  upload(
    @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: false })) file: Express.Multer.File | undefined,
    @Body() dto: UploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploads.save(file, dto.purpose, user);
  }

  /** Xem tệp (cần đăng nhập và có quyền với hộ sở hữu tệp). */
  @Get("uploads/:id")
  @Header("Cache-Control", "private, max-age=86400")
  async download(
    @Param("id", ParseRecordIdPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await findOr404(this.uploads, id);
    await this.uploads.assertReadable(attachment, user);
    return streamAttachment(this.uploads, attachment, req, res);
  }

  /** Tệp công khai (ảnh bản tin, ảnh danh mục) cho trang giới thiệu. */
  @Public()
  @Get("public/files/:id")
  @Header("Cache-Control", "public, max-age=86400")
  async publicFile(
    @Param("id", ParseRecordIdPipe) id: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await findOr404(this.uploads, id);
    if (!PUBLIC_PURPOSES.has(attachment.purpose)) throw notFound();
    return streamAttachment(this.uploads, attachment, req, res);
  }
}
