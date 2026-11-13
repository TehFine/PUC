"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useNetworkQuality, usePerformanceTier } from "@/lib/network";

export interface DwellSlide {
  src: string;
  alt: string;
  /** Vị trí căn khung trên màn hình rộng (mặc định: "center 50%") */
  objectPosition?: string;
  /** Vị trí căn khung riêng trên màn hình dọc di động <= 768px (nếu khác desktop) */
  mobileObjectPosition?: string;
  /** Chỉ hiển thị bổ sung trên màn hình laptop/desktop (> 768px), giữ nguyên bố cục di động */
  desktopOnly?: boolean;
}

interface DwellSlideshowProps {
  slides: readonly DwellSlide[];
  sizes: string;
  /** Chỉ đặt true cho khung ảnh LCP đầu tiên trên trang */
  priorityFirst?: boolean;
  /** Bật bố cục ghép 3 ảnh sang trọng trên màn hình di động (mặc định: true khi có >= 3 ảnh) */
  mobileCollage?: boolean;
  /** Độ trễ lệch nhịp giữa các khung nằm gần nhau (ms) để chuyển cảnh tự nhiên */
  staggerMs?: number;
  /** Chu kỳ chuyển tiếp giữa các hình khi người dùng vẫn dừng lại xem (ms) */
  intervalMs?: number;
  /** Ảnh ưu tiên mở đầu trên màn hình laptop/desktop ngay sau khi giải mã xong */
  desktopLeadSrc?: string;
}

/* ─── Bộ theo dõi khung nhìn Laptop/Desktop (> 768px) dùng chung toàn trang ─── */

let desktopMql: MediaQueryList | null = null;
const desktopViewportListeners = new Set<() => void>();

function subscribeDesktopViewport(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  if (!desktopMql) {
    desktopMql = window.matchMedia("(min-width: 769px)");
    desktopMql.addEventListener("change", () => {
      desktopViewportListeners.forEach((fn) => fn());
    });
  }
  desktopViewportListeners.add(listener);
  return () => {
    desktopViewportListeners.delete(listener);
  };
}

function getDesktopViewportSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  if (!desktopMql) {
    desktopMql = window.matchMedia("(min-width: 769px)");
  }
  return desktopMql.matches;
}

function getDesktopViewportServerSnapshot(): boolean {
  return false;
}

/* ─── Bộ điều phối cuộn & tầm nhìn dùng chung toàn trang (1 listener duy nhất) ─── */

const SCROLL_IDLE_MS = 560;
const FIRST_DWELL_AFTER_STOP_MS = 760;
const INITIAL_TOP_HOLD_MS = 1700;
const DEFAULT_INTERVAL_MS = 3400;
const ACTIVE_VISIBLE_RATIO = 0.38;

let globalScrollBound = false;
let globalIsIdle = true;
let globalHasScrolledOnce = false;
let globalIdleTimer = 0;
const idleListeners = new Set<() => void>();

function notifyIdleListeners() {
  idleListeners.forEach((fn) => fn());
}

function ensureGlobalScrollCoordinator() {
  if (globalScrollBound || typeof window === "undefined") return;
  globalScrollBound = true;

  const markScrolling = () => {
    globalHasScrolledOnce = true;
    if (globalIsIdle) {
      globalIsIdle = false;
      notifyIdleListeners();
    }
    if (globalIdleTimer) {
      window.clearTimeout(globalIdleTimer);
    }
    globalIdleTimer = window.setTimeout(() => {
      globalIdleTimer = 0;
      globalIsIdle = true;
      notifyIdleListeners();
    }, SCROLL_IDLE_MS);
  };

  const onVisibilityChange = () => {
    notifyIdleListeners();
  };

  window.addEventListener("scroll", markScrolling, { passive: true });
  window.addEventListener("touchmove", markScrolling, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function subscribeIdle(listener: () => void): () => void {
  ensureGlobalScrollCoordinator();
  idleListeners.add(listener);
  return () => {
    idleListeners.delete(listener);
  };
}

function getIdleSnapshot(): boolean {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return false;
  }
  return globalIsIdle;
}

function getIdleServerSnapshot(): boolean {
  return true;
}

/* Shared IntersectionObservers để tránh tạo nhiều observer trên thiết bị yếu */
type VisibilityCallback = (inView: boolean) => void;
type PrewarmCallback = () => void;

let sharedActiveObserver: IntersectionObserver | null = null;
const activeCallbacks = new WeakMap<Element, VisibilityCallback>();

function observeActiveVisibility(el: Element, cb: VisibilityCallback): () => void {
  if (typeof IntersectionObserver === "undefined") {
    return () => {};
  }
  if (!sharedActiveObserver) {
    sharedActiveObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const handler = activeCallbacks.get(entry.target);
          if (handler) {
            handler(entry.isIntersecting && entry.intersectionRatio >= ACTIVE_VISIBLE_RATIO);
          }
        }
      },
      { threshold: [0, 0.25, ACTIVE_VISIBLE_RATIO, 0.65] },
    );
  }
  activeCallbacks.set(el, cb);
  sharedActiveObserver.observe(el);
  return () => {
    activeCallbacks.delete(el);
    sharedActiveObserver?.unobserve(el);
  };
}

let sharedPrewarmObserver: IntersectionObserver | null = null;
const prewarmCallbacks = new WeakMap<Element, PrewarmCallback>();

function observePrewarm(el: Element, cb: PrewarmCallback): () => void {
  if (typeof IntersectionObserver === "undefined") {
    return () => {};
  }
  if (!sharedPrewarmObserver) {
    sharedPrewarmObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const handler = prewarmCallbacks.get(entry.target);
          if (handler) {
            prewarmCallbacks.delete(entry.target);
            sharedPrewarmObserver?.unobserve(entry.target);
            handler();
          }
        }
      },
      { rootMargin: "280px 0px" },
    );
  }
  prewarmCallbacks.set(el, cb);
  sharedPrewarmObserver.observe(el);
  return () => {
    prewarmCallbacks.delete(el);
    sharedPrewarmObserver?.unobserve(el);
  };
}

function normalizeTriptychSizes(sizes: string, useTriptych: boolean): string {
  if (!useTriptych) return sizes;
  // Trên di động <= 768px, khung ghép 3 ảnh chia 2 cột (~46vw–50vw mỗi ảnh), tránh tải ảnh 100vw thừa RAM.
  const replaced = sizes.replace(
    /\(max-width:\s*768px\)\s*(?:calc\([^)]+\)|100vw)/g,
    "(max-width: 768px) 50vw",
  );
  if (replaced !== sizes) return replaced;
  if (!sizes.includes("768px") && !sizes.includes("50vw")) {
    return `(max-width: 768px) 50vw, ${sizes}`;
  }
  return sizes;
}

export default function DwellSlideshow({
  slides,
  sizes,
  priorityFirst = false,
  mobileCollage = true,
  staggerMs = 0,
  intervalMs = DEFAULT_INTERVAL_MS,
  desktopLeadSrc,
}: DwellSlideshowProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const perfTier = usePerformanceTier();
  const netQuality = useNetworkQuality();
  const isDesktopViewport = useSyncExternalStore(
    subscribeDesktopViewport,
    getDesktopViewportSnapshot,
    getDesktopViewportServerSnapshot,
  );

  // Trên điện thoại yếu hoặc mạng chậm: tắt tự động nạp/chuyển ảnh để tiết kiệm RAM & 3G/4G;
  // trên laptop/desktop mạng ổn định vẫn cho phép trình chiếu đầy đủ bộ ảnh.
  const disableAutoCycle =
    netQuality !== "good" ||
    (!isDesktopViewport && perfTier === "lite") ||
    (typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const activeSlides = useMemo(
    () => (isDesktopViewport ? slides : slides.filter((s) => !s.desktopOnly)),
    [isDesktopViewport, slides],
  );

  const firstSrc = activeSlides[0]?.src ?? "";
  const [slideState, setSlideState] = useState<{ activeSrc: string; prevSrc: string | null }>({
    activeSrc: firstSrc,
    prevSrc: null,
  });
  const [secondaryMounted, setSecondaryMounted] = useState(false);
  const [inView, setInView] = useState(false);
  const isScrollIdle = useSyncExternalStore(
    subscribeIdle,
    getIdleSnapshot,
    getIdleServerSnapshot,
  );

  // Theo dõi các slide đã giải mã xong theo URL để giữ trạng thái ổn định khi bổ sung slide desktop
  const loadedSrcsRef = useRef<Set<string>>(firstSrc ? new Set([firstSrc]) : new Set());
  const [loadedVersion, setLoadedVersion] = useState(0);
  const manualInteractedRef = useRef(false);
  const appliedDesktopLeadRef = useRef(false);

  const slideCount = activeSlides.length;
  const mobileSlideCount = useMemo(
    () => slides.filter((s) => !s.desktopOnly).length,
    [slides],
  );
  const useTriptych = mobileCollage && mobileSlideCount >= 3;
  const effectiveSizes = useMemo(
    () => normalizeTriptychSizes(sizes, useTriptych),
    [sizes, useTriptych],
  );

  const resolvedActiveIdx = useMemo(() => {
    const idx = activeSlides.findIndex((s) => s.src === slideState.activeSrc);
    return idx >= 0 ? idx : 0;
  }, [activeSlides, slideState.activeSrc]);

  const resolvedPrevIdx = useMemo(() => {
    if (!slideState.prevSrc) return null;
    const idx = activeSlides.findIndex((s) => s.src === slideState.prevSrc);
    return idx >= 0 && idx !== resolvedActiveIdx ? idx : null;
  }, [activeSlides, resolvedActiveIdx, slideState.prevSrc]);

  const markSlideLoaded = useCallback((src: string) => {
    if (loadedSrcsRef.current.has(src)) return;
    loadedSrcsRef.current.add(src);
    setLoadedVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (disableAutoCycle || slideCount <= 1 || secondaryMounted) return;
    const el = rootRef.current;
    if (!el) return;
    return observePrewarm(el, () => {
      setSecondaryMounted(true);
    });
  }, [disableAutoCycle, slideCount, secondaryMounted]);

  useEffect(() => {
    if (disableAutoCycle || slideCount <= 1) return;
    const el = rootRef.current;
    if (!el) return;
    return observeActiveVisibility(el, (visible) => {
      setInView(visible);
      if (visible) {
        setSecondaryMounted(true);
      }
    });
  }, [disableAutoCycle, slideCount]);

  // Trên laptop/desktop: nếu có ảnh mở đầu đặc thù vùng trồng (desktopLeadSrc), chuyển mượt sang ngay khi ảnh tải xong
  useEffect(() => {
    if (
      !isDesktopViewport ||
      !desktopLeadSrc ||
      appliedDesktopLeadRef.current ||
      manualInteractedRef.current
    ) {
      return;
    }
    if (!activeSlides.some((s) => s.src === desktopLeadSrc)) return;
    if (!loadedSrcsRef.current.has(desktopLeadSrc)) return;

    appliedDesktopLeadRef.current = true;
    const timer = window.setTimeout(() => {
      setSlideState((s) =>
        s.activeSrc === desktopLeadSrc
          ? s
          : { activeSrc: desktopLeadSrc, prevSrc: s.activeSrc },
      );
    }, 80);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeSlides, desktopLeadSrc, isDesktopViewport, loadedVersion]);

  const hasAdvancedInCurrentDwellRef = useRef(false);

  useEffect(() => {
    if (!inView || !isScrollIdle) {
      hasAdvancedInCurrentDwellRef.current = false;
    }
  }, [inView, isScrollIdle]);

  useEffect(() => {
    if (disableAutoCycle || slideCount <= 1 || !secondaryMounted || !inView || !isScrollIdle) {
      return;
    }

    // Khi đang ở bố cục lưới ghép 3 ảnh tĩnh trên màn hình hẹp thì không chạy timer chuyển slide
    if (useTriptych && !isDesktopViewport) {
      return;
    }

    const nextIndex = (resolvedActiveIdx + 1) % slideCount;
    const nextSlide = activeSlides[nextIndex];
    if (!nextSlide || !loadedSrcsRef.current.has(nextSlide.src)) {
      return;
    }

    const baseDelay = hasAdvancedInCurrentDwellRef.current
      ? intervalMs
      : (globalHasScrolledOnce ? FIRST_DWELL_AFTER_STOP_MS : INITIAL_TOP_HOLD_MS) + staggerMs;

    const timer = window.setTimeout(() => {
      hasAdvancedInCurrentDwellRef.current = true;
      setSlideState((s) => {
        const curIdx = activeSlides.findIndex((item) => item.src === s.activeSrc);
        const safeCur = curIdx >= 0 ? curIdx : 0;
        const target = activeSlides[(safeCur + 1) % activeSlides.length];
        if (!target || target.src === s.activeSrc) return s;
        return { activeSrc: target.src, prevSrc: activeSlides[safeCur]?.src ?? null };
      });
    }, baseDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeSlides,
    disableAutoCycle,
    inView,
    intervalMs,
    isDesktopViewport,
    isScrollIdle,
    loadedVersion,
    resolvedActiveIdx,
    secondaryMounted,
    slideCount,
    staggerMs,
    useTriptych,
  ]);

  if (slideCount === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`sw-dwell-stage${useTriptych ? " has-triptych" : ""}`}
    >
      {activeSlides.map((slide, idx) => {
        const isNeededInitially =
          (!isDesktopViewport && useTriptych && idx < 3) ||
          idx === 0 ||
          (isDesktopViewport && desktopLeadSrc === slide.src);
        if (
          !isNeededInitially &&
          !secondaryMounted &&
          idx !== resolvedActiveIdx &&
          idx !== resolvedPrevIdx
        ) {
          return null;
        }
        const isActive = idx === resolvedActiveIdx;
        const isLeaving = idx === resolvedPrevIdx;
        const desktopPos = slide.objectPosition ?? "center 50%";
        const styleVars = {
          "--dwell-desk-pos": desktopPos,
          ...(slide.mobileObjectPosition
            ? { "--dwell-mob-pos": slide.mobileObjectPosition }
            : {}),
        } as CSSProperties;

        const isPriorityHero = idx === 0 && priorityFirst;

        return (
          <span
            key={slide.src}
            className={`sw-dwell-layer${isActive ? " is-active" : ""}${isLeaving ? " is-leaving" : ""}`}
            style={styleVars}
            aria-hidden={!isActive}
          >
            <Image
              ref={(img) => {
                if (img && img.complete && img.naturalWidth > 0) {
                  markSlideLoaded(slide.src);
                }
              }}
              src={slide.src}
              alt={slide.alt}
              fill
              priority={isPriorityHero}
              loading={isPriorityHero ? undefined : "lazy"}
              decoding="async"
              sizes={effectiveSizes}
              className="sw-dwell-img"
              onLoad={() => markSlideLoaded(slide.src)}
            />
          </span>
        );
      })}

      {slideCount > 1 && (
        <div className="sw-dwell-dots" aria-hidden="true">
          {activeSlides.map((slide, idx) => (
            <button
              key={slide.src}
              type="button"
              tabIndex={-1}
              className={`sw-dwell-dot ${idx === resolvedActiveIdx ? "is-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                manualInteractedRef.current = true;
                if (idx === 0 || loadedSrcsRef.current.has(slide.src) || disableAutoCycle) {
                  hasAdvancedInCurrentDwellRef.current = true;
                  setSlideState((s) => {
                    const curSrc = activeSlides[resolvedActiveIdx]?.src ?? firstSrc;
                    return curSrc === slide.src
                      ? s
                      : { activeSrc: slide.src, prevSrc: curSrc };
                  });
                } else {
                  setSecondaryMounted(true);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
