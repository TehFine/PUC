import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const enableOnlineTranslate = process.env.NEXT_PUBLIC_ENABLE_ONLINE_TRANSLATE === "true";

/**
 * CSP hợp nhất cho toàn bộ ứng dụng để điều hướng mềm (Next.js <Link> / router.push)
 * giữa /, /login, /trace, /portal và /admin luôn hoạt động xuyên suốt:
 * - Hỗ trợ đăng nhập Google Identity Services (accounts.google.com, oauth2.googleapis.com)
 * - Hỗ trợ tải mảnh bản đồ vệ tinh & GIS (Google Maps tiles, Esri ArcGIS, CartoDB)
 */
const appCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https://*.google.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.basemaps.cartocdn.com https://*.googleusercontent.com",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${enableOnlineTranslate ? " https://translate.googleapis.com" : ""} https://accounts.google.com https://oauth2.googleapis.com${isDev ? " ws: wss:" : ""}`,
  "frame-src https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

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
  { key: "Content-Security-Policy", value: appCsp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...commonHeaders,
];

const nextConfig: NextConfig = {
  /* config options here */
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  devIndicators: false,
  poweredByHeader: false,
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
      { source: "/admin", headers: [noStoreHeader] },
      { source: "/admin/:path*", headers: [noStoreHeader] },
      { source: "/portal", headers: [noStoreHeader] },
      { source: "/portal/:path*", headers: [noStoreHeader] },
      { source: "/trace", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/trace/:path*", headers: [noStoreHeader, noReferrerHeader] },
      { source: "/t/:path*", headers: [noStoreHeader, noReferrerHeader] },
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
  turbopack: {
    rules: {
      "src/app/globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
