/**
 * Service Worker hỗ trợ nông hộ sử dụng Cổng hộ dân (/portal) ngoài rẫy mất sóng hoặc 2G/3G yếu:
 * 1. Tệp tĩnh đã băm (/_next/static/*) và biểu tượng/ảnh danh mục công khai: ưu tiên đọc từ bộ đệm (0ms, 0 KB mạng).
 * 2. Trang giao diện /portal: ưu tiên mạng (giới hạn chờ 3,5 giây); nếu mất sóng tại vườn thì trả về khung ứng dụng đã lưu
 *    (giữ nguyên header Content-Security-Policy đi kèm để khớp nonce) giúp mở thẳng màn hình chụp ảnh/ghi nhật ký.
 * 3. Tuyệt đối KHÔNG lưu bộ đệm cho /api/*, /admin*, /login*, /forgot-password* trong Service Worker,
 *    và xóa sạch bộ đệm khung /portal ngay khi đăng xuất hoặc đổi tài khoản trên thiết bị dùng chung.
 */

const STATIC_CACHE = "puc-static-v1";
const SHELL_CACHE = "puc-portal-shell-v1";
const MAX_STATIC_ENTRIES = 180;
const NAV_TIMEOUT_MS = 3500;
let shellPurgeEpoch = 0;

const PRECACHE_ASSETS = [
  "/manifest.webmanifest",
  "/note.png",
  "/location-pin.png",
  "/map-pin.png",
  "/photo-camera.png",
  "/video.png",
  "/empty.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxItems) return;
    const excess = keys.length - maxItems;
    for (let i = 0; i < excess; i += 1) {
      await cache.delete(keys[i]);
    }
  } catch {
    // ignore
  }
}

function isStaticAssetPath(pathname) {
  if (pathname.startsWith("/_next/static/")) return true;
  if (
    /^\/(diseases|pesticides|fertilizers|varieties|training|stages|fonts|icons)\//.test(pathname)
  ) {
    return true;
  }
  if (/^\/[^/]+\.(?:png|svg|webp|ico|woff2?)$/i.test(pathname)) {
    return true;
  }
  return false;
}

function isPortalNavigation(request, url) {
  if (request.mode !== "navigate" || request.method !== "GET") return false;
  return url.pathname === "/portal" || url.pathname === "/portal/";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === "basic") {
          cache.put(request, response.clone()).then(() => trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES));
        }
        return response;
      }),
    );
    return;
  }

  if (isPortalNavigation(request, url)) {
    event.respondWith(
      (async () => {
        const navEpoch = shellPurgeEpoch;
        const shellCache = await caches.open(SHELL_CACHE);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
          let response;
          try {
            response = await fetch(request, { signal: controller.signal });
          } finally {
            clearTimeout(timer);
          }
          if (
            navEpoch === shellPurgeEpoch &&
            response &&
            response.status === 200 &&
            response.type === "basic" &&
            (response.headers.get("content-type") || "").includes("text/html")
          ) {
            await shellCache.put("/portal", response.clone());
          }
          return response;
        } catch {
          if (navEpoch !== shellPurgeEpoch) {
            throw new Error("Portal shell invalidated during logout");
          }
          const fallback = (await shellCache.match(request)) || (await shellCache.match("/portal"));
          if (fallback) return fallback;
          throw new Error("Offline and no cached portal shell");
        }
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "CLEAR_AUTH_CACHE") {
    shellPurgeEpoch += 1;
    event.waitUntil(caches.delete(SHELL_CACHE));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "puc-outbox-sync") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: "PUC_SW_SYNC_TRIGGER" });
        }
      }),
    );
  }
});

