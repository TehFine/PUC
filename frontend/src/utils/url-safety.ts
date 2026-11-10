/**
 * Chỉ chấp nhận đường dẫn nội bộ hợp lệ bắt đầu bằng đúng 1 dấu `/` (chặn `//evil.com`, `javascript:`, `data:`, v.v.).
 */
const INTERNAL_MEDIA_URL_RE = /^\/(?!\/)[A-Za-z0-9._/-]+$/;

export function isSafeMediaUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && INTERNAL_MEDIA_URL_RE.test(url);
}

/**
 * Giải mã tham số URL an toàn, không ném `URIError` khi chuỗi chứa ký tự `%` không hợp lệ.
 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

