import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseFilePipeBuilder,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { memoryStorage } from "multer";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser, Public } from "../auth/auth.decorators";
import { notFound } from "../common/errors/app.exception";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { UploadDto } from "./upload.dto";
import { PUBLIC_PURPOSES, UploadsService } from "./uploads.service";

/** Giới hạn cứng của multer (lớn hơn UPLOAD_MAX_MB một chút; giới hạn chính xác kiểm tra trong service). */
const MULTER_LIMIT_BYTES = 25 * 1024 * 1024;

const findOr404 = async (service: UploadsService, id: number) => {
  const attachment = await service.find(id);
  if (!attachment) throw notFound();
  return attachment;
};

const applySafeFileHeaders = (res: Response, mimeType: string) => {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  );
};

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
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await findOr404(this.uploads, id);
    await this.uploads.assertReadable(attachment, user);
    applySafeFileHeaders(res, attachment.mime_type);
    return new StreamableFile(await this.uploads.open(attachment));
  }

  /** Tệp công khai (ảnh bản tin, ảnh danh mục) cho trang giới thiệu. */
  @Public()
  @Get("public/files/:id")
  @Header("Cache-Control", "public, max-age=86400")
  async publicFile(@Param("id", ParseRecordIdPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const attachment = await findOr404(this.uploads, id);
    if (!PUBLIC_PURPOSES.has(attachment.purpose)) throw notFound();
    applySafeFileHeaders(res, attachment.mime_type);
    return new StreamableFile(await this.uploads.open(attachment));
  }
}
