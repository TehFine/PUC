import React, { type CSSProperties } from "react";

export interface PublicIconProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  size?: number | string;
  strokeWidth?: number | string;
  color?: string;
}

export type LucideIcon = React.ComponentType<PublicIconProps>;

function toCssSize(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value;
}

/**
 * Hiển thị icon tĩnh lấy trực tiếp từ thư mục `public/` thông qua CSS mask-image
 * để giữ nguyên khả năng đổi màu theo `currentColor` hoặc `color`.
 */
export function PublicIcon({
  src,
  size,
  strokeWidth,
  color,
  className,
  style,
  "aria-hidden": ariaHidden = true,
  ...rest
}: PublicIconProps & { src: string }) {
  void strokeWidth;
  const mergedStyle: CSSProperties & Record<string, string | number | undefined> = {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    ...(size !== undefined ? { "--pub-icon-size": toCssSize(size) } : {}),
    ...(color ? { backgroundColor: color } : {}),
    ...style,
  };

  return (
    <span
      className={className ? `pub-icon ${className}` : "pub-icon"}
      style={mergedStyle}
      aria-hidden={ariaHidden}
      {...rest}
    />
  );
}

function createPublicIcon(src: string, displayName: string): LucideIcon {
  const IconComponent: LucideIcon = (props) => <PublicIcon src={src} {...props} />;
  IconComponent.displayName = displayName;
  return IconComponent;
}

/* ── Icon sẵn có tại gốc `public/*.png` ── */
export const Bell = createPublicIcon("/bell.png", "Bell");
export const BookOpen = createPublicIcon("/education.png", "BookOpen");
export const Camera = createPublicIcon("/photo-camera.png", "Camera");
export const CheckCircle2 = createPublicIcon("/check-mark.png", "CheckCircle2");
export const CircleCheck = createPublicIcon("/check-mark.png", "CircleCheck");
export const ClipboardCheck = createPublicIcon("/approval.png", "ClipboardCheck");
export const FileCheck2 = createPublicIcon("/approval.png", "FileCheck2");
export const House = createPublicIcon("/home.png", "House");
export const Map = createPublicIcon("/trifold.png", "Map");
export const MapPin = createPublicIcon("/location-pin.png", "MapPin");
export const NotebookPen = createPublicIcon("/diary.png", "NotebookPen");
export const Package = createPublicIcon("/harvest.png", "Package");
export const Scale = createPublicIcon("/scale.png", "Scale");
export const Search = createPublicIcon("/search.png", "Search");
export const TreePine = createPublicIcon("/land.png", "TreePine");

/* ── Icon vector tĩnh tại `public/icons/*.svg` ── */
export const AlertTriangle = createPublicIcon("/icons/alert-triangle.svg", "AlertTriangle");
export const ArrowLeft = createPublicIcon("/icons/arrow-left.svg", "ArrowLeft");
export const ArrowRight = createPublicIcon("/icons/arrow-right.svg", "ArrowRight");
export const ArrowUpRight = createPublicIcon("/icons/arrow-up-right.svg", "ArrowUpRight");
export const CalendarDays = createPublicIcon("/icons/calendar.svg", "CalendarDays");
export const Check = createPublicIcon("/icons/check.svg", "Check");
export const ChevronDown = createPublicIcon("/icons/chevron-down.svg", "ChevronDown");
export const ChevronUp = createPublicIcon("/icons/chevron-up.svg", "ChevronUp");
export const Compass = createPublicIcon("/icons/compass.svg", "Compass");
export const Download = createPublicIcon("/icons/download.svg", "Download");
export const ExternalLink = createPublicIcon("/icons/external-link.svg", "ExternalLink");
export const FlaskConical = createPublicIcon("/icons/flask.svg", "FlaskConical");
export const Globe = createPublicIcon("/icons/globe.svg", "Globe");
export const GraduationCap = createPublicIcon("/icons/graduation-cap.svg", "GraduationCap");
export const Lock = createPublicIcon("/icons/lock.svg", "Lock");
export const Mail = createPublicIcon("/icons/mail.svg", "Mail");
export const Microscope = createPublicIcon("/icons/microscope.svg", "Microscope");
export const Navigation = createPublicIcon("/icons/navigation.svg", "Navigation");
export const Printer = createPublicIcon("/icons/printer.svg", "Printer");
export const QrCode = createPublicIcon("/icons/qr-code.svg", "QrCode");
export const Send = createPublicIcon("/icons/send.svg", "Send");
export const ShieldAlert = createPublicIcon("/icons/shield-alert.svg", "ShieldAlert");
export const ShieldCheck = createPublicIcon("/icons/shield-check.svg", "ShieldCheck");
