"use client";

import { useId } from "react";
import { usePerformanceTier } from "@/lib/network";

export interface WatermarkStampProps {
  /** Dòng chữ chính in đậm ở thanh ngang trung tâm (VD: "ĐÃ XUẤT KHO", "BẢN CHỨNG THỰC") */
  centerText: string;
  /** Dòng chữ uốn cong nửa vòng tròn phía trên (VD: "HTX SẦU RIÊNG CƯ NÉ") */
  topText?: string;
  /** Dòng chữ uốn cong nửa vòng tròn phía dưới (VD: "CHỨNG THỰC XUẤT XỨ") */
  bottomText?: string;
  /** Class CSS tùy chỉnh kích thước, độ nghiêng và độ mờ */
  className?: string;
}

interface DistressDot {
  cx: number;
  cy: number;
  r: number;
  op: number;
}

interface DistressScratch {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sw: number;
  op: number;
}

/**
 * Sinh sẵn hạt mực khô (distressed rubber-stamp grain) tất định một lần duy nhất
 * để tạo chất liệu con dấu đóng mộc thực tế mà không tốn CPU filter và tương thích 100% in ấn / xuất PDF.
 */
const STAMP_GRAIN: { dots: DistressDot[]; scratches: DistressScratch[] } = (() => {
  let seed = 20260728;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const dots: DistressDot[] = [];
  for (let i = 0; i < 120; i++) {
    dots.push({
      cx: Math.round((14 + rand() * 332) * 10) / 10,
      cy: Math.round((18 + rand() * 284) * 10) / 10,
      r: Math.round((0.8 + rand() * 2.1) * 10) / 10,
      op: Math.round((0.35 + rand() * 0.52) * 100) / 100,
    });
  }
  // Hạt mực khô tập trung trên dải băng đặc ở giữa để tạo chất cảm mộc cao su chân thực
  for (let i = 0; i < 55; i++) {
    dots.push({
      cx: Math.round((20 + rand() * 320) * 10) / 10,
      cy: Math.round((133 + rand() * 54) * 10) / 10,
      r: Math.round((0.7 + rand() * 1.8) * 10) / 10,
      op: Math.round((0.32 + rand() * 0.48) * 100) / 100,
    });
  }

  const scratches: DistressScratch[] = [];
  for (let i = 0; i < 28; i++) {
    const x1 = 18 + rand() * 324;
    const y1 = 22 + rand() * 276;
    const angle = rand() * Math.PI * 2;
    const len = 6 + rand() * 18;
    scratches.push({
      x1: Math.round(x1 * 10) / 10,
      y1: Math.round(y1 * 10) / 10,
      x2: Math.round((x1 + Math.cos(angle) * len) * 10) / 10,
      y2: Math.round((y1 + Math.sin(angle) * len) * 10) / 10,
      sw: Math.round((0.6 + rand() * 1.1) * 10) / 10,
      op: Math.round((0.28 + rand() * 0.42) * 100) / 100,
    });
  }

  return { dots, scratches };
})();

const STAMP_FONT_STACK =
  '"Arial Narrow", "Roboto Condensed", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

export function WatermarkStamp({
  centerText,
  topText = "HTX SẦU RIÊNG CƯ NÉ",
  bottomText = "MÃ VÙNG TRỒNG PUC",
  className = "",
}: WatermarkStampProps) {
  const perfTier = usePerformanceTier();
  const useGrain = perfTier !== "lite";
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const topArcId = `wm-top-${rawId}`;
  const botArcId = `wm-bot-${rawId}`;
  const circleMaskId = `wm-cmask-${rawId}`;
  const bannerMaskId = `wm-bmask-${rawId}`;
  const grainMaskId = `wm-gmask-${rawId}`;

  const upperCenter = centerText.trim().toUpperCase();
  const upperTop = topText.trim().toUpperCase();
  const upperBottom = bottomText.trim().toUpperCase();

  // Tự động cân đối cỡ chữ & giãn cách chữ trung tâm theo độ dài tiếng Việt (kể cả dấu mũ + dấu nặng)
  const centerLen = upperCenter.length;
  const centerFontSize =
    centerLen <= 11 ? 27.5 : centerLen <= 13 ? 26 : centerLen <= 15 ? 23.5 : 20.5;
  const centerTracking =
    centerLen <= 11 ? 2.0 : centerLen <= 13 ? 1.6 : centerLen <= 15 ? 1.1 : 0.8;

  // Cân đối cỡ chữ & giãn cách hai cung tròn trên / dưới để luôn giữ khoảng thoáng với dải băng ngang
  const getArcMetrics = (len: number, isTop: boolean) => {
    if (len <= 13) return { fontSize: isTop ? 15.0 : 15.5, tracking: isTop ? 2.8 : 3.2 };
    if (len <= 16) return { fontSize: isTop ? 14.0 : 14.5, tracking: isTop ? 1.9 : 2.2 };
    if (len <= 20) return { fontSize: isTop ? 13.0 : 13.6, tracking: isTop ? 1.15 : 1.45 };
    return { fontSize: isTop ? 12.0 : 12.6, tracking: isTop ? 0.75 : 0.95 };
  };

  const topMetrics = getArcMetrics(upperTop.length, true);
  const botMetrics = getArcMetrics(upperBottom.length, false);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 320"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
    >
      <defs>
        {/* Cung tròn trên (r = 99): chạy thuận chiều kim đồng hồ từ 9h qua 12h sang 3h */}
        <path id={topArcId} d="M 81,160 A 99,99 0 1,1 279,160" />

        {/* Cung tròn dưới (r = 109.5): chạy ngược chiều kim đồng hồ từ 9h qua 6h sang 3h để chữ đứng xuôi chiều */}
        <path id={botArcId} d="M 70.5,160 A 109.5,109.5 0 0,0 289.5,160" />

        {/* Mặt nạ khoét rãnh ngang ở tâm để dải băng cắt ngang qua vòng tròn không bị chồng nét */}
        <mask id={circleMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="320">
          <rect x="0" y="0" width="360" height="320" fill="#ffffff" />
          <rect x="4" y="121" width="352" height="78" rx="11" fill="#000000" />
        </mask>

        {/* Mặt nạ đục chữ âm bản (knockout text) xuyên thấu nền trên thanh ngang trung tâm */}
        <mask id={bannerMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="320">
          <rect x="16" y="132" width="328" height="56" rx="5.5" fill="#ffffff" />
          <text
            x="180"
            y="160"
            dy="0.36em"
            textAnchor="middle"
            fill="#000000"
            fontFamily={STAMP_FONT_STACK}
            fontSize={centerFontSize}
            fontWeight="900"
            letterSpacing={centerTracking}
          >
            {upperCenter}
          </text>
        </mask>

        {/* Mặt nạ hạt mực đóng dấu tự nhiên (bỏ qua trên máy yếu để giảm tải rasterize SVG mask) */}
        {useGrain && (
          <mask id={grainMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="320">
            <rect x="0" y="0" width="360" height="320" fill="#ffffff" />
            {STAMP_GRAIN.dots.map((d, idx) => (
              <circle key={idx} cx={d.cx} cy={d.cy} r={d.r} fill="#000000" fillOpacity={d.op} />
            ))}
            {STAMP_GRAIN.scratches.map((s, idx) => (
              <line
                key={idx}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke="#000000"
                strokeWidth={s.sw}
                strokeOpacity={s.op}
                strokeLinecap="round"
              />
            ))}
          </mask>
        )}
      </defs>

      <g mask={useGrain ? `url(#${grainMaskId})` : undefined}>
        {/* 1. HỆ VÒNG TRÒN ĐỒNG TÂM KÉP & CHỮ UỐN CONG TRÊN - DƯỚI */}
        <g mask={`url(#${circleMaskId})`}>
          {/* Cặp vành tròn ngoài (1 nét dày + 1 nét mảnh sát trong) */}
          <circle cx="180" cy="160" r="138" stroke="currentColor" strokeWidth="10.5" />
          <circle cx="180" cy="160" r="126.5" stroke="currentColor" strokeWidth="3" />

          {/* Cặp vành tròn trong (1 nét mảnh ngoài + 1 nét vừa trong) */}
          <circle cx="180" cy="160" r="80.5" stroke="currentColor" strokeWidth="3" />
          <circle cx="180" cy="160" r="70.5" stroke="currentColor" strokeWidth="7.2" />

          {/* Chữ cong nửa trên */}
          <text
            fill="currentColor"
            fontFamily={STAMP_FONT_STACK}
            fontSize={topMetrics.fontSize}
            fontWeight="900"
            letterSpacing={topMetrics.tracking}
          >
            <textPath href={`#${topArcId}`} startOffset="50%" textAnchor="middle">
              {upperTop}
            </textPath>
          </text>

          {/* Chữ cong nửa dưới (đứng thẳng chiều đọc từ trái sang phải) */}
          <text
            fill="currentColor"
            fontFamily={STAMP_FONT_STACK}
            fontSize={botMetrics.fontSize}
            fontWeight="900"
            letterSpacing={botMetrics.tracking}
          >
            <textPath href={`#${botArcId}`} startOffset="50%" textAnchor="middle">
              {upperBottom}
            </textPath>
          </text>
        </g>

        {/* 2. DẢI BĂNG NGANG TRUNG TÂM VƯỢT RÌA VÒNG TRÒN (VIỀN ĐÔI + NỀN ĐẶC CHỮ ÂM BẢN) */}
        <rect
          x="10"
          y="126"
          width="340"
          height="68"
          rx="9"
          stroke="currentColor"
          strokeWidth="3.4"
        />
        <rect
          x="16"
          y="132"
          width="328"
          height="56"
          rx="5.5"
          fill="currentColor"
          mask={`url(#${bannerMaskId})`}
        />
      </g>
    </svg>
  );
}
