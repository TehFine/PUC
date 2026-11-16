"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { AppleSpinner } from "@/components/ui/Skeleton";
import type { UploadPurpose } from "@/lib/api-client";
import { isSafeMediaUrl } from "@/utils/url-safety";
import {
  formatBytesCompact,
  inspectVideoFile,
  isSupportedVideoFile,
  purposeAllowsVideo,
  uploadOptimizedFile,
  uploadPortalFile,
  validatePickedFile,
} from "./media";

export { isSafeMediaUrl };

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
  mode = "diary",
}: {
  selectedDate: string;
  todayDate: string;
  delayDays: number;
  mode?: "protocol" | "diary" | "spray";
}) {
  if (delayDays <= 0) return null;

  const guidance =
    mode === "protocol"
      ? `Hệ thống sẽ lưu đồng thời hai mốc thời gian, tự căn chỉnh lịch mốc kế tiếp tính từ ngày ${formatShortVnDate(selectedDate)} và nhắc lịch sớm hơn ở đợt sau.`
      : mode === "spray"
        ? `Hệ thống lưu đồng thời ngày phun ${formatShortVnDate(selectedDate)} và thời điểm khai báo hôm nay, tính cách ly PHI đúng từ ngày phun và nhắc bạn cập nhật đúng hạn lần tới.`
        : `Hệ thống lưu đồng thời ngày làm thực tế và thời điểm khai báo hôm nay để làm căn cứ đối chiếu và nhắc nhở lần sau khai báo ngay trong ngày.`;

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
      <p className="pt-late-decl-note">{guidance}</p>
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
          setFile(next);
          setPreview(meta.posterUrl ?? URL.createObjectURL(next));
        });
        return;
      }
      setError(null);
      setFile(next);
      setPreview(URL.createObjectURL(next));
    },
    [allowVideo],
  );

  const clear = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
  }, []);

  /** Tải ảnh lên (nếu có), trả về id tệp; `undefined` khi không chọn ảnh. Ném lỗi nếu tải lên thất bại. */
  const ensureUploaded = useCallback(async (): Promise<number | undefined> => {
    if (!file) return undefined;
    if (uploaded.current?.file === file) return uploaded.current.id;
    const id = await uploadPortalFile(file, purpose);
    uploaded.current = { file, id };
    return id;
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
          {required ? "Bắt buộc" : "Không bắt buộc"}
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
  previewUrl: string | null;
  revokeOnCleanup: boolean;
  file?: File;
  uploadedId?: number;
  uploadedUrl?: string;
}

export interface UseMultiPhotoPickerOptions {
  maxFiles?: number;
  allowVideo?: boolean;
  initialItems?: Array<{ id: number; url: string }>;
}

/**
 * Quản lý nhiều ảnh hiện trường (và tùy chọn video ngắn):
 * - Tách riêng nút "Chụp ảnh" (mở thẳng camera sau, bấm nhiều lần để chụp nhiều góc cây/trái)
 *   và nút "Chọn nhiều ảnh" (chọn hàng loạt từ thư viện điện thoại).
 * - Video tự động kiểm tra thời lượng <= 90s, trích 1 khung hình ~12 KB làm ảnh đại diện để không ngốn RAM.
 * - Khi lưu: nén WebP 2 bước và tải lên tối đa 2 luồng đồng thời, nhớ ID các tệp đã tải thành công nếu mạng chập chờn.
 */
export function useMultiPhotoPicker(purpose: UploadPurpose, options: UseMultiPhotoPickerOptions = {}) {
  const maxFiles = options.maxFiles ?? 8;
  const allowVideo = options.allowVideo ?? purposeAllowsVideo(purpose);

  const [items, setItems] = useState<MultiMediaItem[]>(() =>
    (options.initialItems ?? [])
      .filter((it) => Number.isInteger(it.id) && it.id > 0 && isSafeMediaUrl(it.url))
      .map((it, idx) => ({
        key: `existing-${it.id}-${idx}`,
        name: isVideoMediaUrl(it.url) ? `Video hiện trường #${idx + 1}` : `Ảnh hiện trường #${idx + 1}`,
        isVideo: isVideoMediaUrl(it.url),
        previewUrl: isVideoMediaUrl(it.url) ? null : it.url,
        revokeOnCleanup: false,
        uploadedId: it.id,
        uploadedUrl: it.url,
      })),
  );
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const itemsRef = useRef<MultiMediaItem[]>(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.revokeOnCleanup && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, []);

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
      const accepted: MultiMediaItem[] = [];
      let lastProblem: string | null = null;

      if (incoming.length > remainingSlots) {
        lastProblem = `Chỉ thêm được tối đa ${maxFiles} tệp (đã lấy ${remainingSlots} tệp đầu tiên).`;
      }

      for (const file of incoming.slice(0, remainingSlots)) {
        const problem = validatePickedFile(file, { allowVideo });
        if (problem) {
          lastProblem = `${file.name}: ${problem}`;
          continue;
        }
        const video = isSupportedVideoFile(file);
        if (video) {
          const meta = await inspectVideoFile(file);
          if (meta.error) {
            lastProblem = `${file.name}: ${meta.error}`;
            continue;
          }
          accepted.push({
            key: `vid-${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            isVideo: true,
            sizeBytes: file.size,
            durationSec: meta.durationSec,
            previewUrl: meta.posterUrl,
            revokeOnCleanup: false,
            file,
          });
        } else {
          const blobUrl = URL.createObjectURL(file);
          accepted.push({
            key: `img-${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            isVideo: false,
            sizeBytes: file.size,
            previewUrl: blobUrl,
            revokeOnCleanup: true,
            file,
          });
        }
      }

      setError(lastProblem);
      if (accepted.length > 0) {
        const nextList = [...itemsRef.current, ...accepted].slice(0, maxFiles);
        itemsRef.current = nextList;
        setItems(nextList);
      }
    },
    [allowVideo, maxFiles],
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
    setProgress(null);
  }, []);

  /**
   * Nén WebP + tải lên tuần tự/song song có kiểm soát (tối đa 2 luồng) cho các tệp chưa tải,
   * trả về danh sách ID đã tải lên theo đúng thứ tự người dùng chọn.
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

    async function worker() {
      while (true) {
        const step = cursor;
        cursor += 1;
        if (step >= pendingIndices.length) return;
        const item = snapshot[pendingIndices[step]];
        if (!item?.file) continue;
        const res = await uploadOptimizedFile(item.file, purpose);
        uploadedByKey.set(item.key, { id: res.id, url: res.url });
        done += 1;
        setProgress({ done, total });
      }
    }

    try {
      const workers = Array.from({ length: Math.min(2, pendingIndices.length) }, () => worker());
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
  videoLabel = "Thêm video ngắn",
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
              ? `Bắt buộc, tối đa ${picker.maxFiles} tệp`
              : `Tùy chọn, tối đa ${picker.maxFiles} tệp`}
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
                    ? "Đã tải lên"
                    : item.sizeBytes
                      ? item.isVideo
                        ? formatBytesCompact(item.sizeBytes)
                        : `${formatBytesCompact(item.sizeBytes)} (tự nén)`
                      : "Sẵn sàng"}
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

          <label className={`pt-multi-media-btn ${disabled ? "is-disabled" : ""}`.trim()} htmlFor={`${id}-gallery`}>
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
            <label className={`pt-multi-media-btn ${disabled ? "is-disabled" : ""}`.trim()} htmlFor={`${id}-video`}>
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

function LazyVideoCard({ url, caption }: { url: string; caption?: string }) {
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return (
      <div className="pt-lazy-video-card">
        <div className="pt-lazy-video-copy">
          <strong>Video minh chứng hiện trường</strong>
          <span>Chỉ tải dữ liệu video khi bạn bấm phát để tiết kiệm dung lượng mạng</span>
        </div>
        <div className="pt-lazy-video-actions">
          <button type="button" className="pt-lazy-video-play-btn" onClick={() => setPlaying(true)}>
            Phát video
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="pt-lazy-video-link">
            Mở tệp gốc
          </a>
        </div>
        {caption && <div className="pt-lazy-video-caption">{caption}</div>}
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

/** Ảnh hoặc video hiện trường đơn lẻ đã lưu trên server (`/api/uploads/:id`). */
export function StoredPhoto({ url, alt, caption }: { url: string; alt: string; caption?: string }) {
  const [broken, setBroken] = useState(false);
  if (!isSafeMediaUrl(url)) return null;
  if (isVideoMediaUrl(url)) {
    return <LazyVideoCard url={url} caption={caption} />;
  }
  if (broken) {
    return <MissingStoredImageCard caption={caption} />;
  }
  return (
    <a className="pt-detail-photo-frame" href={url} target="_blank" rel="noopener noreferrer" title="Mở tệp gốc">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tải lên phục vụ qua API có cookie phiên */}
      <img
        src={url}
        alt={alt}
        className="pt-detail-photo-img"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
      {caption && (
        <div className="pt-detail-photo-overlay">
          <span>{caption}</span>
        </div>
      )}
    </a>
  );
}

/**
 * Bộ sưu tập nhiều ảnh và video hiện trường đã lưu:
 * - Tự động gom `urls` (hoặc lùi về `fallbackUrl` với dữ liệu cũ 1 ảnh).
 * - Ảnh hiển thị lưới thu nhỏ `loading="lazy"`, bấm vào mở hộp thoại xem phóng to có nút Trước / Tiếp.
 * - Video hiển thị thẻ chờ 0 KB băng thông, chỉ phát qua HTTP Range (206) khi người dùng bấm "Phát video".
 */
export function StoredMediaGallery({
  urls,
  fallbackUrl,
  altPrefix,
  caption,
  compact = false,
}: {
  urls?: string[] | null;
  fallbackUrl?: string | null;
  altPrefix: string;
  caption?: string;
  compact?: boolean;
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

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (safeUrls.length === 0) return null;

  const allImageCandidates = safeUrls.filter((u) => !isVideoMediaUrl(u));
  const imageUrls = allImageCandidates.filter((u) => !brokenImages[u]);
  const brokenCount = allImageCandidates.length - imageUrls.length;
  const videoUrls = safeUrls.filter((u) => isVideoMediaUrl(u));

  const activeImageUrl = viewerIndex !== null && viewerIndex >= 0 && viewerIndex < imageUrls.length ? imageUrls[viewerIndex] : null;

  return (
    <div className="pt-stored-gallery-wrap">
      {imageUrls.length === 1 && videoUrls.length === 0 && !compact ? (
        <button
          type="button"
          className="pt-detail-photo-frame pt-gallery-single-btn"
          onClick={() => setViewerIndex(0)}
          title="Bấm để xem ảnh cỡ lớn"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrls[0]}
            alt={`${altPrefix} 1`}
            className="pt-detail-photo-img"
            loading="lazy"
            decoding="async"
            onError={() => setBrokenImages((prev) => ({ ...prev, [imageUrls[0]]: true }))}
          />
          {caption && (
            <div className="pt-detail-photo-overlay">
              <span>{caption}</span>
            </div>
          )}
        </button>
      ) : (
        imageUrls.length > 0 && (
          <div className={`pt-stored-gallery-grid ${compact ? "is-compact" : ""}`.trim()}>
            {imageUrls.map((u, idx) => (
              <button
                key={u}
                type="button"
                className="pt-stored-gallery-cell"
                onClick={() => setViewerIndex(idx)}
                title={`Xem phóng to ảnh ${idx + 1}/${imageUrls.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u}
                  alt={`${altPrefix} ${idx + 1}`}
                  className="pt-stored-gallery-img"
                  loading="lazy"
                  decoding="async"
                  onError={() => setBrokenImages((prev) => ({ ...prev, [u]: true }))}
                />
                {imageUrls.length > 1 && (
                  <span className="pt-stored-gallery-badge" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {idx + 1}/{imageUrls.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      )}

      {brokenCount > 0 && imageUrls.length === 0 && videoUrls.length === 0 && (
        <MissingStoredImageCard caption={caption} />
      )}

      {videoUrls.length > 0 && (
        <div className="pt-stored-video-list">
          {videoUrls.map((vUrl, idx) => (
            <LazyVideoCard
              key={vUrl}
              url={vUrl}
              caption={videoUrls.length > 1 ? `Video hiện trường ${idx + 1}/${videoUrls.length}` : caption}
            />
          ))}
        </div>
      )}

      {caption && (imageUrls.length > 1 || compact) && (
        <div className="pt-stored-gallery-caption">{caption}</div>
      )}

      {activeImageUrl && viewerIndex !== null && (
        <Modal
          title={`${altPrefix} (${viewerIndex + 1}/${imageUrls.length})`}
          onClose={() => setViewerIndex(null)}
          width={760}
          footer={
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", gap: 6 }}>
                {imageUrls.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={viewerIndex <= 0}
                      onClick={() => setViewerIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
                    >
                      Ảnh trước
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={viewerIndex >= imageUrls.length - 1}
                      onClick={() =>
                        setViewerIndex((prev) =>
                          prev !== null && prev < imageUrls.length - 1 ? prev + 1 : prev,
                        )
                      }
                    >
                      Ảnh tiếp
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <a
                  href={activeImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                  style={{ textDecoration: "none" }}
                >
                  Mở tệp gốc
                </a>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setViewerIndex(null)}>
                  Đóng
                </button>
              </div>
            </div>
          }
        >
          <div style={{ background: "#f7f7f5", border: "1px solid #d4d4d2", borderRadius: 6, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImageUrl}
              alt={`${altPrefix} ${viewerIndex + 1}`}
              style={{
                width: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                display: "block",
                margin: "0 auto",
              }}
              decoding="async"
            />
          </div>
          {caption && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: "#5f6d66", fontVariantNumeric: "tabular-nums" }}>
              {caption}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
