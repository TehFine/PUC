import React from "react";
import type { PortalTabId } from "./PortalApp";

export interface RadialIconProps {
  size?: number;
  className?: string;
}

export function RadialPngIcon({
  src,
  size = 24,
  className,
}: RadialIconProps & { src: string }) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        pointerEvents: "none",
        userSelect: "none",
      }}
      aria-hidden="true"
    />
  );
}

/** 1. Trang chủ - /home.png */
export function HouseCircleCheckIcon({ size = 24, className }: RadialIconProps) {
  return <RadialPngIcon src="/home.png" size={size} className={className} />;
}

/** 2. Thửa đất - /land.png */
export function LandLayerLocationIcon({ size = 24, className }: RadialIconProps) {
  return <RadialPngIcon src="/land.png" size={size} className={className} />;
}

/** 3. Nhật ký - /diary.png */
export function DocumentWriterIcon({ size = 24, className }: RadialIconProps) {
  return <RadialPngIcon src="/diary.png" size={size} className={className} />;
}

/** 4. Thu hoạch - /harvest.png */
export function QrTagIcon({ size = 24, className }: RadialIconProps) {
  return <RadialPngIcon src="/harvest.png" size={size} className={className} />;
}

/** 5. Kiểm nghiệm - /approval.png */
export function AuditIcon({ size = 24, className }: RadialIconProps) {
  return <RadialPngIcon src="/approval.png" size={size} className={className} />;
}

/** 6. Kiến thức - /education.png */
export function BrainQuestionMarkIcon({ size = 24, className }: RadialIconProps) {
  return <RadialPngIcon src="/education.png" size={size} className={className} />;
}

export const RADIAL_ICONS: Record<PortalTabId, React.ComponentType<RadialIconProps>> = {
  home: HouseCircleCheckIcon,
  plots: LandLayerLocationIcon,
  diary: DocumentWriterIcon,
  stamps: QrTagIcon,
  inspection: AuditIcon,
  learn: BrainQuestionMarkIcon,
};
