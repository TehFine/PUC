import type { HouseholdStatus, PlotStatus, PortalHarvest, PortalScheduleItem } from "@/types/portal";

export type Tone = "green" | "gold" | "red" | "blue" | "gray";

export const HOUSEHOLD_STATUS: Record<HouseholdStatus, { label: string; tone: Tone }> = {
  qualified: { label: "Đủ chuẩn xuất khẩu", tone: "green" },
  improve: { label: "Cần cải thiện", tone: "gold" },
  pending: { label: "Chờ duyệt", tone: "blue" },
  violation: { label: "Có vi phạm", tone: "red" },
};

export const PLOT_STATUS: Record<PlotStatus, { label: string; tone: Tone }> = {
  approved: { label: "Đã duyệt", tone: "green" },
  improve: { label: "Cần cải thiện", tone: "gold" },
  violation: { label: "Vi phạm", tone: "red" },
  pending: { label: "Chờ duyệt", tone: "blue" },
};

export const SCHEDULE_KIND: Record<PortalScheduleItem["kind"], string> = {
  periodic: "Định kỳ",
  sudden: "Đột xuất",
  recheck: "Phúc tra",
};

export const HARVEST_STATUS: Record<PortalHarvest["status"], { label: string; tone: Tone }> = {
  exported: { label: "Đã xuất", tone: "green" },
  delivered: { label: "Đã giao", tone: "green" },
  in_transit: { label: "Đang vận chuyển", tone: "blue" },
  sampling: { label: "Đang lấy mẫu", tone: "gold" },
};

export const APPROVAL_STATUS = {
  pending: { label: "Đang chờ duyệt", tone: "blue" },
  approved: { label: "Đã duyệt", tone: "green" },
  rejected: { label: "Bị từ chối", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const PESTICIDE_STATUS = {
  allowed: { label: "Được phép", tone: "green" },
  restricted: { label: "Hạn chế", tone: "gold" },
  banned: { label: "Bị cấm", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const JOURNAL_ACTIVITIES = ["Tưới nước", "Bón phân", "Cắt cỏ", "Tỉa cành", "Phun thuốc", "Thu hoạch", "Khác"];

export const REQUEST_TYPES = [
  "Đăng ký vùng trồng mới",
  "Đăng ký thêm thửa đất",
  "Cấp lại mã vùng trồng",
  "Đề nghị kiểm tra, phúc tra",
  "Khác",
];

/** Số ngày từ `iso` (YYYY-MM-DD) đến hôm nay theo giờ máy; null nếu không có ngày. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const then = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

export const todayIso = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const formatKg = (kg: number): string =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tấn` : `${kg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg`;
