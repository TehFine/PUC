"use client";

import { useId, useRef, useState, useCallback, useEffect } from "react";
import "./charts.css";

export interface StandardMetric {
  label: string;
  pct: number;
  sub?: string;
  target?: number;
  color?: string;
}

export interface StandardBenchmarkMeterProps {
  standards: StandardMetric[];
  initialIndex?: number;
}

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

function getRating(pct: number): { label: string; dotColor: string } {
  if (pct >= 85) return { label: "Tốt nhất", dotColor: "#10b981" };
  if (pct >= 70) return { label: "Xuất sắc", dotColor: "#e11d48" };
  if (pct >= 50) return { label: "Trung bình", dotColor: "#eab308" };
  if (pct >= 30) return { label: "Kém", dotColor: "#f97316" };
  return { label: "Tệ nhất", dotColor: "#e11d48" };
}

export function StandardBenchmarkMeter({ standards, initialIndex = 0 }: StandardBenchmarkMeterProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [selectedIdx, setSelectedIdx] = useState(initialIndex);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  const activeStd = standards[selectedIdx] ?? standards[0];
  const currentPct = hoverPct ?? activeStd.pct;
  const rating = getRating(currentPct);

  const isMini = width > 0 && width < 340;
  const isCompact = width > 0 && width < 420;

  // Tọa độ và kích thước biểu đồ chuẩn xác theo ảnh mẫu
  const PAD_X = isMini ? 16 : isCompact ? 22 : 30;
  const barW = Math.max(width - 2 * PAD_X, 10);
  const barH = isMini ? 40 : 48;
  const barR = barH / 2;
  const barY = 48;
  const svgH = barY + barH + 32;

  const needleX = PAD_X + (Math.min(Math.max(currentPct, 0), 100) / 100) * barW;

  // Các mốc chuẩn mực đánh giá ở phía trên (Benchmark categories)
  const benchmarks = [
    { label: "Tệ nhất", pct: 10 },
    { label: "Kém", pct: 30 },
    { label: "Trung bình", pct: 50 },
    { label: "Tốt nhất", pct: 90 },
  ];

  // Thước chia tỉ lệ số đo dưới đáy (0, 10, 20... 100)
  const scaleNumbers = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  // Tính toán path của con nhộng có eo thắt (pinched hourglass waist) tại vị trí kim đo
  const buildPinchedBarPath = (x1: number, y1: number, w: number, h: number, r: number, nx: number, depthFactor = 0.68) => {
    const x2 = x1 + w;
    const y2 = y1 + h;
    const pw = isMini ? 16 : 22; // nửa chiều rộng vùng thắt eo
    const baseDepth = (h / 2) * depthFactor; // độ sâu thắt eo ở đỉnh và đáy (~15-16px)

    // Giảm dần độ sâu thắt nếu kim chạy sát 2 đầu tròn để không làm méo hình bán nguyệt
    const distFromLeft = nx - (x1 + r);
    const distFromRight = (x2 - r) - nx;
    const minDist = Math.min(distFromLeft, distFromRight);
    const damp = Math.max(0, Math.min(1, minDist / pw));
    const pd = baseDepth * damp;

    if (pd <= 0.6) {
      // Trường hợp sát mép: vẽ con nhộng đều bo tròn 2 đầu
      return `M ${x1 + r},${y1} L ${x2 - r},${y1} A ${r},${r} 0 0,1 ${x2},${y1 + r} L ${x2},${y2 - r} A ${r},${r} 0 0,1 ${x2 - r},${y2} L ${x1 + r},${y2} A ${r},${r} 0 0,1 ${x1},${y2 - r} L ${x1},${y1 + r} A ${r},${r} 0 0,1 ${x1 + r},${y1} Z`;
    }

    // Đường cong Bezier bậc 3 lượn tự nhiên: từ mép trên hạ sâu xuống eo thắt rồi nâng lên lại
    return [
      `M ${x1 + r},${y1}`,
      `L ${nx - pw},${y1}`,
      `C ${nx - pw * 0.45},${y1} ${nx - pw * 0.16},${y1 + pd} ${nx},${y1 + pd}`,
      `C ${nx + pw * 0.16},${y1 + pd} ${nx + pw * 0.45},${y1} ${nx + pw},${y1}`,
      `L ${x2 - r},${y1}`,
      `A ${r},${r} 0 0,1 ${x2},${y1 + r}`,
      `L ${x2},${y2 - r}`,
      `A ${r},${r} 0 0,1 ${x2 - r},${y2}`,
      `L ${nx + pw},${y2}`,
      `C ${nx + pw * 0.45},${y2} ${nx + pw * 0.16},${y2 - pd} ${nx},${y2 - pd}`,
      `C ${nx - pw * 0.16},${y2 - pd} ${nx - pw * 0.45},${y2} ${nx - pw},${y2}`,
      `L ${x1 + r},${y2}`,
      `A ${r},${r} 0 0,1 ${x1},${y2 - r}`,
      `L ${x1},${y1 + r}`,
      `A ${r},${r} 0 0,1 ${x1 + r},${y1}`,
      `Z`,
    ].join(" ");
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const pct = Math.round(((clientX - PAD_X) / barW) * 100);
      setHoverPct(Math.min(Math.max(pct, 0), 100));
    },
    [PAD_X, barW]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverPct(null);
  }, []);

  const tipW = isMini ? 76 : 98;
  const badgeClampX = Math.max(tipW / 2 + 6, Math.min(width - tipW / 2 - 6, needleX));

  return (
    <div className="sbm-wrap">
      {/* Bộ chọn nhanh tiêu chuẩn (Pill Tabs) */}
      <div className="sbm-tabs" role="tablist" aria-label="Bộ tiêu chuẩn">
        {standards.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === selectedIdx}
            className={`sbm-tab-btn ${i === selectedIdx ? "is-active" : ""}`}
            onClick={() => {
              setSelectedIdx(i);
              setHoverPct(null);
            }}
          >
            <span>{s.label}</span>
            <b>{s.pct}%</b>
          </button>
        ))}
      </div>

      {/* Sân khấu nền xám trung tính ấm áp (Stage container giống 100% ảnh mẫu) */}
      <div className="sbm-stage" ref={wrapRef}>
        {width > 0 && (
          <div className="sbm-meter-area" style={{ position: "relative", height: svgH }}>
            {/* Huy hiệu điểm số nổi phía trên kim (Floating Badge: • 72 Excellent) */}
            <div
              className="sbm-floating-badge"
              style={{
                left: badgeClampX,
                top: 6,
              }}
            >
              <span className="sbm-dot" style={{ backgroundColor: rating.dotColor }} />
              <b className="sbm-score">{currentPct}</b>
              <span className="sbm-level">{rating.label}</span>
            </div>

            <svg
              width={width}
              height={svgH}
              className="sbm-svg"
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              style={{ display: "block", overflow: "visible", cursor: "ew-resize" }}
            >
              <defs>
                {/* Dải gradient quang phổ Aurora chuẩn theo ảnh mẫu */}
                <linearGradient id={`${uid}aurora`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#df4466" />
                  <stop offset="14%" stopColor="#eb5648" />
                  <stop offset="30%" stopColor="#f47b2c" />
                  <stop offset="46%" stopColor="#f7ab2b" />
                  <stop offset="60%" stopColor="#d0dc4b" />
                  <stop offset="72%" stopColor="#a8e063" />
                  <stop offset="86%" stopColor="#5cd87a" />
                  <stop offset="100%" stopColor="#42d389" />
                </linearGradient>

                {/* Bộ lọc làm mờ viền phát sáng mộng mơ (Soft frosted aura glow) */}
                <filter id={`${uid}soft`} x="-20%" y="-40%" width="140%" height="180%">
                  <feGaussianBlur stdDeviation="3.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" opacity="0.68" />
                    <feMergeNode in="SourceGraphic" opacity="0.95" />
                  </feMerge>
                </filter>

                {/* Vầng sáng mở rộng tạo hiệu ứng dạ quang êm dịu */}
                <filter id={`${uid}haze`} x="-20%" y="-40%" width="140%" height="180%">
                  <feGaussianBlur stdDeviation="8" />
                </filter>
              </defs>

              {/* Nhãn mốc đánh giá phía trên với đường kẻ nối đứt nét (Worst imaginable, Poor, Ok, Best imaginable) */}
              {benchmarks.map((b) => {
                const bx = PAD_X + (b.pct / 100) * barW;
                const labelHalfW = b.label.length > 5 ? 40 : 16;
                const minClearance = tipW / 2 + labelHalfW - 2;
                const isOverlapped = Math.abs(needleX - bx) < minClearance;

                return (
                  <g
                    key={b.label}
                    opacity={isOverlapped ? 0 : 0.82}
                    style={{ transition: "opacity 0.18s ease" }}
                  >
                    <text
                      x={bx}
                      y={18}
                      textAnchor="middle"
                      className="sbm-bench-text"
                      style={{ fontSize: isMini ? 8.5 : isCompact ? 9.5 : 10.5 }}
                    >
                      {b.label}
                    </text>
                    <line
                      x1={bx}
                      x2={bx}
                      y1={23}
                      y2={barY - 3}
                      stroke="rgba(0, 0, 0, 0.22)"
                      strokeDasharray="2 3"
                      strokeWidth="1.2"
                    />
                  </g>
                );
              })}

              {/* Lớp vỏ con nhộng mờ frosted glass phía ngoài (Frosted Capsule Shell) */}
              <path
                d={buildPinchedBarPath(PAD_X - 1.5, barY - 1.5, barW + 3, barH + 3, barR + 1.5, needleX, 0.65)}
                fill="rgba(255, 255, 255, 0.72)"
                stroke="rgba(0, 0, 0, 0.04)"
                strokeWidth="1"
              />

              {/* Lớp dạ quang phát sáng mộng mơ (Soft ambient aura glow) */}
              <path
                d={buildPinchedBarPath(PAD_X, barY, barW, barH, barR, needleX, 0.68)}
                fill={`url(#${uid}aurora)`}
                filter={`url(#${uid}haze)`}
                opacity="0.38"
                style={{ transition: "d 0.12s ease" }}
              />

              {/* Thân thanh gradient chính với eo thắt tại kim đo (Pinched gradient capsule) */}
              <path
                d={buildPinchedBarPath(PAD_X, barY, barW, barH, barR, needleX, 0.68)}
                fill={`url(#${uid}aurora)`}
                filter={`url(#${uid}soft)`}
                style={{ transition: "d 0.12s ease" }}
              />

              {/* Đường kim dọc đứt nét chạy xuyên qua eo thắt (Vertical dashed needle line) */}
              <line
                x1={needleX}
                x2={needleX}
                y1={32}
                y2={barY + barH + 11}
                stroke="#64748b"
                strokeDasharray="3.5 3"
                strokeWidth="1.4"
                style={{ transition: "x1 0.12s ease, x2 0.12s ease" }}
              />

              {/* Thước đo số kỹ thuật dưới đáy: 0, 10, 20... 100 */}
              {scaleNumbers.map((s) => {
                const sx = PAD_X + (s / 100) * barW;

                return (
                  <text
                    key={s}
                    x={sx}
                    y={barY + barH + 21}
                    textAnchor="middle"
                    className="sbm-scale-text"
                    style={{
                      fontSize: isMini ? 8.5 : 10,
                      fontWeight: 400,
                      fill: "rgba(20, 55, 47, 0.58)",
                    }}
                  >
                    {s}
                  </text>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Danh sách 5 chỉ số tiêu chuẩn đầy đủ của hệ thống bên dưới */}
      <div className="sbm-list">
        {standards.map((s, idx) => {
          const isSelected = idx === selectedIdx;
          const r = getRating(s.pct);

          return (
            <div
              key={s.label}
              className={`sbm-item ${isSelected ? "is-selected" : ""}`}
              onClick={() => {
                setSelectedIdx(idx);
                setHoverPct(null);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="sbm-item-meta">
                <span className="sbm-item-name">{s.label}</span>
                <span className="sbm-item-sub">
                  {s.pct >= 70 ? "Đạt chuẩn xuất khẩu" : s.pct >= 50 ? "Đang hoàn thiện hồ sơ" : "Cần bổ sung tiêu chí"}
                </span>
              </div>
              <div className="sbm-item-bar-wrap">
                <div className="sbm-item-bar">
                  <div className="sbm-item-pin" style={{ left: `${s.pct}%` }} />
                </div>
              </div>
              <div className="sbm-item-score">
                <span className="sbm-item-dot" style={{ backgroundColor: r.dotColor }} />
                <strong>{s.pct}%</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
