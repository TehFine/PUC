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
