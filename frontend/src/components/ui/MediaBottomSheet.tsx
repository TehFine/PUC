"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { useBackLayer } from "@/lib/back-navigation";
import {
  animatePopupExit,
  attachSmoothSheetSettle,
  spawnExitCloneIfNeeded,
} from "@/lib/popup-motion";
import { lockRootScroll } from "@/lib/scroll-lock";
import { isSafeMediaUrl } from "@/utils/url-safety";

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(url);
}

export function extractSafeMediaUrls(
  urls?: ReadonlyArray<string | null | undefined> | null,
  fallbackUrl?: string | null,
): string[] {
  const raw =
    urls && urls.length > 0
      ? urls
      : fallbackUrl
        ? [fallbackUrl]
        : [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isSafeMediaUrl(item)) continue;
    const canonical = item.replace(/\/video\.(mp4|webm)$/i, "");
    if (seen.has(canonical)) {
      if (isVideoUrl(item)) {
        const idx = unique.findIndex(
          (existing) => existing.replace(/\/video\.(mp4|webm)$/i, "") === canonical,
        );
        if (idx >= 0) unique[idx] = item;
      }
      continue;
    }
    seen.add(canonical);
    unique.push(item);
  }
  return unique;
}

export interface MediaBottomSheetProps {
  urls?: ReadonlyArray<string | null | undefined> | null;
  fallbackUrl?: string | null;
  initialIndex?: number;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

/**
 * Hộp xem trực tiếp ảnh và video minh chứng bật lên từ cạnh dưới màn hình (Bottom Sheet)
 * trên cả di động lẫn máy tính, hỗ trợ vuốt ngang chuyển ảnh, vuốt xuống để đóng và không mở tab mới.
 */
export function MediaBottomSheet({
  urls,
  fallbackUrl,
  initialIndex = 0,
  title,
  subtitle,
  onClose,
  onIndexChange,
}: MediaBottomSheetProps) {
  const titleId = useId();
  const items = useMemo(
    () =>
      extractSafeMediaUrls(urls, fallbackUrl).map((url) => ({
        url,
        isVideo: isVideoUrl(url),
      })),
    [urls, fallbackUrl],
  );

  const [index, setIndex] = useState(() =>
    items.length > 0 ? Math.max(0, Math.min(initialIndex, items.length - 1)) : 0,
  );
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const stageInnerRef = useRef<HTMLDivElement>(null);
  const backdropDownRef = useRef(false);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const swipeRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    dx: number;
    axis: "x" | "y" | null;
  }>({ active: false, startX: 0, startY: 0, dx: 0, axis: null });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const safeIndex = items.length > 0 ? Math.max(0, Math.min(index, items.length - 1)) : 0;
  const activeItem = items[safeIndex] ?? null;

  const goTo = useCallback(
    (next: number) => {
      if (items.length === 0) return;
      const clamped = Math.max(0, Math.min(next, items.length - 1));
      setIndex(clamped);
      onIndexChange?.(clamped);
    },
    [items.length, onIndexChange],
  );

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const duration = animatePopupExit(panelRef.current, backdropRef.current, "sheet");
    window.setTimeout(() => {
      onCloseRef.current();
    }, duration);
  }, []);

  useLayoutEffect(() => {
    const backdropEl = backdropRef.current;
    const panelEl = panelRef.current;
    return () => {
      if (!isClosingRef.current) {
        spawnExitCloneIfNeeded(backdropEl, panelEl, "sheet");
      }
    };
  }, []);

  useBackLayer(true, handleClose);

  useSheetSwipe({
    sheetRef: panelRef,
    handleRef: dragZoneRef,
    onDismiss: handleClose,
    enabled: true,
  });

  useEffect(
    () => attachSmoothSheetSettle(panelRef.current, backdropRef.current, isClosingRef),
    [],
  );

  useEffect(() => {
    const unlockScroll = lockRootScroll();

    const onKeyDown = (ev: KeyboardEvent) => {
      const overlays = document.querySelectorAll(
        ".pt-sheet-backdrop, .modal-overlay, .cert-modal-backdrop, .pt-radial-backdrop",
      );
      if (overlays.length > 0 && overlays[overlays.length - 1] !== backdropRef.current) return;

      if (ev.key === "Escape") {
        ev.stopPropagation();
        handleClose();
      } else if (ev.key === "ArrowLeft" && items.length > 1) {
        ev.preventDefault();
        goTo(safeIndex - 1);
      } else if (ev.key === "ArrowRight" && items.length > 1) {
        ev.preventDefault();
        goTo(safeIndex + 1);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlockScroll();
    };
  }, [handleClose, items.length, safeIndex, goTo]);

  if (typeof document === "undefined" || items.length === 0 || !activeItem) return null;

  const resetStageTransform = (animate: boolean) => {
    const el = stageInnerRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    el.style.transform = "translate3d(0, 0, 0)";
  };

  const beginSwipe = (x: number, y: number) => {
    if (items.length <= 1) return;
    swipeRef.current = { active: true, startX: x, startY: y, dx: 0, axis: null };
    resetStageTransform(false);
  };

  const moveSwipe = (x: number, y: number) => {
    const st = swipeRef.current;
    if (!st.active) return;
    const dx = x - st.startX;
    const dy = y - st.startY;
    if (!st.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      st.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    if (st.axis !== "x") return;
    st.dx = dx;
    const atEdge = (safeIndex <= 0 && dx > 0) || (safeIndex >= items.length - 1 && dx < 0);
    const damped = atEdge ? dx * 0.25 : dx * 0.65;
    if (stageInnerRef.current) {
      stageInnerRef.current.style.transition = "none";
      stageInnerRef.current.style.transform = `translate3d(${damped.toFixed(1)}px, 0, 0)`;
    }
  };

  const endSwipe = () => {
    const st = swipeRef.current;
    if (!st.active) return;
    st.active = false;
    const { dx, axis } = st;
    st.dx = 0;
    st.axis = null;
    resetStageTransform(true);
    if (axis !== "x") return;
    if (dx <= -42 && safeIndex < items.length - 1) {
      goTo(safeIndex + 1);
    } else if (dx >= 42 && safeIndex > 0) {
      goTo(safeIndex - 1);
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
      className="pt-sheet-backdrop media-bottom-sheet-backdrop"
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const startedOnBackdrop = backdropDownRef.current;
        backdropDownRef.current = false;
        if (startedOnBackdrop && e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="media-bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div ref={dragZoneRef} className="media-bs-topbar">
          <div className="media-bs-header">
            <div className="media-bs-head-copy">
              <div className="media-bs-title-row">
                <h2 id={titleId} className="media-bs-title">
                  {title}
                </h2>
                {items.length > 1 && (
                  <span className="media-bs-counter">
                    {safeIndex + 1}/{items.length}
                  </span>
                )}
              </div>
              {subtitle && <p className="media-bs-subtitle">{subtitle}</p>}
            </div>
            <button
              type="button"
              className="media-bs-close"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Đóng"
            >
              <CloseCircleIcon size={28} />
            </button>
          </div>
        </div>

        <div className="media-bs-body">
          <div
            className="media-bs-stage"
            data-no-sheet-drag="true"
            onTouchStart={(e) => {
              if (e.touches.length !== 1) return;
              const target = e.target as HTMLElement | null;
              if (target?.tagName === "VIDEO") {
                const rect = target.getBoundingClientRect();
                if (e.touches[0].clientY > rect.bottom - 52) return;
              }
              beginSwipe(e.touches[0].clientX, e.touches[0].clientY);
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1) {
                moveSwipe(e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onTouchEnd={() => endSwipe()}
            onTouchCancel={() => endSwipe()}
            onPointerDown={(e) => {
              if (
                e.pointerType === "mouse" &&
                e.button === 0 &&
                !(e.target as HTMLElement | null)?.closest("video")
              ) {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                beginSwipe(e.clientX, e.clientY);
              }
            }}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse") moveSwipe(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (e.pointerType === "mouse") endSwipe();
            }}
            onPointerCancel={(e) => {
              if (e.pointerType === "mouse") endSwipe();
            }}
          >
            <div ref={stageInnerRef} className="media-bs-stage-inner">
              {activeItem.isVideo ? (
                <video
                  key={activeItem.url}
                  src={activeItem.url}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="media-bs-media"
                />
              ) : failedUrls[activeItem.url] ? (
                <div className="media-bs-missing">Không tải được ảnh minh chứng này.</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh minh chứng người dùng tải lên (/api/uploads)
                <img
                  key={activeItem.url}
                  src={activeItem.url}
                  alt={`${title} ${safeIndex + 1}`}
                  className="media-bs-media"
                  draggable={false}
                  decoding="async"
                  onError={() =>
                    setFailedUrls((prev) => ({ ...prev, [activeItem.url]: true }))
                  }
                />
              )}
            </div>
          </div>

          {items.length > 1 && (
            <div className="media-bs-nav-row" data-no-sheet-drag="true">
              <div className="media-bs-thumbs">
                {items.map((item, idx) => (
                  <button
                    key={item.url}
                    type="button"
                    className={`media-bs-thumb ${idx === safeIndex ? "is-active" : ""}`}
                    onClick={() => goTo(idx)}
                    aria-label={`${item.isVideo ? "Video" : "Ảnh"} ${idx + 1}/${items.length}`}
                  >
                    {item.isVideo ? (
                      <span className="media-bs-thumb-video">Video</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="media-bs-nav-btns">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={safeIndex <= 0}
                  onClick={() => goTo(safeIndex - 1)}
                >
                  Trước
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={safeIndex >= items.length - 1}
                  onClick={() => goTo(safeIndex + 1)}
                >
                  Tiếp
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

