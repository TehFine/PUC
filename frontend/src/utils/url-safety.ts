/**
 * Chỉ chấp nhận đường dẫn nội bộ hợp lệ bắt đầu bằng đúng 1 dấu `/` (chặn `//evil.com`, `javascript:`, `data:`, v.v.).
 */
const INTERNAL_MEDIA_URL_RE = /^\/(?!\/)[A-Za-z0-9._/-]+$/;

export function isSafeMediaUrl(url?: string | null): url is string {
  return typeof url === "string" && INTERNAL_MEDIA_URL_RE.test(url);
}

/**
 * Chỉ chấp nhận URL đối chiếu bên ngoài dùng giao thức `https:` hợp lệ, không chứa khoảng trắng,
 * ký tự điều khiển hay thông tin xác thực nhúng (`user:pass@host`).
 */
export function isSafeExternalHttpsUrl(url?: string | null): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || /[\s\u0000-\u001F\u007F]/.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
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

