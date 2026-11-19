import type * as Leaflet from "leaflet";

export const MAP_CENTER: Leaflet.LatLngTuple = [13.125, 108.185];
export const MAX_MAP_ZOOM = 22;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const DARK_ATTRIBUTION = "Tiles © Esri, HERE, Garmin";
const GOOGLE_SUBDOMAINS = ["0", "1", "2", "3"];

export interface BaseLayers {
  map: Leaflet.LayerGroup;
  streets: Leaflet.Layer;
  satellite: Leaflet.Layer;
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

/**
 * Dựng bộ vẽ vector `<canvas>` gọn nhẹ (Retina 2x gốc của Leaflet, vùng đệm `0.25` vừa khít)
 * tránh cấp phát lại bộ đệm hàng trăm MB mỗi lần kết thúc thu phóng.
 */
export function createCrispCanvasRenderer(
  L: typeof import("leaflet"),
  padding = 0.25,
): Leaflet.Canvas {
  return L.canvas({ padding });
}

/**
 * Bộ điều khiển thu phóng mượt chuẩn 60-120 FPS cho con lăn chuột, bàn di chuột (trackpad),
 * cử chỉ chụm 2 ngón trên di động và nút Phóng to / Thu nhỏ:
 * - Loại bỏ hoàn toàn cơ chế khóa cứng 250ms (`_animatingZoom`) làm rơi nhịp lăn chuột và giật cục của Leaflet.
 * - Neo cứng tọa độ thực địa ngay dưới mũi trỏ chuột không lệch 1 pixel trong suốt quá trình phóng.
 * - Chốt nét 1 lần duy nhất khi dừng tay (giữ nguyên lớp mảnh cha/con bên dưới, không chớp trắng).
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

  // Khử rung lăn tăn ±2px của Leaflet do làm tròn kép (`_round()`) khi thu phóng liên tục ở mức lẻ
  const origGetNewPixelOrigin = rawMap._getNewPixelOrigin.bind(map);
  rawMap._getNewPixelOrigin = (center: Leaflet.LatLng, zoom?: number) => {
    if (!subpixelActive) return origGetNewPixelOrigin(center, zoom);
    const viewHalf = map.getSize().divideBy(2);
    return map.project(center, zoom).subtract(viewHalf).add(rawMap._getMapPanePos());
  };

  const markZoomingStart = () => {
    if (clearZoomClassTimer !== null) {
      clearTimeout(clearZoomClassTimer);
      clearZoomClassTimer = null;
    }
    subpixelActive = true;
    container.classList.add("is-map-zooming");
  };

  const markZoomingEnd = () => {
    subpixelActive = false;
    if (clearZoomClassTimer !== null) clearTimeout(clearZoomClassTimer);
    clearZoomClassTimer = setTimeout(() => {
      clearZoomClassTimer = null;
      container.classList.remove("is-map-zooming");
    }, 65);
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
    const clampedZoom = rawMap._limitZoom(finalZoom);
    const clampedCenter = rawMap._limitCenter(finalCenter, clampedZoom, map.options.maxBounds);
    const wasSameZoom = map.getZoom() === clampedZoom;
    rawMap._move(clampedCenter, clampedZoom);
    if (wasSameZoom) {
      map.fire("zoom");
    }
    rawMap._moveEnd(true);
    markZoomingEnd();
  };

  // Loại bỏ cú nảy 250ms (`_animateZoom`) ở cuối cử chỉ chụm 2 ngón trên điện thoại để có thể chụm liên tiếp tức thì
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

    if (Math.abs(diff) <= 0.0018 && idleMs >= 85) {
      active = false;
      currentZoom = targetZoom;
      const finalCenter = computeAnchoredCenter(currentZoom);
      settleContinuousZoom(finalCenter, currentZoom);
      anchorPt = null;
      anchorLatLng = null;
      return;
    }

    const alpha = 1 - Math.exp(-20 * dt);
    const nextZoom =
      Math.abs(diff) <= 0.0008 ? targetZoom : currentZoom + diff * alpha;
    if (Math.abs(nextZoom - currentZoom) > 0.00005) {
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
      markZoomingStart();
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

    const sensitivity = ev.ctrlKey ? 0.0105 : 0.0023;
    const deltaZoom = Math.max(-1.5, Math.min(1.5, -dy * sensitivity));
    const rect = container.getBoundingClientRect();
    const focalPt = L.point(ev.clientX - rect.left, ev.clientY - rect.top);
    scheduleGlide(deltaZoom, focalPt);
  };

  const onPointerInterrupt = (ev: MouseEvent | TouchEvent) => {
    if (active) {
      cancel();
    }
    if ("touches" in ev && ev.touches.length >= 2) {
      markZoomingStart();
    }
  };

  const onMapZoomStart = () => markZoomingStart();
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
const warmedTileUrls = new Set<string>();
const MAX_WARMED_URLS = 180;

/**
 * Chỉ giảm độ phân giải mảnh bản đồ khi người dùng chủ động bật Tiết kiệm dữ liệu (Save-Data)
 * hoặc đang đứng ở vùng sóng 2G cực yếu; mọi điện thoại 3G/4G/5G/Wi-Fi và màn hình máy tính
 * đều nhận mảnh 512x512 (`&scale=2`) siêu nét (4x mật độ điểm ảnh, chống mờ ở cả mức zoom lẻ 17.25 / 17.5).
 */
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

/**
 * Mở sẵn kết nối DNS + TCP + TLS (HTTP/2 & HTTP/3) tới cả 4 cụm máy chủ ảnh vệ tinh Google
 * để loại bỏ 200–350ms độ trễ bắt tay mạng lần đầu.
 */
export function preconnectMapTileOrigins(): void {
  if (preconnected || typeof document === "undefined") return;
  preconnected = true;
  const origins = [
    "https://mt0.google.com",
    "https://mt1.google.com",
    "https://mt2.google.com",
    "https://mt3.google.com",
    "https://server.arcgisonline.com",
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
 * Nạp trước lưới mảnh vệ tinh 3x3 quanh tọa độ mục tiêu vào bộ nhớ đệm RAM trình duyệt
 * (giải mã bất đồng bộ ngoài luồng giao diện) ngay khi rê chuột / chạm nhẹ hoặc lúc rảnh.
 */
export function warmSatelliteTilesAt(lat: number, lng: number, zoom = 17): void {
  if (typeof window === "undefined" || isDataSaverNetwork()) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  preconnectMapTileOrigins();

  const z = Math.max(10, Math.min(20, Math.round(zoom)));
  const n = 2 ** z;
  const centerX = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const centerY = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  const scale = getHiDpiScaleParam(false);

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const sub = GOOGLE_SUBDOMAINS[Math.abs(x + y) % GOOGLE_SUBDOMAINS.length];
      const url = `https://mt${sub}.google.com/vt/lyrs=y&hl=vi&x=${x}&y=${y}&z=${z}${scale}`;
      if (warmedTileUrls.has(url)) continue;
      if (warmedTileUrls.size >= MAX_WARMED_URLS) {
        const oldest = warmedTileUrls.values().next().value;
        if (oldest) warmedTileUrls.delete(oldest);
      }
      warmedTileUrls.add(url);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = url;
    }
  }
}

interface InternalTileLevel {
  el: HTMLElement;
  origin: Leaflet.Point;
  zoom: number;
}

interface TileLayerWithInternals {
  _map?: Leaflet.Map;
  createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback): HTMLElement;
  _setZoomTransform?: (level: InternalTileLevel, center: Leaflet.LatLng, zoom: number) => void;
}

/**
 * Gắn cơ chế giải mã ảnh bất đồng bộ (`decoding="async"`) và biến đổi tọa độ dưới điểm ảnh (subpixel)
 * khi đang thu phóng để triệt tiêu hoàn toàn hiện tượng rung bậc thang ±1-2px giữa lưới mảnh và đa giác.
 */
function enhanceAsyncTileDecoding(
  L: typeof import("leaflet"),
  layer: Leaflet.TileLayer,
): Leaflet.TileLayer {
  const internalLayer = layer as unknown as TileLayerWithInternals;
  const origCreateTile = internalLayer.createTile.bind(layer);

  internalLayer.createTile = (coords, done) => {
    const tile = origCreateTile(coords, done);
    if (tile instanceof HTMLImageElement) {
      tile.decoding = "async";
    }
    return tile;
  };

  internalLayer._setZoomTransform = function setSubpixelZoomTransform(
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
    // Đệm 2 ô (512px) vừa đủ chống hở viền mà không gây tràn VRAM GPU khi phóng liên tục mảnh 512x512 Retina
    keepBuffer: keepBufferOverride ?? (dataSaver || coarseTouch ? 1 : 2),
    updateWhenIdle: coarseTouch,
    updateWhenZooming: false,
    updateInterval: 180,
    crossOrigin: "anonymous",
  };
}

export function createGoogleSatelliteLayer(
  L: typeof import("leaflet"),
  lowEnd = false,
  targetMax: number = MAX_MAP_ZOOM,
  keepBufferOverride?: number,
): Leaflet.TileLayer {
  const scale = getHiDpiScaleParam(false);
  // Google Hybrid (lyrs=y): ảnh vệ tinh thực địa 512x512 Retina tới Z21 tại Đắk Lắk kèm tên đường/thôn tiếng Việt
  const layer = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}${scale}`, {
    subdomains: GOOGLE_SUBDOMAINS,
    attribution: "Ảnh vệ tinh và Bản đồ © Google",
    ...buildTilePerfOptions(lowEnd, 21, targetMax, keepBufferOverride),
  });
  return enhanceAsyncTileDecoding(L, layer);
}

export function createGoogleStreetsLayer(
  L: typeof import("leaflet"),
  lowEnd = false,
  targetMax: number = MAX_MAP_ZOOM,
): Leaflet.TileLayer {
  const scale = getHiDpiScaleParam(false);
  // Google Terrain + Streets (lyrs=p): hỗ trợ độ nét gốc 512x512 tới Z21 cho đường giao thông, nhà cửa và nhãn tiếng Việt
  const layer = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=p&hl=vi&x={x}&y={y}&z={z}${scale}`, {
    subdomains: GOOGLE_SUBDOMAINS,
    attribution: "Bản đồ địa hình và giao thông © Google",
    ...buildTilePerfOptions(lowEnd, 21, targetMax),
  });
  return enhanceAsyncTileDecoding(L, layer);
}

export function createBaseLayers(L: typeof import("leaflet")): BaseLayers {
  const dataSaver = isDataSaverNetwork();

  // 1. Nền tối tương phản cao (Esri Dark Gray Canvas)
  const darkOpts: Leaflet.TileLayerOptions = {
    ...buildTilePerfOptions(dataSaver, 16, MAX_MAP_ZOOM),
    detectRetina: !dataSaver,
  };
  const darkBase = enhanceAsyncTileDecoding(
    L,
    L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      attribution: DARK_ATTRIBUTION,
      ...darkOpts,
    }),
  );
  const darkReference = enhanceAsyncTileDecoding(
    L,
    L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
      attribution: DARK_ATTRIBUTION,
      ...darkOpts,
    }),
  );

  // 2. Bản đồ địa hình và giao thông chi tiết tiếng Việt (512x512 Retina tới Z21)
  const streets = createGoogleStreetsLayer(L, dataSaver, MAX_MAP_ZOOM);

  // 3. Ảnh vệ tinh Hybrid siêu nét (512x512 Retina tới Z21, phóng sâu Z22, thấy rõ từng tán sầu riêng)
  const satellite = createGoogleSatelliteLayer(L, dataSaver, MAX_MAP_ZOOM);

  return {
    map: L.layerGroup([darkBase, darkReference]),
    streets,
    satellite,
  };
}
