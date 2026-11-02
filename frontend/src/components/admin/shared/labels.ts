// Nhãn tiếng Việt + class badge cho các trạng thái dùng trong khu quản trị.
import type { ApprovalPriority, ApprovalStatus, MinuteResult, ScheduleKind } from "@/types/approvals";
import type { HouseholdStatus } from "@/types/households";
import type { MrlStatus, ViolationSeverity, ViolationStatus } from "@/types/journal";
import type { LabResult } from "@/types/testing";
import type { RegistrationStatus } from "@/types/training";
import type { Option } from "@/components/ui/form/fields";

export interface BadgeLabel {
  label: string;
  badge: string;
}

export const HOUSEHOLD_STATUS: Record<HouseholdStatus, BadgeLabel> = {
  qualified: { label: "Đủ chuẩn XK", badge: "badge-green" },
  improve: { label: "Cần cải thiện", badge: "badge-gold" },
  pending: { label: "Chờ duyệt", badge: "badge-blue" },
  violation: { label: "Vi phạm", badge: "badge-red" },
};

export const APPROVAL_STATUS: Record<ApprovalStatus, BadgeLabel> = {
  pending: { label: "Chờ duyệt", badge: "badge-gold" },
  approved: { label: "Đã duyệt", badge: "badge-green" },
  rejected: { label: "Từ chối", badge: "badge-red" },
  cancelled: { label: "Đã hủy", badge: "badge-gray" },
};

export const PRIORITY: Record<ApprovalPriority, BadgeLabel> = {
  high: { label: "Cao", badge: "badge-red" },
  medium: { label: "Trung bình", badge: "badge-gold" },
  low: { label: "Thấp", badge: "badge-blue" },
};

export const SCHEDULE_KIND: Record<ScheduleKind, BadgeLabel> = {
  periodic: { label: "Định kỳ", badge: "badge-blue" },
  sudden: { label: "Đột xuất", badge: "badge-orange" },
  recheck: { label: "Phúc tra", badge: "badge-gold" },
};

export const MINUTE_RESULT: Record<MinuteResult, BadgeLabel> = {
  pass: { label: "Đạt", badge: "badge-green" },
  fail: { label: "Không đạt", badge: "badge-red" },
  improve: { label: "Cần cải thiện", badge: "badge-gold" },
};

export const SEVERITY: Record<ViolationSeverity, BadgeLabel> = {
  critical: { label: "Nghiêm trọng", badge: "badge-red" },
  warning: { label: "Cảnh báo", badge: "badge-orange" },
};

export const VIOLATION_STATUS: Record<ViolationStatus, BadgeLabel> = {
  open: { label: "Đang mở", badge: "badge-red" },
  resolved: { label: "Đã xử lý", badge: "badge-green" },
};

export const MRL_STATUS: Record<MrlStatus, BadgeLabel> = {
  pass: { label: "Đạt", badge: "badge-green" },
  exceeded: { label: "Vượt ngưỡng", badge: "badge-red" },
};

export const LAB_RESULT: Record<LabResult, BadgeLabel> = {
  pass: { label: "Đạt", badge: "badge-green" },
  fail: { label: "Không đạt", badge: "badge-red" },
};

export const REGISTRATION_STATUS: Record<RegistrationStatus, BadgeLabel> = {
  registered: { label: "Đã đăng ký", badge: "badge-blue" },
  attended: { label: "Có mặt", badge: "badge-green" },
  absent: { label: "Vắng mặt", badge: "badge-red" },
  cancelled: { label: "Đã hủy", badge: "badge-gray" },
};

/** Tra nhãn an toàn (giá trị lạ từ backend vẫn hiển thị được). */
export function badgeOf<K extends string>(map: Record<K, BadgeLabel>, key: string | null | undefined): BadgeLabel {
  return (key && (map as Record<string, BadgeLabel>)[key]) || { label: key || "—", badge: "badge-gray" };
}

/** Chuyển bảng nhãn thành danh sách lựa chọn cho `SelectField`. */
export const optionsOf = <K extends string>(map: Record<K, BadgeLabel>): Option[] =>
  (Object.keys(map) as K[]).map((value) => ({ value, label: map[value].label }));
