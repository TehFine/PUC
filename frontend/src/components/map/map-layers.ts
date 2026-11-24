import type * as Leaflet from "leaflet";

export const MAP_CENTER: Leaflet.LatLngTuple = [13.125, 108.185];
export const MAX_MAP_ZOOM = 22;

const ESRI_HOSTS = ["services", "server"];
const ESRI_REST = "https://services.arcgisonline.com/ArcGIS/rest/services";
const CARTO_SUBDOMAINS = ["a", "b", "c", "d"];
const DARK_ATTRIBUTION = "Bản đồ nền tối © OpenStreetMap, CARTO";
const GOOGLE_SUBDOMAINS = ["0", "1", "2", "3"];
const CUSTOM_SATELLITE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CUSTOM_SATELLITE_TILE_URL ?? "").trim()
    : "";

export interface BaseLayers {
  map: Leaflet.LayerGroup;
  streets: Leaflet.Layer;
  satellite: Leaflet.Layer;
  satelliteGoogle: Leaflet.Layer;
}

export interface SatelliteCaptureInfo {
  dateLabel: string;
  resolutionMeters: number | null;
  sourceName: string | null;
}

interface NetworkConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

export interface SmoothMapZoomHandle {
  zoomBy: (delta: number, focalPoint?: Leaflet.Point) => void;
  cancel: () => void;
  destroy: () => void;
}

interface InternalTouchZoomHandler {
  _moved?: boolean;
  _zooming?: boolean;
  _animRequest?: number;
  _center?: Leaflet.LatLng;
  _zoom?: number;
  _onTouchMove: (e: Event) => void;
  _onTouchEnd: (e?: Event) => void;
}

interface InternalLeafletMap {
  _animatingZoom?: boolean;
  _onZoomTransitionEnd?: () => void;
  _getMapPanePos: () => Leaflet.Point;
  _getNewPixelOrigin: (center: Leaflet.LatLng, zoom?: number) => Leaflet.Point;
  _stop: () => void;
  _moveStart: (zoomChanged: boolean, noMoveStart?: boolean) => void;
  _move: (
    center: Leaflet.LatLng,
    zoom: number,
    data?: { pinch?: boolean; round?: boolean },
    supressEvent?: boolean,
  ) => void;
  _moveEnd: (zoomChanged: boolean) => void;
  _limitZoom: (zoom: number) => number;
  _limitCenter: (
    center: Leaflet.LatLng,
    zoom: number,
    bounds?: Leaflet.LatLngBoundsExpression,
  ) => Leaflet.LatLng;
}

interface InternalCanvasRenderer {
  _map?: Leaflet.Map;
  _container?: HTMLCanvasElement;
  _ctx?: CanvasRenderingContext2D | null;
  _bounds?: Leaflet.Bounds;
  _center?: Leaflet.LatLng;
  _zoom?: number;
  _layers?: Record<string, { _project: () => void; _update: () => void }>;
  _redrawBounds?: Leaflet.Bounds | null;
  _postponeUpdatePaths?: boolean;
  options: { padding: number };
  fire: (type: string) => void;
  _redraw: () => void;
  _updateTransform: (center: Leaflet.LatLng, zoom: number) => void;
}

/**
 * Bộ vẽ vector `<canvas>` không cấp phát lại bộ đệm GPU khi kích thước khung hình không đổi:
 * - Gán `canvas.width` mặc định của Leaflet mỗi lần `moveend` sẽ xóa trắng và tạo lại bộ đệm GPU gây nháy đa giác.
 * - Bản nâng cấp này giữ nguyên bộ đệm `<canvas>` hiện hữu, chỉ `clearRect` + dịch ma trận 2D và tăng `padding = 0.65`
 *   để kéo bản đồ mượt liên tục không bị cắt mảng ranh giới ở mép khung nhìn.
 */
export function createCrispCanvasRenderer(
  L: typeof import("leaflet"),
  padding = 0.65,
): Leaflet.Canvas {
  const renderer = L.canvas({ padding });
  const raw = renderer as unknown as InternalCanvasRenderer;

  (raw as unknown as { _update: () => void })._update = function updateWithoutGpuRealloc(
    this: InternalCanvasRenderer,
  ) {
    const map = this._map;
    if (!map) return;
    const rawMap = map as unknown as InternalLeafletMap;
    if (
      (rawMap._animatingZoom || map.getContainer().classList.contains("is-map-zooming")) &&
      this._bounds
    ) {
      return;
    }

    const p = this.options.padding;
    const size = map.getSize();
    const min = map.containerPointToLayerPoint(size.multiplyBy(-p)).round();
    const b = L.bounds(min, min.add(size.multiplyBy(1 + p * 2)).round());
    this._bounds = b;
    this._center = map.getCenter();
    this._zoom = map.getZoom();

    const container = this._container;
    const ctx = this._ctx;
    if (!container || !ctx || !b.min) return;

    const bSize = b.getSize();
    const m = L.Browser.retina ? 2 : 1;
    const targetW = Math.max(1, m * bSize.x);
    const targetH = Math.max(1, m * bSize.y);

    L.DomUtil.setPosition(container, b.min);

    if (container.width !== targetW || container.height !== targetH) {
      container.width = targetW;
      container.height = targetH;
      container.style.width = `${bSize.x}px`;
      container.style.height = `${bSize.y}px`;
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, targetW, targetH);
    }

    ctx.setTransform(m, 0, 0, m, -b.min.x * m, -b.min.y * m);

    if (this._layers) {
      for (const id in this._layers) {
        this._layers[id]._project();
      }
    }

    this.fire("update");
  };

  return renderer;
}

/**
 * Bộ điều khiển thu phóng mượt 60-120 FPS cho con lăn chuột, bàn di chuột,
 * cử chỉ chụm 2 ngón trên di động và nút Phóng to / Thu nhỏ:
 * - Khóa hoàn toàn việc xóa/tải mảnh giữa chừng (`is-map-zooming`) để GPU phóng mượt lớp ảnh đang có.
 * - Neo cứng tọa độ thực địa ngay dưới mũi trỏ chuột hoặc điểm chụm ngón tay.
 * - Chỉ nạp lớp mảnh mức thu phóng mới một lần duy nhất khi tay vừa dừng hẳn.
 */
export function attachSmoothMapZoom(
  L: typeof import("leaflet"),
  map: Leaflet.Map,
): SmoothMapZoomHandle {
  map.scrollWheelZoom?.disable();
  map.options.zoomSnap = 0;

  const rawMap = map as unknown as InternalLeafletMap;
  const container = map.getContainer();

  let active = false;
  let subpixelActive = false;
  let rafId = 0;
  let currentZoom = map.getZoom();
  let targetZoom = currentZoom;
  let anchorPt: Leaflet.Point | null = null;
  let anchorLatLng: Leaflet.LatLng | null = null;
  let lastFrameMs = 0;
  let lastInputMs = 0;
  let clearZoomClassTimer: ReturnType<typeof setTimeout> | null = null;

  const origGetNewPixelOrigin = rawMap._getNewPixelOrigin.bind(map);
  rawMap._getNewPixelOrigin = (center: Leaflet.LatLng, zoom?: number) => {
    if (!subpixelActive) return origGetNewPixelOrigin(center, zoom);
    const viewHalf = map.getSize().divideBy(2);
    return map.project(center, zoom).subtract(viewHalf).add(rawMap._getMapPanePos());
  };

  const markZoomingStart = (enableSubpixel = false) => {
    if (clearZoomClassTimer !== null) {
      clearTimeout(clearZoomClassTimer);
      clearZoomClassTimer = null;
    }
    if (enableSubpixel) {
      subpixelActive = true;
    }
    container.classList.add("is-map-zooming");
  };

  // Phải gỡ "is-map-zooming" đồng bộ ngay trong pha zoomend (trước khi Leaflet phát moveend tới Canvas và TileLayer),
  // tránh việc Canvas và TileLayer bỏ qua lần vẽ chốt cuối cùng khiến đa giác bị phóng đại nhòe mờ từ mức zoom cũ.
  const markZoomingEnd = () => {
    subpixelActive = false;
    if (clearZoomClassTimer !== null) {
      clearTimeout(clearZoomClassTimer);
      clearZoomClassTimer = null;
    }
    container.classList.remove("is-map-zooming");
  };

  const computeAnchoredCenter = (zoom: number): Leaflet.LatLng => {
    if (!anchorPt || !anchorLatLng) return map.getCenter();
    const centerPt = map.getSize().divideBy(2);
    const offsetFromCenter = anchorPt.subtract(centerPt);
    const projectedAnchor = map.project(anchorLatLng, zoom);
    const rawCenter = map.unproject(projectedAnchor.subtract(offsetFromCenter), zoom);
    return rawMap._limitCenter(rawCenter, zoom, map.options.maxBounds);
  };

  const settleContinuousZoom = (finalCenter: Leaflet.LatLng, finalZoom: number) => {
    subpixelActive = false;
    container.classList.remove("is-map-zooming");
    if (clearZoomClassTimer !== null) {
      clearTimeout(clearZoomClassTimer);
      clearZoomClassTimer = null;
    }
    const clampedZoom = rawMap._limitZoom(finalZoom);
    const clampedCenter = rawMap._limitCenter(finalCenter, clampedZoom, map.options.maxBounds);
    const wasSameZoom = map.getZoom() === clampedZoom;
    rawMap._move(clampedCenter, clampedZoom);
    if (wasSameZoom) {
      map.fire("zoom");
    }
    rawMap._moveEnd(true);
  };

  const touchZoomHandler = map.touchZoom as unknown as InternalTouchZoomHandler | undefined;
  if (touchZoomHandler && typeof touchZoomHandler._onTouchMove === "function") {
    touchZoomHandler._onTouchEnd = function onSmoothTouchEnd(this: InternalTouchZoomHandler) {
      if (!this._moved || !this._zooming) {
        this._zooming = false;
        markZoomingEnd();
        return;
      }
      this._zooming = false;
      if (this._animRequest) {
        L.Util.cancelAnimFrame(this._animRequest);
      }
      L.DomEvent.off(
        document as unknown as HTMLElement,
        "touchmove",
        this._onTouchMove as unknown as Leaflet.DomEvent.EventHandlerFn,
        this,
      );
      L.DomEvent.off(
        document as unknown as HTMLElement,
        "touchend touchcancel",
        this._onTouchEnd as unknown as Leaflet.DomEvent.EventHandlerFn,
        this,
      );
      const nextZoom = rawMap._limitZoom(this._zoom ?? map.getZoom());
      const nextCenter = this._center ?? map.getCenter();
      settleContinuousZoom(nextCenter, nextZoom);
    };
  }

  const step = (now: number) => {
    rafId = 0;
    if (!active) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameMs) / 1000));
    lastFrameMs = now;

    const diff = targetZoom - currentZoom;
    const idleMs = now - lastInputMs;

    if (Math.abs(diff) <= 0.0015 && idleMs >= 68) {
      active = false;
      currentZoom = targetZoom;
      const finalCenter = computeAnchoredCenter(currentZoom);
      settleContinuousZoom(finalCenter, currentZoom);
      anchorPt = null;
      anchorLatLng = null;
      return;
    }

    const alpha = 1 - Math.exp(-18 * dt);
    const nextZoom = Math.abs(diff) <= 0.0007 ? targetZoom : currentZoom + diff * alpha;
    if (Math.abs(nextZoom - currentZoom) > 0.00004) {
      currentZoom = nextZoom;
      const stepCenter = computeAnchoredCenter(currentZoom);
      rawMap._move(stepCenter, currentZoom, { pinch: true, round: false });
    }

    rafId = window.requestAnimationFrame(step);
  };

  const scheduleGlide = (deltaZoom: number, focalPt: Leaflet.Point) => {
    if (!Number.isFinite(deltaZoom) || deltaZoom === 0) return;

    if (rawMap._animatingZoom) {
      rawMap._onZoomTransitionEnd?.();
    }

    const now = performance.now();
    lastInputMs = now;

    if (!active) {
      rawMap._stop();
      currentZoom = map.getZoom();
      targetZoom = currentZoom;
      anchorPt = focalPt;
      anchorLatLng = map.containerPointToLatLng(focalPt);
      const nextTarget = rawMap._limitZoom(targetZoom + deltaZoom);
      if (Math.abs(nextTarget - currentZoom) < 0.0001) return;
      targetZoom = nextTarget;
      active = true;
      lastFrameMs = now;
      markZoomingStart(true);
      rawMap._moveStart(true, false);
      rafId = window.requestAnimationFrame(step);
      return;
    }

    if (!anchorPt || anchorPt.distanceTo(focalPt) > 2.5) {
      anchorPt = focalPt;
      anchorLatLng = map.containerPointToLatLng(focalPt);
    }
    targetZoom = rawMap._limitZoom(targetZoom + deltaZoom);
    if (!rafId) {
      lastFrameMs = now;
      rafId = window.requestAnimationFrame(step);
    }
  };

  const cancel = () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (active) {
      active = false;
      const finalCenter = computeAnchoredCenter(currentZoom);
      settleContinuousZoom(finalCenter, currentZoom);
    }
    anchorPt = null;
    anchorLatLng = null;
  };

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    ev.stopPropagation();

    let dy = ev.deltaY;
    if (ev.deltaMode === 1) dy *= 32;
    else if (ev.deltaMode === 2) dy *= 320;
    if (dy === 0) return;

    const sensitivity = ev.ctrlKey ? 0.01 : 0.0022;
    const deltaZoom = Math.max(-1.4, Math.min(1.4, -dy * sensitivity));
    const rect = container.getBoundingClientRect();
    const focalPt = L.point(ev.clientX - rect.left, ev.clientY - rect.top);
    scheduleGlide(deltaZoom, focalPt);
  };

  const onPointerInterrupt = (ev: MouseEvent | TouchEvent) => {
    if (active) {
      cancel();
    }
    if ("touches" in ev && ev.touches.length >= 2) {
      markZoomingStart(true);
    }
  };

  const onMapZoomStart = () => {
    if (active) markZoomingStart(true);
  };
  const onMapZoomEnd = () => {
    if (!active) markZoomingEnd();
  };

  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("mousedown", onPointerInterrupt, { passive: true });
  container.addEventListener("touchstart", onPointerInterrupt, { passive: true });
  map.on("zoomstart", onMapZoomStart);
  map.on("zoomend", onMapZoomEnd);

  return {
    zoomBy: (delta: number, focalPoint?: Leaflet.Point) => {
      const pt = focalPoint ?? map.getSize().divideBy(2);
      scheduleGlide(delta, pt);
    },
    cancel,
    destroy: () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      active = false;
      subpixelActive = false;
      rawMap._getNewPixelOrigin = origGetNewPixelOrigin;
      if (clearZoomClassTimer !== null) {
        clearTimeout(clearZoomClassTimer);
        clearZoomClassTimer = null;
      }
      container.classList.remove("is-map-zooming");
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onPointerInterrupt);
      container.removeEventListener("touchstart", onPointerInterrupt);
      map.off("zoomstart", onMapZoomStart);
      map.off("zoomend", onMapZoomEnd);
    },
  };
}

let preconnected = false;

/**
 * Kho giữ tham chiếu ảnh mảnh đã giải mã trong RAM (`MemoryCache` của trình duyệt):
 * Khi Leaflet tháo thẻ `<img>` ở mức zoom cũ, trình duyệt vẫn giữ nguyên bitmap đã giải mã trong bộ nhớ
 * nhờ tham chiếu tại đây, giúp phóng ra/vào lại cùng khu vực hiển thị tức thì 0ms không chớp nháy.
 */
const pinnedTileVault = new Map<string, HTMLImageElement>();
const MAX_PINNED_TILES_DESKTOP = 220;
const MAX_PINNED_TILES_MOBILE = 110;

function pinDecodedTileUrl(url: string): void {
  if (!url || url.startsWith("data:")) return;
  const existing = pinnedTileVault.get(url);
  if (existing) {
    pinnedTileVault.delete(url);
    pinnedTileVault.set(url, existing);
    return;
  }
  const limit = isCoarseTouchDevice() ? MAX_PINNED_TILES_MOBILE : MAX_PINNED_TILES_DESKTOP;
  while (pinnedTileVault.size >= limit) {
    const oldestKey = pinnedTileVault.keys().next().value;
    if (!oldestKey) break;
    pinnedTileVault.delete(oldestKey);
  }
  const holder = new Image();
  holder.crossOrigin = "anonymous";
  holder.decoding = "async";
  holder.src = url;
  pinnedTileVault.set(url, holder);
}

export function isDataSaverNetwork(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: NetworkConnectionLike }).connection;
  if (!conn) return false;
  if (conn.saveData === true) return true;
  return conn.effectiveType === "2g" || conn.effectiveType === "slow-2g";
}

export function getHiDpiScaleParam(forceLowRes = false): string {
  if (forceLowRes || isDataSaverNetwork()) return "";
  return "&scale=2";
}

export function preconnectMapTileOrigins(options?: { chinaSafe?: boolean }): void {
  if (typeof document === "undefined") return;
  const chinaSafe = Boolean(options?.chinaSafe);
  if (preconnected && !chinaSafe) return;
  if (!chinaSafe) {
    preconnected = true;
  }
  const origins = chinaSafe
    ? [
        "https://services.arcgisonline.com",
        "https://server.arcgisonline.com",
        "https://a.basemaps.cartocdn.com",
        "https://b.basemaps.cartocdn.com",
      ]
    : [
        "https://services.arcgisonline.com",
        "https://server.arcgisonline.com",
        "https://a.basemaps.cartocdn.com",
        "https://b.basemaps.cartocdn.com",
        "https://mt0.google.com",
        "https://mt1.google.com",
        "https://mt2.google.com",
        "https://mt3.google.com",
      ];
  const head = document.head;
  if (!head) return;
  for (const href of origins) {
    if (head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    head.appendChild(link);
  }
}

/**
 * Nạp trước và giải mã sẵn mảnh vệ tinh quanh tọa độ mục tiêu vào kho RAM trình duyệt.
 */
export function warmSatelliteTilesAt(
  lat: number,
  lng: number,
  zoom = 17,
  options?: { chinaSafe?: boolean },
): void {
  if (typeof window === "undefined" || isDataSaverNetwork()) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  preconnectMapTileOrigins(options);

  // 1. Mảnh Esri World Imagery (256px, CDN ~30ms)
  const zEsri = Math.max(10, Math.min(18, Math.round(zoom)));
  const nEsri = 2 ** zEsri;
  const cxEsri = Math.floor(((lng + 180) / 360) * nEsri);
  const latRad = (lat * Math.PI) / 180;
  const cyEsri = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * nEsri,
  );

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = cxEsri + dx;
      const y = cyEsri + dy;
      if (x < 0 || y < 0 || x >= nEsri || y >= nEsri) continue;
      const host = ESRI_HOSTS[Math.abs(x + y) % ESRI_HOSTS.length];
      pinDecodedTileUrl(
        `https://${host}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zEsri}/${y}/${x}`,
      );
    }
  }
}

const captureInfoCache = new Map<string, Promise<SatelliteCaptureInfo | null>>();

/**
 * Truy vấn ngày chụp ảnh vệ tinh thực tế tại vị trí vùng trồng từ siêu dữ liệu Esri Maxar Vivid.
 * Kết quả được lưu đệm theo ô lưới ~2km để không gọi lại mạng khi người dùng lia nhẹ bản đồ.
 */
export function fetchSatelliteCaptureInfo(
  lat: number,
  lng: number,
): Promise<SatelliteCaptureInfo | null> {
  if (typeof window === "undefined" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Promise.resolve(null);
  }
  const key = `${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = captureInfoCache.get(key);
  if (cached) return cached;

  const queryUrl =
    `${ESRI_REST}/World_Imagery/MapServer/4/query` +
    `?geometry=${encodeURIComponent(`${lng.toFixed(5)},${lat.toFixed(5)}`)}` +
    "&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects" +
    "&outFields=SRC_DATE,SRC_RES,NICE_NAME,NICE_DESC&returnGeometry=false&f=json";

  const req = fetch(queryUrl, { mode: "cors", credentials: "omit" })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as {
        features?: Array<{
          attributes?: {
            SRC_DATE?: number | null;
            SRC_RES?: number | null;
            NICE_NAME?: string | null;
            NICE_DESC?: string | null;
          };
        }>;
      };
      const best = (data.features ?? [])
        .map((f) => f.attributes)
        .filter((a): a is NonNullable<typeof a> => Boolean(a && a.SRC_DATE))
        .sort((a, b) => Number(b.SRC_DATE ?? 0) - Number(a.SRC_DATE ?? 0))[0];

      if (!best || !best.SRC_DATE) return null;
      const raw = String(best.SRC_DATE);
      if (raw.length !== 8) return null;
      const yyyy = raw.slice(0, 4);
      const mm = raw.slice(4, 6);
      const dd = raw.slice(6, 8);
      return {
        dateLabel: `${dd}/${mm}/${yyyy}`,
        resolutionMeters:
          typeof best.SRC_RES === "number" && Number.isFinite(best.SRC_RES)
            ? Number(best.SRC_RES.toFixed(2))
            : null,
        sourceName: best.NICE_DESC || best.NICE_NAME || null,
      };
    })
    .catch(() => null);

  captureInfoCache.set(key, req);
  return req;
}

interface InternalTileRecord {
  el: HTMLImageElement;
  coords: Leaflet.Coords;
  current: boolean;
  loaded?: number;
  active?: boolean;
  retain?: boolean;
}

interface InternalTileLevel {
  el: HTMLElement;
  origin: Leaflet.Point;
  zoom: number;
}

interface TileLayerWithInternals {
  _map?: Leaflet.Map;
  _url: string;
  _tiles: Record<string, InternalTileRecord>;
  _levels: Record<number, InternalTileLevel>;
  _tileZoom?: number;
  _loading?: boolean;
  _fadeFrame?: number;
  options: Leaflet.TileLayerOptions;
  getTileUrl(coords: Leaflet.Coords): string;
  createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback): HTMLElement;
  _onMoveEnd?: () => void;
  _pruneTiles?: () => void;
  _removeTile?: (key: string) => void;
  _removeAllTiles?: () => void;
  _tileReady?: (coords: Leaflet.Coords, err: Error | null, tile: HTMLImageElement) => void;
  _updateOpacity?: () => void;
  _noTilesToLoad?: () => boolean;
  _keyToTileCoords?: (key: string) => Leaflet.Coords;
  _setZoomTransform?: (level: InternalTileLevel, center: Leaflet.LatLng, zoom: number) => void;
  fire: (type: string, data?: Record<string, unknown>) => void;
}

const EMPTY_IMAGE_URL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Nâng cấp toàn diện vòng đời mảnh bản đồ (`TileLayer`) chống giật nháy mảng lớn:
 * 1. Giải mã ảnh ngoài luồng giao diện (`img.decode()`) TRƯỚC KHI báo `done()`, đảm bảo mảnh nền cũ
 *    không bao giờ bị xóa khi mảnh mới chưa giải mã xong trên GPU.
 * 2. Hiển thị tức thì trong cùng khung hình (`opacity: 1`, không chớp mờ) nếu mảnh đã có sẵn trong RAM cache.
 * 3. Khóa việc cập nhật/cắt tỉa lưới mảnh trong suốt lúc đang thu phóng liên tục (`is-map-zooming`).
 * 4. Thuật toán giữ mảnh cha/con đa tầng độ phức tạp `O(N)` theo phép dịch bit: dù nhảy phóng xa (`Z13 -> Z20`
 *    hay `Z20 -> Z13`), toàn bộ ảnh nền đã tải vẫn nằm lót bên dưới cho đến khi ảnh mới nét 100%, không hở mảng tối.
 */
function enhanceSeamlessTileLayer(
  L: typeof import("leaflet"),
  layer: Leaflet.TileLayer,
): Leaflet.TileLayer {
  const internal = layer as unknown as TileLayerWithInternals;
  const origOnMoveEnd = internal._onMoveEnd?.bind(layer);
  const origTileReady = internal._tileReady?.bind(layer);

  internal.createTile = function createDecodedTile(
    this: TileLayerWithInternals,
    coords: Leaflet.Coords,
    done: Leaflet.DoneCallback,
  ): HTMLElement {
    const tile = document.createElement("img");
    tile.alt = "";
    tile.decoding = "async";

    if (this.options.crossOrigin || this.options.crossOrigin === "") {
      tile.crossOrigin = this.options.crossOrigin === true ? "" : String(this.options.crossOrigin);
    }
    if (typeof this.options.referrerPolicy === "string") {
      tile.referrerPolicy = this.options.referrerPolicy;
    }

    const url = this.getTileUrl(coords);
    let settled = false;

    const finish = (err?: Error | null) => {
      if (settled) return;
      settled = true;
      tile.onload = null;
      tile.onerror = null;
      if (!err) {
        pinDecodedTileUrl(url);
      }
      done(err ?? undefined, tile);
    };

    tile.onload = () => {
      if (typeof tile.decode === "function") {
        tile.decode().then(
          () => finish(null),
          () => finish(null),
        );
      } else {
        finish(null);
      }
    };

    tile.onerror = () => {
      const errorUrl = this.options.errorTileUrl;
      if (errorUrl && tile.getAttribute("src") !== errorUrl) {
        tile.src = errorUrl;
        return;
      }
      finish(new Error("Tile load failed"));
    };

    tile.src = url;

    // Nếu mảnh đã nằm sẵn trong bộ nhớ đệm trình duyệt, xuất hiện tức thì ở độ mờ 1.0 không cần fade-in
    if (tile.complete && tile.naturalWidth > 0) {
      settled = true;
      tile.onload = null;
      tile.onerror = null;
      tile.dataset.instant = "1";
      pinDecodedTileUrl(url);
      queueMicrotask(() => {
        done(undefined, tile);
      });
    }

    return tile;
  };

  internal._tileReady = function onDecodedTileReady(
    this: TileLayerWithInternals,
    coords: Leaflet.Coords,
    err: Error | null,
    tileEl: HTMLImageElement,
  ) {
    if (!this._map || (tileEl && tileEl.getAttribute("src") === EMPTY_IMAGE_URL)) {
      return;
    }
    if (!err && tileEl?.dataset.instant === "1") {
      const key = `${coords.x}:${coords.y}:${coords.z}`;
      const record = this._tiles[key];
      if (record) {
        record.loaded = Date.now() - 1000;
        record.active = true;
        record.el.style.opacity = "1";
        L.DomUtil.addClass(record.el, "leaflet-tile-loaded");
        this.fire("tileload", { tile: record.el, coords });
        if (this._noTilesToLoad?.()) {
          this._loading = false;
          this.fire("load");
          window.requestAnimationFrame(() => {
            this._pruneTiles?.();
          });
        }
        return;
      }
    }
    origTileReady?.(coords, err, tileEl);
  };

  internal._onMoveEnd = function onGuardedMoveEnd(this: TileLayerWithInternals) {
    const map = this._map;
    if (!map) return;
    if (
      (map as unknown as InternalLeafletMap)._animatingZoom ||
      map.getContainer().classList.contains("is-map-zooming")
    ) {
      return;
    }
    origOnMoveEnd?.();
  };

  internal._removeTile = function removeTileSafely(this: TileLayerWithInternals, key: string) {
    const tile = this._tiles[key];
    if (!tile) return;

    // Chỉ gán ảnh rỗng để hủy kết nối HTTP nếu mảnh chưa tải xong;
    // nếu mảnh đã tải xong thì tháo trực tiếp khỏi DOM để giữ nguyên bitmap giải mã trong RAM trình duyệt!
    if (!tile.loaded) {
      tile.el.onload = null;
      tile.el.onerror = null;
      tile.el.setAttribute("src", EMPTY_IMAGE_URL);
    }

    L.DomUtil.remove(tile.el);
    delete this._tiles[key];
    this.fire("tileunload", {
      tile: tile.el,
      coords: this._keyToTileCoords ? this._keyToTileCoords(key) : tile.coords,
    });
  };

  internal._pruneTiles = function pruneTilesWithFullBackdropRetention(
    this: TileLayerWithInternals,
  ) {
    const map = this._map;
    if (!map) return;

    // Đang phóng hoặc chụm ngón tay: tuyệt đối không xóa mảnh nào để tránh hở mảng tối
    if (
      (map as unknown as InternalLeafletMap)._animatingZoom ||
      map.getContainer().classList.contains("is-map-zooming")
    ) {
      return;
    }

    const zoom = map.getZoom();
    const maxZ = this.options.maxZoom ?? MAX_MAP_ZOOM;
    const minZ = this.options.minZoom ?? 0;
    if (zoom > maxZ || zoom < minZ) {
      this._removeAllTiles?.();
      return;
    }

    const tiles = this._tiles;
    const pendingCurrent: Leaflet.Coords[] = [];

    for (const key in tiles) {
      const tile = tiles[key];
      tile.retain = tile.current;
      if (tile.current && !tile.active) {
        pendingCurrent.push(tile.coords);
      }
    }

    // Nếu vẫn còn ít nhất 1 ô ở mức thu phóng mới chưa giải mã & hiển thị xong (`!tile.active`),
    // giữ lại chính xác các mảnh cha (mọi độ sâu) và mảnh con đã tải xong nằm dưới ô đó!
    if (pendingCurrent.length > 0) {
      let retainedBackdropCount = 0;
      const maxRetainedBackdrops = 96;

      for (const key in tiles) {
        if (retainedBackdropCount >= maxRetainedBackdrops) break;
        const candidate = tiles[key];
        if (candidate.retain || !candidate.loaded) continue;

        const cz = candidate.coords.z;
        const cx = candidate.coords.x;
        const cy = candidate.coords.y;

        for (let i = 0; i < pendingCurrent.length; i += 1) {
          const target = pendingCurrent[i];
          const tz = target.z;
          if (cz === tz) continue;

          if (cz < tz) {
            const scale = 2 ** (tz - cz);
            if (Math.floor(target.x / scale) === cx && Math.floor(target.y / scale) === cy) {
              candidate.retain = true;
              retainedBackdropCount += 1;
              break;
            }
          } else {
            const scale = 2 ** (cz - tz);
            if (Math.floor(cx / scale) === target.x && Math.floor(cy / scale) === target.y) {
              candidate.retain = true;
              retainedBackdropCount += 1;
              break;
            }
          }
        }
      }
    }

    for (const key in tiles) {
      if (!tiles[key].retain) {
        this._removeTile?.(key);
      }
    }
  };

  internal._setZoomTransform = function setSubpixelZoomTransform(
    this: TileLayerWithInternals,
    level: InternalTileLevel,
    center: Leaflet.LatLng,
    zoom: number,
  ) {
    const map = this._map;
    if (!map) return;
    const scale = map.getZoomScale(zoom, level.zoom);
    const origin = (map as unknown as InternalLeafletMap)._getNewPixelOrigin(center, zoom);
    const rawTranslate = level.origin.multiplyBy(scale).subtract(origin);
    const translate = map.getContainer().classList.contains("is-map-zooming")
      ? rawTranslate
      : rawTranslate.round();
    L.DomUtil.setTransform(level.el, translate, scale);
  };

  return layer;
}

function isCoarseTouchDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function buildTilePerfOptions(
  _lowEnd: boolean,
  nativeMax: number,
  targetMax: number = MAX_MAP_ZOOM,
  keepBufferOverride?: number,
): Leaflet.TileLayerOptions {
  const dataSaver = isDataSaverNetwork();
  const coarseTouch = isCoarseTouchDevice();
  return {
    maxNativeZoom: nativeMax,
    maxZoom: targetMax,
    keepBuffer: keepBufferOverride ?? (dataSaver ? 1 : coarseTouch ? 2 : 3),
    updateWhenIdle: true,
    updateWhenZooming: false,
    updateInterval: 150,
    crossOrigin: "anonymous",
  };
}

/**
 * Tạo lưới mảnh Google chuẩn 512px (`tileSize: 512, zoomOffset: -1` + `&scale=2`):
 * giảm 75% số lượng request HTTP và thẻ `<img>` trên mỗi khung hình so với lưới 256px cũ
 * nhưng giữ nguyên 100% độ phân giải điểm ảnh gốc tới Z22.
 */
function buildGoogle512TileOptions(
  lowEnd: boolean,
  targetMax: number = MAX_MAP_ZOOM,
  keepBufferOverride?: number,
): { scaleParam: string; tileOpts: Leaflet.TileLayerOptions } {
  const dataSaver = isDataSaverNetwork();
  if (dataSaver) {
    return {
      scaleParam: "",
      tileOpts: {
        ...buildTilePerfOptions(lowEnd, 21, targetMax, keepBufferOverride ?? 1),
        tileSize: 256,
        zoomOffset: 0,
      },
    };
  }
  return {
    scaleParam: "&scale=2",
    tileOpts: {
      ...buildTilePerfOptions(lowEnd, 22, targetMax, keepBufferOverride ?? 2),
      minZoom: 8,
      minNativeZoom: 9,
      tileSize: 512,
      zoomOffset: -1,
    },
  };
}

/**
 * Lớp ảnh vệ tinh mới nhất (Esri World Imagery - Vantor/Maxar Vivid 0.34m cập nhật mới nhất tại Tây Nguyên,
 * tải siêu tốc ~13KB/mảnh từ Edge CDN) kết hợp lớp nhãn đường liên thôn và địa danh tiếng Việt sắc nét.
 * Nếu hệ thống có cấu hình `NEXT_PUBLIC_CUSTOM_SATELLITE_TILE_URL` (ảnh bay chụp Drone/UAV hoặc Mapbox),
 * tự động ưu tiên nguồn tùy chỉnh đó.
 */
export function createLatestSatelliteLayer(
  L: typeof import("leaflet"),
  lowEnd = false,
  targetMax: number = MAX_MAP_ZOOM,
  keepBufferOverride?: number,
  options?: { chinaSafe?: boolean },
): Leaflet.Layer {
  if (CUSTOM_SATELLITE_URL) {
    return enhanceSeamlessTileLayer(
      L,
      L.tileLayer(CUSTOM_SATELLITE_URL, {
        attribution: "Ảnh vệ tinh thực địa cập nhật mới nhất",
        ...buildTilePerfOptions(lowEnd, 21, targetMax, keepBufferOverride),
      }),
    );
  }

  const esriImagery = enhanceSeamlessTileLayer(
    L,
    L.tileLayer(
      "https://{s}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        subdomains: ESRI_HOSTS,
        attribution: "Ảnh vệ tinh Maxar Vivid © Esri",
        ...buildTilePerfOptions(lowEnd, 18, targetMax, keepBufferOverride),
      },
    ),
  );

  if (options?.chinaSafe) {
    return esriImagery;
  }

  const { scaleParam, tileOpts } = buildGoogle512TileOptions(lowEnd, targetMax, keepBufferOverride);
  const vnHybridLabels = enhanceSeamlessTileLayer(
    L,
    L.tileLayer(`https://mt{s}.google.com/vt/lyrs=h&hl=vi&x={x}&y={y}&z={z}${scaleParam}`, {
      subdomains: GOOGLE_SUBDOMAINS,
      attribution: "Nhãn địa danh © Google",
      ...tileOpts,
      zIndex: 5,
    }),
  );

  return L.layerGroup([esriImagery, vnHybridLabels]);
}

/**
 * Lớp ảnh vệ tinh Google Hybrid 512px (`lyrs=y`) hỗ trợ phóng sâu tán cây tới Z22.
 */
export function createGoogleSatelliteLayer(
  L: typeof import("leaflet"),
  lowEnd = false,
  targetMax: number = MAX_MAP_ZOOM,
  keepBufferOverride?: number,
): Leaflet.TileLayer {
  const { scaleParam, tileOpts } = buildGoogle512TileOptions(lowEnd, targetMax, keepBufferOverride);
  const layer = L.tileLayer(
    `https://mt{s}.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}${scaleParam}`,
    {
      subdomains: GOOGLE_SUBDOMAINS,
      attribution: "Ảnh vệ tinh và Bản đồ © Google",
      ...tileOpts,
    },
  );
  return enhanceSeamlessTileLayer(L, layer);
}

export function createGoogleStreetsLayer(
  L: typeof import("leaflet"),
  lowEnd = false,
  targetMax: number = MAX_MAP_ZOOM,
): Leaflet.TileLayer {
  const { scaleParam, tileOpts } = buildGoogle512TileOptions(lowEnd, targetMax);
  const layer = L.tileLayer(
    `https://mt{s}.google.com/vt/lyrs=p&hl=vi&x={x}&y={y}&z={z}${scaleParam}`,
    {
      subdomains: GOOGLE_SUBDOMAINS,
      attribution: "Bản đồ địa hình và giao thông © Google",
      ...tileOpts,
    },
  );
  return enhanceSeamlessTileLayer(L, layer);
}

export function createBaseLayers(L: typeof import("leaflet")): BaseLayers {
  const dataSaver = isDataSaverNetwork();

  // 1. Nền tối tương phản cao: CARTO Dark Matter (@2x Retina tới Z19, không bao giờ lỗi "Map data not available"
  // tại nông thôn Tây Nguyên) kết hợp lớp đường liên thôn và địa danh tiếng Việt sắc nét tới Z22.
  const darkScaleSuffix = dataSaver ? "" : "@2x";
  const darkBase = enhanceSeamlessTileLayer(
    L,
    L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}${darkScaleSuffix}.png`,
      {
        subdomains: CARTO_SUBDOMAINS,
        attribution: DARK_ATTRIBUTION,
        ...buildTilePerfOptions(dataSaver, 19, MAX_MAP_ZOOM),
      },
    ),
  );
  const { scaleParam: darkLabelScale, tileOpts: darkLabelOpts } = buildGoogle512TileOptions(
    dataSaver,
    MAX_MAP_ZOOM,
  );
  const darkReference = enhanceSeamlessTileLayer(
    L,
    L.tileLayer(
      `https://mt{s}.google.com/vt/lyrs=h&hl=vi&x={x}&y={y}&z={z}${darkLabelScale}`,
      {
        subdomains: GOOGLE_SUBDOMAINS,
        attribution: "Nhãn địa danh © Google",
        ...darkLabelOpts,
        zIndex: 5,
      },
    ),
  );

  // 2. Bản đồ địa hình và giao thông chi tiết tiếng Việt (512x512)
  const streets = createGoogleStreetsLayer(L, dataSaver, MAX_MAP_ZOOM);

  // 3. Ảnh vệ tinh mới nhất (Esri Maxar Vivid cập nhật mới nhất + nhãn tiếng Việt)
  const satellite = createLatestSatelliteLayer(L, dataSaver, MAX_MAP_ZOOM);

  // 4. Ảnh vệ tinh Google Hybrid phóng sâu Z22
  const satelliteGoogle = createGoogleSatelliteLayer(L, dataSaver, MAX_MAP_ZOOM);

  return {
    map: L.layerGroup([darkBase, darkReference]),
    streets,
    satellite,
    satelliteGoogle,
  };
}
