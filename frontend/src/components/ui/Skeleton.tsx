import type { CSSProperties, ReactNode } from "react";
import "./skeleton.css";

type Size = number | string;
const px = (value: Size) => (typeof value === "number" ? `${value}px` : value);

/** Một khối giữ chỗ có nhịp sáng. Chỉ trang trí nên ẩn khỏi trình đọc màn hình. */
export function Skeleton({ w, h, r, circle, className = "" }: { w?: Size; h?: Size; r?: Size; circle?: boolean; className?: string }) {
  const style = {
    ...(w !== undefined && { "--sk-w": px(w) }),
    ...(h !== undefined && { "--sk-h": px(h) }),
    ...(r !== undefined && { "--sk-r": px(r) }),
  } as CSSProperties;
  return <span className={`sk${circle ? " sk-circle" : ""} ${className}`.trim()} style={style} aria-hidden="true" />;
}

/** Các dòng chữ giữ chỗ; dòng cuối ngắn hơn cho giống đoạn văn thật. */
export function SkeletonLines({ lines = 3, h = 13 }: { lines?: number; h?: Size }) {
  return (
    <div className="sk-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} h={h} />
      ))}
    </div>
  );
}

/**
 * Vỏ bọc cho một cụm skeleton: báo "đang tải" cho trình đọc màn hình và
 * trì hoãn hiển thị ~180ms khi mạng tốt (hiện ngay khi mạng yếu).
 */
export function SkeletonGroup({ label = "Đang tải…", className = "", children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`sk-group ${className}`.trim()} role="status" aria-busy="true" aria-live="polite">
      <span className="sk-sr">{label}</span>
      {children}
    </div>
  );
}

/** Thẻ nội dung giữ chỗ: tiêu đề + vài dòng chữ. */
export function SkeletonCard({ lines = 2, avatar = false }: { lines?: number; avatar?: boolean }) {
  return (
    <div className="sk-card" aria-hidden="true">
      <div className="sk-card-head">
        {avatar && <Skeleton w={40} h={40} circle />}
        <div className="sk-lines">
          <Skeleton h={16} w="55%" />
          <Skeleton h={11} w="35%" />
        </div>
      </div>
      <SkeletonLines lines={lines} />
    </div>
  );
}

/** Danh sách thẻ giữ chỗ dùng cho các tab của cổng hộ dân. */
export function SkeletonCards({ count = 3, label }: { count?: number; label?: string }) {
  return (
    <SkeletonGroup label={label}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} avatar={index === 0} />
      ))}
    </SkeletonGroup>
  );
}

/** Các dòng của bảng/danh sách giữ chỗ. */
export function SkeletonRows({ count = 5, label }: { count?: number; label?: string }) {
  return (
    <SkeletonGroup label={label}>
      <div aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="sk-row">
            <Skeleton w={36} h={36} r={10} />
            <div className="sk-lines">
              <Skeleton h={13} w="60%" />
              <Skeleton h={11} w="38%" />
            </div>
            <Skeleton w={56} h={22} r={999} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** Ô số liệu giữ chỗ (2 cột) cho thẻ thống kê. */
export function SkeletonStats({ count = 4, label }: { count?: number; label?: string }) {
  return (
    <SkeletonGroup label={label}>
      <div className="sk-stats" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="sk-card">
            <Skeleton h={22} w="50%" />
            <Skeleton h={11} w="70%" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** Khung bản đồ giữ chỗ trong lúc tải thư viện bản đồ (nặng, dễ bị chậm trên mạng yếu). */
export function MapSkeleton({ label = "Đang tải bản đồ…" }: { label?: string }) {
  return (
    <SkeletonGroup label={label} className="sk-map">
      <Skeleton h="100%" r={14} />
      <span className="sk-map-label" aria-hidden="true">
        {label}
      </span>
    </SkeletonGroup>
  );
}

/** Khung cả trang (thanh trên + tab + thẻ) dùng khi đang kiểm tra phiên hoặc tải trang. */
export function PageSkeleton({ label = "Đang tải trang…" }: { label?: string }) {
  return (
    <SkeletonGroup label={label} className="sk-page">
      <div className="sk-page-bar" aria-hidden="true">
        <div className="sk-page-brand">
          <Skeleton w={40} h={40} circle />
          <div className="sk-lines" style={{ flex: 1, maxWidth: 160 }}>
            <Skeleton h={14} />
            <Skeleton h={10} w="60%" />
          </div>
        </div>
        <Skeleton w={84} h={34} r={999} />
      </div>
      <div className="sk-tabs" aria-hidden="true">
        {[88, 76, 82, 90, 70].map((width, index) => (
          <Skeleton key={index} w={width} h={36} r={999} />
        ))}
      </div>
      <SkeletonStats count={4} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />
    </SkeletonGroup>
  );
}
