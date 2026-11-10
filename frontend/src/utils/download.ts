/**
 * Tiện ích tải tệp (Blob / Data URL / CSV UTF-8 BOM) tương thích mọi trình duyệt
 * kể cả iOS Safari, Android Chrome, Firefox Mobile và WebView (tránh lỗi thu hồi Blob URL sớm).
 */

export function sanitizeDownloadFilename(name: string, fallback = "tep-xuat"): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const safeName = sanitizeDownloadFilename(filename);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = safeName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Giữ URL sống tối thiểu 10 giây để trình duyệt di động (Safari iOS / Firefox) kịp đọc luồng Blob bất đồng bộ
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 10_000);
}

export function triggerDataUrlDownload(dataUrl: string, filename: string): void {
  const safeName = sanitizeDownloadFilename(filename);
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = safeName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Chống CSV Formula Injection (=, +, -, @, tab, CR/LF, |) và escape dấu nháy kép chuẩn RFC 4180. */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const safe = /^[=+\-@\t\r\n|]/.test(raw) || /^\s+[=+\-@|]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** Đóng gói bảng dữ liệu thành tệp CSV UTF-8 có BOM (\uFEFF) và CRLF để mở đúng tiếng Việt trong Microsoft Excel. */
export function buildUtf8CsvBlob(headers: string[], rows: unknown[][]): Blob {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8;" });
}

