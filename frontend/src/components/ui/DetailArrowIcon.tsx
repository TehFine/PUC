import React from "react";

export interface DetailArrowIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

/**
 * Icon mũi tên tròn dẫn vào chi tiết từng mục (hình tròn đặc kèm dấu › bo tròn ở giữa).
 */
export function DetailArrowIcon({
  size = 22,
  strokeWidth = 2.5,
  className,
  ...props
}: DetailArrowIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10.5" fill="var(--detail-arrow-bg, #d4dae2)" />
      <path
        d="M10.5 8L14.5 12L10.5 16"
        stroke="var(--detail-arrow-fg, #1e293b)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default DetailArrowIcon;

