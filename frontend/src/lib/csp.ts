/*
 * Dựng Content-Security-Policy hợp nhất cho toàn bộ ứng dụng để điều hướng mềm (Next.js <Link> / router.push)
 * giữa /, /login, /trace, /portal và /admin luôn hoạt động xuyên suốt:
 * - Hỗ trợ đăng nhập Google Identity Services (accounts.google.com, oauth2.googleapis.com)
 * - Hỗ trợ tải mảnh bản đồ vệ tinh và GIS (Google Maps tiles, Esri ArcGIS, CartoDB)
 *
 * Mô-đun thuần (không alias, không API trình duyệt) dùng chung cho `next.config.ts` và `src/proxy.ts`.
 *
 * Production KHÔNG dùng `'unsafe-inline'` cho `script-src`:
 * - Script khởi tạo hiệu năng tĩnh được cho phép bằng mã băm SHA-256 tính sẵn lúc nạp cấu hình.
 * - Script nội tuyến do chính Next.js sinh ra (dữ liệu RSC `self.__next_f.push(...)`, script khởi động React)
 *   thay đổi theo từng trang nên không băm trước được; chúng được cho phép bằng nonce ngẫu nhiên mỗi request
 *   do `src/proxy.ts` cấp (Next.js tự gắn nonce này vào mọi script của framework).
 */

export interface CspOptions {
  isDev: boolean;
  enableOnlineTranslate: boolean;
  /** Mã băm dạng `sha256-<base64>` của các script nội tuyến tĩnh. */
  scriptHashes?: readonly string[];
  /** Nonce ngẫu nhiên theo request (chỉ production, do proxy cấp). */
  nonce?: string;
}

const NONCE_RE = /^[A-Za-z0-9+/=_-]{16,128}$/;
const HASH_RE = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/;

export function buildContentSecurityPolicy(options: CspOptions): string {
  const scriptSrc = ["'self'"];
  if (options.isDev) {
    // Môi trường phát triển: React cần `eval` để dựng lại stack lỗi, Fast Refresh chèn script nội tuyến.
    scriptSrc.push("'unsafe-inline'");
  } else {
    if (options.nonce && NONCE_RE.test(options.nonce)) {
      scriptSrc.push(`'nonce-${options.nonce}'`);
    }
    for (const hash of options.scriptHashes ?? []) {
      if (HASH_RE.test(hash)) scriptSrc.push(`'${hash}'`);
    }
  }
  scriptSrc.push("https://accounts.google.com");
  if (options.isDev) scriptSrc.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob: https://*.google.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.basemaps.cartocdn.com https://*.googleusercontent.com",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "worker-src 'self'",
    "manifest-src 'self'",
    `connect-src 'self'${options.enableOnlineTranslate ? " https://translate.googleapis.com" : ""} https://accounts.google.com https://oauth2.googleapis.com https://mt0.google.com https://mt1.google.com https://mt2.google.com https://mt3.google.com https://server.arcgisonline.com https://services.arcgisonline.com${options.isDev ? " ws: wss:" : ""}`,
    "frame-src https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Biến môi trường (được `next.config.ts` nhúng lúc build) chứa danh sách mã băm script nội tuyến tĩnh. */
export const CSP_SCRIPT_HASHES_ENV = "PUC_CSP_SCRIPT_HASHES";
