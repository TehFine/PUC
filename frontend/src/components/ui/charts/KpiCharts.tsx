"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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

/** Đo bề rộng phần tử để vẽ SVG đúng pixel (chữ không bị co giãn theo viewBox). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function resolveIndex(data: ChartPoint[], highlight: Highlight): number {
  if (typeof highlight === "number") return Math.min(Math.max(highlight, 0), data.length - 1);
  if (highlight === "last") return data.length - 1;
  let best = 0;
  data.forEach((p, i) => {
    if (p.value > data[best].value) best = i;
  });
  return best;
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
  const defaultIdx = n ? resolveIndex(data, highlight) : 0;
  const active = hover ?? defaultIdx;

  if (n < 2) return <div className="vc vc-empty" role="img" aria-label={ariaLabel} />;

  const values = data.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max), 1);
  const lo = min - span * 0.35;
  const hi = max + span * 0.12;

  const isMini = width > 0 && width < 220;
  const isCompact = width > 0 && width < 460;

  const padTop = isMini ? 26 : isCompact ? 32 : PAD_TOP;
  const padBottom = isMini ? 16 : isCompact ? 18 : PAD_BOTTOM;
  const effectiveHeight = isMini
    ? Math.min(height, 112)
    : isCompact
    ? Math.min(height, 138)
    : height;

  const plotTop = padTop;
  const plotBottom = effectiveHeight - padBottom;
  // Dành khoảng không gian bên phải cho phần vạch kẻ thước
  const reserveRight = Math.min(Math.max(width * 0.28, isMini ? 36 : isCompact ? 48 : 68), 120);
  const innerW = Math.max(width - PAD_X * 2 - reserveRight, 1);
  const step = innerW / Math.max(n - 1, 1);

  const waveTop = plotTop + (isMini ? 8 : isCompact ? 12 : 16);
  const pts = data.map((p, i) => ({
    x: PAD_X + i * step,
    y: plotBottom - ((p.value - lo) / (hi - lo)) * (plotBottom - waveTop),
  }));

  // Sóng tiền cảnh (aurora wave)
  const line = monotonePath(pts);
  const area = `${line} L${pts[n - 1].x},${plotBottom} L${pts[0].x},${plotBottom} Z`;

  // Sóng hậu cảnh (mist wave) tạo hiệu ứng đa tầng mờ ảo
  const backPts = pts.map((p, i) => {
    const wave = Math.sin((i / Math.max(n - 1, 1)) * Math.PI * 2.3) * 10;
    return {
      x: p.x,
      y: Math.min(Math.max(p.y + wave - 6, plotTop + 4), plotBottom - 2),
    };
  });
  const backLine = monotonePath(backPts);
  const backArea = `${backLine} L${pts[n - 1].x},${plotBottom} L${pts[0].x},${plotBottom} Z`;

  const cur = pts[active];
  const clipW = Math.max(cur.x, PAD_X + step * 0.3);

  // Sinh các vạch kẻ thước kỹ thuật phía sau kim mốc
  const rulerTicks = generateRulerTicks(cur.x + 5.5, width - PAD_X, plotTop, plotBottom, isCompact);

  const valText = `${formatValue(data[active].value)}${unit}`;
  const pinDotY = isMini ? plotTop + 4 : isCompact ? plotTop + 5 : plotTop + 6;
  const textY = isMini ? pinDotY - 6 : isCompact ? pinDotY - 8 : pinDotY - 11;
  const valFontSize = isMini ? 15 : isCompact ? 21 : 28;
  const textMinX = isMini ? 24 : isCompact ? 32 : 44;
  const textMaxX = width - textMinX;
  const textClampX = Math.min(Math.max(cur.x, textMinX), Math.max(textMaxX, textMinX));
  const labelEvery = n > 8 || (isCompact && n > 6) ? 2 : 1;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = Math.round((e.clientX - rect.left - PAD_X) / step);
    setHover(Math.min(Math.max(idx, 0), n - 1));
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
      onPointerLeave={() => setHover(null)}
      onBlur={() => setHover(null)}
      onKeyDown={onKey}
    >
      {width > 0 && (
        <>
          <svg width={width} height={effectiveHeight} aria-hidden="true" style={{ overflow: "visible" }}>
            <defs>
              {/* Bộ lọc làm mờ gaussian mềm như mây quang phổ trong hình */}
              <filter id={`${uid}blur`} x="-20%" y="-30%" width="140%" height="160%">
                <feGaussianBlur stdDeviation="7.5" />
              </filter>
              <filter id={`${uid}mist`} x="-20%" y="-30%" width="140%" height="160%">
                <feGaussianBlur stdDeviation="4.5" />
              </filter>

              {/* Dải gradient cực quang: Xanh lá mạ -> Xanh bạc hà -> Vàng hổ phách -> Cam đào -> Hồng san hô */}
              <linearGradient id={`${uid}aurora`} gradientUnits="userSpaceOnUse" x1={PAD_X} y1="0" x2={cur.x} y2="0">
                <stop offset="0%" stopColor="#4ade80" stopOpacity="0.88" />
                <stop offset="22%" stopColor="#86efac" stopOpacity="0.88" />
                <stop offset="50%" stopColor="#fde047" stopOpacity="0.90" />
                <stop offset="78%" stopColor="#fb923c" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.96" />
              </linearGradient>

              {/* Dải màu cho vạch kẻ thước ở cuối: Cam đào san hô chuyển dần sang hồng thắm */}
              <linearGradient id={`${uid}ruler`} gradientUnits="userSpaceOnUse" x1={cur.x + 5} y1="0" x2={width - PAD_X} y2="0">
                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.45" />
                <stop offset="40%" stopColor="#f43f5e" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0.65" />
              </linearGradient>

              {/* Mặt nạ cắt lớp sóng tại vạch phân cách cur.x và giữ phẳng đáy */}
              <clipPath id={`${uid}clip`}>
                <rect x="0" y="0" width={clipW} height={plotBottom + 1} />
              </clipPath>
            </defs>

            {/* Các đường lưới ngang đứt nét rất nhẹ */}
            {[0, 1, 2].map((g) => {
              const y = plotTop + ((plotBottom - plotTop) * g) / 2;
              return <line key={g} className="vc-grid" x1={0} x2={width} y1={y} y2={y} />;
            })}

            {/* Tầng 1: Sóng sương mờ hậu cảnh (soft mist silhouette) */}
            <path
              d={backArea}
              fill="rgba(195, 215, 205, 0.32)"
              clipPath={`url(#${uid}clip)`}
              filter={`url(#${uid}mist)`}
            />

            {/* Tầng 2: Sóng cực quang mờ phát sáng (blurred aurora wave) */}
            <path
              d={area}
              fill={`url(#${uid}aurora)`}
              clipPath={`url(#${uid}clip)`}
              filter={`url(#${uid}blur)`}
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

            {/* Số liệu cụ thể font chữ số kỹ thuật nét mảnh phía trên đỉnh kim */}
            <text
              x={textClampX}
              y={textY}
              textAnchor="middle"
              className="vc-aurora-val"
              style={{ fontSize: valFontSize }}
            >
              {valText}
            </text>

            {/* Nhãn trục X phía đáy */}
            {data.map((p, i) => {
              if (i % labelEvery !== 0 && i !== n - 1) return null;
              const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
              const x = i === 0 ? pts[i].x - 6 : i === n - 1 ? pts[i].x + 4 : pts[i].x;
              return (
                <text
                  key={i}
                  className={i === active ? "vc-x is-on" : "vc-x"}
                  x={x}
                  y={effectiveHeight - 6}
                  textAnchor={anchor}
                  style={isMini ? { fontSize: 9 } : isCompact ? { fontSize: 9.5 } : undefined}
                >
                  {p.label}
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
      <svg viewBox="0 0 200 112" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: "var(--vc-gauge-a)" }} />
            <stop offset="100%" style={{ stopColor: "var(--vc-gauge-b)" }} />
          </linearGradient>
        </defs>
        <path className="vc-track" d={arc} pathLength={100} />
        <path className="vc-arc" d={arc} pathLength={100} stroke={`url(#${uid}g)`} strokeDasharray={`${v} 100`} />
        <text className="vc-x" x={G_CX - G_R} y={G_CY + 15} textAnchor="middle">0</text>
        <text className="vc-x" x={G_CX + G_R} y={G_CY + 15} textAnchor="middle">100</text>
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
}

const RULER_TONES: Record<
  ChartTone,
  {
    active: string;
    muted: string;
    pin: string;
    grid: string;
    scale: string;
    baseline: string;
  }
> = {
  ink: {
    active: "#14372f",
    muted: "rgba(20, 55, 47, 0.36)",
    pin: "#f97316",
    grid: "rgba(20, 55, 47, 0.16)",
    scale: "rgba(20, 55, 47, 0.52)",
    baseline: "rgba(20, 55, 47, 0.28)",
  },
  lime: {
    active: "#2e7018",
    muted: "rgba(46, 112, 24, 0.36)",
    pin: "#f97316",
    grid: "rgba(46, 112, 24, 0.16)",
    scale: "rgba(46, 112, 24, 0.52)",
    baseline: "rgba(46, 112, 24, 0.28)",
  },
  sky: {
    active: "#1c5d85",
    muted: "rgba(28, 93, 133, 0.36)",
    pin: "#f97316",
    grid: "rgba(28, 93, 133, 0.16)",
    scale: "rgba(28, 93, 133, 0.52)",
    baseline: "rgba(28, 93, 133, 0.28)",
  },
  rose: {
    active: "#c4503a",
    muted: "rgba(196, 80, 58, 0.36)",
    pin: "#f97316",
    grid: "rgba(196, 80, 58, 0.16)",
    scale: "rgba(196, 80, 58, 0.52)",
    baseline: "rgba(196, 80, 58, 0.28)",
  },
  amber: {
    active: "#8f6a0c",
    muted: "rgba(143, 106, 12, 0.38)",
    pin: "#f97316",
    grid: "rgba(143, 106, 12, 0.16)",
    scale: "rgba(143, 106, 12, 0.52)",
    baseline: "rgba(143, 106, 12, 0.28)",
  },
};

function calculateScale(maxVal: number) {
  if (maxVal <= 2) return { scaleMax: 2, steps: [1, 2] };
  if (maxVal <= 5) return { scaleMax: 5, steps: [2.5, 5] };
  if (maxVal <= 10) return { scaleMax: 10, steps: [5, 10] };
  if (maxVal <= 20) return { scaleMax: 20, steps: [10, 20] };
  if (maxVal <= 35) return { scaleMax: 30, steps: [10, 20, 30] };
  if (maxVal <= 60) return { scaleMax: 60, steps: [20, 40, 60] };
  if (maxVal <= 100) return { scaleMax: 100, steps: [50, 100] };
  const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const norm = maxVal / mag;
  let mult = 10;
  if (norm <= 2) mult = 2;
  else if (norm <= 5) mult = 5;
  const scaleMax = mult * mag;
  return { scaleMax, steps: [Math.round(scaleMax * 0.33), Math.round(scaleMax * 0.67), scaleMax] };
}

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
}: SoftBarsProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const active = hover ?? (n ? resolveIndex(data, highlight) : 0);
  const clear = useCallback(() => setHover(null), []);

  if (!n) return <div className="vc vc-empty" role="img" aria-label={ariaLabel} />;

  const isCompact = width > 0 && width < 260;
  const isMini = width > 0 && width < 180;
  const effectiveHeight = isMini ? 120 : isCompact ? 135 : height;

  const maxVal = Math.max(...data.map((p) => p.value), 1);
  const { scaleMax, steps } = calculateScale(maxVal);

  const PAD_TOP = 40;
  const PAD_BOTTOM = 22;
  const PAD_X = isMini ? 14 : isCompact ? 18 : 24;
  const plotW = Math.max(width - 2 * PAD_X, 10);
  const plotH = Math.max(effectiveHeight - PAD_TOP - PAD_BOTTOM, 20);
  const plotBottom = effectiveHeight - PAD_BOTTOM;

  const colors = RULER_TONES[tone] ?? RULER_TONES.lime;

  // Tọa độ X của các cột mốc chính
  const colW = plotW / n;
  const majorXs = data.map((_, i) => PAD_X + (i + 0.5) * colW);

  // Số lượng vạch chia lẻ trong mỗi cột để tạo vạch chính đối xứng ở giữa (S = 5 hoặc 7)
  const subDivs = isCompact ? 5 : 7;
  const midK = Math.floor(subDivs / 2);

  interface RulerTick {
    key: string;
    x: number;
    y: number;
    h: number;
    val: number;
    isMajor: boolean;
    colIndex: number;
  }

  const ticks: RulerTick[] = [];
  const dx = colW / subDivs;

  for (let i = 0; i < n; i++) {
    for (let k = 0; k < subDivs; k++) {
      const tx = PAD_X + (i * subDivs + k + 0.5) * dx;
      const isMajor = k === midK;

      // Nội suy giá trị dữ liệu chính xác theo số liệu thực tế
      let val = data[i].value;
      if (!isMajor) {
        if (k > midK) {
          const t = (k - midK) / subDivs;
          if (i < n - 1) {
            val = data[i].value + t * (data[i + 1].value - data[i].value);
          } else {
            val = data[i].value * (1 - t * 0.25);
          }
        } else {
          const t = (midK - k) / subDivs;
          if (i > 0) {
            val = data[i].value - t * (data[i].value - data[i - 1].value);
          } else {
            val = data[i].value * (1 - t * 0.25);
          }
        }
      }
      val = Math.max(val, 0);

      const h = Math.max((val / scaleMax) * plotH, isMajor ? 5 : 2.5);
      const ty = plotBottom - h;
      ticks.push({
        key: `${i}-${k}`,
        x: tx,
        y: ty,
        h,
        val,
        isMajor,
        colIndex: i,
      });
    }
  }

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
    // Tự động rút gọn mã vùng dạng KB-VT-001 thành VT-01 hoặc 01 khi không gian hẹp
    const vtMatch = p.label.match(/VT-0*(\d+)/i);
    if (vtMatch) {
      const num = parseInt(vtMatch[1], 10);
      const padded = num < 10 ? `0${num}` : `${num}`;
      return colWidth < 34 ? padded : `VT-${padded}`;
    }
    // Tự động rút gọn tiền tố mã (VD: KB-001 -> #01)
    if (p.label.length > 5 && colWidth < 52) {
      const num = p.label.match(/\d+$/)?.[0];
      if (num) return `#${num}`;
      return p.label.slice(0, Math.max(Math.floor(colWidth / 7), 3));
    }
    return p.label;
  };

  const axisLabels = data.map((p, i) => resolveAxisLabel(p, i, colW));

  // Chống chồng lấn (collision avoidance) tuyệt đối giữa các nhãn trục X
  const labelWidths = axisLabels.map((lbl) => lbl.length * 6.2 + 8);
  const showLabel = new Array<boolean>(n).fill(true);

  let hasOverlap = false;
  for (let i = 0; i < n - 1; i++) {
    const gap = majorXs[i + 1] - majorXs[i];
    const minNeeded = (labelWidths[i] + labelWidths[i + 1]) / 2 + 3;
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
      if (leftBound - r >= 6) {
        showLabel[i] = true;
        leftBound = majorXs[i] - labelWidths[i] / 2;
      }
    }

    let rightBound = majorXs[active] + labelWidths[active] / 2;
    for (let i = active + 1; i < n; i++) {
      const l = majorXs[i] - labelWidths[i] / 2;
      if (l - rightBound >= 6) {
        showLabel[i] = true;
        rightBound = majorXs[i] + labelWidths[i] / 2;
      }
    }
  }

  const curPoint = data[active] ?? data[0];
  const curX = majorXs[active] ?? PAD_X;
  const curVal = curPoint.value;
  const curH = Math.max((curVal / scaleMax) * plotH, 5);
  const curY = plotBottom - curH;

  const tipW = isMini ? 72 : 88;
  const textClampX = Math.max(tipW / 2 + 4, Math.min(width - tipW / 2 - 4, curX));

  return (
    <div
      ref={wrapRef}
      className="vc vc-ruler-bars"
      data-tone={tone}
      style={{ height: effectiveHeight, position: "relative" }}
      role="img"
      aria-label={`${ariaLabel}. ${data.map((p) => `${p.label} ${formatValue(p.value)}${unit}`).join(", ")}`}
      onPointerLeave={clear}
    >
      {width > 0 && (
        <>
          {/* Tooltip hiển thị giá trị dạng viên thuốc */}
          <div
            className="vc-tip is-on"
            style={{
              left: textClampX,
              bottom: Math.max(effectiveHeight - curY + 6, 46),
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
            {/* Vạch kẻ lưới chia tỷ lệ ngang (ruler grid divisions) */}
            {steps.map((st) => {
              const y = plotBottom - (st / scaleMax) * plotH;
              return (
                <g key={st}>
                  <line
                    x1={PAD_X}
                    x2={width - PAD_X}
                    y1={y}
                    y2={y}
                    stroke={colors.grid}
                    strokeDasharray="2.5 3.5"
                    strokeWidth="1"
                  />
                  <text
                    x={width - PAD_X + 3}
                    y={y + 3}
                    textAnchor="start"
                    className="vc-ruler-scale"
                    fill={colors.scale}
                    style={{ fontSize: isMini ? 8 : 9, fontFamily: "var(--font-mono, monospace)" }}
                  >
                    {st}
                  </text>
                </g>
              );
            })}

            {/* Đường đáy (baseline) */}
            <line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={plotBottom}
              y2={plotBottom}
              stroke={colors.baseline}
              strokeWidth="1"
            />

            {/* Các vạch kẻ thước kỹ thuật (ruler ticks) theo số liệu thực tế */}
            {ticks.map((t) => {
              const isOn = t.colIndex === active;
              const strokeColor = isOn ? colors.active : colors.muted;
              const sw = t.isMajor ? (isCompact ? 2.0 : 2.5) : isCompact ? 1.2 : 1.5;
              const opacity = isOn ? (t.isMajor ? 1 : 0.78) : t.isMajor ? 0.65 : 0.35;

              return (
                <line
                  key={t.key}
                  x1={t.x}
                  x2={t.x}
                  y1={t.y}
                  y2={plotBottom}
                  stroke={strokeColor}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  opacity={opacity}
                  style={{ transition: "stroke 0.18s ease, opacity 0.18s ease" }}
                />
              );
            })}

            {/* Đường chỉ mốc đứt nét tại vị trí đang chọn */}
            <line
              x1={curX}
              x2={curX}
              y1={curY}
              y2={plotBottom}
              stroke={colors.pin}
              strokeWidth={isCompact ? 1.15 : 1.3}
              strokeDasharray="2 2.5"
              opacity="0.85"
            />

            {/* Chấm pin cam nổi bật ở đỉnh vạch chính đang chọn */}
            <circle
              cx={curX}
              cy={curY}
              r={isMini ? 2.4 : isCompact ? 2.8 : 3.2}
              fill={colors.pin}
              stroke="#fff"
              strokeWidth="1.2"
            />

            {/* Nhãn trục X dưới chân các vạch chính */}
            {data.map((p, i) => {
              if (!showLabel[i]) return null;
              return (
                <text
                  key={i}
                  className={i === active ? "vc-x is-on" : "vc-x"}
                  x={majorXs[i]}
                  y={plotBottom + 16}
                  textAnchor="middle"
                  style={{
                    fontSize: isMini ? 8.5 : isCompact ? 9 : 10,
                    fontWeight: i === active ? 700 : 500,
                    fill: i === active ? colors.active : "rgba(20, 55, 47, 0.55)",
                    cursor: "pointer",
                    letterSpacing: "-0.01em",
                  }}
                  onClick={() => setHover(i)}
                >
                  {axisLabels[i]}
                </text>
              );
            })}

            {/* Các vùng cảm ứng vô hình (invisible touch hits) */}
            {data.map((p, i) => (
              <rect
                key={i}
                x={PAD_X + i * colW}
                y={0}
                width={colW}
                height={effectiveHeight}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              />
            ))}
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

