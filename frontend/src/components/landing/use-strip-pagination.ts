"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface StripPaginationState {
  stopCount: number;
  activeStop: number;
  canPrev: boolean;
  canNext: boolean;
  handleStripScroll: () => void;
  cancelProgrammaticLock: () => void;
  scrollToStop: (index: number) => void;
  scrollByStep: (direction: -1 | 1) => void;
}

/**
 * Quản lý phân trang dấu chấm & nút Trước/Tiếp cho dải thẻ cuộn ngang (.sw-training-strip).
 * Tối ưu chống nóng máy: chỉ đo offset DOM khi mount / resize, còn lúc lướt chỉ đọc scrollLeft.
 */
export function useStripPagination(
  trackRef: RefObject<HTMLDivElement | null>,
  itemCount: number,
): StripPaginationState {
  const [stopCount, setStopCount] = useState(1);
  const [activeStop, setActiveStop] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const stopsRef = useRef<number[]>([0]);
  const maxScrollRef = useRef(0);
  const activeStopRef = useRef(0);
  const scrollRafRef = useRef(0);
  const targetStopRef = useRef<number | null>(null);
  const targetUntilRef = useRef(0);

  const syncFromScroll = useCallback(() => {
    scrollRafRef.current = 0;
    const el = trackRef.current;
    if (!el) return;

    const left = el.scrollLeft;
    const maxScroll = maxScrollRef.current;
    const stops = stopsRef.current;

    const nextPrev = left > 6;
    const nextNext = left < maxScroll - 6;
    setCanPrev((p) => (p === nextPrev ? p : nextPrev));
    setCanNext((p) => (p === nextNext ? p : nextNext));

    if (stops.length <= 1) {
      activeStopRef.current = 0;
      setActiveStop((p) => (p === 0 ? p : 0));
      return;
    }

    const now = performance.now();
    if (targetStopRef.current !== null && now < targetUntilRef.current) {
      const targetLeft = stops[targetStopRef.current] ?? 0;
      if (Math.abs(left - targetLeft) <= 8) {
        targetUntilRef.current = 0;
        targetStopRef.current = null;
      } else {
        return;
      }
    }

    let bestIdx = 0;
    let bestDist = Math.abs(left - stops[0]);
    for (let i = 1; i < stops.length; i += 1) {
      const dist = Math.abs(left - stops[i]);
      if (dist <= bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    activeStopRef.current = bestIdx;
    setActiveStop((p) => (p === bestIdx ? p : bestIdx));
  }, [trackRef]);

  const measureStops = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;

    const cards = el.querySelectorAll<HTMLElement>(".sw-training-slide");
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    maxScrollRef.current = maxScroll;

    if (cards.length <= 1 || maxScroll <= 4) {
      stopsRef.current = [0];
      setStopCount((p) => (p === 1 ? p : 1));
      activeStopRef.current = 0;
      setActiveStop((p) => (p === 0 ? p : 0));
      setCanPrev((p) => (p === false ? p : false));
      setCanNext((p) => (p === false ? p : false));
      return;
    }

    const baseLeft = cards[0].offsetLeft;
    const firstStep =
      cards.length > 1 ? Math.max(1, cards[1].offsetLeft - baseLeft) : el.clientWidth;
    const minDistinctDelta = Math.max(24, firstStep * 0.22);

    const nextStops: number[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      const raw = cards[i].offsetLeft - baseLeft;
      const clamped = Math.min(Math.max(0, raw), maxScroll);
      if (nextStops.length === 0) {
        nextStops.push(clamped);
      } else {
        const prev = nextStops[nextStops.length - 1];
        if (clamped - prev >= minDistinctDelta) {
          nextStops.push(clamped);
        } else if (clamped === maxScroll && prev < maxScroll) {
          nextStops[nextStops.length - 1] = maxScroll;
        }
      }
    }

    if (nextStops[nextStops.length - 1] < maxScroll - 4) {
      nextStops.push(maxScroll);
    }

    stopsRef.current = nextStops;
    setStopCount((p) => (p === nextStops.length ? p : nextStops.length));
    syncFromScroll();
  }, [trackRef, syncFromScroll]);

  const handleStripScroll = useCallback(() => {
    if (scrollRafRef.current === 0) {
      scrollRafRef.current = window.requestAnimationFrame(syncFromScroll);
    }
  }, [syncFromScroll]);

  const cancelProgrammaticLock = useCallback(() => {
    targetUntilRef.current = 0;
    targetStopRef.current = null;
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let resizeRaf = window.requestAnimationFrame(measureStops);
    const scheduleMeasure = () => {
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      resizeRaf = window.requestAnimationFrame(measureStops);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(scheduleMeasure);
      ro.observe(el);
    }
    window.addEventListener("resize", scheduleMeasure, { passive: true });

    return () => {
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
      ro?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [trackRef, itemCount, measureStops]);

  const scrollToStop = useCallback(
    (index: number) => {
      const el = trackRef.current;
      const stops = stopsRef.current;
      if (!el || stops.length === 0) return;

      const clampedIdx = Math.min(Math.max(0, index), stops.length - 1);
      const targetLeft = stops[clampedIdx] ?? 0;

      targetStopRef.current = clampedIdx;
      targetUntilRef.current = performance.now() + 520;
      activeStopRef.current = clampedIdx;
      setActiveStop(clampedIdx);
      setCanPrev(targetLeft > 6);
      setCanNext(targetLeft < maxScrollRef.current - 6);

      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      el.scrollTo({
        left: targetLeft,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [trackRef],
  );

  const scrollByStep = useCallback(
    (direction: -1 | 1) => {
      const stops = stopsRef.current;
      if (stops.length <= 1) return;
      const now = performance.now();
      const base =
        targetStopRef.current !== null && now < targetUntilRef.current
          ? targetStopRef.current
          : activeStopRef.current;
      scrollToStop(base + direction);
    },
    [scrollToStop],
  );

  return {
    stopCount,
    activeStop,
    canPrev,
    canNext,
    handleStripScroll,
    cancelProgrammaticLock,
    scrollToStop,
    scrollByStep,
  };
}

