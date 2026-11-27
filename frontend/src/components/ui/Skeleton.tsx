import type { CSSProperties, ReactNode } from "react";
import { LoadingToastBridge } from "@/components/ui/Toast";
import "./skeleton.css";

type Size = number | string;
const px = (value: Size) => (typeof value === "number" ? `${value}px` : value);

/** Con quay 12 nan chuẩn phong cách Apple (sử dụng `/icons/spinner.svg` từ `public/`). */
export function AppleSpinner({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`pub-icon sk-apple-spinner ${className}`.trim()}
      style={
        {
          "--pub-icon-size": `${size}px`,
          WebkitMaskImage: 'url("/icons/spinner.svg")',
          maskImage: 'url("/icons/spinner.svg")',
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}

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
 * Vỏ bọc cho một cụm skeleton: trên nền chỉ giữ khối skeleton giữ chỗ bố cục,
 * còn thông báo trạng thái đang tải được đưa sang Toast toàn hệ thống.
 */
export function SkeletonGroup({
  label = "Đang tải dữ liệu…",
  showSpinner = true,
  className = "",
  children,
}: {
  label?: string;
  showSpinner?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`sk-group ${className}`.trim()} role="status" aria-busy="true" aria-live="polite">
      <span className="sk-sr">{label}</span>
      {showSpinner && <LoadingToastBridge label={label} />}
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

/** Danh sách thẻ giữ chỗ dùng cho các tab của cổng hộ dân và quản trị. */
export function SkeletonCards({
  count = 3,
  label,
  showSpinner = true,
}: {
  count?: number;
  label?: string;
  showSpinner?: boolean;
}) {
  return (
    <SkeletonGroup label={label} showSpinner={showSpinner}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} avatar={index === 0} />
      ))}
    </SkeletonGroup>
  );
}

/** Các dòng của bảng/danh sách giữ chỗ. */
export function SkeletonRows({
  count = 5,
  label,
  showSpinner = true,
}: {
  count?: number;
  label?: string;
  showSpinner?: boolean;
}) {
  return (
    <SkeletonGroup label={label} showSpinner={showSpinner}>
      <div aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="sk-row">
            <Skeleton w={36} h={36} r={8} />
            <div className="sk-lines">
              <Skeleton h={13} w="60%" />
              <Skeleton h={11} w="38%" />
            </div>
            <Skeleton w={56} h={22} r={6} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** Ô số liệu giữ chỗ (2 cột) cho thẻ thống kê. */
export function SkeletonStats({
  count = 4,
  label,
  showSpinner = true,
}: {
  count?: number;
  label?: string;
  showSpinner?: boolean;
}) {
  return (
    <SkeletonGroup label={label} showSpinner={showSpinner}>
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

/** Khung bản đồ giữ chỗ trong lúc tải thư viện bản đồ (thông báo tải hiển thị qua Toast). */
export function MapSkeleton({ label = "Đang tải bản đồ…" }: { label?: string }) {
  return (
    <SkeletonGroup label={label} showSpinner className="sk-map">
      <Skeleton h="100%" r={8} />
    </SkeletonGroup>
  );
}

/** Khung cả trang (thanh trên + tab + thẻ) dùng khi đang kiểm tra phiên hoặc tải trang. */
export function PageSkeleton({ label = "Đang tải trang…" }: { label?: string }) {
  return (
    <SkeletonGroup label={label} showSpinner className="sk-page">
      <div className="sk-page-bar" aria-hidden="true">
        <div className="sk-page-brand">
          <Skeleton w={40} h={40} circle />
          <div className="sk-lines" style={{ flex: 1, maxWidth: 160 }}>
            <Skeleton h={14} />
            <Skeleton h={10} w="60%" />
          </div>
        </div>
      </div>
      <div className="sk-tabs" aria-hidden="true">
        {[88, 76, 82, 90, 70].map((width, index) => (
          <Skeleton key={index} w={width} h={36} r={6} />
        ))}
      </div>
      <SkeletonStats count={4} showSpinner={false} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />
    </SkeletonGroup>
  );
}
