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
  cancelled: { label: "Đã hủy", tone: "gray" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const DECLARATION_STATUS = {
  submitted: { label: "Chờ HTX xác nhận", tone: "blue" },
  confirmed: { label: "HTX đã xác nhận", tone: "green" },
  rejected: { label: "Bị từ chối", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const STAMP_STATUS: Record<string, { label: string; tone: Tone }> = {
  allocated: { label: "Chưa kích hoạt", tone: "gray" },
  activated: { label: "Đã kích hoạt", tone: "green" },
  revoked: { label: "Đã thu hồi", tone: "red" },
};

export const TRAINING_MY_STATUS = {
  registered: { label: "Đã đăng ký", tone: "green" },
  attended: { label: "Đã tham dự", tone: "green" },
  absent: { label: "Vắng mặt", tone: "gold" },
  cancelled: { label: "Đã hủy đăng ký", tone: "gray" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const PESTICIDE_STATUS = {
  allowed: { label: "Được phép", tone: "green" },
  restricted: { label: "Hạn chế", tone: "gold" },
  banned: { label: "Bị cấm", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const JOURNAL_ACTIVITIES = [
  "Tưới nước",
  "Bón phân",
  "Phun thuốc BVTV",
  "Làm đất & Cải tạo đất",
  "Xử lý ra hoa & Nuôi đọt",
  "Thụ phấn bổ sung",
  "Tỉa cành & Tỉa quả non",
  "Bao trái sầu riêng",
  "Cắt cỏ & Dọn vườn",
  "Thu hoạch",
  "Khác",
];

export const REQUEST_TYPES: string[] = [
  "Đăng ký vùng trồng mới",
  "Đăng ký thêm thửa đất",
  "Cấp lại mã vùng trồng",
  "Đề nghị kiểm tra, phúc tra",
  "Khác",
];

/** Số ngày từ `iso` (YYYY-MM-DD) đến hôm nay theo giờ Việt Nam; null nếu không có ngày. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const then = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const [y, m, d] = todayIso().split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  return Math.round((today - then) / 86_400_000);
}

/** Ngày hôm nay (YYYY-MM-DD) theo giờ Việt Nam, không phụ thuộc múi giờ máy và không dùng `toISOString()` (UTC). */
export const todayIso = (): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
};

/** "07:30:00" → "07:30"; null → null. */
export const formatClock = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value;
};

/** Số ngày từ hôm nay tới `iso` (dương = tương lai); null nếu không đọc được ngày. */
export function daysUntil(iso: string | null | undefined): number | null {
  const since = daysSince(iso);
  return since === null ? null : -since;
}

/** Nhãn tương đối ngắn gọn cho một ngày: Hôm nay / Ngày mai / Còn N ngày / Đã diễn ra… */
export function relativeDayLabel(iso: string | null | undefined): string {
  const diff = daysUntil(iso);
  if (diff === null) return "";
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  if (diff > 1 && diff <= 30) return `Còn ${diff} ngày`;
  if (diff > 30) return "Sắp diễn ra";
  if (diff === -1) return "Hôm qua";
  return "Đã diễn ra";
}

/** Chuyển giá trị số có thể là chuỗi (NUMERIC của PostgreSQL) sang number; null nếu rỗng. */
export const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatKg = (kg: number): string =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tấn` : `${kg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg`;
