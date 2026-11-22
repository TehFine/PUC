import React from "react";

export interface DetailArrowIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

/**
 * Icon mũi tên mảnh dẫn vào chi tiết từng mục (không khung tròn bao ngoài).
 */
export function DetailArrowIcon({
  size = 20,
  strokeWidth = 2,
  className,
  style,
  ...props
}: DetailArrowIconProps) {
  const pxSize = typeof size === "number" ? `${size}px` : size;
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: pxSize,
        height: pxSize,
        flexShrink: 0,
        color: "var(--detail-arrow-fg, #c5cbc8)",
        ...style,
      }}
      {...props}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M7.5 5L12.5 10L7.5 15"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default DetailArrowIcon;

