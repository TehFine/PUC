"use client";

import { api, type UploadedFile, type UploadPurpose } from "@/lib/api-client";
import { isLowEndDevice } from "@/lib/network";

/** Giới hạn tệp gốc người dùng chọn (trước khi nén). */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
/** Giới hạn tệp PDF gửi kèm hồ sơ. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Giới hạn tệp video hiện trường (MP4 / WebM). */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const FULL_MAX_DIMENSION = 1600;
const LITE_MAX_DIMENSION = 1280;
const FULL_JPEG_QUALITY = 0.8;
const LITE_JPEG_QUALITY = 0.76;

async function decode(
  file: Blob,
  maxDimension: number,
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      if (scale < 1) {
        // Giải mã thu nhỏ trực tiếp ở tầng trình duyệt và đóng ngay bitmap gốc (tránh giữ 48MB RGBA của ảnh 12MP trên máy RAM yếu)
        const targetW = Math.max(1, Math.round(bitmap.width * scale));
        const targetH = Math.max(1, Math.round(bitmap.height * scale));
        try {
          const resized = await createImageBitmap(bitmap, {
            resizeWidth: targetW,
            resizeHeight: targetH,
            resizeQuality: "medium",
          });
          bitmap.close();
          return { source: resized, width: resized.width, height: resized.height, release: () => resized.close() };
        } catch {
          // Nếu trình duyệt không hỗ trợ resizeWidth/resizeHeight thì dùng bitmap gốc bên dưới
        }
      }
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Trình duyệt cũ: dùng thẻ <img> bên dưới.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => {
        image.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Thu nhỏ ảnh về cạnh dài tối đa 1600px (hoặc 1280px trên điện thoại ít RAM) và nén JPEG bằng canvas
 * trước khi tải lên (ảnh điện thoại 5–10MB còn vài trăm KB, tải nhanh trên mạng 3G/4G ở vườn).
 * Giải phóng tức thì bộ nhớ canvas/bitmap ngay sau khi nén để tránh tràn RAM trên máy cấu hình thấp.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  const lowEnd = isLowEndDevice();
  const maxDimension = lowEnd ? LITE_MAX_DIMENSION : FULL_MAX_DIMENSION;
  const jpegQuality = lowEnd ? LITE_JPEG_QUALITY : FULL_JPEG_QUALITY;
  let canvas: HTMLCanvasElement | null = null;
  try {
    const { source, width, height, release } = await decode(file, maxDimension);
    try {
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));
      canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return file;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(source, 0, 0, targetW, targetH);
      const blob = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, "image/jpeg", jpegQuality));
      if (!blob) return file;
      // Ảnh JPEG vốn đã nhỏ: giữ bản gốc nếu bản nén không nhỏ hơn.
      if (blob.size >= file.size && file.type === "image/jpeg") return file;
      return blob;
    } finally {
      release();
    }
  } catch {
    return file;
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/** Đổi đuôi tên tệp sang `.jpg` khi đã nén sang JPEG. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "anh";
  return `${base}.jpg`;
}

/** Nén (nếu là ảnh) rồi tải lên `/api/uploads`, trả về thông tin tệp đầy đủ (`{ id, url, mimeType, sizeBytes }`). */
export async function uploadOptimizedFile(file: File, purpose: UploadPurpose): Promise<UploadedFile> {
  const isImage = file.type.startsWith("image/");
  const blob = isImage ? await compressImage(file) : file;
  const name = isImage && blob !== file ? jpegName(file.name) : file.name;
  return api.upload(blob, purpose, name);
}

/** Nén (nếu là ảnh) rồi tải lên `/api/uploads`, trả về id tệp. */
export async function uploadPortalFile(file: File, purpose: UploadPurpose): Promise<number> {
  const uploaded = await uploadOptimizedFile(file, purpose);
  return uploaded.id;
}

/** Kiểm tra tệp người dùng chọn; trả về thông báo lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function validatePickedFile(
  file: File,
  options: { allowPdf?: boolean; allowVideo?: boolean } = {},
): string | null {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isVideo =
    file.type === "video/mp4" ||
    file.type === "video/webm" ||
    /\.(mp4|webm)$/i.test(file.name);
  if (!isImage && !(options.allowPdf && isPdf) && !(options.allowVideo && isVideo)) {
    if (options.allowPdf && options.allowVideo) return "Chỉ nhận ảnh (JPG, PNG, WEBP), video (MP4, WebM) hoặc tệp PDF.";
    if (options.allowPdf) return "Chỉ nhận ảnh (JPG, PNG…) hoặc tệp PDF.";
    if (options.allowVideo) return "Chỉ nhận ảnh (JPG, PNG, WEBP) hoặc video hiện trường (MP4, WebM).";
    return "Vui lòng chọn tệp ảnh (JPG, PNG, WEBP).";
  }
  if (isPdf && file.size > MAX_PDF_BYTES) return "Tệp PDF không được vượt quá 10MB.";
  if (isVideo && file.size > MAX_VIDEO_BYTES) return "Video không được vượt quá 20MB.";
  if (isImage && file.size > MAX_SOURCE_BYTES) return "Ảnh quá lớn (tối đa 15MB).";
  return null;
}
