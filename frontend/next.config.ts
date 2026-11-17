import { createHash } from "node:crypto";
import type { NextConfig } from "next";
import { buildContentSecurityPolicy, CSP_SCRIPT_HASHES_ENV } from "./src/lib/csp";
import { PERF_BOOTSTRAP_SCRIPT } from "./src/lib/perf-bootstrap";

const isDev = process.env.NODE_ENV === "development";
const enableOnlineTranslate = process.env.NEXT_PUBLIC_ENABLE_ONLINE_TRANSLATE === "true";

/** Mã băm SHA-256 của đúng chuỗi script khởi tạo hiệu năng chèn trong `app/layout.tsx` (tính lúc nạp cấu hình). */
const perfBootstrapHash = `sha256-${createHash("sha256").update(PERF_BOOTSTRAP_SCRIPT, "utf8").digest("base64")}`;

/**
 * CSP tĩnh cho môi trường phát triển. Ở production, CSP được `src/proxy.ts` gắn cho từng request trang
 * (nonce ngẫu nhiên kết hợp mã băm script khởi tạo, không còn `'unsafe-inline'` trong `script-src`), nên không
 * phát thêm header CSP thứ hai ở đây (trình duyệt sẽ áp giao của hai chính sách và chặn script của Next.js).
 */
const devCsp = buildContentSecurityPolicy({ isDev: true, enableOnlineTranslate });

const commonHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const securityHeaders = [
  ...(isDev ? [{ key: "Content-Security-Policy", value: devCsp }] : []),
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...commonHeaders,
];

const nextConfig: NextConfig = {
  /* config options here */
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  devIndicators: false,
  poweredByHeader: false,
  // Không phát hành tệp .map mã nguồn trên bản build production.
  productionBrowserSourceMaps: false,
  env: {
    [CSP_SCRIPT_HASHES_ENV]: perfBootstrapHash,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 86400,
  },
  async headers() {
    const immutableAssetHeaders = [
      ...securityHeaders,
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    const noStoreHeader = {
      key: "Cache-Control",
      value: "private, no-store, no-cache, max-age=0, must-revalidate",
    };
    const noReferrerHeader = {
      key: "Referrer-Policy",
      value: "no-referrer",
    };
    // Các đường dẫn /api/* được proxy sang backend (đã có helmet), nên chỉ áp cho trang giao diện.
    return [
      { source: "/((?!api/).*)", headers: securityHeaders },
      { source: "/admin", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/admin/:path*", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/portal", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/portal/:path*", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/trace", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/trace/:path*", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/t/:path*", headers: [noStoreHeader, noReferrerHeader] },
      // Trang đăng nhập, đăng ký và khôi phục mật khẩu không được lưu bộ đệm trình duyệt/CDN (biểu mẫu chứa thông tin xác thực/PII).
      { source: "/login", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/login/:path*", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/register", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/register/:path*", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/forgot-password", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/forgot-password/:path*", headers: [noStoreHeader, noReferrerHeader] },
      {
        source: "/sw.js",
        headers: [
          ...commonHeaders,
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          ...commonHeaders,
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/:folder(diseases|pesticides|fertilizers|varieties|training|landing|stages|fonts|icons)/:path*",
        headers: immutableAssetHeaders,
      },
      {
        source: "/:asset([^/]+\\.(?:png|svg|webp|ico))",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/landing", destination: "/", permanent: true }];
  },
  async rewrites() {
    const rawApiUrl =
      process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const normalizedApiUrl = rawApiUrl.trim().replace(/\/+$/, "").replace(/\/api$/i, "");
    return [{ source: "/api/:path*", destination: `${normalizedApiUrl}/api/:path*` }];
  },
};

export default nextConfig;
