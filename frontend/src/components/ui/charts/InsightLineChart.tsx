"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

export interface InsightPoint {
  label: string;
  value: number;
  dateIso?: string;
  journalCount?: number;
  sprayCount?: number;
  householdCount?: number;
}

interface InsightLineChartProps {
  data: InsightPoint[];
  metricLabel: string;
  ariaLabel: string;
  height?: number;
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const NICE_STEPS = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
const INTERVAL_COUNT = 7;
const MORPH_DURATION_MS = 380;

function buildScale(maxValue: number): { yMax: number; ticks: number[] } {
  const targetTop = Math.max(maxValue * 1.35, INTERVAL_COUNT);
  let chosenStep = NICE_STEPS[NICE_STEPS.length - 1];
  for (const step of NICE_STEPS) {
    if (step * INTERVAL_COUNT >= targetTop) {
      chosenStep = step;
      break;
    }
  }
  if (maxValue === 0) {
    chosenStep = 5;
  }
  const ticks: number[] = [];
  for (let i = 0; i <= INTERVAL_COUNT; i++) {
    ticks.push(i * chosenStep);
  }
  return { yMax: chosenStep * INTERVAL_COUNT, ticks };
}

function samplePolyline(arr: readonly number[], t: number): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];
  const clamped = Math.min(Math.max(t, 0), 1);
  const pos = clamped * (arr.length - 1);
  const idx = Math.floor(pos);
  const frac = pos - idx;
  if (idx >= arr.length - 1) return arr[arr.length - 1];
  return arr[idx] + (arr[idx + 1] - arr[idx]) * frac;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Nội suy 60fps mượt mà cho tỷ lệ tung độ [0..1] của từng điểm trên đường cong
 * (kể cả khi số lượng điểm thay đổi giữa 7 / 14 / 30 ngày hoặc khi dữ liệu mới vừa đổ về).
 */
function useAnimatedRatios(targetRatios: readonly number[]): { ratios: number[]; isMorphing: boolean } {
  const [ratios, setRatios] = useState<number[]>(() => [...targetRatios]);
  const [isMorphing, setIsMorphing] = useState(false);
  const currentRef = useRef<number[]>([...targetRatios]);
  const rafRef = useRef<number>(0);

  const signature = targetRatios.map((r) => r.toFixed(5)).join("|");

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const prev = currentRef.current;
    const n = targetRatios.length;

    const startRatios =
      n === 0
        ? []
        : prev.length === 0
          ? [...targetRatios]
          : prev.length === n
            ? [...prev]
            : targetRatios.map((_, i) => samplePolyline(prev, n > 1 ? i / (n - 1) : 0));

    const maxDiff =
      n === 0
        ? 0
        : targetRatios.reduce(
            (acc, target, i) => Math.max(acc, Math.abs(target - (startRatios[i] ?? target))),
            0,
          );
    const skipAnim = n === 0 || maxDiff < 0.0005 || prefersReducedMotion();
    const startAt = performance.now();

    const step = (now: number) => {
      if (skipAnim) {
        rafRef.current = 0;
        const exact = [...targetRatios];
        currentRef.current = exact;
        setRatios(exact);
        setIsMorphing(false);
        return;
      }
      if (now === startAt) {
        setIsMorphing(true);
      }
      const elapsed = now - startAt;
      const p = Math.min(Math.max(elapsed / MORPH_DURATION_MS, 0), 1);
      // easeOutQuart: khởi đầu nhạy tức thì, hạ cánh êm không vọt lố
      const eased = 1 - Math.pow(1 - p, 4);
      const next = targetRatios.map((target, i) => {
        const from = startRatios[i] ?? target;
        return from + (target - from) * eased;
      });
      currentRef.current = next;
      setRatios(next);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = 0;
        const finalArr = [...targetRatios];
        currentRef.current = finalArr;
        setRatios(finalArr);
        setIsMorphing(false);
      }
    };

    rafRef.current = requestAnimationFrame((now) => {
      if (!skipAnim) setIsMorphing(true);
      step(now);
    });
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return {
    ratios: ratios.length === targetRatios.length ? ratios : [...targetRatios],
    isMorphing,
  };
}

/**
 * Đường cong đơn điệu Fritsch–Carlson (Monotone Cubic Hermite):
 * đi chính xác qua mọi điểm dữ liệu thực tế, không bao giờ vọt quá đỉnh hoặc tụt xuống dưới 0.
 */
function buildMonotoneSplinePath(
  pts: { x: number; y: number }[],
  plotTop: number,
  plotBottom: number,
): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;

  const dx: number[] = new Array(n - 1);
  const secants: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(pts[i + 1].x - pts[i].x, 0.0001);
    secants[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }

  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = secants[0];
  tangents[n - 1] = secants[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (secants[i - 1] * secants[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (secants[i - 1] + secants[i]) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(secants[i]) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / secants[i];
      const b = tangents[i + 1] / secants[i];
      const normSq = a * a + b * b;
      if (normSq > 9) {
        const tau = 3 / Math.sqrt(normSq);
        tangents[i] = tau * a * secants[i];
        tangents[i + 1] = tau * b * secants[i];
      }
    }
  }

  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const h = dx[i] / 3;
    const cp1x = p0.x + h;
    const cp2x = p1.x - h;
    const cp1y = Math.min(plotBottom, Math.max(plotTop, p0.y + tangents[i] * h));
    const cp2y = Math.min(plotBottom, Math.max(plotTop, p1.y - tangents[i + 1] * h));
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  }
  return d;
}

function pickDefaultActiveIndex(data: InsightPoint[]): number {
  if (data.length === 0) return 0;
  let bestIdx = data.length - 1;
  let bestVal = -Infinity;
  for (let i = 0; i < data.length; i++) {
    // Ưu tiên ngày gần nhất khi có cùng mức đỉnh (>=)
    if (data[i].value >= bestVal) {
      bestVal = data[i].value;
      bestIdx = i;
    }
  }
  if (bestVal <= 0) {
    return data.length - 1;
  }
  return bestIdx;
}

export default function InsightLineChart({
  data,
  metricLabel,
  ariaLabel,
  height = 268,
}: InsightLineChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const cachedLeftRef = useRef<number | null>(null);
  const touchModeRef = useRef<"idle" | "undecided" | "scrub" | "scroll">("idle");
  const geomRef = useRef<{ plotLeft: number; stepX: number; n: number }>({
    plotLeft: 0,
    stepX: 0,
    n: 0,
  });
  const prevValuesByDateRef = useRef<Map<string, number> | null>(null);
  const prevLengthRef = useRef<number>(data.length);

  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [liveFocusIdx, setLiveFocusIdx] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let rafId = 0;
    const initial = Math.round(el.clientWidth);
    if (initial > 0) setWidth(initial);

    const ro = new ResizeObserver(([entry]) => {
      const nextW = Math.round(entry?.contentRect?.width ?? 0);
      if (nextW > 0) {
        if (rafId) window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(() => {
          rafId = 0;
          setWidth((prev) => (Math.abs(prev - nextW) > 1 ? nextW : prev));
        });
      }
    });
    ro.observe(el);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Khi có bản ghi mới vừa về trên cùng khung thời gian, tự động hướng điểm neo tới ngày vừa thay đổi
  useEffect(() => {
    const nextMap = new Map<string, number>();
    data.forEach((pt, idx) => {
      const key = pt.dateIso ?? `${idx}:${pt.label}`;
      nextMap.set(key, Number(pt.value) || 0);
    });

    if (prevLengthRef.current !== data.length) {
      prevLengthRef.current = data.length;
      prevValuesByDateRef.current = nextMap;
      const raf = requestAnimationFrame(() => {
        setHoverIdx(null);
        setLiveFocusIdx(null);
      });
      return () => cancelAnimationFrame(raf);
    }

    const prevMap = prevValuesByDateRef.current;
    prevValuesByDateRef.current = nextMap;
    if (!prevMap) return;

    let changedIdx: number | null = null;
    for (let i = data.length - 1; i >= 0; i--) {
      const key = data[i].dateIso ?? `${i}:${data[i].label}`;
      const prevVal = prevMap.get(key);
      const curVal = Number(data[i].value) || 0;
      if (prevVal !== undefined && prevVal !== curVal) {
        changedIdx = i;
        break;
      }
    }
    if (changedIdx !== null) {
      const targetIdx = changedIdx;
      const raf = requestAnimationFrame(() => {
        setLiveFocusIdx(targetIdx);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [data]);

  const defaultIdx = useMemo(() => pickDefaultActiveIndex(data), [data]);
  const n = data.length;
  const resolvedDefault = liveFocusIdx !== null && liveFocusIdx < n ? liveFocusIdx : defaultIdx;
  const activeIdx = n > 0 ? Math.min(Math.max(hoverIdx ?? resolvedDefault, 0), n - 1) : 0;

  const maxValue = useMemo(
    () => data.reduce((m, item) => Math.max(m, Number(item.value) || 0), 0),
    [data],
  );
  const { yMax, ticks } = useMemo(() => buildScale(maxValue), [maxValue]);

  const targetRatios = useMemo(
    () => data.map((pt) => Math.min(Math.max((Number(pt.value) || 0) / Math.max(yMax, 1), 0), 1)),
    [data, yMax],
  );
  const { ratios: animatedRatios, isMorphing } = useAnimatedRatios(targetRatios);

  const isMobile = width > 0 && width < 520;
  const svgHeight = isMobile ? Math.min(height, 236) : height;
  const plotTop = 10;
  const plotBottom = svgHeight - (isMobile ? 34 : 38);
  const plotHeight = Math.max(plotBottom - plotTop, 1);

  const gridLeft = isMobile ? 32 : 46;
  const gridRight = Math.max(gridLeft + 40, width - (isMobile ? 4 : 8));
  const gridSpan = gridRight - gridLeft;
  const insetX = Math.round(gridSpan * (n > 10 ? (isMobile ? 0.025 : 0.035) : isMobile ? 0.05 : 0.065));
  const plotLeft = gridLeft + insetX;
  const plotRight = Math.max(plotLeft + 20, gridRight - insetX);
  const stepX = n > 1 ? (plotRight - plotLeft) / (n - 1) : 0;

  const pts = useMemo(
    () =>
      data.map((_, i) => ({
        x: plotLeft + i * stepX,
        y: plotBottom - (animatedRatios[i] ?? 0) * plotHeight,
      })),
    [data, animatedRatios, plotLeft, stepX, plotBottom, plotHeight],
  );

  const curvePath = useMemo(
    () => buildMonotoneSplinePath(pts, plotTop, plotBottom),
    [pts, plotTop, plotBottom],
  );
  const areaPath = useMemo(() => {
    if (pts.length < 2 || !curvePath) return "";
    return `${curvePath} L${pts[pts.length - 1].x.toFixed(2)},${plotBottom.toFixed(2)} L${pts[0].x.toFixed(2)},${plotBottom.toFixed(2)} Z`;
  }, [curvePath, pts, plotBottom]);

  // Tính nhãn trục hoành không chồng lấn khi hiển thị 14 hoặc 30 ngày
  const visibleXIndices = useMemo(() => {
    const visible = new Set<number>();
    if (n <= 8 || stepX <= 0) {
      for (let i = 0; i < n; i++) visible.add(i);
      return visible;
    }
    const minGapPx = isMobile ? 44 : 54;
    const stride = Math.max(1, Math.ceil(minGapPx / stepX));
    // Căn nhịp từ ngày cuối (Hôm nay) lùi về đầu để mốc Hôm nay luôn hiển thị rõ
    for (let i = n - 1; i >= 0; i -= stride) {
      visible.add(i);
    }
    visible.add(0);
    // Nếu điểm đầu và điểm kế tiếp quá sát nhau thì ẩn điểm kế tiếp để giữ mốc đầu + mốc cuối
    for (const idx of Array.from(visible)) {
      if (idx !== 0 && idx !== n - 1 && idx * stepX < minGapPx * 0.72) {
        visible.delete(idx);
      }
    }
    return visible;
  }, [n, stepX, isMobile]);

  useIsomorphicLayoutEffect(() => {
    geomRef.current = { plotLeft, stepX, n };
  }, [plotLeft, stepX, n]);

  // Hỗ trợ cảm ứng vuốt ngang mượt mà qua từng ngày trên điện thoại / máy tính bảng mà vẫn giữ cuộn dọc tự nhiên
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;

    const applyClientX = (clientX: number, forceMeasure = false) => {
      const { plotLeft: pLeft, stepX: sX, n: count } = geomRef.current;
      if (count <= 1 || sX <= 0) return;
      if (forceMeasure || cachedLeftRef.current === null) {
        cachedLeftRef.current = el.getBoundingClientRect().left;
      }
      const relX = clientX - cachedLeftRef.current - pLeft;
      const nextIdx = Math.round(relX / sX);
      const clamped = Math.min(Math.max(nextIdx, 0), count - 1);
      setHoverIdx((prev) => (prev === clamped ? prev : clamped));
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) {
        touchModeRef.current = "idle";
        setIsScrubbing(false);
        return;
      }
      const t = ev.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      touchModeRef.current = "undecided";
      applyClientX(t.clientX, true);
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1 || touchModeRef.current === "idle" || touchModeRef.current === "scroll") {
        return;
      }
      const t = ev.touches[0];
      const absX = Math.abs(t.clientX - startX);
      const absY = Math.abs(t.clientY - startY);

      if (touchModeRef.current === "undecided") {
        if (absX >= 5 && absX >= absY * 0.75) {
          touchModeRef.current = "scrub";
          setIsScrubbing(true);
        } else if (absY > 9 && absY > absX * 1.25) {
          touchModeRef.current = "scroll";
          setIsScrubbing(false);
          return;
        }
      }

      if (touchModeRef.current === "scrub") {
        if (ev.cancelable) ev.preventDefault();
        applyClientX(t.clientX);
      } else if (absX >= absY) {
        applyClientX(t.clientX);
      }
    };

    const endTouch = () => {
      touchModeRef.current = "idle";
      cachedLeftRef.current = null;
      setIsScrubbing(false);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endTouch, { passive: true });
    el.addEventListener("touchcancel", endTouch, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endTouch);
      el.removeEventListener("touchcancel", endTouch);
    };
  }, []);

  if (n === 0) {
    return null;
  }

  const activePoint = pts[activeIdx] ?? { x: plotLeft, y: plotBottom };
  const activeData = data[activeIdx];
  const rawActiveVal = Number(activeData?.value) || 0;
  const formattedVal = rawActiveVal.toLocaleString("vi-VN");

  const sprayCnt = Number(activeData?.sprayCount) || 0;
  const journalCnt = Number(activeData?.journalCount) || 0;
  const calloutHeader = activeData?.label ? `${activeData.label} - ${metricLabel}` : metricLabel;
  const calloutSub =
    sprayCnt > 0 && journalCnt > 0
      ? `${journalCnt} canh tác, ${sprayCnt} phun thuốc`
      : sprayCnt > 0 && journalCnt === 0
        ? `${sprayCnt} lần phun thuốc`
        : null;

  // Neo hộp chú thích phía trên đường cong nhưng không bao giờ che khuất điểm dữ liệu thực
  const secondGridFromTopY = plotTop + plotHeight / INTERVAL_COUNT;
  const pinY = Math.max(plotTop + 12, Math.min(secondGridFromTopY, activePoint.y - 24));
  const estCalloutWidth = calloutSub ? (isMobile ? 162 : 176) : isMobile ? 138 : 154;
  const canFitRight = width <= 0 || activePoint.x + 13 + estCalloutWidth <= width - 2;
  const canFitLeft = activePoint.x - 13 - estCalloutWidth >= 2;
  const flipCalloutLeft = !canFitRight && (canFitLeft || activePoint.x > width * 0.5);

  const selectAtClientX = (el: HTMLDivElement, clientX: number, forceMeasure = false) => {
    if (n <= 1 || stepX <= 0) return;
    if (forceMeasure || cachedLeftRef.current === null) {
      cachedLeftRef.current = el.getBoundingClientRect().left;
    }
    const relX = clientX - cachedLeftRef.current - plotLeft;
    const nextIdx = Math.round(relX / stepX);
    const clamped = Math.min(Math.max(nextIdx, 0), n - 1);
    setHoverIdx((prev) => (prev === clamped ? prev : clamped));
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      if (touchModeRef.current === "idle") {
        selectAtClientX(e.currentTarget, e.clientX, true);
      }
      return;
    }
    cachedLeftRef.current = e.currentTarget.getBoundingClientRect().left;
  };

  const handlePointerEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    cachedLeftRef.current = e.currentTarget.getBoundingClientRect().left;
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      if (touchModeRef.current === "scroll") return;
      selectAtClientX(e.currentTarget, e.clientX);
      return;
    }
    selectAtClientX(e.currentTarget, e.clientX);
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    selectAtClientX(e.currentTarget, e.clientX, true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      setHoverIdx(Math.min(activeIdx + 1, n - 1));
    } else if (e.key === "ArrowLeft") {
      setHoverIdx(Math.max(activeIdx - 1, 0));
    } else if (e.key === "Escape") {
      setHoverIdx(null);
    } else {
      return;
    }
    e.preventDefault();
  };

  return (
    <div
      ref={wrapRef}
      className={`dash-insight-stage${isMorphing ? " is-morphing" : ""}${isScrubbing ? " is-scrubbing" : ""}`}
      style={{ minHeight: svgHeight }}
      role="img"
      aria-label={`${ariaLabel}: ngày ${activeData?.label ?? ""}, ${formattedVal} ${metricLabel.toLowerCase()}`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={(e) => {
        cachedLeftRef.current = null;
        if (e.pointerType !== "touch") setHoverIdx(null);
      }}
      onPointerCancel={() => {
        cachedLeftRef.current = null;
        setIsScrubbing(false);
      }}
      onClick={handleClick}
      onBlur={() => setHoverIdx(null)}
      onKeyDown={handleKeyDown}
    >
      {width > 0 && (
        <>
          <svg
            width={width}
            height={svgHeight}
            className="dash-insight-svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`${uid}-dot`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#343438" />
                <stop offset="100%" stopColor="#111113" />
              </linearGradient>
              <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#18181b" stopOpacity="0.065" />
                <stop offset="100%" stopColor="#18181b" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Hệ đường lưới ngang mảnh và trục tung bên trái */}
            {ticks.map((tickVal) => {
              const rawY = plotBottom - (tickVal / yMax) * plotHeight;
              const crispY = Math.round(rawY) + 0.5;
              return (
                <g key={tickVal}>
                  <text
                    x={0}
                    y={rawY}
                    textAnchor="start"
                    dominantBaseline="central"
                    className="dash-insight-y-label"
                  >
                    {tickVal.toLocaleString("vi-VN")}
                  </text>
                  <line
                    x1={gridLeft}
                    y1={crispY}
                    x2={gridRight}
                    y2={crispY}
                    stroke="#ececee"
                    strokeWidth={1}
                  />
                </g>
              );
            })}

            {/* Lớp nền bóng nhẹ dưới đường cong giúp đọc độ cao trực quan */}
            {areaPath && <path d={areaPath} fill={`url(#${uid}-area)`} />}

            {/* Đường cong chính nét liền màu đen than */}
            <path
              d={curvePath}
              fill="none"
              stroke="#18181b"
              strokeWidth={isMobile ? 2.25 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Đường gióng dọc nét đứt tại mốc đang chọn */}
            <line
              x1={activePoint.x}
              y1={plotTop}
              x2={activePoint.x}
              y2={plotBottom}
              stroke="#18181b"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              className="dash-insight-guide"
            />

            {/* Điểm neo chính xác ngay trên đường cong tại giá trị thực tế */}
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r={4.25}
              fill="#ffffff"
              stroke="#18181b"
              strokeWidth={2.25}
              className="dash-insight-curve-dot"
            />

            {/* Nút tròn đen đối chiếu hộp chú thích trên đường gióng dọc */}
            <circle cx={activePoint.x} cy={pinY} r={8.5} fill="#ffffff" className="dash-insight-pin" />
            <circle cx={activePoint.x} cy={pinY} r={6.5} fill={`url(#${uid}-dot)`} className="dash-insight-pin" />

            {/* Nhãn ngày tháng trục hoành */}
            {data.map((pt, i) => {
              const isSelected = i === activeIdx;
              if (!visibleXIndices.has(i) && !isSelected) return null;
              // Khi đang trỏ vào ngày không nằm trên nhịp chia đều, tạm ẩn nhãn chia đều quá sát cạnh bên để không đè chữ
              if (!isSelected && hoverIdx !== null && n > 8) {
                const distPx = Math.abs((pts[i]?.x ?? 0) - activePoint.x);
                if (distPx < (isMobile ? 34 : 40)) return null;
              }
              const x = pts[i]?.x ?? plotLeft;
              return (
                <text
                  key={pt.dateIso ?? `${pt.label}-${i}`}
                  x={x}
                  y={plotBottom + (isMobile ? 22 : 25)}
                  textAnchor="middle"
                  className={`dash-insight-x-label${isSelected ? " is-active" : ""}`}
                >
                  {pt.label}
                </text>
              );
            })}
          </svg>

          {/* Hộp chú thích nền đen có mũi nhọn trỏ vào nút tròn */}
          <div
            className={`dash-insight-callout${flipCalloutLeft ? " is-left" : " is-right"}`}
            style={{
              left: flipCalloutLeft ? activePoint.x - 13 : activePoint.x + 13,
              top: pinY,
            }}
            aria-hidden="true"
          >
            <span className="dash-insight-callout-label">{calloutHeader}</span>
            <strong className="dash-insight-callout-val">{formattedVal}</strong>
            {calloutSub && <span className="dash-insight-callout-sub">{calloutSub}</span>}
          </div>
        </>
      )}
    </div>
  );
}
