"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { ConfirmDialog } from "@/components/ui/Modal";
import { AppleSpinner } from "@/components/ui/Skeleton";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
  api,
  type UploadPurpose,
} from "@/lib/api-client";
import { getNetworkQualitySnapshot, isLowEndDevice } from "@/lib/network";
import { usePersistedState } from "@/lib/back-navigation";
import { isDeviceOfflineNow, type OfflineMediaSlot } from "@/lib/offline-sync";
import { isSafeMediaUrl } from "@/utils/url-safety";
import {
  ALLOWED_IMAGE_MIMES,
  computeBlobSha256Hex,
  encodedImageName,
  formatBytesCompact,
  inspectVideoFile,
  isSupportedImageFile,
  isSupportedVideoFile,
  purposeAllowsVideo,
  uploadOptimizedFile,
  validatePickedFile,
} from "./media";

export { isSafeMediaUrl };

let cachedControlsWebpSupport: boolean | null = null;

function canEncodeWebp(): boolean {
  if (cachedControlsWebpSupport !== null) return cachedControlsWebpSupport;
  if (typeof document === "undefined") return false;
  let probe: HTMLCanvasElement | null = null;
  try {
    probe = document.createElement("canvas");
    probe.width = 2;
    probe.height = 2;
    const url = probe.toDataURL("image/webp", 0.75);
    cachedControlsWebpSupport = url.startsWith("data:image/webp");
    return cachedControlsWebpSupport;
  } catch {
    cachedControlsWebpSupport = false;
    return false;
  } finally {
    if (probe) {
      probe.width = 1;
      probe.height = 1;
      probe.width = 0;
      probe.height = 0;
    }
  }
}

function canvasToBlobAsync(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

async function decodeImageSingleLowRam(
  file: Blob,
  maxDimension: number,
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      if (scale < 1) {
        const targetW = Math.max(1, Math.round(bitmap.width * scale));
        const targetH = Math.max(1, Math.round(bitmap.height * scale));
        try {
          const resized = await createImageBitmap(bitmap, {
            resizeWidth: targetW,
            resizeHeight: targetH,
            resizeQuality: "medium",
          });
          bitmap.close?.();
          return {
            source: resized,
            width: resized.width,
            height: resized.height,
            release: () => resized.close?.(),
          };
        } catch {
          // Trình duyệt không hỗ trợ resizeWidth/resizeHeight: thu nhỏ trên canvas bên dưới rồi đóng bitmap ngay.
        }
      }
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      };
    } catch {
      // Lùi về thẻ Image trên Android WebView / Safari đời cũ.
    }
  }

  const tempUrl = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(tempUrl);
      reject(err);
    };
    img.src = tempUrl;
  });

  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    release: () => {
      image.src = "";
    },
  };
}

/**
 * Nén tuần tự 1 ảnh hiện trường với mức tiêu thụ RAM tối thiểu cho điện thoại 2–3 GB RAM:
 * - Thiết bị yếu (`isLowEndDevice()`): cạnh dài tối đa 1280px, chất lượng 0.78.
 * - Thiết bị khá: cạnh dài tối đa 1440px, chất lượng 0.80.
 * - Thu hồi `blob:` URL ngay trong `onload`, đóng `ImageBitmap` ngay sau `drawImage`,
 *   và thu nhỏ `<canvas>` về `1x1` rồi `0x0` ngay sau `toBlob()` để giải phóng bộ nhớ GPU tức thì.
 */
export async function compressImageLowRamSequential(file: File): Promise<File> {
  if (!isSupportedImageFile(file)) return file;
  const lowEnd = isLowEndDevice();
  const weakNet = getNetworkQualitySnapshot() !== "good";
  const maxDimension = weakNet ? 1080 : lowEnd ? 1280 : 1440;
  const primaryQuality = weakNet ? 0.7 : lowEnd ? 0.78 : 0.8;
  const secondPassThreshold = weakNet ? 190 * 1024 : lowEnd ? 240 * 1024 : 340 * 1024;
  const secondPassQuality = weakNet ? 0.56 : lowEnd ? 0.62 : 0.66;
  const targetMime = canEncodeWebp() ? "image/webp" : "image/jpeg";

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const { source, width, height, release } = await decodeImageSingleLowRam(file, maxDimension);
    const scale = Math.min(1, maxDimension / Math.max(width || 1, height || 1));
    const targetW = Math.max(1, Math.round((width || 1) * scale));
    const targetH = Math.max(1, Math.round((height || 1) * scale));

    canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      release();
      return file;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    try {
      ctx.drawImage(source, 0, 0, targetW, targetH);
    } finally {
      // Giải phóng bitmap giải mã ngay lập tức trước cả khi mã hóa sang WebP/JPEG
      release();
    }

    let blob = await canvasToBlobAsync(canvas, targetMime, primaryQuality);
    if (!blob || (targetMime === "image/webp" && blob.type !== "image/webp")) {
      blob = await canvasToBlobAsync(canvas, "image/jpeg", primaryQuality);
    }
    if (!blob) return file;

    if (blob.size > secondPassThreshold) {
      const tighter = await canvasToBlobAsync(canvas, blob.type || "image/jpeg", secondPassQuality);
      if (tighter && tighter.size < blob.size) {
        blob = tighter;
      }
    }

    if (blob.size >= file.size && ALLOWED_IMAGE_MIMES.has(file.type)) {
      return file;
    }

    const nextMime = blob.type || "image/jpeg";
    const nextName = encodedImageName(file.name, nextMime);
    return new File([blob], nextName, {
      type: nextMime,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      ctx?.clearRect(0, 0, 1, 1);
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/**
 * Hook dựng dần (windowed progressive rendering) cho danh sách dài (thuốc BVTV, phân bón, sâu bệnh, nhật ký):
 * - Lần đầu mở tab hoặc đổi bộ lọc chỉ gắn `initialBatch` (16) thẻ vào DOM (< 12ms trên máy cũ).
 * - Khi người dùng cuộn gần cuối (`rootMargin: "320px"`), tự động nối thêm `step` (16) thẻ mượt mà.
 * - Toàn bộ tìm kiếm và đếm số lượng vẫn chạy trên 100% tập dữ liệu trong bộ nhớ.
 */
export function useProgressiveCount(
  totalCount: number,
  initialBatch = 16,
  step = 16,
  resetKey = "",
) {
  const [windowState, setWindowState] = useState<{ key: string; count: number }>(() => ({
    key: resetKey,
    count: initialBatch,
  }));

  const rawCount = windowState.key === resetKey ? windowState.count : initialBatch;
  const visibleCount = Math.min(totalCount, rawCount);
  const hasMore = visibleCount < totalCount;
  const remainingCount = Math.max(0, totalCount - visibleCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const showMore = useCallback(() => {
    setWindowState((prev) => {
      const base = prev.key === resetKey ? prev.count : initialBatch;
      const next = Math.min(totalCount, base + step);
      if (prev.key === resetKey && prev.count === next) return prev;
      return { key: resetKey, count: next };
    });
  }, [initialBatch, resetKey, step, totalCount]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          showMore();
        }
      },
      { rootMargin: "320px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, showMore, visibleCount]);

  return {
    visibleCount,
    hasMore,
    remainingCount,
    sentinelRef,
    showMore,
  };
}

export function ProgressiveListFooter({
  hasMore,
  remainingCount,
  sentinelRef,
  onShowMore,
  unitLabel = "mục",
}: {
  hasMore: boolean;
  remainingCount: number;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onShowMore: () => void;
  unitLabel?: string;
}) {
  if (!hasMore) return null;
  return (
    <div
      ref={sentinelRef}
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "10px 0 4px",
      }}
    >
      <button
        type="button"
        onClick={onShowMore}
        style={{
          minHeight: 38,
          padding: "7px 16px",
          borderRadius: 6,
          border: "1px solid #d4d4d2",
          background: "#ffffff",
          color: "#14372f",
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          cursor: "pointer",
        }}
      >
        Xem thêm (còn {remainingCount} {unitLabel})
      </button>
    </div>
  );
}

export function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(url);
}

/* ──────────────────────────── Nút có trạng thái đang xử lý ──────────────────────────── */

export function Spinner() {
  return <AppleSpinner size={15} />;
}

/** Nút bấm tự khóa và hiện vòng xoay khi `busy`. */
export function BusyButton({
  busy = false,
  busyLabel,
  children,
  className = "pt-btn pt-btn-primary",
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyLabel?: ReactNode }) {
  return (
    <button {...rest} type={type} className={className} disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy && <Spinner />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

/** Lỗi nội tuyến dưới form (dùng class sẵn có của cổng hộ dân). */
export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p className="pt-form-error" role="alert">
      {message}
    </p>
  );
}

function formatShortVnDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Thẻ đối chiếu trực tiếp khi người dùng chọn khai báo lùi về ngày trước đó:
 * hiển thị đồng thời Ngày thực hiện muốn khai báo, Ngày khai báo thực tế (hôm nay) và Số ngày khai báo chậm.
 */
export function LateDeclarationNotice({
  selectedDate,
  todayDate,
  delayDays,
}: {
  selectedDate: string;
  todayDate: string;
  delayDays: number;
}) {
  if (delayDays <= 0) return null;

  return (
    <div className="pt-late-decl-box" role="status">
      <div className="pt-late-decl-grid">
        <div className="pt-late-decl-cell">
          <span>Ngày thực hiện muốn khai báo</span>
          <strong>{formatShortVnDate(selectedDate)}</strong>
        </div>
        <div className="pt-late-decl-cell">
          <span>Thời điểm khai báo thực tế</span>
          <strong>{formatShortVnDate(todayDate)} (hôm nay)</strong>
        </div>
        <div className="pt-late-decl-cell is-highlight">
          <span>Độ trễ khai báo</span>
          <strong>Chậm {delayDays} ngày</strong>
        </div>
      </div>
    </div>
  );
}

/**
 * Nút thao tác xóa / hủy mở hộp thoại xác nhận cân đối trước khi thực thi `onConfirm`.
 */
export function ConfirmButton({
  label,
  title = "Xác nhận xóa",
  question,
  confirmLabel = "Xóa",
  busy = false,
  onConfirm,
  className = "pt-btn pt-btn-danger",
  disabled,
}: {
  label: ReactNode;
  title?: string;
  question: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);

  const handleConfirm = async () => {
    try {
      await onConfirm();
      setAsking(false);
    } catch {
      // Giữ hộp thoại hoặc hiển thị lỗi từ component cha
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setAsking(true)} disabled={disabled || busy}>
        {label}
      </button>
      {asking && (
        <ConfirmDialog
          title={title}
          message={question}
          confirmLabel={confirmLabel}
          danger
          pending={busy}
          onConfirm={() => void handleConfirm()}
          onClose={() => {
            if (!busy) setAsking(false);
          }}
        />
      )}
    </>
  );
}

/* ──────────────────────────── Chọn 1 ảnh + tải lên (tương thích ngược) ──────────────────────────── */

/**
 * Quản lý một ảnh/video người dùng chọn: xem trước, kiểm tra định dạng, nén WebP + tải lên khi lưu.
 * Kết quả tải lên được nhớ theo tệp để bấm "Lưu" lại sau lỗi mạng không tải lại ảnh.
 */
export function usePhotoPicker(purpose: UploadPurpose) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploaded = useRef<{ file: File; id: number } | null>(null);
  const precompressedRef = useRef<boolean>(false);
  const allowVideo = purposeAllowsVideo(purpose);

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const pick = useCallback(
    (next: File | null | undefined) => {
      if (!next) return;
      const problem = validatePickedFile(next, { allowVideo });
      if (problem) {
        setError(problem);
        return;
      }
      if (isSupportedVideoFile(next)) {
        void inspectVideoFile(next).then((meta) => {
          if (meta.error) {
            setError(meta.error);
            return;
          }
          setError(null);
          precompressedRef.current = false;
          setFile(next);
          setPreview(meta.posterUrl ?? URL.createObjectURL(next));
        });
        return;
      }
      void compressImageLowRamSequential(next).then((compressedFile) => {
        setError(null);
        precompressedRef.current = true;
        setFile(compressedFile);
        setPreview(URL.createObjectURL(compressedFile));
      });
    },
    [allowVideo],
  );

  const clear = useCallback(() => {
    precompressedRef.current = false;
    setFile(null);
    setPreview(null);
    setError(null);
  }, []);

  /** Tải ảnh lên (nếu có), trả về id tệp; `undefined` khi không chọn ảnh. Ném lỗi nếu tải lên thất bại. */
  const ensureUploaded = useCallback(async (): Promise<number | undefined> => {
    if (!file) return undefined;
    if (uploaded.current?.file === file) return uploaded.current.id;
    const res = precompressedRef.current
      ? await api.upload(file, purpose, file.name)
      : await uploadOptimizedFile(file, purpose);
    uploaded.current = { file, id: res.id };
    return res.id;
  }, [file, purpose]);

  return { file, preview, error, pick, clear, ensureUploaded };
}

export type PhotoPicker = ReturnType<typeof usePhotoPicker>;

/** Ô chọn/chụp 1 ảnh hiện trường. */
export function PhotoField({
  id,
  label,
  picker,
  required = false,
  title = "Chụp ảnh hoặc chọn ảnh từ máy",
  description = "Ảnh tự động nén nhẹ để tải nhanh trên mạng di động",
  disabled = false,
}: {
  id: string;
  label: string;
  picker: PhotoPicker;
  required?: boolean;
  title?: string;
  description?: string;
  disabled?: boolean;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="pt-journal-photo-field">
      <div className="pt-journal-photo-header">
        <label className="pt-journal-photo-label" htmlFor={id}>
          {label}
        </label>
        <span className={required ? "pt-journal-photo-required" : "pt-photo-optional"}>
          {required ? "Bắt buộc *" : "Không bắt buộc"}
        </span>
      </div>

      {picker.preview ? (
        <div className="pt-photo-preview-wrap">
          {picker.file && isSupportedVideoFile(picker.file) && picker.preview.startsWith("blob:") ? (
            <video
              src={picker.preview}
              controls
              playsInline
              preload="metadata"
              className="pt-photo-preview-img"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước từ blob: hoặc poster data: URL
            <img src={picker.preview} alt="Xem trước tệp đã chọn" className="pt-photo-preview-img" decoding="async" />
          )}
          <div className="pt-photo-preview-bar">
            <span>{picker.file?.name || "Tệp đã chọn"}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {picker.file ? formatBytesCompact(picker.file.size) : "Đã đính kèm"}
            </span>
          </div>
          <button
            type="button"
            className="pt-photo-remove-btn"
            onClick={() => setConfirmClear(true)}
            disabled={disabled}
            title="Xóa tệp đã chọn"
            aria-label="Xóa tệp đã chọn"
          >
            Xóa tệp
          </button>
        </div>
      ) : (
        <label className="pt-photo-dropzone" htmlFor={id}>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            disabled={disabled}
            onChange={(event) => {
              picker.pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <span className="pt-photo-dropzone-title">{title}</span>
          <span className="pt-photo-dropzone-desc">{description}</span>
        </label>
      )}
      <InlineError message={picker.error} />
      {confirmClear && (
        <ConfirmDialog
          title="Xóa tệp đã chọn"
          message={
            <>
              Xác nhận xóa tệp <strong>{picker.file?.name || "đang chọn"}</strong> khỏi biểu mẫu này?
            </>
          }
          confirmLabel="Xóa tệp"
          danger
          onConfirm={() => {
            picker.clear();
            setConfirmClear(false);
          }}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────── Chọn NHIỀU ảnh hiện trường + video ngắn tối ưu ──────────────────────────── */

export interface MultiMediaItem {
  key: string;
  name: string;
  isVideo: boolean;
  sizeBytes?: number;
  durationSec?: number | null;
  posterDataUrl?: string | null;
  previewUrl: string | null;
  revokeOnCleanup: boolean;
  file?: File;
  blob?: Blob;
  precompressed?: boolean;
  sha256?: string;
  bgStatus?: "local" | "uploading" | "uploaded";
  uploadedId?: number;
  uploadedUrl?: string;
}

export interface UseMultiPhotoPickerOptions {
  maxFiles?: number;
  allowVideo?: boolean;
  initialItems?: Array<{ id: number; url: string }>;
  initialDraftSlots?: OfflineMediaSlot[];
  /** Tự động tải nền êm ái từng ảnh đã nén ngay khi người dùng còn đang điền biểu mẫu (mặc định bật). */
  enableBackgroundUpload?: boolean;
}

function buildInitialPickerItems(options: UseMultiPhotoPickerOptions): MultiMediaItem[] {
  if (options.initialDraftSlots && options.initialDraftSlots.length > 0) {
    return options.initialDraftSlots.map((slot, idx) => {
      let previewUrl: string | null = null;
      let revokeOnCleanup = false;
      if (slot.isVideo) {
        previewUrl = slot.posterDataUrl ?? null;
      } else if (slot.blob && typeof URL !== "undefined") {
        previewUrl = URL.createObjectURL(slot.blob);
        revokeOnCleanup = true;
      } else if (slot.uploadedUrl && isSafeMediaUrl(slot.uploadedUrl)) {
        previewUrl = slot.uploadedUrl;
      }
      const fileObj =
        slot.blob && typeof File !== "undefined"
          ? new File([slot.blob], slot.fileName || `anh-${idx + 1}.webp`, {
            type: slot.mimeType || (slot.isVideo ? "video/mp4" : "image/webp"),
          })
          : undefined;
      return {
        key: `draft-slot-${idx}-${slot.sha256 ?? slot.fileName}-${Math.random().toString(36).slice(2, 6)}`,
        name: slot.fileName || (slot.isVideo ? `Video hiện trường #${idx + 1}` : `Ảnh hiện trường #${idx + 1}`),
        isVideo: slot.isVideo,
        sizeBytes: slot.sizeBytes || slot.blob?.size,
        durationSec: slot.durationSec ?? null,
        posterDataUrl: slot.posterDataUrl ?? null,
        previewUrl,
        revokeOnCleanup,
        file: fileObj,
        blob: slot.blob,
        precompressed: !slot.isVideo,
        sha256: slot.sha256,
        bgStatus: slot.uploadedId ? "uploaded" : "local",
        uploadedId: slot.uploadedId,
        uploadedUrl: slot.uploadedUrl,
      };
    });
  }

  return (options.initialItems ?? [])
    .filter((it) => Number.isInteger(it.id) && it.id > 0 && isSafeMediaUrl(it.url))
    .map((it, idx) => ({
      key: `existing-${it.id}-${idx}`,
      name: isVideoMediaUrl(it.url) ? `Video hiện trường #${idx + 1}` : `Ảnh hiện trường #${idx + 1}`,
      isVideo: isVideoMediaUrl(it.url),
      previewUrl: isVideoMediaUrl(it.url) ? null : it.url,
      revokeOnCleanup: false,
      bgStatus: "uploaded" as const,
      uploadedId: it.id,
      uploadedUrl: it.url,
    }));
}

/**
 * Quản lý nhiều ảnh hiện trường (và tùy chọn video ngắn):
 * - Tách riêng nút "Chụp ảnh" (mở thẳng camera sau, bấm nhiều lần để chụp nhiều góc cây/trái)
 *   và nút "Chọn nhiều ảnh" (chọn hàng loạt từ thư viện điện thoại).
 * - Ảnh được nén tuần tự từng tấm ngay khi chọn (không bao giờ giải mã hàng loạt ảnh 12MP–48MP song song),
 *   giải phóng canvas 1x1 -> 0x0 và đóng ImageBitmap tức thì để điện thoại 2GB RAM không bao giờ văng ứng dụng.
 * - Tự động tải trước từng ảnh lên máy chủ ở nền ngay trong lúc người dùng đang nhập thông tin; nếu ở ngoài rẫy
 *   mất sóng thì giữ nguyên tệp WebP đã nén trong máy mà không bao giờ báo lỗi làm gián đoạn.
 */
export function useMultiPhotoPicker(purpose: UploadPurpose, options: UseMultiPhotoPickerOptions = {}) {
  const maxFiles = options.maxFiles ?? 8;
  const allowVideo = options.allowVideo ?? purposeAllowsVideo(purpose);
  const enableBackgroundUpload = options.enableBackgroundUpload ?? true;

  const [items, setItems] = useState<MultiMediaItem[]>(() => buildInitialPickerItems(options));
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState<{ done: number; total: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const itemsRef = useRef<MultiMediaItem[]>(items);
  const bgRunningRef = useRef(false);
  const bgFailedKeysRef = useRef<Set<string>>(new Set());
  const bgAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const pumpBackgroundUpload = useCallback(async () => {
    if (!enableBackgroundUpload || bgRunningRef.current || isDeviceOfflineNow()) return;
    bgRunningRef.current = true;
    try {
      while (!isDeviceOfflineNow()) {
        const candidate = itemsRef.current.find(
          (it) =>
            !it.uploadedId &&
            !it.isVideo &&
            Boolean(it.file) &&
            !bgFailedKeysRef.current.has(it.key),
        );
        if (!candidate?.file) break;

        const targetKey = candidate.key;
        setItems((prev) =>
          prev.map((it) => (it.key === targetKey && !it.uploadedId ? { ...it, bgStatus: "uploading" } : it)),
        );

        const controller = new AbortController();
        bgAbortRef.current = controller;
        const timer = window.setTimeout(() => controller.abort(), 14_000);
        try {
          const sha = candidate.sha256 ?? (await computeBlobSha256Hex(candidate.file));
          const res = await api.upload(candidate.file, purpose, candidate.file.name, {
            sha256: sha,
            signal: controller.signal,
          });
          if (!itemsRef.current.some((it) => it.key === targetKey)) continue;
          const nextList = itemsRef.current.map((it) =>
            it.key === targetKey
              ? {
                ...it,
                sha256: sha ?? it.sha256,
                uploadedId: res.id,
                uploadedUrl: res.url,
                bgStatus: "uploaded" as const,
              }
              : it,
          );
          itemsRef.current = nextList;
          setItems(nextList);
        } catch {
          // Mạng ngoài rẫy yếu hoặc đứt quãng: lặng lẽ trả về trạng thái lưu trong máy, chờ bấm Lưu hoặc có sóng lại.
          bgFailedKeysRef.current.add(targetKey);
          if (itemsRef.current.some((it) => it.key === targetKey)) {
            const resetList = itemsRef.current.map((it) =>
              it.key === targetKey && !it.uploadedId ? { ...it, bgStatus: "local" as const } : it,
            );
            itemsRef.current = resetList;
            setItems(resetList);
          }
          break;
        } finally {
          window.clearTimeout(timer);
          if (bgAbortRef.current === controller) bgAbortRef.current = null;
        }
      }
    } finally {
      bgRunningRef.current = false;
    }
  }, [enableBackgroundUpload, purpose]);

  useEffect(() => {
    const abortBg = () => {
      bgAbortRef.current?.abort();
      bgAbortRef.current = null;
    };
    const onOnline = () => {
      bgFailedKeysRef.current.clear();
      void pumpBackgroundUpload();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener(AUTH_LOGOUT_EVENT, abortBg);
    window.addEventListener(AUTH_EXPIRED_EVENT, abortBg);
    window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, abortBg);
    void pumpBackgroundUpload();
    return () => {
      abortBg();
      window.removeEventListener("online", onOnline);
      window.removeEventListener(AUTH_LOGOUT_EVENT, abortBg);
      window.removeEventListener(AUTH_EXPIRED_EVENT, abortBg);
      window.removeEventListener(AUTH_SCOPE_CHANGED_EVENT, abortBg);
      for (const item of itemsRef.current) {
        if (item.revokeOnCleanup && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, [pumpBackgroundUpload]);

  const addFiles = useCallback(
    async (fileList: FileList | File[] | null | undefined) => {
      if (!fileList) return;
      const incoming = Array.from(fileList);
      if (incoming.length === 0) return;

      const currentCount = itemsRef.current.length;
      if (currentCount >= maxFiles) {
        setError(`Đã đạt giới hạn tối đa ${maxFiles} tệp cho mục này.`);
        return;
      }

      const remainingSlots = maxFiles - currentCount;
      const batch = incoming.slice(0, remainingSlots);
      let lastProblem: string | null = null;

      if (incoming.length > remainingSlots) {
        lastProblem = `Chỉ thêm được tối đa ${maxFiles} tệp (đã lấy ${remainingSlots} tệp đầu tiên).`;
      }

      const totalBatch = batch.length;
      if (totalBatch > 1) {
        setCompressing({ done: 0, total: totalBatch });
      }

      try {
        // Nén tuần tự từng tệp một (tuyệt đối không Promise.all) để giữ đỉnh bộ nhớ RAM thấp nhất trên điện thoại cũ
        let processed = 0;
        for (const rawFile of batch) {
          const problem = validatePickedFile(rawFile, { allowVideo });
          if (problem) {
            lastProblem = `${rawFile.name}: ${problem}`;
            processed += 1;
            if (totalBatch > 1) setCompressing({ done: processed, total: totalBatch });
            continue;
          }

          if (isSupportedVideoFile(rawFile)) {
            const meta = await inspectVideoFile(rawFile);
            if (meta.error) {
              lastProblem = `${rawFile.name}: ${meta.error}`;
              processed += 1;
              if (totalBatch > 1) setCompressing({ done: processed, total: totalBatch });
              continue;
            }
            const sha256 = rawFile.size <= 20 * 1024 * 1024 ? await computeBlobSha256Hex(rawFile) : undefined;
            const nextItem: MultiMediaItem = {
              key: `vid-${rawFile.name}-${rawFile.size}-${rawFile.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
              name: rawFile.name,
              isVideo: true,
              sizeBytes: rawFile.size,
              durationSec: meta.durationSec,
              posterDataUrl: meta.posterUrl,
              previewUrl: meta.posterUrl,
              revokeOnCleanup: false,
              file: rawFile,
              blob: rawFile,
              sha256,
              bgStatus: "local",
            };
            if (itemsRef.current.length < maxFiles) {
              const nextList = [...itemsRef.current, nextItem].slice(0, maxFiles);
              itemsRef.current = nextList;
              setItems(nextList);
            }
          } else {
            const compressedFile = await compressImageLowRamSequential(rawFile);
            const sha256 = await computeBlobSha256Hex(compressedFile);
            const blobUrl = URL.createObjectURL(compressedFile);
            const nextItem: MultiMediaItem = {
              key: `img-${rawFile.name}-${rawFile.size}-${rawFile.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
              name: rawFile.name,
              isVideo: false,
              sizeBytes: compressedFile.size,
              previewUrl: blobUrl,
              revokeOnCleanup: true,
              file: compressedFile,
              blob: compressedFile,
              precompressed: true,
              sha256,
              bgStatus: "local",
            };
            if (itemsRef.current.length < maxFiles) {
              const nextList = [...itemsRef.current, nextItem].slice(0, maxFiles);
              itemsRef.current = nextList;
              setItems(nextList);
              void pumpBackgroundUpload();
            } else {
              URL.revokeObjectURL(blobUrl);
            }
          }

          processed += 1;
          if (totalBatch > 1) setCompressing({ done: processed, total: totalBatch });
        }
      } finally {
        setCompressing(null);
      }

      setError(lastProblem);
    },
    [allowVideo, maxFiles, pumpBackgroundUpload],
  );

  const removeKey = useCallback((key: string) => {
    const target = itemsRef.current.find((it) => it.key === key);
    if (target?.revokeOnCleanup && target.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    const nextList = itemsRef.current.filter((it) => it.key !== key);
    itemsRef.current = nextList;
    setItems(nextList);
    setError(null);
  }, []);

  const clearAll = useCallback(() => {
    for (const it of itemsRef.current) {
      if (it.revokeOnCleanup && it.previewUrl) {
        URL.revokeObjectURL(it.previewUrl);
      }
    }
    itemsRef.current = [];
    setItems([]);
    setError(null);
    setCompressing(null);
    setProgress(null);
  }, []);

  /**
   * Tải lên tuần tự trên máy yếu / mạng chậm (hoặc tối đa 2 luồng mạng khi ảnh đã nén sẵn trên máy mạnh),
   * không bao giờ giải mã đồng thời nhiều ảnh trên bộ nhớ.
   */
  const ensureUploadedAll = useCallback(async (): Promise<number[]> => {
    const snapshot = itemsRef.current;
    if (snapshot.length === 0) return [];

    const pendingIndices: number[] = [];
    snapshot.forEach((it, idx) => {
      if (!it.uploadedId && it.file) {
        pendingIndices.push(idx);
      }
    });

    if (pendingIndices.length === 0) {
      return snapshot.map((it) => it.uploadedId!).filter((id) => Number.isInteger(id) && id > 0);
    }

    const total = pendingIndices.length;
    let done = 0;
    let cursor = 0;
    setProgress({ done: 0, total });

    const uploadedByKey = new Map<string, { id: number; url: string }>();
    const allPrecompressed = pendingIndices.every((i) => snapshot[i]?.precompressed || snapshot[i]?.isVideo);
    const maxConcurrency = isLowEndDevice() || !allPrecompressed ? 1 : Math.min(2, pendingIndices.length);

    async function worker() {
      while (true) {
        const step = cursor;
        cursor += 1;
        if (step >= pendingIndices.length) return;
        const item = snapshot[pendingIndices[step]];
        if (!item?.file) continue;
        let res: { id: number; url: string };
        if (item.precompressed || item.isVideo) {
          const sha = item.sha256 ?? (await computeBlobSha256Hex(item.file));
          res = await api.upload(item.file, purpose, item.file.name, { sha256: sha });
        } else {
          const compressed = isSupportedImageFile(item.file)
            ? await compressImageLowRamSequential(item.file)
            : item.file;
          const sha = await computeBlobSha256Hex(compressed);
          res = await api.upload(compressed, purpose, compressed.name, { sha256: sha });
        }
        uploadedByKey.set(item.key, { id: res.id, url: res.url });
        done += 1;
        setProgress({ done, total });
      }
    }

    try {
      const workers = Array.from({ length: maxConcurrency }, () => worker());
      await Promise.all(workers);

      const merged = snapshot.map((it) => {
        const fresh = uploadedByKey.get(it.key);
        return fresh ? { ...it, uploadedId: fresh.id, uploadedUrl: fresh.url } : it;
      });
      itemsRef.current = merged;
      setItems(merged);
      setProgress(null);

      return merged.map((it) => it.uploadedId!).filter((id) => Number.isInteger(id) && id > 0);
    } catch (err) {
      // Giữ lại các tệp đã tải thành công để bấm gửi lại không phải tải lại từ đầu
      if (uploadedByKey.size > 0) {
        const partial = snapshot.map((it) => {
          const fresh = uploadedByKey.get(it.key);
          return fresh ? { ...it, uploadedId: fresh.id, uploadedUrl: fresh.url } : it;
        });
        itemsRef.current = partial;
        setItems(partial);
      }
      setProgress(null);
      throw err;
    }
  }, [purpose]);

  return {
    items,
    count: items.length,
    hasFiles: items.length > 0,
    maxFiles,
    allowVideo,
    error,
    compressing,
    progress,
    setUploadProgress: setProgress,
    addFiles,
    removeKey,
    clearAll,
    ensureUploadedAll,
  };
}

export type MultiPhotoPicker = ReturnType<typeof useMultiPhotoPicker>;

/**
 * Khung chọn nhiều ảnh hiện trường (và video ngắn tùy chọn) dùng chung cho Cổng hộ dân và Quản trị.
 */
export function MultiPhotoField({
  id,
  label,
  picker,
  required = false,
  description,
  cameraLabel = "Chụp ảnh",
  galleryLabel = "Chọn nhiều ảnh",
  videoLabel = "Thêm video",
  disabled = false,
}: {
  id: string;
  label: string;
  picker: MultiPhotoPicker;
  required?: boolean;
  description?: string;
  cameraLabel?: string;
  galleryLabel?: string;
  videoLabel?: string;
  disabled?: boolean;
}) {
  const [removingItem, setRemovingItem] = useState<MultiMediaItem | null>(null);
  const canAddMore = picker.count < picker.maxFiles;

  return (
    <div className="pt-multi-media-field">
      <div className="pt-journal-photo-header">
        <label className="pt-journal-photo-label" htmlFor={`${id}-gallery`}>
          {label}
        </label>
        <span
          className={required && picker.count === 0 ? "pt-journal-photo-required" : "pt-photo-optional"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {picker.count > 0
            ? `${picker.count}/${picker.maxFiles} tệp`
            : required
              ? "Bắt buộc *"
              : "Không bắt buộc"}
        </span>
      </div>

      {description && <p className="pt-multi-media-desc">{description}</p>}

      {picker.items.length > 0 && (
        <div className="pt-multi-media-grid">
          {picker.items.map((item, idx) => (
            <div key={item.key} className="pt-multi-media-card">
              <div className="pt-multi-media-thumb-box">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước cục bộ hoặc URL máy chủ
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="pt-multi-media-thumb"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="pt-multi-media-video-placeholder">
                    <strong>{item.isVideo ? "Video hiện trường" : "Ảnh đính kèm"}</strong>
                    {item.durationSec ? (
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(item.durationSec)} giây</span>
                    ) : null}
                  </div>
                )}
                <span className="pt-multi-media-index" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {item.isVideo
                    ? item.durationSec
                      ? `Video ${Math.round(item.durationSec)}s`
                      : "Video"
                    : `Ảnh ${String(idx + 1).padStart(2, "0")}`}
                </span>
              </div>

              <div className="pt-multi-media-foot">
                <span className="pt-multi-media-meta" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {item.uploadedId
                    ? "Đã tải sẵn"
                    : item.bgStatus === "uploading"
                      ? "Đang tải nền..."
                      : item.sizeBytes
                        ? item.isVideo
                          ? `${formatBytesCompact(item.sizeBytes)}, lưu máy`
                          : `${formatBytesCompact(item.sizeBytes)}, lưu máy`
                        : "Lưu trong máy"}
                </span>
                <button
                  type="button"
                  className="pt-multi-media-remove"
                  onClick={() => setRemovingItem(item)}
                  disabled={disabled}
                  aria-label={`Xóa ${item.name}`}
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <div className="pt-multi-media-actions">
          <label className={`pt-multi-media-btn is-primary ${disabled ? "is-disabled" : ""}`.trim()} htmlFor={`${id}-camera`}>
            <input
              id={`${id}-camera`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={disabled}
              onChange={(event) => {
                void picker.addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <span>{picker.count > 0 ? "Chụp thêm ảnh" : cameraLabel}</span>
          </label>

          <label className={`pt-multi-media-btn is-tinted ${disabled ? "is-disabled" : ""}`.trim()} htmlFor={`${id}-gallery`}>
            <input
              id={`${id}-gallery`}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled}
              onChange={(event) => {
                void picker.addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <span>{galleryLabel}</span>
          </label>

          {picker.allowVideo && (
            <label className={`pt-multi-media-btn is-gray ${disabled ? "is-disabled" : ""}`.trim()} htmlFor={`${id}-video`}>
              <input
                id={`${id}-video`}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={disabled}
                onChange={(event) => {
                  void picker.addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <span>{videoLabel}</span>
            </label>
          )}
        </div>
      )}

      {picker.compressing && !picker.progress && (
        <div className="pt-multi-media-progress" role="status" style={{ fontVariantNumeric: "tabular-nums" }}>
          Đang nén tuần tự ảnh {picker.compressing.done}/{picker.compressing.total} để tiết kiệm bộ nhớ...
        </div>
      )}

      {picker.progress && (
        <div className="pt-multi-media-progress" role="status" style={{ fontVariantNumeric: "tabular-nums" }}>
          Đang nén tối ưu và tải lên {picker.progress.done}/{picker.progress.total} tệp...
        </div>
      )}

      <InlineError message={picker.error} />

      {removingItem && (
        <ConfirmDialog
          title="Xóa tệp minh chứng"
          message={
            <>
              Xác nhận xóa <strong>{removingItem.name}</strong> khỏi danh sách minh chứng hiện trường?
            </>
          }
          confirmLabel="Xóa tệp"
          danger
          onConfirm={() => {
            picker.removeKey(removingItem.key);
            setRemovingItem(null);
          }}
          onClose={() => setRemovingItem(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────── Nhiều tệp đính kèm (ảnh/PDF cho hồ sơ gửi HTX) ──────────────────────────── */

export interface PickedAttachment {
  key: string;
  file: File;
}

/** Chọn nhiều tệp ảnh hoặc PDF cho hồ sơ gửi HTX. */
export function AttachmentsField({
  id,
  label,
  files,
  onChange,
  max = 10,
  disabled = false,
}: {
  id: string;
  label: string;
  files: PickedAttachment[];
  onChange: (files: PickedAttachment[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removingItem, setRemovingItem] = useState<PickedAttachment | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= max) {
        setError(`Tối đa ${max} tệp đính kèm.`);
        break;
      }
      const problem = validatePickedFile(file, { allowPdf: true, allowVideo: true });
      if (problem) {
        setError(`${file.name}: ${problem}`);
        continue;
      }
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`, file });
    }
    if (next.length !== files.length) setError((prev) => (next.length >= max ? prev : null));
    onChange(next);
  };

  return (
    <div className="pt-attach-field">
      <div className="pt-journal-photo-header">
        <label className="pt-journal-photo-label" htmlFor={id}>
          {label}
        </label>
        <span className="pt-photo-optional" style={{ fontVariantNumeric: "tabular-nums" }}>
          {files.length}/{max} tệp
        </span>
      </div>
      {files.length > 0 && (
        <ul className="pt-attach-list">
          {files.map((item) => (
            <li key={item.key} className="pt-attach-item">
              <span className="pt-attach-name">{item.file.name}</span>
              <span className="pt-attach-size" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatBytesCompact(item.file.size)}
              </span>
              <button
                type="button"
                className="pt-attach-remove"
                onClick={() => setRemovingItem(item)}
                disabled={disabled}
                aria-label={`Xóa tệp ${item.file.name}`}
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <label className="pt-attach-add" htmlFor={id}>
          <input
            id={id}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,.pdf"
            disabled={disabled}
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
          <span>Thêm ảnh giấy tờ, video ngắn hoặc tệp PDF</span>
        </label>
      )}
      <InlineError message={error} />
      {removingItem && (
        <ConfirmDialog
          title="Xóa tệp đính kèm"
          message={
            <>
              Xác nhận xóa tệp <strong>{removingItem.file.name}</strong> khỏi danh sách đính kèm?
            </>
          }
          confirmLabel="Xóa tệp"
          danger
          onConfirm={() => {
            onChange(files.filter((f) => f.key !== removingItem.key));
            setRemovingItem(null);
          }}
          onClose={() => setRemovingItem(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────── Hiển thị ảnh & video tối ưu (Zero-Bandwidth Video + Lightbox) ──────────────────────────── */

const MAX_VIDEO_THUMB_CACHE = 40;
const VIDEO_THUMB_TIMEOUT_MS = 5500;
const videoThumbnailCache = new Map<string, string>();
const inflightVideoThumbnails = new Map<string, Promise<string | null>>();
let videoThumbAuthCleanupInstalled = false;

function ensureVideoThumbAuthCleanup(): void {
  if (videoThumbAuthCleanupInstalled || typeof window === "undefined") return;
  videoThumbAuthCleanupInstalled = true;
  const clearCache = () => {
    videoThumbnailCache.clear();
    inflightVideoThumbnails.clear();
  };
  window.addEventListener(AUTH_LOGOUT_EVENT, clearCache);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearCache);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, clearCache);
}

function rememberVideoThumbnail(url: string, dataUrl: string): void {
  if (videoThumbnailCache.has(url)) {
    videoThumbnailCache.delete(url);
  } else if (videoThumbnailCache.size >= MAX_VIDEO_THUMB_CACHE) {
    const oldestKey = videoThumbnailCache.keys().next().value;
    if (oldestKey) videoThumbnailCache.delete(oldestKey);
  }
  videoThumbnailCache.set(url, dataUrl);
}

function captureVideoFrameThumbnail(url: string): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  ensureVideoThumbAuthCleanup();

  const cached = videoThumbnailCache.get(url);
  if (cached) return Promise.resolve(cached);
  if (isDeviceOfflineNow()) return Promise.resolve(null);

  const existing = inflightVideoThumbnails.get(url);
  if (existing) return existing;

  const job = new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    let seekFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (seekFallbackTimer) {
        clearTimeout(seekFallbackTimer);
        seekFallbackTimer = null;
      }
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore
      }
    };

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      if (result) {
        rememberVideoThumbnail(url, result);
      }
      resolve(result);
    };

    const captureCurrentFrame = () => {
      if (settled) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) {
        finish(null);
        return;
      }
      try {
        const scale = Math.min(1, 640 / vw);
        const targetW = Math.max(1, Math.round(vw * scale));
        const targetH = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.74);
        finish(dataUrl.startsWith("data:image/jpeg") && dataUrl.length > 256 ? dataUrl : null);
      } catch {
        finish(null);
      }
    };

    const timeoutId = setTimeout(() => finish(null), VIDEO_THUMB_TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    video.onloadedmetadata = () => {
      if (settled) return;
      video.preload = "auto";
      const targetTime = Number.isFinite(video.duration) && video.duration > 0.25 ? 0.15 : 0.01;
      try {
        video.currentTime = targetTime;
      } catch {
        // Đợi onloadeddata nếu trình duyệt chưa cho seek ngay
      }
    };

    video.onloadeddata = () => {
      if (settled) return;
      if (video.currentTime > 0 && video.readyState >= 2) {
        captureCurrentFrame();
        return;
      }
      if (!seekFallbackTimer) {
        seekFallbackTimer = setTimeout(() => {
          if (!settled && video.readyState >= 2) {
            captureCurrentFrame();
          }
        }, 700);
      }
    };

    video.onseeked = () => {
      if (video.readyState >= 2) {
        captureCurrentFrame();
      }
    };

    video.onerror = () => finish(null);

    try {
      video.src = url;
      video.load();
    } catch {
      finish(null);
    }
  }).finally(() => {
    inflightVideoThumbnails.delete(url);
  });

  inflightVideoThumbnails.set(url, job);
  return job;
}

function LazyVideoCard({ url, caption }: { url: string; caption?: string }) {
  const [playing, setPlaying] = useState(false);
  const [thumbState, setThumbState] = useState<{ url: string; dataUrl: string | null }>(() => ({
    url,
    dataUrl: videoThumbnailCache.get(url) ?? null,
  }));
  const thumbUrl = thumbState.url === url ? thumbState.dataUrl : (videoThumbnailCache.get(url) ?? null);

  useEffect(() => {
    if (playing || thumbUrl) return;
    let cancelled = false;

    const attemptCapture = () => {
      void captureVideoFrameThumbnail(url).then((captured) => {
        if (!cancelled && captured) {
          setThumbState({ url, dataUrl: captured });
        }
      });
    };

    attemptCapture();
    window.addEventListener("online", attemptCapture);
    return () => {
      cancelled = true;
      window.removeEventListener("online", attemptCapture);
    };
  }, [url, playing, thumbUrl]);

  if (!playing) {
    return (
      <div className="pt-lazy-video-card">
        {thumbUrl ? (
          <button
            type="button"
            className="pt-lazy-video-thumb-wrap"
            onClick={() => setPlaying(true)}
            aria-label={caption ? `Phát ${caption}` : "Phát video minh chứng hiện trường"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh chụp khung hình tạm thời dạng Data URL */}
            <img
              src={thumbUrl}
              alt={caption || "Video minh chứng hiện trường"}
              className="pt-lazy-video-thumb"
              draggable={false}
              decoding="async"
            />
            {caption && <span className="pt-lazy-video-thumb-caption">{caption}</span>}
          </button>
        ) : (
          <button
            type="button"
            className="pt-lazy-video-copy"
            onClick={() => setPlaying(true)}
            aria-label={caption ? `Phát ${caption}` : "Phát video minh chứng hiện trường"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- biểu tượng video tĩnh nội bộ */}
            <img
              src="/video.png"
              alt=""
              width={34}
              height={34}
              className="pt-lazy-video-fallback-icon"
              draggable={false}
              aria-hidden="true"
            />
            <strong>Video minh chứng hiện trường</strong>
            {caption && <span className="pt-lazy-video-caption">{caption}</span>}
          </button>
        )}
        <div className="pt-lazy-video-actions">
          <button type="button" className="pt-lazy-video-play-btn" onClick={() => setPlaying(true)}>
            Phát video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-detail-photo-frame">
      <video
        src={url}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="pt-detail-photo-img"
      />
      {caption && (
        <div className="pt-detail-photo-overlay">
          <span>{caption}</span>
        </div>
      )}
    </div>
  );
}

function MissingStoredImageCard({ caption }: { caption?: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 6,
        border: "1px solid #d4d4d2",
        background: "#f7f7f5",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <strong style={{ fontSize: 13.5, fontWeight: 600, color: "#14372f" }}>
        Không tải được tệp ảnh gốc trên máy chủ
      </strong>
      <span style={{ fontSize: 12.5, color: "#5f6d66", lineHeight: 1.5 }}>
        Ảnh của bản ghi cũ được tải lên trước khi bật lưu trữ bền vững trong CSDL nên không còn trên ổ đĩa tạm của máy chủ. Các ảnh tải lên mới sẽ được lưu giữ cố định.
      </span>
      {caption && <span style={{ fontSize: 12, color: "#8a968f" }}>{caption}</span>}
    </div>
  );
}

function VideoThumbTile({ url, label }: { url: string; label: string }) {
  const [thumbState, setThumbState] = useState<{ url: string; dataUrl: string | null }>(() => ({
    url,
    dataUrl: videoThumbnailCache.get(url) ?? null,
  }));
  const thumbUrl = thumbState.url === url ? thumbState.dataUrl : (videoThumbnailCache.get(url) ?? null);

  useEffect(() => {
    if (thumbUrl) return;
    let cancelled = false;
    void captureVideoFrameThumbnail(url).then((captured) => {
      if (!cancelled && captured) {
        setThumbState({ url, dataUrl: captured });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, thumbUrl]);

  if (thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ảnh chụp khung hình tạm thời dạng Data URL
      <img src={thumbUrl} alt={label} className="pt-stored-gallery-img" decoding="async" />
    );
  }
  return (
    <span className="pt-stored-video-thumb-fallback" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- biểu tượng video tĩnh nội bộ */}
      <img src="/video.png" alt="" width={22} height={22} />
    </span>
  );
}

/** Ảnh hoặc video hiện trường đơn lẻ đã lưu trên server (`/api/uploads/:id`). */
export function StoredPhoto({ url, alt, caption }: { url: string; alt: string; caption?: string }) {
  if (!isSafeMediaUrl(url)) return null;
  if (isVideoMediaUrl(url)) {
    return <LazyVideoCard url={url} caption={caption} />;
  }
  return <StoredMediaGallery urls={[url]} altPrefix={alt} caption={caption} />;
}

/**
 * Bộ sưu tập nhiều ảnh và video hiện trường đã lưu:
 * - Tự động gom chung cả ảnh và video theo đúng thứ tự đính kèm.
 * - Hỗ trợ vuốt ngang trực tiếp trên khung ảnh/video (cả ở màn hình chi tiết nhật ký lẫn hộp thoại xem phóng to)
 *   để chuyển mượt sang ảnh mới hoặc video kế bên.
 */
export function StoredMediaGallery({
  urls,
  fallbackUrl,
  altPrefix,
  caption,
  compact = false,
  eager = false,
}: {
  urls?: string[] | null;
  fallbackUrl?: string | null;
  altPrefix: string;
  caption?: string;
  compact?: boolean;
  eager?: boolean;
}) {
  const safeUrls = useMemo(() => {
    const raw = urls && urls.length > 0 ? urls : fallbackUrl ? [fallbackUrl] : [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const u of raw) {
      if (!isSafeMediaUrl(u)) continue;
      // Chuẩn hóa khóa khử trùng lặp giữa '/api/uploads/12' và '/api/uploads/12/video.mp4'
      const canonical = u.replace(/\/video\.(mp4|webm)$/i, "");
      if (seen.has(canonical)) {
        // Ưu tiên bản có hậu tố video rõ ràng nếu trùng ID
        if (isVideoMediaUrl(u)) {
          const idx = unique.findIndex((item) => item.replace(/\/video\.(mp4|webm)$/i, "") === canonical);
          if (idx >= 0) unique[idx] = u;
        }
        continue;
      }
      seen.add(canonical);
      unique.push(u);
    }
    return unique;
  }, [urls, fallbackUrl]);

  const galleryStorageKey = `media-viewer:${safeUrls[0] ?? altPrefix}`;
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [activeSlide, setActiveSlide] = useState(0);
  const [rawViewerIndex, setViewerIndex] = usePersistedState<number | null>(
    galleryStorageKey,
    null,
    (v): v is number | null => v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0),
  );
  const viewerIndex =
    rawViewerIndex !== null && rawViewerIndex >= 0 && rawViewerIndex < safeUrls.length ? rawViewerIndex : null;
  const carouselTrackRef = useRef<HTMLDivElement | null>(null);
  const thumbStripRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number>(0);
  const programmaticTargetRef = useRef<number | null>(null);
  const programmaticTimerRef = useRef<number>(0);
  const didCarouselDragRef = useRef(false);
  const carouselDragRef = useRef<{
    active: boolean;
    startX: number;
    startScrollLeft: number;
    dx: number;
    moved: boolean;
  }>({ active: false, startX: 0, startScrollLeft: 0, dx: 0, moved: false });

  const allImageCount = useMemo(
    () => safeUrls.filter((u) => !isVideoMediaUrl(u)).length,
    [safeUrls],
  );
  const mediaItems = useMemo(
    () =>
      safeUrls
        .filter((u) => isVideoMediaUrl(u) || !brokenImages[u])
        .map((u) => ({ url: u, isVideo: isVideoMediaUrl(u) })),
    [safeUrls, brokenImages],
  );
  const brokenCount = allImageCount - mediaItems.filter((m) => !m.isVideo).length;

  const safeSlide = mediaItems.length > 0 ? Math.min(activeSlide, mediaItems.length - 1) : 0;
  const safeViewerIndex =
    viewerIndex !== null && mediaItems.length > 0
      ? Math.max(0, Math.min(viewerIndex, mediaItems.length - 1))
      : null;

  const centerActiveThumb = useCallback((idx: number, instant = false) => {
    const strip = thumbStripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const thumb = strip.children[idx] as HTMLElement | undefined;
    if (!thumb) return;
    const targetLeft = Math.max(
      0,
      Math.min(
        strip.scrollWidth - strip.clientWidth,
        thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2,
      ),
    );
    strip.scrollTo({ left: targetLeft, behavior: instant ? "auto" : "smooth" });
  }, []);

  const resolveNearestSlideIndex = useCallback((track: HTMLDivElement): number => {
    const count = track.children.length;
    if (count === 0) return 0;
    const scrollLeft = track.scrollLeft;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      const child = track.children[i] as HTMLElement;
      const dist = Math.abs(child.offsetLeft - scrollLeft);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, []);

  const scrollToSlide = useCallback(
    (idx: number, instant = false) => {
      if (mediaItems.length === 0) return;
      const clamped = Math.max(0, Math.min(idx, mediaItems.length - 1));
      setActiveSlide(clamped);
      centerActiveThumb(clamped, instant);

      const track = carouselTrackRef.current;
      if (!track) return;
      const slideEl = track.children[clamped] as HTMLElement | undefined;
      const targetLeft = slideEl ? slideEl.offsetLeft : clamped * track.clientWidth;

      if (programmaticTimerRef.current) {
        window.clearTimeout(programmaticTimerRef.current);
        programmaticTimerRef.current = 0;
      }

      if (instant || Math.abs(track.scrollLeft - targetLeft) < 2) {
        programmaticTargetRef.current = null;
        track.scrollTo({ left: targetLeft, behavior: "auto" });
        return;
      }

      // Khóa đồng bộ ngược từ sự kiện onScroll trong lúc cuộn mượt để khung hình nhỏ bên dưới không bị nháy qua các hình trung gian.
      programmaticTargetRef.current = clamped;
      track.scrollTo({ left: targetLeft, behavior: "smooth" });
      programmaticTimerRef.current = window.setTimeout(() => {
        programmaticTargetRef.current = null;
        programmaticTimerRef.current = 0;
      }, 420);
    },
    [mediaItems.length, centerActiveThumb],
  );

  const stepSlide = useCallback(
    (delta: number) => {
      const base = programmaticTargetRef.current ?? safeSlide;
      scrollToSlide(base + delta);
    },
    [safeSlide, scrollToSlide],
  );

  const handleCarouselScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const track = carouselTrackRef.current;
      if (!track || track.clientWidth <= 0) return;

      const lockedTarget = programmaticTargetRef.current;
      if (lockedTarget !== null) {
        const targetEl = track.children[lockedTarget] as HTMLElement | undefined;
        if (targetEl && Math.abs(track.scrollLeft - targetEl.offsetLeft) <= 2) {
          programmaticTargetRef.current = null;
          if (programmaticTimerRef.current) {
            window.clearTimeout(programmaticTimerRef.current);
            programmaticTimerRef.current = 0;
          }
        }
        return;
      }

      const idx = resolveNearestSlideIndex(track);
      setActiveSlide((prev) => {
        if (prev === idx) return prev;
        centerActiveThumb(idx);
        return idx;
      });
    });
  }, [resolveNearestSlideIndex, centerActiveThumb]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      if (programmaticTimerRef.current) window.clearTimeout(programmaticTimerRef.current);
    };
  }, []);

  if (safeUrls.length === 0) return null;

  return (
    <div className="pt-stored-gallery-wrap">
      {brokenCount > 0 && mediaItems.length === 0 && <MissingStoredImageCard caption={caption} />}

      {mediaItems.length === 1 && !compact && (
        mediaItems[0].isVideo ? (
          <LazyVideoCard url={mediaItems[0].url} caption={caption} />
        ) : (
          <button
            type="button"
            className="pt-detail-photo-frame pt-gallery-single-btn"
            onClick={() => setViewerIndex(0)}
            title="Bấm để xem ảnh cỡ lớn"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaItems[0].url}
              alt={`${altPrefix} 1`}
              className="pt-detail-photo-img"
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              onError={() => setBrokenImages((prev) => ({ ...prev, [mediaItems[0].url]: true }))}
            />
            {caption && (
              <div className="pt-detail-photo-overlay">
                <span>{caption}</span>
              </div>
            )}
          </button>
        )
      )}

      {mediaItems.length > 1 && !compact && (
        <div className="pt-media-carousel" data-no-sheet-drag="true">
          <div
            ref={carouselTrackRef}
            className="pt-media-carousel-track"
            onScroll={handleCarouselScroll}
            data-no-sheet-drag="true"
            onClickCapture={(e) => {
              if (didCarouselDragRef.current) {
                e.preventDefault();
                e.stopPropagation();
                didCarouselDragRef.current = false;
              }
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse" || e.button !== 0) return;
              if ((e.target as HTMLElement | null)?.closest("video")) return;
              const track = carouselTrackRef.current;
              if (!track) return;
              didCarouselDragRef.current = false;
              carouselDragRef.current = {
                active: true,
                startX: e.clientX,
                startScrollLeft: track.scrollLeft,
                dx: 0,
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== "mouse") return;
              const st = carouselDragRef.current;
              const track = carouselTrackRef.current;
              if (!st.active || !track) return;
              const dx = e.clientX - st.startX;
              st.dx = dx;
              if (!st.moved && Math.abs(dx) > 8) {
                st.moved = true;
                didCarouselDragRef.current = true;
                track.style.scrollSnapType = "none";
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }
              if (st.moved) {
                track.scrollLeft = st.startScrollLeft - dx;
              }
            }}
            onPointerUp={(e) => {
              if (e.pointerType !== "mouse") return;
              const st = carouselDragRef.current;
              const track = carouselTrackRef.current;
              if (!st.active) return;
              st.active = false;
              if (st.moved && track) {
                track.style.scrollSnapType = "";
                const target =
                  st.dx <= -40
                    ? safeSlide + 1
                    : st.dx >= 40
                      ? safeSlide - 1
                      : resolveNearestSlideIndex(track);
                scrollToSlide(target);
                window.setTimeout(() => {
                  didCarouselDragRef.current = false;
                }, 0);
              }
            }}
            onPointerCancel={(e) => {
              if (e.pointerType !== "mouse") return;
              carouselDragRef.current.active = false;
              if (carouselTrackRef.current) {
                carouselTrackRef.current.style.scrollSnapType = "";
              }
              didCarouselDragRef.current = false;
            }}
          >
            {mediaItems.map((item, idx) => (
              <div key={item.url} className="pt-media-carousel-slide">
                {item.isVideo ? (
                  <LazyVideoCard
                    url={item.url}
                    caption={`Video ${idx + 1}/${mediaItems.length}`}
                  />
                ) : (
                  <button
                    type="button"
                    className="pt-detail-photo-frame pt-gallery-single-btn"
                    onClick={() => setViewerIndex(idx)}
                    title={`Bấm để phóng to (${idx + 1}/${mediaItems.length})`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={`${altPrefix} ${idx + 1}`}
                      className="pt-detail-photo-img"
                      draggable={false}
                      loading={idx === 0 ? "eager" : "lazy"}
                      decoding="async"
                      onError={() => setBrokenImages((prev) => ({ ...prev, [item.url]: true }))}
                    />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="pt-media-carousel-bar">
            <span className="pt-media-carousel-count" style={{ fontVariantNumeric: "tabular-nums" }}>
              {mediaItems[safeSlide]?.isVideo ? "Video" : "Ảnh"} {safeSlide + 1}/{mediaItems.length}
            </span>
            <div className="pt-media-carousel-nav">
              <button
                type="button"
                className="pt-media-carousel-btn"
                disabled={safeSlide <= 0}
                onClick={() => stepSlide(-1)}
              >
                Trước
              </button>
              <button
                type="button"
                className="pt-media-carousel-btn"
                disabled={safeSlide >= mediaItems.length - 1}
                onClick={() => stepSlide(1)}
              >
                Tiếp
              </button>
            </div>
          </div>

          <div ref={thumbStripRef} className="pt-media-thumb-strip" data-no-sheet-drag="true">
            {mediaItems.map((item, idx) => (
              <button
                key={item.url}
                type="button"
                className={`pt-media-thumb-item ${idx === safeSlide ? "is-active" : ""}`.trim()}
                onClick={() => scrollToSlide(idx)}
                aria-label={`${item.isVideo ? "Video" : "Ảnh"} ${idx + 1}/${mediaItems.length}`}
              >
                {item.isVideo ? (
                  <VideoThumbTile url={item.url} label={`${altPrefix} ${idx + 1}`} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={`${altPrefix} ${idx + 1}`}
                    className="pt-stored-gallery-img"
                    loading="lazy"
                    decoding="async"
                    onError={() => setBrokenImages((prev) => ({ ...prev, [item.url]: true }))}
                  />
                )}
                <span className="pt-stored-gallery-badge" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {item.isVideo ? `Video` : `${idx + 1}/${mediaItems.length}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {compact && mediaItems.length > 0 && (
        <div className="pt-stored-gallery-grid is-compact">
          {mediaItems.map((item, idx) => (
            <button
              key={item.url}
              type="button"
              className="pt-stored-gallery-cell"
              onClick={() => setViewerIndex(idx)}
              title={`Xem (${idx + 1}/${mediaItems.length})`}
            >
              {item.isVideo ? (
                <VideoThumbTile url={item.url} label={`${altPrefix} ${idx + 1}`} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={`${altPrefix} ${idx + 1}`}
                  className="pt-stored-gallery-img"
                  loading="lazy"
                  decoding="async"
                  onError={() => setBrokenImages((prev) => ({ ...prev, [item.url]: true }))}
                />
              )}
              {mediaItems.length > 1 || item.isVideo ? (
                <span className="pt-stored-gallery-badge" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {item.isVideo ? "Video" : `${idx + 1}/${mediaItems.length}`}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {caption && (mediaItems.length > 1 || compact) && (
        <div className="pt-stored-gallery-caption">{caption}</div>
      )}

      {safeViewerIndex !== null && (
        <MediaBottomSheet
          urls={mediaItems.map((m) => m.url)}
          initialIndex={safeViewerIndex}
          title={altPrefix}
          subtitle={caption}
          onClose={() => setViewerIndex(null)}
          onIndexChange={(nextIdx) => scrollToSlide(nextIdx, true)}
        />
      )}
    </div>
  );
}
