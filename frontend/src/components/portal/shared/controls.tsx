"use client";

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { FileText, Paperclip } from "lucide-react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { AppleSpinner } from "@/components/ui/Skeleton";
import type { UploadPurpose } from "@/lib/api-client";
import { RadialPngIcon } from "../RadialIcons";
import { uploadPortalFile, validatePickedFile } from "./media";

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

/**
 * Nút thao tác nguy hiểm (xóa, hủy…) xác nhận 2 bước ngay tại chỗ:
 * bấm lần 1 hiện câu hỏi + nút “Đồng ý”, bấm “Đồng ý” mới chạy `onConfirm`.
 */
export function ConfirmButton({
  label,
  question,
  confirmLabel = "Đồng ý",
  busy = false,
  onConfirm,
  className = "pt-btn pt-btn-ghost pt-btn-danger",
  disabled,
}: {
  label: ReactNode;
  question: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)} disabled={disabled || busy}>
        {label}
      </button>
    );
  }
  return (
    <div className="pt-confirm-inline" role="group" aria-label={question}>
      <span className="pt-confirm-question">{question}</span>
      <div className="pt-confirm-actions">
        <button type="button" className="pt-btn pt-btn-ghost pt-btn-sm" onClick={() => setAsking(false)} disabled={busy}>
          Không
        </button>
        <BusyButton className="pt-btn pt-btn-sm pt-btn-danger-solid" busy={busy} busyLabel="Đang xử lý…" onClick={onConfirm}>
          {confirmLabel}
        </BusyButton>
      </div>
    </div>
  );
}

/* ──────────────────────────── Chọn ảnh + tải lên ──────────────────────────── */

/**
 * Quản lý một ảnh người dùng chọn: xem trước, kiểm tra định dạng, nén + tải lên khi lưu.
 * Kết quả tải lên được nhớ theo tệp để bấm “Lưu” lại sau lỗi mạng không tải lại ảnh.
 */
export function usePhotoPicker(purpose: UploadPurpose) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploaded = useRef<{ file: File; id: number } | null>(null);
  const allowVideo =
    purpose === "journal" ||
    purpose === "harvest" ||
    purpose === "approval" ||
    purpose === "violation" ||
    purpose === "news";

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
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

/** Ô chọn/chụp ảnh hiện trường dùng chung (nhật ký, khai báo thu hoạch, kích hoạt tem, báo khắc phục…). */
export function PhotoField({
  id,
  label,
  picker,
  required = false,
  title = "Chụp ảnh hoặc tải ảnh lên",
  description = "Bấm để mở máy ảnh hoặc chọn ảnh có sẵn",
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
  return (
    <div className="pt-journal-photo-field">
      <div className="pt-journal-photo-header">
        <label className="pt-journal-photo-label" htmlFor={id}>
          {label}
        </label>
        <span className={required ? "pt-journal-photo-required" : "pt-photo-optional"}>{required ? "* Bắt buộc" : "Không bắt buộc"}</span>
      </div>

      {picker.preview ? (
        <div className="pt-photo-preview-wrap">
          {picker.file?.type.startsWith("video/") ? (
            <video
              src={picker.preview}
              controls
              playsInline
              preload="metadata"
              className="pt-photo-preview-img"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước từ blob: URL
            <img src={picker.preview} alt="Xem trước ảnh đã chọn" className="pt-photo-preview-img" decoding="async" />
          )}
          <div className="pt-photo-preview-bar">
            <span>{picker.file?.name || "Tệp đã chọn"}</span>
            <span>✓ Đã đính kèm</span>
          </div>
          <button
            type="button"
            className="pt-photo-remove-btn"
            onClick={picker.clear}
            disabled={disabled}
            title="Bỏ tệp này để chọn tệp khác"
            aria-label="Bỏ tệp đã chọn"
          >
            <CloseCircleIcon size={24} />
          </button>
        </div>
      ) : (
        <label className="pt-photo-dropzone" htmlFor={id}>
          <input
            id={id}
            type="file"
            accept="image/*,video/mp4,video/webm"
            capture="environment"
            disabled={disabled}
            onChange={(event) => {
              picker.pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="pt-photo-dropzone-icon">
            <RadialPngIcon src="/photo-camera.png" size={28} />
          </div>
          <span className="pt-photo-dropzone-title">{title}</span>
          <span className="pt-photo-dropzone-desc">{description}</span>
        </label>
      )}
      <InlineError message={picker.error} />
    </div>
  );
}

/* ──────────────────────────── Nhiều tệp đính kèm (ảnh/PDF) ──────────────────────────── */

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
        <span className="pt-photo-optional">
          {files.length}/{max} tệp
        </span>
      </div>
      {files.length > 0 && (
        <ul className="pt-attach-list">
          {files.map((item) => (
            <li key={item.key} className="pt-attach-item">
              {item.file.type.startsWith("image/") ? <RadialPngIcon src="/photo-camera.png" size={16} /> : <FileText size={15} aria-hidden="true" />}
              <span className="pt-attach-name">{item.file.name}</span>
              <span className="pt-attach-size">{Math.max(1, Math.round(item.file.size / 1024))} KB</span>
              <button
                type="button"
                className="pt-attach-remove"
                onClick={() => onChange(files.filter((f) => f.key !== item.key))}
                disabled={disabled}
                aria-label={`Bỏ tệp ${item.file.name}`}
              >
                <CloseCircleIcon size={20} />
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
            accept="image/*,video/mp4,video/webm,application/pdf,.pdf"
            disabled={disabled}
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
          <Paperclip size={16} aria-hidden="true" />
          <span>Thêm ảnh giấy tờ hoặc tệp PDF</span>
        </label>
      )}
      <InlineError message={error} />
    </div>
  );
}

/** Chỉ cho phép URL nội bộ bắt đầu bằng `/` (không phải `//`) hoặc `http(s)://` để chặn `javascript:`. */
export const isSafeMediaUrl = (url: string | null | undefined): url is string =>
  typeof url === "string" && /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/.test(url);

/** Ảnh hoặc video hiện trường đã lưu trên server (`/api/uploads/:id`), có liên kết mở tệp gốc. */
export function StoredPhoto({ url, alt, caption }: { url: string; alt: string; caption?: string }) {
  const [asVideo, setAsVideo] = useState(() => /\.(mp4|webm)(\?|$)/i.test(url));
  if (!isSafeMediaUrl(url)) return null;
  if (asVideo) {
    return (
      <div className="pt-detail-photo-frame">
        <video
          src={url}
          controls
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
  return (
    <a className="pt-detail-photo-frame" href={url} target="_blank" rel="noopener noreferrer" title="Mở tệp gốc">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tải lên phục vụ qua API có cookie phiên */}
      <img
        src={url}
        alt={alt}
        className="pt-detail-photo-img"
        loading="lazy"
        decoding="async"
        onError={() => setAsVideo(true)}
      />
      {caption && (
        <div className="pt-detail-photo-overlay">
          <span>{caption}</span>
        </div>
      )}
    </a>
  );
}
