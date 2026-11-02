"use client";

import { api, type UploadPurpose } from "@/lib/api-client";

/** Giới hạn tệp gốc người dùng chọn (trước khi nén). */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
/** Giới hạn tệp PDF gửi kèm hồ sơ. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
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
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Thu nhỏ ảnh về cạnh dài tối đa 1600px và nén JPEG ~0.8 bằng canvas trước khi tải lên
 * (ảnh điện thoại 5–10MB còn vài trăm KB, tải nhanh trên mạng 3G/4G ở vườn).
 * Nếu không nén được (định dạng lạ), trả về tệp gốc.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const { source, width, height, release } = await decode(file);
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(source, 0, 0, targetW, targetH);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (!blob) return file;
      // Ảnh JPEG vốn đã nhỏ: giữ bản gốc nếu bản nén không nhỏ hơn.
      if (scale === 1 && file.type === "image/jpeg" && blob.size >= file.size) return file;
      return blob;
    } finally {
      release();
    }
  } catch {
    return file;
  }
}

/** Đổi đuôi tên tệp sang `.jpg` khi đã nén sang JPEG. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "anh";
  return `${base}.jpg`;
}

/** Nén (nếu là ảnh) rồi tải lên `/api/uploads`, trả về id tệp. */
export async function uploadPortalFile(file: File, purpose: UploadPurpose): Promise<number> {
  const isImage = file.type.startsWith("image/");
  const blob = isImage ? await compressImage(file) : file;
  const name = isImage && blob !== file ? jpegName(file.name) : file.name;
  const uploaded = await api.upload(blob, purpose, name);
  return uploaded.id;
}

/** Kiểm tra tệp người dùng chọn; trả về thông báo lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function validatePickedFile(file: File, options: { allowPdf?: boolean } = {}): string | null {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isImage && !(options.allowPdf && isPdf)) {
    return options.allowPdf ? "Chỉ nhận ảnh (JPG, PNG…) hoặc tệp PDF." : "Vui lòng chọn tệp ảnh (JPG, PNG…).";
  }
  if (isPdf && file.size > MAX_PDF_BYTES) return "Tệp PDF không được vượt quá 10MB.";
  if (isImage && file.size > MAX_SOURCE_BYTES) return "Ảnh quá lớn (tối đa 15MB).";
  return null;
}
