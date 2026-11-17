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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
