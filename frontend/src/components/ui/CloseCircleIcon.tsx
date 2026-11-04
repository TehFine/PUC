import React from 'react';

export interface CloseCircleIconProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'width' | 'height'> {
  size?: number | string;
  strokeWidth?: number | string;
}

export function CloseCircleIcon({
  size = 28,
  strokeWidth: _strokeWidth,
  className,
  style,
  ...props
}: CloseCircleIconProps) {
  return (
    <img
      src="/close.png"
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
}
export default CloseCircleIcon;

