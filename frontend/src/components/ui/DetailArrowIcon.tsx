import React from "react";

export interface DetailArrowIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

/**
 * Icon mũi tên tròn dẫn vào chi tiết từng mục (sử dụng `/icons/chevron-right.svg` từ `public/`).
 */
export function DetailArrowIcon({
  size = 22,
  strokeWidth: _strokeWidth,
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
        position: "relative",
        ...style,
      }}
      {...props}
    >
      <span
        style={{
          position: "absolute",
          width: "87.5%",
          height: "87.5%",
          borderRadius: "50%",
          backgroundColor: "var(--detail-arrow-bg, #d4dae2)",
        }}
      />
      <span
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundColor: "var(--detail-arrow-fg, #1e293b)",
          WebkitMaskImage: 'url("/icons/chevron-right.svg")',
          maskImage: 'url("/icons/chevron-right.svg")',
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </span>
  );
}

export default DetailArrowIcon;

