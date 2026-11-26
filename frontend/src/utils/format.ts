const pad = (value: number) => String(value).padStart(2, "0");

/** "2024-10-14" hoặc ISO timestamp → "14/10/2024"; rỗng → "—". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** ISO timestamp → "14/10/2024 16:45" (giờ địa phương); rỗng → "—". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** ISO timestamp → "16:45" (giờ địa phương); chuỗi chỉ có ngày hoặc rỗng → "". */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getNotificationDayKey(value: string | null | undefined): string {
  if (!value) return "unknown";
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "unknown";
  return toLocalDayKey(date);
}

export function formatNotificationDayHeading(
  dayKey: string,
  lang: "vi" | "en" | "zh" = "vi",
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) {
    return lang === "zh" ? "其他日期" : lang === "en" ? "Other dates" : "Khác";
  }
  const formatted = `${m[3]}/${m[2]}/${m[1]}`;
  const now = new Date();
  const todayKey = toLocalDayKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = toLocalDayKey(yesterday);

  if (dayKey === todayKey) {
    if (lang === "zh") return `今天, ${formatted}`;
    if (lang === "en") return `Today, ${formatted}`;
    return `Hôm nay, ${formatted}`;
  }
  if (dayKey === yesterdayKey) {
    if (lang === "zh") return `昨天, ${formatted}`;
    if (lang === "en") return `Yesterday, ${formatted}`;
    return `Hôm qua, ${formatted}`;
  }
  return formatted;
}

export interface NotificationDayGroup<T> {
  dayKey: string;
  heading: string;
  items: T[];
}

export function groupNotificationsByDay<T extends { createdAt: string | null | undefined }>(
  items: readonly T[],
  lang: "vi" | "en" | "zh" = "vi",
): NotificationDayGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = getNotificationDayKey(item.createdAt);
    const list = buckets.get(key);
    if (list) {
      list.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }
  return Array.from(buckets.entries()).map(([dayKey, groupItems]) => ({
    dayKey,
    heading: formatNotificationDayHeading(dayKey, lang),
    items: groupItems,
  }));
}

export const formatNumber = (value: number | null | undefined, fractionDigits: number) =>
  value === null || value === undefined ? "—" : value.toFixed(fractionDigits);

const DIARY_ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  htx_head: "Trưởng HTX",
  htx_deputy: "Phó HTX",
  support_specialist: "Chuyên viên hỗ trợ hệ thống",
  htx_officer: "Cán bộ HTX",
  inspector: "Cán bộ kiểm tra",
  village_officer: "Cán bộ thôn",
  enterprise: "Doanh nghiệp",
  farmer: "Chủ hộ",
};

export function formatDiaryRole(role: string | null | undefined): string | null {
  if (!role) return null;
  return DIARY_ROLE_LABELS[role] ?? null;
}

/** Hiển thị rõ tên và vai trò người chỉnh sửa nhật ký (ví dụ: "Nguyễn Văn A (Quản trị viên)"). */
export function formatDiaryEditor(
  name: string | null | undefined,
  role?: string | null,
): string | null {
  const cleanName = typeof name === "string" ? name.trim() : "";
  const roleLabel = formatDiaryRole(role);
  if (!cleanName && !roleLabel) return null;
  if (!cleanName) return roleLabel;
  if (!roleLabel || cleanName.toLowerCase().includes(roleLabel.toLowerCase())) {
    return cleanName;
  }
  return `${cleanName} (${roleLabel})`;
}
