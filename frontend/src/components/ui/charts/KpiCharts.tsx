"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import "./charts.css";

/**
 * Bộ biểu đồ nhỏ cho thẻ số liệu, lấy cảm hứng từ các mẫu "soft dashboard":
 * vùng gradient mờ dần, chấm đánh dấu phát sáng, tooltip dạng viên thuốc,
 * đồng hồ bán nguyệt và cột bo tròn. Vẽ bằng SVG/CSS thuần để kiểm soát hoàn toàn kiểu dáng.
 */

export type ChartTone = "lime" | "sky" | "ink" | "rose" | "amber";

export interface ChartPoint {
  label: string;
  value: number;
  shortLabel?: string;
}

type Highlight = "max" | "last" | number;

const defaultFormat = (v: number) => v.toLocaleString("vi-VN");
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Đo bề rộng phần tử để vẽ SVG đúng pixel (chữ không bị co giãn theo viewBox). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const initial = Math.round(el.clientWidth);
    if (initial > 0) setWidth(initial);
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect?.width ?? 0);
      if (w > 0) {
        setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function resolveIndex(data: ChartPoint[], highlight: Highlight, preferLastOnTie = false): number {
  if (typeof highlight === "number") return Math.min(Math.max(highlight, 0), data.length - 1);
  if (highlight === "last") return data.length - 1;
  let best = 0;
  data.forEach((p, i) => {
    if (preferLastOnTie ? p.value >= data[best].value : p.value > data[best].value) best = i;
  });
  return best;
}

/** Rút gọn nhãn trục X cho biểu đồ miền xu hướng để không bao giờ đè chữ trên thẻ nhỏ. */
function formatAreaAxisLabel(p: ChartPoint, stepPx: number): string {
  if (p.shortLabel) return p.shortLabel;
  const ym = p.label.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const m = parseInt(ym[2], 10);
    const yShort = ym[1].slice(2);
    if (stepPx < 56) return `T${m}`;
    if (stepPx < 80) return `T${m}/${yShort}`;
    return `${ym[2]}/${ym[1]}`;
  }
  if (stepPx < 48 && p.label.length > 5) {
    const num = p.label.match(/\d+$/)?.[0];
    if (num) return `#${num}`;
    return p.label.slice(0, 4);
  }
  return p.label;
}

/** Đường cong đơn điệu (Fritsch–Carlson) — mượt nhưng không "vọt" quá giá trị thật. */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return "";
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/* ─────────────────────────── AreaTrend ─────────────────────────── */

interface AreaTrendProps {
  data: ChartPoint[];
  tone?: ChartTone;
  height?: number;
  highlight?: Highlight;
  unit?: string;
  formatValue?: (v: number) => string;
  ariaLabel: string;
  caption?: string;
}

const PAD_TOP = 50;
const PAD_BOTTOM = 24;
const PAD_X = 14;

/** Sinh các vạch kẻ thước kỹ thuật (ruler graduations) ở phía sau vạch phân cách như hình mẫu */
function generateRulerTicks(
  startX: number,
  endX: number,
  plotTop: number,
  plotBottom: number,
  isCompact: boolean
) {
  const ticks: { x: number; y: number }[] = [];
  const availableWidth = endX - startX;
  if (availableWidth < 8) return ticks;

  const step = isCompact ? 5.2 : 6.0;
  const count = Math.floor(availableWidth / step);
  if (count <= 0) return ticks;

  const dx = availableWidth / count;
  const plotH = plotBottom - plotTop;
  const maxH = plotH * (isCompact ? 0.70 : 0.78);

  for (let k = 0; k < count; k++) {
    const tx = startX + k * dx;
    // Tăng dần độ cao cho 3 vạch đầu tiên cạnh kim mốc
    const ramp = Math.min(0.28 + (k / 3) * 0.72, 1);
    const mod = k % 6;
    let factor: number;
    if (mod === 0) factor = 0.92;       // Vạch chính dài nhất
    else if (mod === 3) factor = 0.70;  // Vạch chính phụ
    else if (mod === 1 || mod === 5) factor = 0.44; // Vạch trung bình
    else factor = 0.22;                 // Vạch chia nhỏ

    const h = Math.max(maxH * factor * ramp, isCompact ? 5 : 8);
    ticks.push({ x: tx, y: plotBottom - h });
  }
  return ticks;
}

export function AreaTrend({
  data,
  tone = "lime",
  height = 175,
  highlight = "max",
  unit = "",
  formatValue = defaultFormat,
  ariaLabel,
  caption,
}: AreaTrendProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const defaultIdx = n ? resolveIndex(data, highlight, true) : 0;
  const active = hover ?? defaultIdx;

  if (n < 2) return <div className="vc vc-empty" role="img" aria-label={ariaLabel} />;

  const values = data.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const allZero = min === 0 && max === 0;
  const span = max - min || Math.max(Math.abs(max), 1);
  const lo = allZero ? -0.45 : min - span * 0.35;
  const hi = allZero ? 1.0 : max + span * 0.12;

  const isMini = width > 0 && width < 220;
  const isCompact = width > 0 && width < 460;
  const padX = isMini ? 12 : PAD_X;

  const padTop = isMini ? 24 : isCompact ? 32 : PAD_TOP;
  const padBottom = isMini ? 18 : isCompact ? 20 : PAD_BOTTOM;
  const effectiveHeight = isMini
    ? Math.min(height, caption ? 98 : 112)
    : isCompact
    ? Math.min(height, caption ? 132 : 142)
    : height;

  const plotTop = padTop;
  const plotBottom = effectiveHeight - padBottom;
  // Trên thẻ nhỏ (< 300px), để biểu đồ trải đều toàn chiều ngang thẻ cho cân đối
  const reserveRight =
    width < 300 ? 0 : Math.min(Math.max(width * 0.22, isCompact ? 44 : 64), 110);
  const innerW = Math.max(width - padX * 2 - reserveRight, 1);
  const step = innerW / Math.max(n - 1, 1);

  const waveTop = plotTop + (isMini ? 6 : isCompact ? 10 : 16);
  const pts = data.map((p, i) => ({
    x: padX + i * step,
    y: plotBottom - ((p.value - lo) / (hi - lo)) * (plotBottom - waveTop),
  }));

  // Sóng tiền cảnh (aurora wave)
  const line = monotonePath(pts);
  const area = `${line} L${pts[n - 1].x},${plotBottom} L${pts[0].x},${plotBottom} Z`;

  // Sóng hậu cảnh (mist wave) tạo hiệu ứng đa tầng mờ ảo
  const backPts = pts.map((p, i) => {
    const wave = Math.sin((i / Math.max(n - 1, 1)) * Math.PI * 2.3) * (isMini ? 6 : 10);
    return {
      x: p.x,
      y: Math.min(Math.max(p.y + wave - (isMini ? 4 : 6), plotTop + 4), plotBottom - 2),
    };
  });
  const backLine = monotonePath(backPts);
  const backArea = `${backLine} L${pts[n - 1].x},${plotBottom} L${pts[0].x},${plotBottom} Z`;

  const cur = pts[active];
  const lastX = pts[n - 1].x;
  // Luôn hiển thị trọn vẹn dải sóng tới điểm cuối (hoặc điểm đang chọn nếu ở giữa trên khung lớn)
  const clipW = reserveRight > 0 && active > 0 ? cur.x : lastX;
  const rulerStart = (reserveRight > 0 && active > 0 ? cur.x : lastX) + 5.5;

  // Sinh các vạch kẻ thước kỹ thuật phía sau kim mốc (chỉ khi có vùng reserveRight)
  const rulerTicks =
    reserveRight > 0
      ? generateRulerTicks(rulerStart, width - padX, plotTop, plotBottom, isCompact)
      : [];

  const valText = `${formatValue(data[active].value)}${unit}`;
  const pinDotY = isMini ? plotTop + 3 : isCompact ? plotTop + 4 : plotTop + 6;
  const textY = isMini ? pinDotY - 6 : isCompact ? pinDotY - 8 : pinDotY - 11;
  const valFontSize = isMini ? 12.5 : isCompact ? 16 : 24;
  const estHalfTextW = Math.ceil(valText.length * valFontSize * 0.31) + padX;
  const textMinX = Math.min(estHalfTextW, width / 2);
  const textMaxX = Math.max(width - estHalfTextW, width / 2);
  const textClampX = Math.min(Math.max(cur.x, textMinX), textMaxX);

  const axisLabels = data.map((p) => formatAreaAxisLabel(p, step));
  const charW = isMini ? 5.2 : isCompact ? 5.6 : 6.2;
  const labelWidths = axisLabels.map((lbl) => lbl.length * charW + 4);
  const showLabel = new Array<boolean>(n).fill(true);

  let hasOverlap = false;
  for (let i = 0; i < n - 1; i++) {
    const gap = pts[i + 1].x - pts[i].x;
    const minNeeded = (labelWidths[i] + labelWidths[i + 1]) / 2 + 4;
    if (gap < minNeeded) {
      hasOverlap = true;
      break;
    }
  }
  if (hasOverlap) {
    showLabel.fill(false);
    showLabel[active] = true;
    let leftBound = pts[active].x - labelWidths[active] / 2;
    for (let i = active - 1; i >= 0; i--) {
      const r = pts[i].x + labelWidths[i] / 2;
      if (leftBound - r >= 5) {
        showLabel[i] = true;
        leftBound = pts[i].x - labelWidths[i] / 2;
      }
    }
    let rightBound = pts[active].x + labelWidths[active] / 2;
    for (let i = active + 1; i < n; i++) {
      const l = pts[i].x - labelWidths[i] / 2;
      if (l - rightBound >= 5) {
        showLabel[i] = true;
        rightBound = pts[i].x + labelWidths[i] / 2;
      }
    }
  }

  const selectPointAtClientX = (el: HTMLDivElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    const idx = Math.round((clientX - rect.left - padX) / step);
    const clamped = Math.min(Math.max(idx, 0), n - 1);
    setHover((prev) => (prev === clamped ? prev : clamped));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    selectPointAtClientX(e.currentTarget, e.clientX);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    selectPointAtClientX(e.currentTarget, e.clientX);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") setHover(Math.min(active + 1, n - 1));
    else if (e.key === "ArrowLeft") setHover(Math.max(active - 1, 0));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={wrapRef}
      className="vc vc-area vc-aurora-card"
      data-tone={tone}
      style={{ minHeight: effectiveHeight }}
      role="img"
      aria-label={`${ariaLabel}. ${data[active].label} ${valText}`}
      tabIndex={0}
      onPointerMove={onMove}
      onClick={onClick}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") setHover(null);
      }}
      onBlur={() => setHover(null)}
      onKeyDown={onKey}
    >
      {width > 0 && (
        <>
          <svg width={width} height={effectiveHeight} aria-hidden="true" style={{ overflow: "visible" }}>
            <defs>
              {/* Dải gradient cực quang: Xanh lá mạ -> Xanh bạc hà -> Vàng hổ phách -> Cam đào -> Hồng san hô */}
              <linearGradient id={`${uid}aurora`} gradientUnits="userSpaceOnUse" x1={padX} y1="0" x2={Math.max(clipW, padX + 20)} y2="0">
                <stop offset="0%" stopColor="#4ade80" stopOpacity="0.88" />
                <stop offset="22%" stopColor="#86efac" stopOpacity="0.88" />
                <stop offset="50%" stopColor="#fde047" stopOpacity="0.90" />
                <stop offset="78%" stopColor="#fb923c" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.96" />
              </linearGradient>

              {/* Dải màu cho vạch kẻ thước ở cuối: Cam đào san hô chuyển dần sang hồng thắm */}
              <linearGradient id={`${uid}ruler`} gradientUnits="userSpaceOnUse" x1={rulerStart} y1="0" x2={width - padX} y2="0">
                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.45" />
                <stop offset="40%" stopColor="#f43f5e" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0.65" />
              </linearGradient>

              {/* Mặt nạ cắt lớp sóng tại vạch phân cách và giữ phẳng đáy */}
              <clipPath id={`${uid}clip`}>
                <rect x="0" y="0" width={clipW + 1} height={plotBottom + 1} />
              </clipPath>
            </defs>

            {/* Các đường lưới ngang đứt nét rất nhẹ */}
            {[0, 1, 2].map((g) => {
              const y = plotTop + ((plotBottom - plotTop) * g) / 2;
              return <line key={g} className="vc-grid" x1={padX} x2={width - padX} y1={y} y2={y} />;
            })}

            {/* Tầng 1: Sóng sương mờ hậu cảnh (soft mist silhouette) */}
            <path
              d={backArea}
              fill="rgba(195, 215, 205, 0.30)"
              clipPath={`url(#${uid}clip)`}
            />

            {/* Tầng 2: Sóng cực quang phát sáng (aurora wave) */}
            <path
              d={area}
              fill={`url(#${uid}aurora)`}
              opacity="0.86"
              stroke={`url(#${uid}aurora)`}
              strokeWidth="5"
              strokeOpacity="0.22"
              strokeLinejoin="round"
              clipPath={`url(#${uid}clip)`}
            />

            {/* Tầng 3: Sống lưng nét cong nhẹ mờ thanh thoát */}
            <path
              d={line}
              fill="none"
              stroke={`url(#${uid}aurora)`}
              strokeWidth="1.6"
              clipPath={`url(#${uid}clip)`}
              opacity="0.65"
            />

            {/* Phía sau mốc: Các vạch kẻ thước kỹ thuật (ruler graduation marks) như hình mẫu */}
            {rulerTicks.map((nd, k) => (
              <line
                key={k}
                x1={nd.x}
                x2={nd.x}
                y1={nd.y}
                y2={plotBottom}
                stroke={`url(#${uid}ruler)`}
                strokeWidth={isCompact ? "1.15" : "1.3"}
                strokeLinecap="round"
              />
            ))}

            {/* Vạch dọc chấm chấm màu cam san hô tại điểm mốc */}
            <line
              x1={cur.x}
              x2={cur.x}
              y1={pinDotY}
              y2={plotBottom}
              stroke="#fb923c"
              strokeWidth={isCompact ? "1.15" : "1.3"}
              strokeDasharray="2.5 2.5"
            />

            {/* Chấm tròn pin màu cam ở đỉnh kim mốc như hình mẫu */}
            <circle cx={cur.x} cy={pinDotY} r={isMini ? 2.4 : isCompact ? 2.8 : 3.2} fill="#f97316" />

            {/* Số liệu cụ thể phía trên đỉnh kim */}
            <text
              x={textClampX}
              y={textY}
              textAnchor="middle"
              className="vc-aurora-val"
              style={{
                fontSize: valFontSize,
                fontWeight: isMini || isCompact ? 600 : 300,
              }}
            >
              {valText}
            </text>

            {/* Nhãn trục X phía đáy */}
            {data.map((_, i) => {
              if (!showLabel[i]) return null;
              const lbl = axisLabels[i];
              const halfLbl = labelWidths[i] / 2;
              const x = Math.min(Math.max(pts[i].x, padX + halfLbl - 2), width - padX - halfLbl + 2);
              return (
                <text
                  key={i}
                  className={i === active ? "vc-x is-on" : "vc-x"}
                  x={x}
                  y={effectiveHeight - (isMini ? 4 : 5)}
                  textAnchor="middle"
                  style={isMini ? { fontSize: 9 } : isCompact ? { fontSize: 9.5 } : undefined}
                >
                  {lbl}
                </text>
              );
            })}
          </svg>
          {caption && <p className="vc-aurora-caption" title={caption}>{caption}</p>}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── GaugeArc ─────────────────────────── */

interface GaugeArcProps {
  /** Giá trị phần trăm 0–100 */
  value: number;
  /** Mốc mục tiêu (0–100) hiển thị bằng vạch nhỏ */
  target?: number;
  unit?: string;
  caption?: string;
  tone?: ChartTone;
  ariaLabel: string;
}

const G_CX = 100;
const G_CY = 100;
const G_R = 80;

export function GaugeArc({ value, unit = "%", caption, tone = "lime", ariaLabel }: GaugeArcProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const v = Math.min(Math.max(value, 0), 100);
  const arc = `M${G_CX - G_R},${G_CY} A${G_R},${G_R} 0 0 1 ${G_CX + G_R},${G_CY}`;

  return (
    <div className="vc vc-gauge" data-tone={tone} role="img" aria-label={`${ariaLabel}: ${value}${unit}${caption ? `, ${caption}` : ""}`}>
      <svg viewBox="0 10 200 108" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: "var(--vc-gauge-a)" }} />
            <stop offset="100%" style={{ stopColor: "var(--vc-gauge-b)" }} />
          </linearGradient>
        </defs>
        <path className="vc-track" d={arc} pathLength={100} />
        <path className="vc-arc" d={arc} pathLength={100} stroke={`url(#${uid}g)`} strokeDasharray={`${v} 100`} />
        <text className="vc-x" x={G_CX - G_R} y={G_CY + 14} textAnchor="middle">0</text>
        <text className="vc-x" x={G_CX + G_R} y={G_CY + 14} textAnchor="middle">100</text>
      </svg>
      <div className="vc-gauge-center">
        <strong>
          {value}
          <small>{unit}</small>
        </strong>
        {caption && <span>{caption}</span>}
      </div>
    </div>
  );
}

/* ─────────────────────────── SoftBars ─────────────────────────── */

interface SoftBarsProps {
  data: ChartPoint[];
  tone?: ChartTone;
  height?: number;
  highlight?: Highlight;
  unit?: string;
  formatValue?: (v: number) => string;
  formatAxisLabel?: (label: string, index: number, point: ChartPoint) => string;
  caption?: string;
  ariaLabel: string;
  activeIndex?: number | null;
  onActiveChange?: (index: number | null) => void;
}

const CAPSULE_TONES: Record<
  ChartTone,
  {
    active: string;
    mid: string;
    dim: string;
    glow: string;
    labelActive: string;
  }
> = {
  ink: {
    active: "#14372f",
    mid: "rgba(20, 55, 47, 0.44)",
    dim: "rgba(20, 55, 47, 0.22)",
    glow: "rgba(20, 55, 47, 0.24)",
    labelActive: "#14372f",
  },
  lime: {
    active: "#2e7d20",
    mid: "rgba(46, 125, 32, 0.44)",
    dim: "rgba(46, 125, 32, 0.22)",
    glow: "rgba(46, 125, 32, 0.26)",
    labelActive: "#236318",
  },
  sky: {
    active: "#1c6ea4",
    mid: "rgba(28, 110, 164, 0.44)",
    dim: "rgba(28, 110, 164, 0.22)",
    glow: "rgba(28, 110, 164, 0.24)",
    labelActive: "#165782",
  },
  rose: {
    active: "#c4503a",
    mid: "rgba(196, 80, 58, 0.44)",
    dim: "rgba(196, 80, 58, 0.22)",
    glow: "rgba(196, 80, 58, 0.24)",
    labelActive: "#a63e2a",
  },
  amber: {
    active: "#f59e0b",
    mid: "rgba(217, 119, 6, 0.44)",
    dim: "rgba(217, 119, 6, 0.22)",
    glow: "rgba(245, 158, 11, 0.28)",
    labelActive: "#b45309",
  },
};

export function SoftBars({
  data,
  tone = "lime",
  height = 150,
  highlight = "max",
  unit = "",
  formatValue = defaultFormat,
  formatAxisLabel,
  caption,
  ariaLabel,
  activeIndex,
  onActiveChange,
}: SoftBarsProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const resolvedHover = activeIndex !== undefined && activeIndex !== null ? activeIndex : hover;
  const active = resolvedHover ?? (n ? resolveIndex(data, highlight) : 0);

  const updateHover = useCallback(
    (idx: number | null) => {
      setHover(idx);
      onActiveChange?.(idx);
    },
    [onActiveChange]
  );
  const clear = useCallback(() => updateHover(null), [updateHover]);

  if (!n) return <div className="vc vc-empty" role="img" aria-label={ariaLabel} />;

  const isCompact = width > 0 && width < 260;
  const isMini = width > 0 && width < 200;
  const effectiveHeight = isMini ? 116 : isCompact ? 132 : height;

  const maxVal = Math.max(...data.map((p) => p.value), 0.0001);

  const PAD_TOP = isMini ? 34 : 38;
  const PAD_BOTTOM = isMini ? 20 : 22;
  const PAD_X = isMini ? 11 : isCompact ? 12 : 14;
  const plotW = Math.max(width - 2 * PAD_X, 10);
  const plotH = Math.max(effectiveHeight - PAD_TOP - PAD_BOTTOM, 24);
  const plotBottom = effectiveHeight - PAD_BOTTOM;

  const colors = CAPSULE_TONES[tone] ?? CAPSULE_TONES.lime;

  // Tọa độ X tâm mỗi cột
  const colW = plotW / n;
  const majorXs = data.map((_, i) => PAD_X + (i + 0.5) * colW);

  // Bề rộng thanh capsule bo tròn hai đầu (style pill bar)
  const baseBarW = Math.min(Math.max(colW * 0.42, isMini ? 10 : 13), 20);

  const bars = data.map((p, i) => {
    const val = Math.max(p.value, 0);
    const isOn = i === active;
    const w = isOn ? baseBarW + 1.5 : baseBarW;
    const rawH = (val / maxVal) * plotH;
    const h = val <= 0 ? w : Math.max(rawH, w);
    const x = majorXs[i] - w / 2;
    const y = plotBottom - h;

    // Phân tầng sắc độ theo vị trí tương quan với cột đang chọn (giống mẫu pill chart)
    let fill = colors.mid;
    if (isOn) {
      fill = colors.active;
    } else if (active > 0 && active < n - 1) {
      fill = i < active ? colors.mid : colors.dim;
    } else if (active === n - 1) {
      fill = i < Math.ceil((n - 1) / 2) ? colors.mid : colors.dim;
    } else {
      fill = i <= Math.floor(n / 2) ? colors.mid : colors.dim;
    }

    return {
      key: `${p.label}-${i}`,
      x,
      y,
      w,
      h,
      val,
      isOn,
      fill,
      cx: majorXs[i],
    };
  });

  // Xác định nhãn hiển thị cho từng cột mốc X
  const resolveAxisLabel = (p: ChartPoint, i: number, colWidth: number): string => {
    if (formatAxisLabel) return formatAxisLabel(p.label, i, p);
    if (p.shortLabel) {
      if (colWidth < 28 && p.shortLabel.length > 3) {
        const num = p.shortLabel.match(/\d+$/)?.[0];
        if (num) return num.padStart(2, "0");
      }
      return p.shortLabel;
    }
    const vtMatch = p.label.match(/VT-0*(\d+)/i);
    if (vtMatch) {
      const num = parseInt(vtMatch[1], 10);
      const padded = num < 10 ? `0${num}` : `${num}`;
      return colWidth < 32 ? padded : `VT-${padded}`;
    }
    if (p.label.length > 5 && colWidth < 52) {
      const num = p.label.match(/\d+$/)?.[0];
      if (num) return `#${num}`;
      return p.label.slice(0, Math.max(Math.floor(colWidth / 7), 3));
    }
    return p.label;
  };

  const axisLabels = data.map((p, i) => resolveAxisLabel(p, i, colW));

  // Hiển thị đầy đủ nhãn trục X cho <= 8 cột; chỉ lọc khi quá dày
  const labelWidths = axisLabels.map((lbl) => lbl.length * 5.2 + 4);
  const showLabel = new Array<boolean>(n).fill(true);

  if (n > 8) {
    let hasOverlap = false;
    for (let i = 0; i < n - 1; i++) {
      const gap = majorXs[i + 1] - majorXs[i];
      const minNeeded = (labelWidths[i] + labelWidths[i + 1]) / 2 + 2;
      if (gap < minNeeded) {
        hasOverlap = true;
        break;
      }
    }

    if (hasOverlap) {
      showLabel.fill(false);
      showLabel[active] = true;

      let leftBound = majorXs[active] - labelWidths[active] / 2;
      for (let i = active - 1; i >= 0; i--) {
        const r = majorXs[i] + labelWidths[i] / 2;
        if (leftBound - r >= 4) {
          showLabel[i] = true;
          leftBound = majorXs[i] - labelWidths[i] / 2;
        }
      }

      let rightBound = majorXs[active] + labelWidths[active] / 2;
      for (let i = active + 1; i < n; i++) {
        const l = majorXs[i] - labelWidths[i] / 2;
        if (l - rightBound >= 4) {
          showLabel[i] = true;
          rightBound = majorXs[i] + labelWidths[i] / 2;
        }
      }
    }
  }

  const curPoint = data[active] ?? data[0];
  const curBar = bars[active] ?? bars[0];
  const curX = curBar?.cx ?? PAD_X;
  const curY = curBar?.y ?? plotBottom;

  const valStr = `${formatValue(curPoint.value)}${unit}`;
  const charFactor = isMini ? 5.8 : 6.6;
  const padTip = isMini ? 18 : 24;
  const estTipW = Math.max(
    isMini ? 52 : 76,
    (curPoint.label.length + valStr.length) * charFactor + padTip
  );
  const halfTip = Math.min(estTipW / 2, Math.max(width / 2 - 8, 26));
  const edgePad = isMini ? 10 : 12;
  const textClampX = Math.max(halfTip + edgePad, Math.min(width - halfTip - edgePad, curX));

  return (
    <div
      ref={wrapRef}
      className="vc vc-ruler-bars vc-capsule-bars"
      data-tone={tone}
      style={{ height: effectiveHeight, position: "relative" }}
      role="img"
      aria-label={`${ariaLabel}. ${data.map((p) => `${p.label} ${formatValue(p.value)}${unit}`).join(", ")}`}
      onPointerLeave={clear}
    >
      {width > 0 && (
        <>
          {/* Tooltip hiển thị giá trị chính xác dạng viên thuốc */}
          <div
            className="vc-tip is-on"
            style={{
              left: textClampX,
              bottom: Math.min(
                Math.max(effectiveHeight - curY + (isMini ? 5 : 7), isMini ? 38 : 44),
                effectiveHeight - (isMini ? 24 : 28)
              ),
            }}
          >
            <span>{curPoint.label}</span>
            <b>
              {formatValue(curPoint.value)}
              {unit}
            </b>
          </div>

          <svg
            width={width}
            height={effectiveHeight}
            className="vc-ruler-svg"
            style={{ display: "block", overflow: "visible" }}
          >
            {/* Các cột capsule bo tròn 2 đầu ứng với số liệu thực tế */}
            {bars.map((b, i) => (
              <rect
                key={b.key}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={b.w / 2}
                ry={b.w / 2}
                fill={b.fill}
                style={{
                  transition:
                    "y 0.28s cubic-bezier(0.22, 1, 0.36, 1), height 0.28s cubic-bezier(0.22, 1, 0.36, 1), x 0.2s ease, width 0.2s ease, fill 0.2s ease, filter 0.2s ease",
                  filter: b.isOn ? `drop-shadow(0 4px 10px ${colors.glow})` : "none",
                  cursor: "pointer",
                }}
                onClick={() => updateHover(i)}
              />
            ))}

            {/* Nhãn trục X dưới chân mỗi cột */}
            {data.map((p, i) => {
              if (!showLabel[i]) return null;
              const isOn = i === active;
              return (
                <text
                  key={i}
                  className={isOn ? "vc-x is-on" : "vc-x"}
                  x={majorXs[i]}
                  y={plotBottom + 16}
                  textAnchor="middle"
                  style={{
                    fontSize: isMini ? 8.5 : isCompact ? 9.5 : 10.5,
                    fontWeight: isOn ? 700 : 500,
                    fill: isOn ? colors.labelActive : "rgba(20, 55, 47, 0.52)",
                    cursor: "pointer",
                    letterSpacing: "-0.01em",
                    transition: "fill 0.18s ease",
                  }}
                  onClick={() => updateHover(i)}
                >
                  {axisLabels[i]}
                </text>
              );
            })}

            {/* Vùng cảm ứng chọn cột */}
            {data.map((_, i) => (
              <rect
                key={i}
                x={PAD_X + i * colW}
                y={0}
                width={colW}
                height={effectiveHeight}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") updateHover(i);
                }}
                onClick={() => updateHover(i)}
              />
            ))}
          </svg>
        </>
      )}
      {caption && <p className="vc-aurora-caption" title={caption}>{caption}</p>}
    </div>
  );
}

/* ─────────────────────────── SmoothLineChart ─────────────────────────── */

function computeNiceScale(maxVal: number): { yMax: number; ticks: number[] } {
  const safeMax = maxVal > 0 ? maxVal : 1;
  const rawStep = safeMax / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / mag;
  let niceStep: number;
  if (residual <= 1) niceStep = 1 * mag;
  else if (residual <= 2) niceStep = 2 * mag;
  else if (residual <= 2.5) niceStep = 2.5 * mag;
  else if (residual <= 5) niceStep = 5 * mag;
  else niceStep = 10 * mag;

  const steps = Math.max(2, Math.ceil(safeMax / niceStep));
  const yMax = Math.round(steps * niceStep * 1000) / 1000;
  const ticks: number[] = [];
  for (let i = 0; i <= steps; i++) {
    ticks.push(Math.round(i * niceStep * 1000) / 1000);
  }
  return { yMax, ticks };
}

/**
 * Biểu đồ đường cong mượt (smooth spline line + soft vertical green gradient fill)
 * theo đúng tỷ lệ trục Y (0 -> yMax) và khoảng chia đều trục X.
 */
export function SmoothLineChart({
  data,
  tone = "lime",
  height = 148,
  highlight = "max",
  unit = "",
  formatValue = defaultFormat,
  ariaLabel,
  caption,
  activeIndex,
  onActiveChange,
}: SoftBarsProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const defaultIdx = n ? resolveIndex(data, highlight) : 0;
  const externalIdx =
    activeIndex !== undefined && activeIndex !== null && activeIndex >= 0 && activeIndex < n
      ? activeIndex
      : null;
  const active = hover ?? externalIdx ?? defaultIdx;

  const updateHover = (idx: number | null) => {
    setHover(idx);
    onActiveChange?.(idx);
  };

  if (n < 2) return <div className="vc vc-empty" role="img" aria-label={ariaLabel} />;

  const isMini = width > 0 && width < 220;
  const isCompact = width > 0 && width < 380;

  const effectiveHeight = isMini
    ? Math.min(height, 108)
    : isCompact
    ? Math.min(height, 138)
    : height;

  const padTop = isMini ? 32 : 38;
  const padBottom = isMini ? 20 : 24;
  const plotTop = padTop;
  const plotBottom = effectiveHeight - padBottom;
  const plotH = Math.max(plotBottom - plotTop, 28);

  const rightAxisW = isMini ? 22 : 28;
  const leftPad = isMini ? 14 : 18;
  const rightPad = rightAxisW + (isMini ? 8 : 12);
  const innerW = Math.max(width - leftPad - rightPad, 1);
  const stepX = innerW / Math.max(n - 1, 1);

  const maxVal = Math.max(...data.map((p) => p.value), 0.1);
  const { yMax, ticks } = computeNiceScale(maxVal);

  const pts = data.map((p, i) => {
    const val = Math.max(0, p.value);
    const ratio = Math.min(val / yMax, 1);
    return {
      x: leftPad + i * stepX,
      y: plotBottom - ratio * plotH,
      value: p.value,
      label: p.label,
    };
  });

  const linePath = monotonePath(pts);
  const areaPath = `${linePath} L${pts[n - 1].x},${plotBottom} L${pts[0].x},${plotBottom} Z`;
  const minY = Math.min(...pts.map((p) => p.y));

  const resolveAxisLabel = (p: ChartPoint): string => {
    if (p.shortLabel) return p.shortLabel;
    const vtMatch = p.label.match(/VT-0*(\d+)/i);
    if (vtMatch) {
      const num = parseInt(vtMatch[1], 10);
      return `VT-${num < 10 ? `0${num}` : num}`;
    }
    return p.label;
  };

  const axisLabels = data.map((p) => resolveAxisLabel(p));
  const curPt = pts[active] ?? pts[0];
  const curData = data[active] ?? data[0];

  const valStr = `${formatValue(curData.value)}${unit}`;
  const estTipW = Math.max(
    isMini ? 72 : 88,
    (curData.label.length + valStr.length) * 6.8 + 26
  );
  const halfTip = Math.min(estTipW / 2, Math.max(width / 2 - 4, 36));
  const textClampX = Math.max(halfTip, Math.min(width - halfTip, curPt.x));

  const formatTick = (t: number) =>
    Number.isInteger(t)
      ? t.toString()
      : t.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

  return (
    <div
      ref={wrapRef}
      className="vc vc-ruler-bars vc-smooth-line"
      data-tone={tone}
      style={{ height: effectiveHeight, position: "relative" }}
      role="img"
      aria-label={`${ariaLabel}. ${data.map((p) => `${p.label} ${formatValue(p.value)}${unit}`).join(", ")}`}
      onPointerLeave={() => updateHover(null)}
    >
      {width > 0 && (
        <>
          <div
            className="vc-tip is-on"
            style={{
              left: textClampX,
              bottom: Math.min(
                Math.max(effectiveHeight - curPt.y + 8, 44),
                effectiveHeight - 28
              ),
            }}
          >
            <span>{curData.label}</span>
            <b>
              {formatValue(curData.value)}
              {unit}
            </b>
          </div>

          <svg
            width={width}
            height={effectiveHeight}
            className="vc-ruler-svg"
            style={{ display: "block", overflow: "visible" }}
          >
            <defs>
              <linearGradient
                id={`${uid}lineFill`}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1={minY}
                x2="0"
                y2={plotBottom}
              >
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.32" />
                <stop offset="60%" stopColor="#4ade80" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#4ade80" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Lưới chia tỷ lệ chuẩn theo trục Y (0 -> yMax) */}
            {ticks.map((t) => {
              const ty = plotBottom - (t / yMax) * plotH;
              const isZero = t === 0;
              return (
                <g key={t}>
                  <line
                    x1={leftPad - 4}
                    y1={ty}
                    x2={leftPad + innerW + 4}
                    y2={ty}
                    stroke={isZero ? "rgba(20, 55, 47, 0.16)" : "rgba(20, 55, 47, 0.09)"}
                    strokeWidth={1}
                    strokeDasharray={isZero ? undefined : "3 3"}
                  />
                  <text
                    x={width - 2}
                    y={ty + 3}
                    textAnchor="end"
                    style={{
                      fontSize: isMini ? 8.5 : 9.5,
                      fontWeight: 500,
                      fill: "rgba(20, 55, 47, 0.45)",
                    }}
                  >
                    {formatTick(t)}
                  </text>
                </g>
              );
            })}

            {/* Vùng phủ màu xanh lá mờ dần bên dưới đường cong */}
            <path d={areaPath} fill={`url(#${uid}lineFill)`} />

            {/* Đường gióng dọc tại điểm đang chọn */}
            <line
              x1={curPt.x}
              y1={curPt.y}
              x2={curPt.x}
              y2={plotBottom}
              stroke="#16a34a"
              strokeWidth={1.2}
              strokeDasharray="2.5 2.5"
              strokeOpacity={0.55}
            />

            {/* Đường biểu đồ xanh lá mượt như hình mẫu */}
            <path
              d={linePath}
              fill="none"
              stroke="#16a34a"
              strokeWidth={3.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Các điểm dữ liệu chuẩn xác trên đường cong */}
            {pts.map((p, i) => {
              const isOn = i === active;
              return (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={isOn ? 4.5 : 2.5}
                  fill={isOn ? "#16a34a" : "#ffffff"}
                  stroke="#16a34a"
                  strokeWidth={isOn ? 2.2 : 1.8}
                  style={{
                    transition: "r 0.18s ease, fill 0.18s ease",
                    cursor: "pointer",
                  }}
                  onClick={() => updateHover(i)}
                />
              );
            })}

            {/* Nhãn trục X chia đều dưới mỗi mốc mã vùng */}
            {pts.map((p, i) => {
              const isOn = i === active;
              return (
                <text
                  key={i}
                  className={isOn ? "vc-x is-on" : "vc-x"}
                  x={p.x}
                  y={plotBottom + 16}
                  textAnchor="middle"
                  style={{
                    fontSize: isMini ? 8.5 : isCompact ? 9.5 : 10.5,
                    fontWeight: isOn ? 700 : 500,
                    fill: isOn ? "#14372f" : "rgba(20, 55, 47, 0.52)",
                    cursor: "pointer",
                    letterSpacing: "-0.01em",
                  }}
                  onClick={() => updateHover(i)}
                >
                  {axisLabels[i]}
                </text>
              );
            })}

            {/* Vùng cảm ứng tương tác theo từng mốc */}
            {pts.map((p, i) => {
              const hitW = n > 1 ? innerW / (n - 1) : innerW;
              const hx = Math.max(0, p.x - hitW / 2);
              return (
                <rect
                  key={i}
                  x={hx}
                  y={0}
                  width={hitW}
                  height={effectiveHeight}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch") updateHover(i);
                  }}
                  onClick={() => updateHover(i)}
                />
              );
            })}
          </svg>
        </>
      )}
      {caption && <p className="vc-aurora-caption" title={caption}>{caption}</p>}
    </div>
  );
}

/* ─────────────────────────── GradientMeter ─────────────────────────── */

interface GradientMeterProps {
  value: number;
  caption?: string;
  unit?: string;
  ariaLabel: string;
}

/** Thanh gradient đỏ → vàng → xanh với con trỏ tại giá trị, kèm số lớn (kiểu "52%"). */
export function GradientMeter({ value, caption, unit = "%", ariaLabel }: GradientMeterProps) {
  const v = Math.min(Math.max(value, 0), 100);
  return (
    <div className="vc vc-meter" role="img" aria-label={`${ariaLabel}: ${value}${unit}`}>
      <div className="vc-meter-head">
        <strong>
          {value}
          <small>{unit}</small>
        </strong>
        {caption && <span>{caption}</span>}
      </div>
      <div className="vc-meter-bar">
        <div className="vc-meter-rest" style={{ left: `${v}%` }} />
        <div className="vc-meter-pin" style={{ left: `${v}%` }} />
      </div>
    </div>
  );
}

/* ─────────────────────────── KpiChartView ─────────────────────────── */

/** Mô tả biểu đồ gắn vào một thẻ số liệu (`.kpi-card.has-chart`). */
export type KpiChartSpec =
  | { kind: "area" | "bars"; data: ChartPoint[]; tone: ChartTone; unit?: string; highlight?: "max" | "last"; formatValue?: (v: number) => string; caption?: string }
  | { kind: "gauge"; value: number; target?: number; caption: string; tone: ChartTone };

/** Tách phần số và phần đơn vị (ví dụ "33,9 tấn" -> 33,9 + <small>tấn</small>) để không tràn chữ trên thẻ nhỏ. */
export function renderKpiValue(val: string) {
  const m = val.match(/^([\d.,]+%?)\s+(.+)$/);
  if (!m) return val;
  return (
    <>
      <span>{m[1]}</span>
      <small className="kpi-val-unit">{m[2]}</small>
    </>
  );
}

/** Vùng biểu đồ ở đáy thẻ số liệu: area/bars tràn sát mép, gauge canh giữa. */
export function KpiChartView({ chart, label, suffix = "theo tháng" }: { chart: KpiChartSpec; label: string; suffix?: string }) {
  if (chart.kind === "gauge") {
    return (
      <div className="kpi-chart is-pad">
        <GaugeArc value={chart.value} target={chart.target} caption={chart.caption} tone={chart.tone} ariaLabel={label} />
      </div>
    );
  }
  const Chart = chart.kind === "area" ? AreaTrend : SoftBars;
  return (
    <div className="kpi-chart is-soft">
      <Chart
        data={chart.data}
        tone={chart.tone}
        unit={chart.unit}
        highlight={chart.highlight}
        formatValue={chart.formatValue}
        caption={chart.caption}
        height={chart.kind === "area" ? 165 : 140}
        ariaLabel={`${label} ${suffix}`.trim()}
      />
    </div>
  );
}

/* ─────────────────────────── ShareBar ─────────────────────────── */

interface ShareBarProps {
  value: number;
  total: number;
  unit?: string;
  tone?: ChartTone;
  ariaLabel: string;
}

/** Thanh tỷ trọng mảnh: "value/total" bên trái, phần trăm bên phải. */
export function ShareBar({ value, total, unit = "hộ", tone = "lime", ariaLabel }: ShareBarProps) {
  const pct = total > 0 ? Math.min(Math.max((value / total) * 100, 0), 100) : 0;
  const shown = pct >= 10 || pct === 0 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return (
    <div className="vc vc-share" data-tone={tone} role="img" aria-label={`${ariaLabel}: ${value}/${total} ${unit}, ${shown}%`}>
      <div className="vc-share-row">
        <span>{value}/{total} {unit}</span>
        <b>{String(shown).replace(".", ",")}%</b>
      </div>
      <div className="vc-share-track">
        <div className="vc-share-fill" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

/* ─────────────────────────── CapsuleDonutChart ─────────────────────────── */

export interface DonutItem {
  name: string;
  value: number;
  color: string;
  unit?: string;
  /** Tùy chọn ẩn đệm pastel bên trong nếu muốn một phân khúc chỉ có viền mảnh */
  hideCushion?: boolean;
}

export interface CapsuleDonutChartProps {
  data: DonutItem[];
  ariaLabel: string;
  size?: number;
  unit?: string;
  formatValue?: (val: number) => string;
  defaultIndex?: number;
  centerSubLabel?: string;
  showLegend?: boolean;
}

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Number((cx + r * Math.sin(rad)).toFixed(2)),
    y: Number((cy - r * Math.cos(rad)).toFixed(2)),
  };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const p1 = pointOnCircle(cx, cy, r, startDeg);
  const p2 = pointOnCircle(cx, cy, r, endDeg);
  const diff = (endDeg - startDeg + 360) % 360;
  const large = diff > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

interface DonutSector {
  item: DonutItem;
  idx: number;
  start: number;
  end: number;
  span: number;
  pct: number;
  fraction: number;
}

function computeDonutSectors(
  data: DonutItem[],
  total: number,
  availableDeg: number,
  gapDeg: number,
  n: number,
): DonutSector[] {
  let curr = -15; // Bắt đầu từ -15 độ (khoảng 11:30)
  return data.map((item, idx) => {
    const fraction = item.value / total;
    const span = n > 1 ? Math.max(fraction * availableDeg, 4) : 360;
    const start = curr;
    const end = curr + span;
    curr = end + gapDeg;
    const pct = Math.round(fraction * 100);
    return { item, idx, start, end, span, pct, fraction };
  });
}

/**
 * Biểu đồ tròn dạng viên nang nhiều lớp (Capsule Donut Chart):
 * - Vòng ngoài mảnh với đầu bo tròn thanh thoát.
 * - Lớp đệm bên trong dạng viên nang mềm mại (pastel cushion) tiệp màu.
 * - Tâm biểu đồ hiển thị tên phân khúc, chấm tròn màu sắc cùng giá trị và tỷ lệ phần trăm [XX%].
 * - Tương tác hover/click/bàn phím linh hoạt và mượt mà.
 */
export function CapsuleDonutChart({
  data,
  ariaLabel,
  size = 210,
  unit = "",
  formatValue,
  defaultIndex,
  centerSubLabel,
  showLegend = true,
}: CapsuleDonutChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const format = formatValue ?? defaultFormat;

  const total = data.reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0);
  const maxIdx = data.reduce((best, cur, i) => (cur.value > data[best].value ? i : best), 0);

  if (total <= 0 || data.length === 0) {
    return (
      <div className="vc-donut-wrap" role="img" aria-label={ariaLabel}>
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Chưa có dữ liệu thống kê
        </div>
      </div>
    );
  }

  const cx = 100;
  const cy = 100;
  const rOuter = 82;
  const rInner = 66;
  const n = data.length;
  const gapDeg = n > 1 ? Math.max(6, Math.min(10, 36 / n)) : 0;
  const availableDeg = 360 - n * gapDeg;
  const capDeg = (9 / rInner) * (180 / Math.PI); // ~7.8 độ bo tròn viên nang

  const sectors = computeDonutSectors(data, total, availableDeg, gapDeg, n);

  const activeIdx = hoverIdx ?? pinnedIdx ?? defaultIndex ?? maxIdx;
  const active = sectors[activeIdx] ?? sectors[0];

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((prev) => ((prev ?? activeIdx) + 1) % n);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((prev) => ((prev ?? activeIdx) - 1 + n) % n);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPinnedIdx((prev) => (prev === activeIdx ? null : activeIdx));
    }
  };

  return (
    <div
      className="vc-donut-wrap"
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <div className="vc-donut-stage" style={{ width: size, height: size, maxWidth: "100%" }}>
        <svg
          viewBox="0 0 200 200"
          width="100%"
          height="100%"
          className="vc-donut-svg"
          aria-hidden="true"
        >
          {n === 1 ? (
            <g className="vc-donut-group is-active">
              {!data[0].hideCushion && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={rInner}
                  stroke={data[0].color}
                  strokeWidth={18}
                  fill="none"
                  opacity={0.25}
                  className="vc-donut-cushion"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={rOuter}
                stroke={data[0].color}
                strokeWidth={4.5}
                fill="none"
                className="vc-donut-arc"
              />
            </g>
          ) : (
            sectors.map((s) => {
              const isActive = s.idx === activeIdx;
              const isShort = s.span <= capDeg * 2 + 1;
              const cStart = s.start + capDeg;
              const cEnd = s.end - capDeg;

              return (
                <g
                  key={s.idx}
                  className={`vc-donut-group ${isActive ? "is-active" : ""}`}
                  data-index={s.idx}
                >
                  {/* Lớp đệm viên nang bên trong */}
                  {!s.item.hideCushion && (
                    isShort ? (
                      (() => {
                        const mid = (s.start + s.end) / 2;
                        const pt = pointOnCircle(cx, cy, rInner, mid);
                        return (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isActive ? 10.5 : 9}
                            fill={s.item.color}
                            opacity={isActive ? 0.44 : 0.22}
                            className="vc-donut-cushion"
                          />
                        );
                      })()
                    ) : (
                      <path
                        d={arcPath(cx, cy, rInner, cStart, cEnd)}
                        stroke={s.item.color}
                        strokeWidth={isActive ? 21 : 18}
                        strokeLinecap="round"
                        fill="none"
                        opacity={isActive ? 0.44 : 0.22}
                        className="vc-donut-cushion"
                      />
                    )
                  )}

                  {/* Vòng cung thanh mảnh bên ngoài */}
                  <path
                    d={arcPath(cx, cy, rOuter, s.start, s.end)}
                    stroke={s.item.color}
                    strokeWidth={isActive ? 5.5 : 4.2}
                    strokeLinecap="round"
                    fill="none"
                    className="vc-donut-arc"
                  />

                  {/* Vùng cảm ứng diện rộng bao phủ trọn phân khúc */}
                  <path
                    d={arcPath(cx, cy, 74, s.start, s.end)}
                    stroke="transparent"
                    strokeWidth={36}
                    strokeLinecap="round"
                    fill="none"
                    style={{ cursor: "pointer" }}
                    onPointerEnter={() => setHoverIdx(s.idx)}
                    onClick={() => setPinnedIdx((prev) => (prev === s.idx ? null : s.idx))}
                  />
                </g>
              );
            })
          )}
        </svg>

        {/* Nội dung trung tâm: Tên danh mục, chấm màu và Giá trị [Phần trăm%] */}
        <div className="vc-donut-center" aria-hidden="true">
          <div className="vc-donut-label" title={active.item.name}>
            {active.item.name}
          </div>
          <div className="vc-donut-val">
            <span
              className="vc-donut-dot"
              style={{ backgroundColor: active.item.color }}
            />
            <span className="vc-donut-num">{format(active.item.value)}</span>
            <span className="vc-donut-pct">[{active.pct}%]</span>
          </div>
          {centerSubLabel && <div className="vc-donut-sub">{centerSubLabel}</div>}
        </div>
      </div>

      {/* Thẻ chú thích dạng viên nang tương tác phía dưới */}
      {showLegend && (
        <div className="vc-donut-legend" role="list">
          {sectors.map((s) => {
            const isSel = s.idx === activeIdx;
            return (
              <button
                key={s.idx}
                type="button"
                role="listitem"
                className={`vc-donut-pill ${isSel ? "is-active" : ""}`}
                onPointerEnter={() => setHoverIdx(s.idx)}
                onPointerLeave={() => setHoverIdx(null)}
                onClick={() => setPinnedIdx((prev) => (prev === s.idx ? null : s.idx))}
                aria-label={`${s.item.name}: ${format(s.item.value)}${unit || ""} (${s.pct}%)`}
              >
                <span
                  className="vc-donut-pill-dot"
                  style={{ backgroundColor: s.item.color }}
                />
                <span className="vc-donut-pill-name">{s.item.name}</span>
                <span className="vc-donut-pill-val">
                  {format(s.item.value)}
                  {unit ? <span className="vc-donut-unit">{unit}</span> : null}
                  <small style={{ fontWeight: 500, opacity: 0.7, marginLeft: 3 }}>[{s.pct}%]</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

