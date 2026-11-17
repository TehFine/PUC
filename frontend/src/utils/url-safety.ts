/**
 * Chỉ chấp nhận đường dẫn nội bộ hợp lệ bắt đầu bằng đúng 1 dấu `/`, không chứa `..` hay `.` vượt cấp thư mục.
 */
const INTERNAL_MEDIA_URL_RE = /^\/(?!\/)[A-Za-z0-9._/-]+$/;
const DOT_SEGMENT_RE = /(?:^|\/)\.{1,2}(?:\/|$)/;
const SAFE_RASTER_DATA_URL_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i;

export function isSafeMediaUrl(url?: string | null): url is string {
  return typeof url === "string" && INTERNAL_MEDIA_URL_RE.test(url) && !DOT_SEGMENT_RE.test(url);
}

/**
 * Chỉ chấp nhận Data URL ảnh điểm ảnh (PNG / JPEG / WebP base64), chặn tuyệt đối `data:image/svg+xml` hay HTML.
 */
export function isSafeRasterDataUrl(value?: string | null): value is string {
  return typeof value === "string" && value.length <= 8_000_000 && SAFE_RASTER_DATA_URL_RE.test(value);
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

const UNSAFE_PATH_CHARS_RE = /[\\\u0000-\u001F\u007F\s]/;
const MAX_NEXT_PATH_LENGTH = 2048;
/** Các trang không được phép làm đích quay lại sau đăng nhập (tránh vòng lặp và điều hướng sang API thô). */
const BLOCKED_NEXT_PREFIXES = ["/api", "/login", "/register", "/forgot-password"];

/**
 * Chuẩn hóa tham số `?next=` thành đường dẫn nội bộ an toàn, trả `null` nếu không hợp lệ:
 * - Chỉ nhận đường dẫn bắt đầu bằng đúng 1 dấu `/` (chặn `//evil.com`, `javascript:`, URL tuyệt đối).
 * - Chặn gạch chéo ngược, ký tự điều khiển và khoảng trắng (trình duyệt chuẩn hóa `/\evil.com` thành `//evil.com`),
 *   kể cả khi bị mã hóa phần trăm (`/%5Cevil.com`).
 * - Phân tích theo chuẩn WHATWG URL và bắt buộc trùng nguồn gốc với trang hiện tại.
 * - Chặn `/api/*`, `/login`, `/register`, `/forgot-password` (sau khi đã chuẩn hóa `..`).
 */
export function resolveSafeNextPath(raw: string | null | undefined, origin?: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_NEXT_PATH_LENGTH) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (UNSAFE_PATH_CHARS_RE.test(trimmed)) return null;

  let baseOrigin: string;
  try {
    baseOrigin = new URL(
      origin ?? (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost"),
    ).origin;
  } catch {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, baseOrigin);
  } catch {
    return null;
  }
  if (parsed.origin !== baseOrigin || parsed.username || parsed.password) return null;

  // Giải mã phần đường dẫn để bắt cả dạng mã hóa phần trăm (`/%5Cevil.com`, `/%2F%2Fevil.com`, `/%61pi/...`).
  const normalizedPath = safeDecodeURIComponent(parsed.pathname).toLowerCase();
  if (normalizedPath.startsWith("//") || /[\\\u0000-\u001F\u007F]/.test(normalizedPath) || /%5c/i.test(normalizedPath)) {
    return null;
  }
  if (BLOCKED_NEXT_PREFIXES.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`))) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

const MAX_TRACE_CODE_LENGTH = 128;

/**
 * Kiểm tra mã truy xuất (mã lô, mã tem, token QR) trước khi ghép vào đường dẫn `/trace/...`, `/t/...` hoặc `/api/trace/...`:
 * từ chối chuỗi rỗng, quá dài, chỉ gồm dấu chấm (`.` / `..` bị trình duyệt hiểu là thư mục cha), dấu gạch chéo (`/`, `\`)
 * hoặc ký tự điều khiển (kể cả sau khi giải mã phần trăm).
 */
export function isSafeTraceCode(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TRACE_CODE_LENGTH) return false;
  if (/^\.+$/.test(trimmed)) return false;
  if (/[/\\?#\u0000-\u001F\u007F]/.test(trimmed)) return false;
  const decoded = safeDecodeURIComponent(trimmed).trim();
  if (!decoded || /^\.+$/.test(decoded)) return false;
  return !/[/\\?#\u0000-\u001F\u007F]/.test(decoded);
}

