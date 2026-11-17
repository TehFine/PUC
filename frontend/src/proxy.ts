import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "./lib/csp";

/**
 * Cấp nonce CSP ngẫu nhiên cho mỗi request trang ở production để bỏ hẳn `'unsafe-inline'` khỏi `script-src`.
 * Next.js đọc nonce từ header request và tự gắn vào mọi script nội tuyến của framework; `app/layout.tsx` đọc `x-nonce`
 * để gắn đồng thời cả `nonce` lẫn mã băm SHA-256 cho script khởi tạo hiệu năng trên mọi trình duyệt.
 * Môi trường phát triển giữ CSP tĩnh trong `next.config.ts` (cần `'unsafe-eval'` cho Fast Refresh).
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const scriptHashes = (process.env.PUC_CSP_SCRIPT_HASHES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const csp = buildContentSecurityPolicy({
    isDev: false,
    enableOnlineTranslate: process.env.NEXT_PUBLIC_ENABLE_ONLINE_TRANSLATE === "true",
    scriptHashes,
    nonce,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Áp cho mọi trang giao diện (kể cả đường dẫn động /trace/*, /t/* chứa dấu chấm hoặc trang 404), chỉ bỏ qua:
     * - /api/* (proxy sang backend, đã có helmet)
     * - tệp tĩnh đã băm của Next.js, ảnh tối ưu, Service Worker, manifest và tệp tĩnh thực sự trong public/
     */
    "/((?!api/|_next/static/|_next/image/|favicon\\.ico$|sw\\.js$|manifest\\.webmanifest$|robots\\.txt$|sitemap\\.xml$|[^/]+\\.(?:png|svg|webp|ico|jpg|jpeg|avif|woff2?)$|(?:diseases|pesticides|fertilizers|varieties|training|landing|stages|fonts|icons)/.+\\.(?:png|svg|webp|ico|jpg|jpeg|avif|woff2?)$).*)",
  ],
};
