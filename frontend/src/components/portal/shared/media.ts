"use client";

import { api, type UploadedFile, type UploadPurpose } from "@/lib/api-client";
import { getNetworkQualitySnapshot, isLowEndDevice } from "@/lib/network";

/** Tập định dạng ảnh raster an toàn được phép chọn và tải lên (chặn SVG, GIF, HTML giả mạo). */
export const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Tập định dạng video hiện trường được phép chọn từ điện thoại Android/iOS và trình duyệt. */
export const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/3gpp",
]);

/** Giới hạn tệp ảnh gốc người dùng chọn (trước khi nén tự động trên trình duyệt). */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Giới hạn tệp PDF gửi kèm hồ sơ. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Giới hạn tệp video hiện trường (MP4 / WebM / MOV). */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
/** Thời lượng tối đa khuyến nghị cho mỗi đoạn video hiện trường để tải mượt trên sóng 3G/4G tại vườn. */
export const MAX_VIDEO_DURATION_SECONDS = 90;

const FULL_MAX_DIMENSION = 1440;
const LITE_MAX_DIMENSION = 1152;
const FULL_PRIMARY_QUALITY = 0.78;
const LITE_PRIMARY_QUALITY = 0.72;
const FULL_SECOND_PASS_THRESHOLD = 320 * 1024;
const LITE_SECOND_PASS_THRESHOLD = 240 * 1024;
const FULL_SECOND_PASS_QUALITY = 0.64;
const LITE_SECOND_PASS_QUALITY = 0.58;

let cachedWebpSupport: boolean | null = null;

/** Kiểm tra trình duyệt có hỗ trợ mã hóa WebP trên thẻ `<canvas>` hay không (nhẹ hơn JPEG ~30–40% cùng độ nét). */
function supportsWebpEncode(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    probe.width = 2;
    probe.height = 2;
    const dataUrl = probe.toDataURL("image/webp", 0.75);
    probe.width = 0;
    probe.height = 0;
    cachedWebpSupport = dataUrl.startsWith("data:image/webp");
    return cachedWebpSupport;
  } catch {
    cachedWebpSupport = false;
    return false;
  }
}

export function isSupportedImageFile(file: Pick<File, "type" | "name">): boolean {
  if (ALLOWED_IMAGE_MIMES.has(file.type)) return true;
  if (!file.type) {
    return /\.(jpe?g|png|webp)$/i.test(file.name);
  }
  return false;
}

export function isSupportedVideoFile(file: Pick<File, "type" | "name">): boolean {
  if (ALLOWED_VIDEO_MIMES.has(file.type)) return true;
  if (!file.type) {
    return /\.(mp4|webm|mov|m4v|3gp)$/i.test(file.name);
  }
  return false;
}

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

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * Thu nhỏ ảnh về cạnh dài tối đa 1440px (1152px trên điện thoại RAM yếu / tiết kiệm dữ liệu)
 * và ưu tiên nén sang WebP 2 bước (tự động lùi về JPEG trên trình duyệt cũ):
 * - Ảnh điện thoại 6–12 MB giảm còn khoảng 100–220 KB mà vẫn giữ sắc nét tán lá, trái và chữ trên hóa đơn.
 * - Giải phóng tức thì bộ nhớ GPU/RAM ngay sau mỗi tấm ảnh để chọn 6–8 ảnh liền không đơ máy.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!isSupportedImageFile(file)) {
    throw new Error("Định dạng ảnh không được hỗ trợ. Chỉ nhận JPG, PNG hoặc WEBP.");
  }
  const lowEnd = isLowEndDevice();
  const weakNet = getNetworkQualitySnapshot() !== "good";
  const maxDimension = weakNet ? 1080 : lowEnd ? LITE_MAX_DIMENSION : FULL_MAX_DIMENSION;
  const primaryQuality = weakNet ? 0.7 : lowEnd ? LITE_PRIMARY_QUALITY : FULL_PRIMARY_QUALITY;
  const secondPassThreshold = weakNet ? 190 * 1024 : lowEnd ? LITE_SECOND_PASS_THRESHOLD : FULL_SECOND_PASS_THRESHOLD;
  const secondPassQuality = weakNet ? 0.56 : lowEnd ? LITE_SECOND_PASS_QUALITY : FULL_SECOND_PASS_QUALITY;
  const targetMime = supportsWebpEncode() ? "image/webp" : "image/jpeg";

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

      let blob = await canvasToBlob(canvas, targetMime, primaryQuality);
      if (!blob || (targetMime === "image/webp" && blob.type !== "image/webp")) {
        blob = await canvasToBlob(canvas, "image/jpeg", primaryQuality);
      }
      if (!blob) return file;

      // Bước 2: nếu ảnh nhiều chi tiết lá cây vẫn nặng hơn ngưỡng mục tiêu, nén tinh chỉnh thêm 1 lượt trên cùng canvas
      if (blob.size > secondPassThreshold) {
        const tighter = await canvasToBlob(canvas, blob.type || "image/jpeg", secondPassQuality);
        if (tighter && tighter.size < blob.size) {
          blob = tighter;
        }
      }

      if (blob.size >= file.size && ALLOWED_IMAGE_MIMES.has(file.type)) {
        return file;
      }
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

/** Đổi đuôi tên tệp khớp với định dạng nén thực tế (`.webp` hoặc `.jpg`). */
export function encodedImageName(name: string, mimeType: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "anh-hien-truong";
  const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
  return `${base}.${ext}`;
}

/** Giữ tương thích cho các chỗ gọi cũ. */
export function jpegName(name: string): string {
  return encodedImageName(name, "image/jpeg");
}

/**
 * Kiểm tra nhanh siêu dữ liệu video trên trình duyệt (thời lượng + chụp 1 khung hình đại diện siêu nhẹ ~12 KB)
 * rồi giải phóng bộ giải mã video ngay lập tức để không giữ bộ đệm video trong RAM điện thoại.
 */
export async function inspectVideoFile(
  file: File,
): Promise<{ durationSec: number | null; posterUrl: string | null; error: string | null }> {
  if (typeof document === "undefined") {
    return { durationSec: null, posterUrl: null, error: null };
  }
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  const cleanup = () => {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {
      // ignore
    }
    URL.revokeObjectURL(objectUrl);
  };

  try {
    const durationSec = await new Promise<number | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 4000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
        resolve(d);
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };
      video.src = objectUrl;
    });

    if (durationSec !== null && durationSec > MAX_VIDEO_DURATION_SECONDS + 1) {
      return {
        durationSec,
        posterUrl: null,
        error: `Video dài ${Math.round(durationSec)} giây (tối đa ${MAX_VIDEO_DURATION_SECONDS} giây). Vui lòng quay đoạn ngắn để tải nhanh trên mạng di động.`,
      };
    }

    let posterUrl: string | null = null;
    if (durationSec !== null && video.videoWidth > 0 && video.videoHeight > 0) {
      posterUrl = await new Promise<string | null>((resolve) => {
        const timer = window.setTimeout(() => resolve(null), 1800);
        video.onseeked = () => {
          window.clearTimeout(timer);
          let thumbCanvas: HTMLCanvasElement | null = null;
          try {
            const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
            const w = Math.max(1, Math.round(video.videoWidth * scale));
            const h = Math.max(1, Math.round(video.videoHeight * scale));
            thumbCanvas = document.createElement("canvas");
            thumbCanvas.width = w;
            thumbCanvas.height = h;
            const ctx = thumbCanvas.getContext("2d", { alpha: false });
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.drawImage(video, 0, 0, w, h);
            const mime = supportsWebpEncode() ? "image/webp" : "image/jpeg";
            resolve(thumbCanvas.toDataURL(mime, 0.62));
          } catch {
            resolve(null);
          } finally {
            if (thumbCanvas) {
              thumbCanvas.width = 0;
              thumbCanvas.height = 0;
            }
          }
        };
        try {
          video.currentTime = Math.min(0.25, Math.max(0.05, durationSec * 0.1));
        } catch {
          window.clearTimeout(timer);
          resolve(null);
        }
      });
    }

    return { durationSec, posterUrl, error: null };
  } finally {
    cleanup();
  }
}

export function purposeAllowsVideo(purpose: UploadPurpose): boolean {
  return (
    purpose === "journal" ||
    purpose === "harvest" ||
    purpose === "approval" ||
    purpose === "violation" ||
    purpose === "news" ||
    purpose === "inspection"
  );
}

/**
 * Tính dấu vân tay SHA-256 của tệp nén ngay trên trình duyệt để:
 * 1. Máy chủ kiểm tra toàn vẹn dữ liệu chống lỗi đứt quãng trên sóng 2G/3G ngoài rẫy.
 * 2. Không bao giờ tải lại tệp đã có trên máy chủ khi thử đồng bộ lại.
 */
export async function computeBlobSha256Hex(blob: Blob): Promise<string | undefined> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle?.digest) return undefined;
    const buf = await blob.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(hashBuf);
    let hex = "";
    for (let i = 0; i < bytes.length; i += 1) {
      hex += bytes[i]!.toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return undefined;
  }
}

/** Nén (nếu là ảnh) rồi tải lên `/api/uploads`, trả về thông tin tệp đầy đủ (`{ id, url, mimeType, sizeBytes }`). */
export async function uploadOptimizedFile(file: File, purpose: UploadPurpose): Promise<UploadedFile> {
  const allowPdf = purpose === "approval" || purpose === "lab";
  const allowVideo = purposeAllowsVideo(purpose);
  const validationError = validatePickedFile(file, { allowPdf, allowVideo });
  if (validationError) {
    throw new Error(validationError);
  }
  const isImage = isSupportedImageFile(file);
  const blob = isImage ? await compressImage(file) : file;
  const name = isImage && blob !== file ? encodedImageName(file.name, blob.type || "image/jpeg") : file.name;
  const sha256 = blob.size <= MAX_VIDEO_BYTES ? await computeBlobSha256Hex(blob) : undefined;
  return api.upload(blob, purpose, name, { sha256 });
}

/** Bí danh chuẩn cho luồng kiểm tra MIME + nén + tải tệp phương tiện lên máy chủ. */
export const uploadMedia = uploadOptimizedFile;

/** Nén (nếu là ảnh) rồi tải lên `/api/uploads`, trả về id tệp. */
export async function uploadPortalFile(file: File, purpose: UploadPurpose): Promise<number> {
  const uploaded = await uploadOptimizedFile(file, purpose);
  return uploaded.id;
}

/**
 * Tải hàng loạt ảnh/video theo hàng đợi giới hạn đồng thời (tối đa 2 luồng nén + tải cùng lúc)
 * để tránh tràn bộ nhớ trên điện thoại phổ thông và không nghẽn băng thông 3G/4G tại vườn.
 */
export async function uploadOptimizedFilesBatch(
  files: File[],
  purpose: UploadPurpose,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<UploadedFile[]> {
  const total = files.length;
  if (total === 0) return [];
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 3));
  const results = new Array<UploadedFile>(total);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= total) return;
      results[current] = await uploadOptimizedFile(files[current], purpose);
      completed += 1;
      options.onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Kiểm tra tệp người dùng chọn; trả về thông báo lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function validatePickedFile(
  file: File,
  options: { allowPdf?: boolean; allowVideo?: boolean } = {},
): string | null {
  const isImage = isSupportedImageFile(file);
  const isPdf = file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name));
  const isVideo = isSupportedVideoFile(file);
  if (!isImage && !(options.allowPdf && isPdf) && !(options.allowVideo && isVideo)) {
    if (options.allowPdf && options.allowVideo) return "Chỉ nhận ảnh (JPG, PNG, WEBP), video ngắn (MP4, WebM, MOV) hoặc tệp PDF.";
    if (options.allowPdf) return "Chỉ nhận ảnh (JPG, PNG, WEBP) hoặc tệp PDF.";
    if (options.allowVideo) return "Chỉ nhận ảnh (JPG, PNG, WEBP) hoặc video hiện trường (MP4, WebM, MOV).";
    return "Vui lòng chọn tệp ảnh (JPG, PNG, WEBP).";
  }
  if (isPdf && file.size > MAX_PDF_BYTES) return "Tệp PDF không được vượt quá 10 MB.";
  if (isVideo && file.size > MAX_VIDEO_BYTES) return "Video không được vượt quá 20 MB. Vui lòng quay đoạn ngắn dưới 90 giây.";
  if (isImage && file.size > MAX_SOURCE_BYTES) return "Ảnh gốc vượt quá 20 MB.";
  return null;
}
