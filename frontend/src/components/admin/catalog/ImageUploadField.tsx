"use client";

import { useId, useRef, useState } from "react";
import { uploadOptimizedFile, validatePickedFile } from "@/components/portal/shared/media";
import { ConfirmDialog } from "@/components/ui/Modal";
import { errorMessage, type UploadPurpose } from "@/lib/api-client";
import { isSafeMediaUrl } from "@/utils/url-safety";

/**
 * Ô chọn ảnh của Quản trị viên: tự động thu nhỏ (tối đa 1600px) và nén JPEG ~0.8 trên trình duyệt
 * trước khi tải lên `/api/uploads` để tối ưu tốc độ tải và hiển thị khi người dùng truy cập.
 * Không bao giờ lưu ảnh dạng base64.
 */
export default function ImageUploadField({
  label,
  value,
  onChange,
  purpose,
  alt,
  hint,
  presets,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null, file?: File) => void;
  purpose: UploadPurpose;
  alt?: string;
  hint?: string;
  /** Ảnh mẫu có sẵn trong /public để chọn nhanh. */
  presets?: { label: string; src: string }[];
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = validatePickedFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadOptimizedFile(file, purpose);
      onChange(uploaded.url, file);
    } catch (err) {
      setError(errorMessage(err, "Không tải được ảnh lên."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="form-group img-upload-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="img-upload-top">
        <div className="img-upload-preview">
          {isSafeMediaUrl(value) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={alt || "Ảnh đã chọn"}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="img-upload-empty">Chưa có ảnh</span>
          )}
        </div>

        <div className="img-upload-controls">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <div className="img-upload-actions">
            <button
              type="button"
              className="btn btn-outline img-upload-action-btn"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Đang tải ảnh…" : value ? "Đổi ảnh" : "Tải ảnh lên"}
            </button>
            {value && (
              <button
                type="button"
                className="btn btn-danger img-upload-action-btn"
                disabled={uploading}
                onClick={() => setConfirmRemove(true)}
              >
                Xóa ảnh
              </button>
            )}
          </div>
          {hint && !error && <small className="img-upload-hint">{hint}</small>}
          {error && (
            <small role="alert" className="img-upload-error">
              {error}
            </small>
          )}
        </div>
      </div>

      {presets && presets.length > 0 && (
        <div className="img-upload-presets-wrap">
          <span className="img-upload-presets-label">Chọn nhanh ảnh mẫu</span>
          <div className="img-upload-presets">
            {presets.map((preset) => (
              <button
                key={preset.src}
                type="button"
                className={`news-sample-chip ${value === preset.src ? "active" : ""}`}
                onClick={() => onChange(preset.src)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Xóa ảnh đã chọn"
          message="Xác nhận xóa ảnh hiện tại khỏi mục này?"
          confirmLabel="Xóa ảnh"
          danger
          onConfirm={() => {
            onChange(null);
            setConfirmRemove(false);
          }}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
