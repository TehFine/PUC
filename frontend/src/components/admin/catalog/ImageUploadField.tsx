"use client";

import { useId, useRef, useState } from "react";
import { api, errorMessage, type UploadPurpose } from "@/lib/api-client";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Ô chọn ảnh: tải tệp lên `/api/uploads` với `purpose` rồi trả về URL do máy chủ cấp (lưu vào `imageUrl`).
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

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp hình ảnh (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ảnh quá lớn. Vui lòng chọn ảnh dưới 5 MB.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded = await api.upload(file, purpose);
      onChange(uploaded.url, file);
    } catch (err) {
      setError(errorMessage(err, "Không tải được ảnh lên."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="form-group">
      <label htmlFor={inputId}>{label}</label>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          style={{
            width: 132,
            height: 92,
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid var(--border)",
            background: "var(--bg-input, #f5f7f4)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={alt || "Ảnh đã chọn"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Chưa có ảnh</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-outline btn-sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Đang tải ảnh…" : value ? "Đổi ảnh" : "Tải ảnh lên"}
            </button>
            {value && (
              <button type="button" className="btn btn-outline btn-sm" disabled={uploading} onClick={() => onChange(null)}>
                Bỏ ảnh
              </button>
            )}
          </div>
          {presets && presets.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
          )}
          {hint && !error && <small style={{ color: "var(--text-muted)", fontSize: 12 }}>{hint}</small>}
          {error && (
            <small role="alert" style={{ color: "#b73c20", fontSize: 12 }}>
              {error}
            </small>
          )}
        </div>
      </div>
    </div>
  );
}
