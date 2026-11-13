"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

export interface DwellSlide {
  src: string;
  alt: string;
  /** Vị trí căn khung trên màn hình rộng (mặc định: "center 50%") */
  objectPosition?: string;
  /** Vị trí căn khung riêng trên màn hình dọc di động <= 768px (nếu khác desktop) */
  mobileObjectPosition?: string;
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

export default function DwellSlideshow({
  slides,
  sizes,
  priorityFirst = false,
  mobileCollage = true,
  staggerMs = 0,
  intervalMs = DEFAULT_INTERVAL_MS,
}: DwellSlideshowProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [slideState, setSlideState] = useState<{ active: number; prev: number | null }>({
    active: 0,
    prev: null,
  });
  const [secondaryMounted, setSecondaryMounted] = useState(false);
  const [inView, setInView] = useState(false);
  const isScrollIdle = useSyncExternalStore(
    subscribeIdle,
    getIdleSnapshot,
    getIdleServerSnapshot,
  );

  // Theo dõi các slide phụ đã giải mã xong để không bao giờ chuyển sang khung trống
  const loadedIndicesRef = useRef<Set<number>>(new Set([0]));
  const [loadedVersion, setLoadedVersion] = useState(0);

  const slideCount = slides.length;
  const safeActive = slideState.active < slideCount ? slideState.active : 0;
  const safePrev =
    slideState.prev !== null && slideState.prev < slideCount && slideState.prev !== safeActive
      ? slideState.prev
      : null;

  const markSlideLoaded = useCallback((idx: number) => {
    if (loadedIndicesRef.current.has(idx)) return;
    loadedIndicesRef.current.add(idx);
    setLoadedVersion((v) => v + 1);
  }, []);

  // Gắn observer nạp trước ảnh phụ khi khung sắp lọt vào tầm mắt
  useEffect(() => {
    if (slideCount <= 1 || secondaryMounted) return;
    const el = rootRef.current;
    if (!el) return;
    return observePrewarm(el, () => {
      setSecondaryMounted(true);
    });
  }, [slideCount, secondaryMounted]);

  // Gắn observer kiểm tra khung hình đang nằm rõ trong vùng người dùng dừng xem
  useEffect(() => {
    if (slideCount <= 1) return;
    const el = rootRef.current;
    if (!el) return;
    return observeActiveVisibility(el, (visible) => {
      setInView(visible);
      if (visible) {
        setSecondaryMounted(true);
      }
    });
  }, [slideCount]);

  // Chu kỳ tự nhảy chuyển hình mượt mà chỉ khi đang hiển thị rõ & người dùng dừng cuộn
  const hasAdvancedInCurrentDwellRef = useRef(false);

  useEffect(() => {
    if (!inView || !isScrollIdle) {
      hasAdvancedInCurrentDwellRef.current = false;
    }
  }, [inView, isScrollIdle]);

  useEffect(() => {
    if (slideCount <= 1 || !secondaryMounted || !inView || !isScrollIdle) {
      return;
    }

    const stageEl = rootRef.current;
    if (stageEl && window.getComputedStyle(stageEl).display === "grid") {
      return;
    }

    const nextIndex = (safeActive + 1) % slideCount;
    if (!loadedIndicesRef.current.has(nextIndex)) {
      // Đợi ảnh kế tiếp giải mã xong (loadedVersion tăng sẽ tự kích hoạt lại effect này)
      return;
    }

    const baseDelay = hasAdvancedInCurrentDwellRef.current
      ? intervalMs
      : (globalHasScrolledOnce ? FIRST_DWELL_AFTER_STOP_MS : INITIAL_TOP_HOLD_MS) + staggerMs;

    const timer = window.setTimeout(() => {
      hasAdvancedInCurrentDwellRef.current = true;
      setSlideState((s) => {
        const cur = s.active < slideCount ? s.active : 0;
        return { active: (cur + 1) % slideCount, prev: cur };
      });
    }, baseDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    inView,
    intervalMs,
    isScrollIdle,
    loadedVersion,
    safeActive,
    secondaryMounted,
    slideCount,
    staggerMs,
  ]);

  if (slideCount === 0) return null;

  const useTriptych = mobileCollage && slideCount >= 3;

  return (
    <div
      ref={rootRef}
      className={`sw-dwell-stage${useTriptych ? " has-triptych" : ""}`}
    >
      {slides.map((slide, idx) => {
        if ((useTriptych ? idx >= 3 : idx > 0) && !secondaryMounted) return null;
        const isActive = idx === safeActive;
        const isLeaving = idx === safePrev;
        const desktopPos = slide.objectPosition ?? "center 50%";
        const styleVars = {
          "--dwell-desk-pos": desktopPos,
          ...(slide.mobileObjectPosition
            ? { "--dwell-mob-pos": slide.mobileObjectPosition }
            : {}),
        } as CSSProperties;

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
                  markSlideLoaded(idx);
                }
              }}
              src={slide.src}
              alt={slide.alt}
              fill
              priority={idx === 0 && priorityFirst}
              loading={
                priorityFirst
                  ? idx === 0
                    ? undefined
                    : useTriptych && idx < 3
                      ? "eager"
                      : "lazy"
                  : "lazy"
              }
              decoding="async"
              sizes={sizes}
              className="sw-dwell-img"
              onLoad={() => markSlideLoaded(idx)}
            />
          </span>
        );
      })}

      {slideCount > 1 && (
        <div className="sw-dwell-dots" aria-hidden="true">
          {slides.map((slide, idx) => (
            <button
              key={slide.src}
              type="button"
              tabIndex={-1}
              className={`sw-dwell-dot ${idx === safeActive ? "is-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (idx === 0 || loadedIndicesRef.current.has(idx)) {
                  hasAdvancedInCurrentDwellRef.current = true;
                  setSlideState((s) => {
                    const cur = s.active < slideCount ? s.active : 0;
                    return cur === idx ? s : { active: idx, prev: cur };
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
