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

function buildScale(maxValue: number): { yMax: number; ticks: number[] } {
  const targetTop = Math.max(maxValue * 1.42, INTERVAL_COUNT);
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

/**
 * Đường cong cubic Bezier mượt (Catmull-Rom kẹp biên [plotTop, plotBottom])
 * giữ đỉnh và đáy tròn tự nhiên như biểu đồ biên tập nhưng không vượt xuống dưới mức 0.
 */
function buildSmoothCurvePath(
  pts: { x: number; y: number }[],
  plotTop: number,
  plotBottom: number,
): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;

  const slopes: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const isBaseline = pts[i].y >= plotBottom - 0.5;
    if (isBaseline) {
      slopes[i] = 0;
      continue;
    }
    if (i === 0) {
      slopes[i] = (pts[1].y - pts[0].y) / Math.max(pts[1].x - pts[0].x, 1);
    } else if (i === n - 1) {
      slopes[i] = (pts[n - 1].y - pts[n - 2].y) / Math.max(pts[n - 1].x - pts[n - 2].x, 1);
    } else {
      const prevDiff = pts[i].y - pts[i - 1].y;
      const nextDiff = pts[i + 1].y - pts[i].y;
      // Tại cực đại hoặc cực tiểu cục bộ, đặt tiếp tuyến ngang để đỉnh uốn tròn mượt mà và không vọt quá trị số thật
      if (prevDiff * nextDiff <= 0) {
        slopes[i] = 0;
      } else {
        slopes[i] = (pts[i + 1].y - pts[i - 1].y) / Math.max(pts[i + 1].x - pts[i - 1].x, 1);
      }
    }
  }

  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = p1.x - p0.x;
    const h = dx / 2.65;
    const cp1x = p0.x + h;
    const cp2x = p1.x - h;
    const cp1y = Math.min(plotBottom, Math.max(plotTop, p0.y + slopes[i] * h));
    const cp2y = Math.min(plotBottom, Math.max(plotTop, p1.y - slopes[i + 1] * h));
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  }
  return d;
}

function pickDefaultActiveIndex(data: InsightPoint[]): number {
  if (data.length === 0) return 0;
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i].value > bestVal) {
      bestVal = data[i].value;
      bestIdx = i;
    }
  }
  if (bestVal <= 0) {
    return Math.min(Math.max(1, Math.floor(data.length / 3)), data.length - 1);
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
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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

  const defaultIdx = useMemo(() => pickDefaultActiveIndex(data), [data]);
  const n = data.length;
  const activeIdx = n > 0 ? Math.min(Math.max(hoverIdx ?? defaultIdx, 0), n - 1) : 0;

  const maxValue = useMemo(
    () => data.reduce((m, item) => Math.max(m, Number(item.value) || 0), 0),
    [data],
  );
  const { yMax, ticks } = useMemo(() => buildScale(maxValue), [maxValue]);

  const isMobile = width > 0 && width < 520;
  const svgHeight = isMobile ? Math.min(height, 236) : height;
  const plotTop = 10;
  const plotBottom = svgHeight - (isMobile ? 34 : 38);
  const plotHeight = Math.max(plotBottom - plotTop, 1);

  const gridLeft = isMobile ? 32 : 46;
  const gridRight = Math.max(gridLeft + 40, width - (isMobile ? 4 : 8));
  const gridSpan = gridRight - gridLeft;
  const insetX = Math.round(gridSpan * (isMobile ? 0.05 : 0.065));
  const plotLeft = gridLeft + insetX;
  const plotRight = Math.max(plotLeft + 20, gridRight - insetX);
  const stepX = n > 1 ? (plotRight - plotLeft) / (n - 1) : 0;

  const pts = useMemo(
    () =>
      data.map((pt, i) => ({
        x: plotLeft + i * stepX,
        y: plotBottom - ((Number(pt.value) || 0) / yMax) * plotHeight,
      })),
    [data, plotLeft, stepX, plotBottom, yMax, plotHeight],
  );

  const curvePath = useMemo(
    () => buildSmoothCurvePath(pts, plotTop, plotBottom),
    [pts, plotTop, plotBottom],
  );

  if (n === 0) {
    return null;
  }

  const activePoint = pts[activeIdx] ?? { x: plotLeft, y: plotBottom };
  const activeData = data[activeIdx];
  const formattedVal = (Number(activeData?.value) || 0).toLocaleString("vi-VN");

  // Đặt nút tròn đen đúng trên đường lưới thứ 2 tính từ đỉnh (như mốc 30/35 trên mẫu tham chiếu), luôn cao hơn đường cong
  const secondGridFromTopY = plotTop + plotHeight / INTERVAL_COUNT;
  const pinY = Math.max(plotTop + 12, Math.min(secondGridFromTopY, activePoint.y - 22));
  const flipCalloutLeft = width > 0 && activePoint.x + 148 > width;

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

  const handlePointerEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    cachedLeftRef.current = e.currentTarget.getBoundingClientRect().left;
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
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
      className="dash-insight-stage"
      style={{ minHeight: svgHeight }}
      role="img"
      aria-label={`${ariaLabel}: ngày ${activeData?.label ?? ""}, ${formattedVal} ${metricLabel.toLowerCase()}`}
      tabIndex={0}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={(e) => {
        cachedLeftRef.current = null;
        if (e.pointerType !== "touch") setHoverIdx(null);
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
            />

            {/* Nút tròn đen có vòng tách nền trắng mảnh trên đường gióng dọc */}
            <circle cx={activePoint.x} cy={pinY} r={8.5} fill="#ffffff" />
            <circle cx={activePoint.x} cy={pinY} r={6.5} fill={`url(#${uid}-dot)`} />

            {/* Nhãn ngày tháng trục hoành */}
            {data.map((pt, i) => {
              const x = pts[i]?.x ?? plotLeft;
              const isSelected = i === activeIdx;
              return (
                <text
                  key={`${pt.label}-${i}`}
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
            <span className="dash-insight-callout-label">{metricLabel}</span>
            <strong className="dash-insight-callout-val">{formattedVal}</strong>
          </div>
        </>
      )}
    </div>
  );
}

