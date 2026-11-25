import { isSafeMediaUrl } from "@/utils/url-safety";

function sanitizeTracePath(rawPath: string | null | undefined): string {
  const clean = typeof rawPath === "string" ? rawPath.trim() : "";
  return /^\/(?:t|trace)\/[A-Za-z0-9._%-]{1,120}$/.test(clean) ? clean : "/trace";
}

export type ReportBackendType =
  | "household-logbook"
  | "households"
  | "journal"
  | "spray"
  | "lab-tests"
  | "violations"
  | "harvest"
  | "training-registrations";

export interface ReportHouseholdPlotItem {
  plotCode: string;
  areaHa: number;
  variety: string | null;
  plantedYear: number | null;
  zoneCode: string | null;
  statusLabel: string;
}

export interface ReportHouseholdMeta {
  id: number;
  code: string;
  name: string;
  cccd: string;
  phone: string;
  villageId: number | null;
  villageName: string;
  plotCount: number;
  areaHa: number;
  status: string;
  statusLabel: string;
  pucCode: string;
  zoneName: string;
  zoneAddress?: string;
  gaccCode: string | null;
  coopLegalName: string;
  coopAddress: string;
  tracePath: string;
  plots: ReportHouseholdPlotItem[];
}

export interface ReportEvidencePhotoItem {
  refCode: string;
  attachmentId: number;
  url: string;
  mimeType: string;
  category: "field" | "violation_fix" | "invoice";
  categoryLabel: string;
  date: string;
  plotCode: string;
  activityTitle: string;
  detailSummary: string;
  gpsStatusLabel: string;
  verificationLabel: string;
  recorder: string;
}

export interface ReportSummaryStats {
  totalRecords: number;
  verifiedCount: number;
  selfDeclaredCount: number;
  gpsVerifiedCount: number;
  fieldPhotoCount: number;
  videoCount: number;
  invoicePhotoCount: number;
}

export interface ReportDataPayload {
  type: ReportBackendType;
  filename: string;
  headers: string[];
  rows: string[][];
  total: number;
  mode?: "summary" | "household_detail";
  householdMeta?: ReportHouseholdMeta | null;
  evidencePhotos?: ReportEvidencePhotoItem[];
  truncatedPhotoCount?: number;
  summaryStats?: ReportSummaryStats;
}

export interface PrintableReportDocSpec {
  title: string;
  docTitle: string;
  desc: string;
}

export interface PrintableReportContextMeta {
  from: string;
  to: string;
  villageName?: string;
}

interface PreparedPhoto extends ReportEvidencePhotoItem {
  resolvedSrc: string;
  failed?: boolean;
}

const MAX_PHOTO_DIMENSION = 920;
const PHOTO_JPEG_QUALITY = 0.82;
const PHOTO_FETCH_CONCURRENCY = 4;

function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatIsoToVn(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function truncateText(raw: string, maxLen: number): string {
  const clean = (raw || "").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 3).trimEnd()}...`;
}

function normalizeReportAdminText(raw: string): string {
  if (!raw || !raw.trim()) return raw;
  let res = raw
    .replace(/HỢP TÁC XÃ/g, "__PUC_HTX_UPPER__")
    .replace(/Hợp Tác Xã/g, "__PUC_HTX_TITLE2__")
    .replace(/Hợp tác xã/g, "__PUC_HTX_TITLE__")
    .replace(/hợp tác xã/g, "__PUC_HTX_LOWER__");

  res = res
    .replace(/XÃ\s+CƯ\s+NÉ\s*(?:[-–,]|VÀ)\s*(?:HUYỆN\s+)?KR(?:Ô|O)NG\s+B(?:Ú|U)K/g, "XÃ KRÔNG BÚK")
    .replace(/Xã\s+Cư\s+Né\s*(?:[-–,]|và)\s*(?:Huyện\s+|huyện\s+)?Kr(?:ô|o)ng\s+B(?:ú|u)k/g, "Xã Krông Búk")
    .replace(/xã\s+Cư\s+Né\s*(?:[-–,]|và)\s*(?:huyện\s+|Huyện\s+)?Kr(?:ô|o)ng\s+B(?:ú|u)k/g, "xã Krông Búk")
    .replace(/XÃ\s+CƯ\s+NÉ/g, "XÃ KRÔNG BÚK")
    .replace(/Xã\s+Cư\s+Né/g, "Xã Krông Búk")
    .replace(/xã\s+Cư\s+Né/g, "xã Krông Búk")
    .replace(/HUYỆN\s+KR(?:Ô|O)NG\s+B(?:Ú|U)K/g, "XÃ KRÔNG BÚK")
    .replace(/Huyện\s+Kr(?:ô|o)ng\s+B(?:ú|u)k/g, "Xã Krông Búk")
    .replace(/huyện\s+Kr(?:ô|o)ng\s+B(?:ú|u)k/g, "xã Krông Búk")
    .replace(/(Xã\s+Krông\s+Búk)(?:\s*[-–,]\s*Xã\s+Krông\s+Búk)+/gi, "$1");

  return res
    .replace(/__PUC_HTX_UPPER__/g, "HỢP TÁC XÃ")
    .replace(/__PUC_HTX_TITLE2__/g, "Hợp Tác Xã")
    .replace(/__PUC_HTX_TITLE__/g, "Hợp tác xã")
    .replace(/__PUC_HTX_LOWER__/g, "hợp tác xã");
}

function splitCoopDisplayLines(coopText: string): { line1: string; line2: string | null } {
  const trimmed = (coopText || "").trim();
  const m = /^(Hợp\s+tác\s+xã|HTX)\s+(.+)$/i.exec(trimmed);
  if (m?.[1] && m[2]) {
    return { line1: m[1].trim(), line2: m[2].trim() };
  }
  return { line1: trimmed, line2: null };
}

function collectSelfHostedFontCss(): string {
  if (typeof document === "undefined" || typeof window === "undefined") return "";
  const origin = window.location.origin;
  const rulesOut: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(cssRules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      let text = rule.cssText.replace(
        /font-family:\s*['"]?[^;'"]+['"]?/i,
        'font-family: "Bai Jamjuree"',
      );
      text = text.replace(/url\(\s*(['"]?)(\/[^)'"]+)\1\s*\)/g, `url("${origin}$2")`);
      rulesOut.push(text);
    }
  }
  return rulesOut.join("\n");
}

/**
 * Mở trước cửa sổ in đồng bộ ngay trong sự kiện bấm của người dùng (tránh bị Safari/Mobile chặn popup)
 * và hiển thị trạng thái chuẩn bị dữ liệu gọn gàng theo đúng phông Bai Jamjuree.
 */
export function openPrintProgressWindow(docTitle: string): Window | null {
  if (typeof window === "undefined") return null;
  const win = window.open("", "_blank", "width=1080,height=820");
  if (!win) return null;
  try {
    const fontCss = collectSelfHostedFontCss();
    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    ${fontCss}
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f7f7f5;
      color: #14372f;
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      padding: 24px;
    }
    .prep-box {
      max-width: 440px;
      width: 100%;
      background: #ffffff;
      border: 1px solid #d4d4d2;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 8px 24px rgba(20, 55, 47, 0.08);
    }
    .prep-title {
      font-size: 16px;
      font-weight: 700;
      margin: 0 0 8px;
    }
    .prep-desc {
      font-size: 13.5px;
      color: #5f6d66;
      margin: 0;
      line-height: 1.5;
      font-variant-numeric: tabular-nums;
    }
  </style>
</head>
<body>
  <div class="prep-box">
    <p class="prep-title">Đang khởi tạo hồ sơ bản in A4</p>
    <p id="prep-status-text" class="prep-desc">Đang tải dữ liệu và đối chiếu minh chứng...</p>
  </div>
</body>
</html>`);
    win.document.close();
  } catch {
    // Ignore cross-window write errors if any
  }
  return win;
}

function updatePrintWindowStatus(win: Window | null, text: string): void {
  if (!win || win.closed) return;
  try {
    const el = win.document.getElementById("prep-status-text");
    if (el) el.textContent = text;
  } catch {
    // Ignore
  }
}

async function downscaleBlobToJpegDataUrl(blob: Blob): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = "async";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode error"));
      el.src = objectUrl;
    });
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;

    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareEvidencePhotos(
  photos: ReportEvidencePhotoItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<PreparedPhoto[]> {
  if (!photos || photos.length === 0 || typeof window === "undefined") return [];
  const origin = window.location.origin;
  const results: PreparedPhoto[] = new Array(photos.length);
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (cursor < photos.length) {
      const index = cursor;
      cursor += 1;
      const item = photos[index];
      const safePath = isSafeMediaUrl(item.url) ? item.url.trim() : null;
      if (!safePath || !safePath.startsWith("/")) {
        results[index] = {
          ...item,
          resolvedSrc: "",
          failed: true,
        };
        completed += 1;
        onProgress?.(completed, photos.length);
        continue;
      }
      const fullUrl = `${origin}${safePath}`;
      let resolvedSrc = fullUrl;
      let failed = false;
      try {
        const res = await fetch(fullUrl, { credentials: "same-origin" });
        if (res.ok) {
          const blob = await res.blob();
          const compressed = await downscaleBlobToJpegDataUrl(blob);
          if (compressed) {
            resolvedSrc = compressed;
          }
        } else {
          failed = true;
        }
      } catch {
        failed = true;
      }
      results[index] = {
        ...item,
        resolvedSrc,
        failed,
      };
      completed += 1;
      onProgress?.(completed, photos.length);
    }
  };

  const workers = Array.from(
    { length: Math.min(PHOTO_FETCH_CONCURRENCY, photos.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function buildQrDataUrl(targetUrl: string): Promise<string | null> {
  try {
    const qrMod = await import("qrcode");
    const QRCode = qrMod.default ?? qrMod;
    return await QRCode.toDataURL(targetUrl, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
      color: { dark: "#14372f", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

function renderCellHtml(cell: string, origin: string): string {
  const trimmed = (cell || "").trim();
  if (!trimmed) return "-";
  if (/^\/(t|trace)\/[A-Za-z0-9._%-]+$/.test(trimmed)) {
    const fullHref = `${origin}${trimmed}`;
    return `<a href="${escapeHtml(fullHref)}" target="_blank" rel="noopener noreferrer" class="trace-link">${escapeHtml(trimmed)}</a>`;
  }
  return escapeHtml(trimmed);
}

function buildPhotoAppendixCardHtml(photo: PreparedPhoto): string {
  const isVerified =
    photo.verificationLabel.startsWith("HTX") || photo.verificationLabel.startsWith("Đạt");
  const verifyClass = isVerified ? "status-verified" : "status-declared";
  const detailLine = photo.detailSummary ? truncateText(photo.detailSummary, 145) : "";

  const mediaHtml = photo.failed
    ? `<div class="photo-fallback">Không tải được tệp ảnh gốc trên thiết bị này (${escapeHtml(photo.refCode)})</div>`
    : `<img src="${escapeHtml(photo.resolvedSrc)}" alt="${escapeHtml(`${photo.refCode} - ${photo.activityTitle}`)}" />`;

  return `<article class="evidence-card">
    <div class="evidence-card-head">
      <span class="evidence-ref">${escapeHtml(photo.refCode)}</span>
      <span class="evidence-date">Ngày: ${escapeHtml(photo.date || "-")} | Thửa: ${escapeHtml(photo.plotCode || "-")}</span>
    </div>
    <div class="evidence-frame">
      ${mediaHtml}
    </div>
    <div class="evidence-meta">
      <div class="evidence-activity">${escapeHtml(photo.activityTitle)}</div>
      ${detailLine ? `<div class="evidence-detail">${escapeHtml(detailLine)}</div>` : ""}
      <div class="evidence-row"><strong>Phân loại:</strong> ${escapeHtml(photo.categoryLabel)}</div>
      <div class="evidence-row"><strong>Định vị:</strong> ${escapeHtml(photo.gpsStatusLabel)}</div>
      <div class="evidence-row"><strong>Đối soát:</strong> <span class="${verifyClass}">${escapeHtml(photo.verificationLabel)}</span></div>
    </div>
  </article>`;
}

function buildDossierPhotoCardHtml(photo: PreparedPhoto): string {
  const isVerified =
    photo.verificationLabel.startsWith("HTX") || photo.verificationLabel.startsWith("Đạt");
  const verifyClass = isVerified ? "dos-status-ok" : "dos-status-muted";
  const detailLine = photo.detailSummary ? truncateText(photo.detailSummary, 145) : "";

  const mediaHtml = photo.failed
    ? `<div class="dos-photo-fallback">Không tải được tệp ảnh gốc trên thiết bị này (${escapeHtml(photo.refCode)})</div>`
    : `<img src="${escapeHtml(photo.resolvedSrc)}" alt="${escapeHtml(`${photo.refCode} - ${photo.activityTitle}`)}" />`;

  return `<article class="dos-evidence-card">
    <div class="dos-evidence-head">
      <span class="dos-evidence-ref">${escapeHtml(photo.refCode)}</span>
      <span class="dos-evidence-date">Ngày ${escapeHtml(photo.date || "-")} / Thửa ${escapeHtml(photo.plotCode || "-")}</span>
    </div>
    <div class="dos-evidence-frame">
      ${mediaHtml}
    </div>
    <div class="dos-evidence-meta">
      <strong class="dos-evidence-activity">${escapeHtml(photo.activityTitle)}</strong>
      ${detailLine ? `<div class="dos-evidence-detail">${escapeHtml(detailLine)}</div>` : ""}
      <div class="dos-evidence-row"><span>Phân loại:</span> ${escapeHtml(photo.categoryLabel)}</div>
      <div class="dos-evidence-row"><span>Định vị:</span> ${escapeHtml(photo.gpsStatusLabel)}</div>
      <div class="dos-evidence-row"><span>Đối soát:</span> <span class="${verifyClass}">${escapeHtml(photo.verificationLabel)}</span></div>
    </div>
  </article>`;
}

/**
 * Mẫu A4 đồng bộ phong cách Hồ sơ Truy xuất Nguồn gốc (Swiss Editorial A4):
 * - Chỉ áp dụng cho nhóm Sổ báo cáo nhật ký canh tác (`household-logbook`, `journal`, `spray`).
 * - Đầu trang chỉ dùng chữ pháp nhân Hợp tác xã sắc nét (không hiển thị hộp icon/logo).
 * - Bảng kê giữ đầy đủ đường kẻ ngang/dọc nhưng dùng nét mảnh tinh tế (`0.75px` / `1px` màu trung tính `#cfcfc9`, `#e6e6e1`).
 */
function buildCultivationLogbookDossierHtml(
  report: PrintableReportDocSpec,
  data: ReportDataPayload,
  meta: PrintableReportContextMeta,
  preparedPhotos: PreparedPhoto[],
  qrDataUrl: string | null,
): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://htxcune.com";
  const fontFaceCss = collectSelfHostedFontCss();
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const exportedAtLabel = `${hours}:${minutes} ngày ${day}/${month}/${year}`;

  const isHouseholdDetail = data.mode === "household_detail" && Boolean(data.householdMeta);
  const hh = data.householdMeta ?? null;
  const usePortraitA4 = isHouseholdDetail && data.headers.length <= 9;
  const pageOrientationCss = usePortraitA4
    ? "@page { size: A4 portrait; margin: 0; }"
    : "@page { size: A4 landscape; margin: 0; }";
  const sheetMaxWidth = usePortraitA4 ? "210mm" : "297mm";

  const dateRangeLabel =
    meta.from && meta.to
      ? `Từ ${formatIsoToVn(meta.from)} đến ${formatIsoToVn(meta.to)}`
      : meta.from
        ? `Từ ${formatIsoToVn(meta.from)} đến nay`
        : meta.to
          ? `Đến ${formatIsoToVn(meta.to)}`
          : "Toàn bộ thời gian canh tác";

  const coopLegalRaw = hh?.coopLegalName || "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né";
  const coopLines = splitCoopDisplayLines(coopLegalRaw);
  const coopSubLine = normalizeReportAdminText(hh?.coopAddress || "Xã Krông Búk, Tỉnh Đắk Lắk");

  const shortMainTitle =
    data.type === "spray"
      ? "NHẬT KÝ PHUN THUỐC"
      : data.type === "journal" && !isHouseholdDetail
        ? "NHẬT KÝ CANH TÁC"
        : "SỔ NHẬT KÝ CANH TÁC";

  const colClasses = data.headers.map((h) => {
    const lower = h.toLowerCase();
    if (lower.includes("ngày")) return "is-col-date";
    if (lower === "mã thửa" || lower === "số thửa" || lower === "diện tích (ha)") return "is-col-compact";
    if (lower.includes("xác minh") || lower.includes("trạng thái")) return "is-col-verify";
    if (lower.includes("người ghi")) return "is-col-recorder";
    if (lower.includes("mã minh chứng")) return "is-col-ref";
    return "";
  });

  const theadHtml = data.headers
    .map((h, idx) => `<th class="${colClasses[idx]}">${escapeHtml(h)}</th>`)
    .join("");

  const tbodyHtml =
    data.rows.length === 0
      ? `<tr><td colspan="${data.headers.length + 1}" class="dos-empty-cell">Chưa có bản ghi nhật ký phù hợp trong khoảng thời gian đã chọn.</td></tr>`
      : data.rows
          .map((row, rIdx) => {
            const tds = row
              .map((cell, cIdx) => {
                const rawTrim = (cell || "").trim();
                let statusTone = "";
                if (/^HTX đã xác minh/i.test(rawTrim) || rawTrim === "Đạt" || rawTrim === "Đủ chuẩn XK") {
                  statusTone = " dos-status-ok";
                } else if (/vượt ngưỡng|vi phạm|bị cấm/i.test(rawTrim)) {
                  statusTone = " dos-status-danger";
                }
                const cls = `${colClasses[cIdx]}${statusTone}`.trim();
                return `<td${cls ? ` class="${cls}"` : ""}>${renderCellHtml(cell, origin)}</td>`;
              })
              .join("");
            return `<tr><td class="col-stt">${rIdx + 1}</td>${tds}</tr>`;
          })
          .join("");

  let partiesHtml = "";
  if (hh) {
    const plotsLine =
      hh.plots.length > 0
        ? hh.plots
            .map(
              (p) =>
                `${p.plotCode} (${p.areaHa} ha${p.variety ? `, ${p.variety}` : ""}${p.plantedYear ? `, trồng ${p.plantedYear}` : ""})`,
            )
            .join("; ")
        : `Tổng ${hh.plotCount} thửa (${hh.areaHa} ha)`;

    partiesHtml = `<section class="dos-parties">
      <div class="dos-party-col">
        <span class="dos-party-kicker">Nông hộ canh tác định danh</span>
        <strong class="dos-party-name">${escapeHtml(hh.name)}</strong>
        <div class="dos-party-lines">
          <span>Địa bàn: ${escapeHtml(normalizeReportAdminText(hh.villageName))}</span>
          <span class="num">Điện thoại / CCCD: ${escapeHtml(hh.phone || "-")} / ${escapeHtml(hh.cccd || "-")}</span>
          <span class="num">Quy mô canh tác: ${hh.plotCount} thửa (${hh.areaHa} ha)</span>
          <span class="num">Thửa vườn: ${escapeHtml(plotsLine)}</span>
        </div>
        <div class="dos-party-code">Mã hộ: ${escapeHtml(hh.code)} (${escapeHtml(hh.statusLabel)})</div>
      </div>
      <div class="dos-party-col">
        <span class="dos-party-kicker">Vùng trồng và quy chuẩn áp dụng</span>
        <strong class="dos-party-name">${escapeHtml(hh.zoneName)}</strong>
        <div class="dos-party-lines">
          <span>${escapeHtml(
            normalizeReportAdminText(
              hh.zoneAddress ||
                (/^66-PUC-SR0001-/i.test(hh.pucCode) || /ea\s*kh[aă]l/i.test(hh.zoneName)
                  ? "Xã Ea Khăl, Huyện Ea H'Leo, Tỉnh Đắk Lắk"
                  : coopSubLine),
            ),
          )}</span>
          <span>Tiêu chuẩn: VietGAP và Nghị định thư GACC</span>
          <span class="num">Kỳ trích xuất: ${escapeHtml(dateRangeLabel)}</span>
        </div>
        <div class="dos-party-code">PUC: ${escapeHtml(hh.pucCode)}</div>
        ${hh.gaccCode ? `<div class="dos-party-code-sub">Mã GACC: ${escapeHtml(hh.gaccCode)}</div>` : ""}
      </div>
    </section>`;
  } else {
    partiesHtml = `<section class="dos-parties">
      <div class="dos-party-col">
        <span class="dos-party-kicker">Đơn vị quản lý vùng trồng</span>
        <strong class="dos-party-name">${escapeHtml(coopLegalRaw)}</strong>
        <div class="dos-party-lines">
          <span>${escapeHtml(coopSubLine)}</span>
          <span>Phạm vi địa bàn: ${escapeHtml(normalizeReportAdminText(meta.villageName || "Tất cả thôn / tổ"))}</span>
          <span>Tiêu chuẩn: VietGAP và Nghị định thư GACC</span>
        </div>
      </div>
      <div class="dos-party-col">
        <span class="dos-party-kicker">Thông số kỳ báo cáo</span>
        <strong class="dos-party-name">${escapeHtml(report.docTitle)}</strong>
        <div class="dos-party-lines">
          <span>${escapeHtml(report.desc)}</span>
          <span class="num">Kỳ báo cáo: ${escapeHtml(dateRangeLabel)}</span>
        </div>
        <div class="dos-party-code">Tổng dòng kê khai: ${Number(data.total) || 0}</div>
      </div>
    </section>`;
  }

  const fieldPhotos = preparedPhotos.filter((p) => p.category !== "invoice");
  const invoicePhotos = preparedPhotos.filter((p) => p.category === "invoice");
  const hasPhotoAppendix = fieldPhotos.length > 0 || invoicePhotos.length > 0;
  const gridColsClass = usePortraitA4 ? "dos-evidence-grid-2" : "dos-evidence-grid-3";

  const stats = data.summaryStats;
  const summarySplitHtml = `<section class="dos-summary-split">
    <div class="dos-total-box">
      <span class="dos-total-label">Tổng hợp hồ sơ nhật ký</span>
      <div class="dos-hatch-box">
        <strong class="dos-hatch-val">${stats ? stats.totalRecords : Number(data.total) || 0} bản ghi</strong>
        <span class="dos-hatch-sub">${
          hasPhotoAppendix
            ? `Kèm ${preparedPhotos.length} hình ảnh phụ lục đối chiếu`
            : "Đối chiếu trực tiếp dữ liệu điện tử HTX"
        }</span>
      </div>
    </div>
    ${
      stats
        ? `<dl class="dos-kv-totals">
             <div class="dos-kv-row">
               <dt>HTX đã xác minh</dt>
               <dd class="${stats.verifiedCount > 0 ? "dos-status-ok" : ""}">${stats.verifiedCount} bản ghi</dd>
             </div>
             <div class="dos-kv-row">
               <dt>Nông hộ tự khai báo</dt>
               <dd>${stats.selfDeclaredCount} bản ghi</dd>
             </div>
             <div class="dos-kv-row">
               <dt>Khớp tọa độ GPS tại vườn</dt>
               <dd>${stats.gpsVerifiedCount} bản ghi</dd>
             </div>
             <div class="dos-kv-row is-grand">
               <dt>Tệp minh chứng thực địa</dt>
               <dd>${stats.fieldPhotoCount} ảnh${stats.videoCount > 0 ? `, ${stats.videoCount} video` : ""}${
                 stats.invoicePhotoCount > 0 ? `, ${stats.invoicePhotoCount} chứng từ` : ""
               }</dd>
             </div>
           </dl>`
        : `<div class="dos-summary-note-wrap">
             <p class="dos-summary-note">Dữ liệu nhật ký được ghi nhận thời gian thực trên hệ thống quản lý vùng trồng của Hợp tác xã Cư Né.</p>
           </div>`
    }
  </section>`;

  const summaryModeNoteHtml = !isHouseholdDetail
    ? `<p class="dos-summary-note">Ghi chú: Để tối ưu tốc độ tra cứu và dung lượng tệp in cho báo cáo nhiều hộ, hình ảnh hiện trường độ phân giải gốc được liên kết qua đường dẫn hồ sơ số của từng hộ hoặc khi xuất sổ chi tiết từng nông hộ.</p>`
    : "";

  let appendixHtml = "";
  if (hasPhotoAppendix) {
    const truncatedCount = Number(data.truncatedPhotoCount ?? 0);
    appendixHtml = `<header class="dos-head-cont">
      <strong class="dos-cont-org">${escapeHtml(coopLegalRaw)}</strong>
      <span class="dos-cont-meta">${escapeHtml(shortMainTitle)}${hh ? ` / MÃ HỘ: ${escapeHtml(hh.code)}` : ""}</span>
    </header>
    <section class="dos-appendix">
      <div class="dos-meta-strip">
        <span class="dos-meta-left">Phần II / Phụ lục hình ảnh minh chứng thực địa</span>
        <span class="dos-meta-right">Đối chiếu mã MC tại Phần I (${preparedPhotos.length} ảnh)</span>
      </div>
      ${
        fieldPhotos.length > 0
          ? `<div class="dos-appendix-group">
               ${
                 invoicePhotos.length > 0
                   ? `<div class="dos-appendix-subhead">1. Hình ảnh hiện trường chăm sóc và bảo vệ thực vật (${fieldPhotos.length} ảnh)</div>`
                   : ""
               }
               <div class="dos-evidence-grid ${gridColsClass}">
                 ${fieldPhotos.map(buildDossierPhotoCardHtml).join("")}
               </div>
             </div>`
          : ""
      }
      ${
        invoicePhotos.length > 0
          ? `<div class="dos-appendix-group">
               <div class="dos-appendix-subhead">${fieldPhotos.length > 0 ? "2." : "1."} Chứng từ và hóa đơn vật tư nông nghiệp lưu nội bộ (${invoicePhotos.length} ảnh)</div>
               <div class="dos-evidence-grid ${gridColsClass}">
                 ${invoicePhotos.map(buildDossierPhotoCardHtml).join("")}
               </div>
             </div>`
          : ""
      }
      ${
        truncatedCount > 0
          ? `<p class="dos-summary-note">Ghi chú: Còn ${truncatedCount} hình ảnh bổ sung của hộ được lưu trữ nguyên bản trên hệ thống điện tử. Quét mã QR cuối hồ sơ để tra cứu toàn bộ ảnh độ phân giải gốc.</p>`
          : ""
      }
    </section>`;
  }

  const leftSigRole = isHouseholdDetail ? "Đại diện Nông hộ canh tác" : "Người lập biểu";
  const leftSigName = hh ? escapeHtml(hh.name) : "";
  const docFullLabel = `${report.docTitle}${hh ? ` - ${hh.code}` : ""} - HTX Cư Né`;
  const fullTraceUrl = hh ? `${origin}${sanitizeTracePath(hh.tracePath)}` : "";

  const closingBlockHtml = `
    <section class="dos-attest-grid${hh ? "" : " is-two-cols"}">
      <div class="dos-attest-col is-bordered">
        <strong class="dos-attest-heading">${escapeHtml(leftSigRole)}</strong>
        <p>${
          isHouseholdDetail
            ? "Xác nhận ghi chép trung thực nhật ký canh tác, vật tư sử dụng và tuân thủ thời gian cách ly an toàn trước thu hoạch."
            : "Tổng hợp đầy đủ từ cơ sở dữ liệu nhật ký điện tử của các hộ thành viên trong kỳ báo cáo."
        }</p>
        <div class="dos-sig-space">(Ký, ghi rõ họ tên)</div>
        ${leftSigName ? `<strong class="dos-sig-name">${leftSigName}</strong>` : ""}
      </div>
      <div class="dos-attest-col${hh ? " is-bordered" : ""}">
        <strong class="dos-attest-heading">TM. Ban Giám đốc HTX Cư Né</strong>
        <p>Ngày ${day} tháng ${month} năm ${year} - Kiểm tra đối chiếu và lưu trữ hồ sơ quản lý vùng trồng.</p>
        <div class="dos-sig-space">(Ký tên, đóng dấu xác nhận)</div>
      </div>
      ${
        hh
          ? `<div class="dos-sign-col">
               <span class="dos-sign-kicker">Hồ sơ số trực tuyến</span>
               <div class="dos-qr-wrap">
                 ${
                   qrDataUrl
                     ? `<img src="${escapeHtml(qrDataUrl)}" alt="Mã QR hồ sơ số" class="dos-qr-img" />`
                     : `<div class="dos-qr-placeholder"></div>`
                 }
               </div>
               <strong class="dos-sign-org">HTX Cư Né</strong>
               <a href="${escapeHtml(fullTraceUrl)}" target="_blank" rel="noopener noreferrer" class="dos-sign-code">${escapeHtml(hh.code)}</a>
             </div>`
          : ""
      }
    </section>
    <footer class="dos-footer-bar">
      <span>${escapeHtml(coopLegalRaw)} (${escapeHtml(coopSubLine)})</span>
      <span>Xuất lúc ${escapeHtml(exportedAtLabel)}</span>
    </footer>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docFullLabel)}</title>
  <style>
    ${fontFaceCss}
    ${pageOrientationCss}
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-variant-numeric: tabular-nums;
      color: #18181b;
      margin: 0;
      padding: 20px 16px 36px;
      background: #efefec;
      font-size: 12px;
      line-height: 1.45;
      -webkit-text-size-adjust: none;
      text-size-adjust: none;
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .print-toolbar {
      max-width: ${sheetMaxWidth};
      margin: 0 auto 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: #ffffff;
      border: 1px solid #d4d4d2;
      border-radius: 0;
    }
    .print-toolbar-info {
      font-size: 12.5px;
      color: #575752;
      font-weight: 600;
    }
    .print-toolbar-actions {
      display: flex;
      gap: 8px;
    }
    .print-btn {
      padding: 7px 15px;
      border-radius: 0;
      border: 1px solid #18181b;
      background: #18181b;
      color: #ffffff;
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
      outline: none;
    }
    .print-btn.secondary {
      background: #ffffff;
      color: #18181b;
      border-color: #cfcfc9;
    }
    .dos-a4-sheet {
      max-width: ${sheetMaxWidth};
      margin: 0 auto;
      background: #ffffff;
      border: none;
      border-radius: 0;
      padding: 13mm 14mm 12mm;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05), 0 18px 42px -12px rgba(15, 23, 42, 0.12);
    }
    .print-layout-frame {
      width: 100%;
      border-collapse: collapse;
      border: none;
    }
    .print-layout-thead,
    .print-layout-tfoot {
      display: none;
    }
    .print-layout-cell {
      padding: 0;
      border: none;
      vertical-align: top;
    }

    /* 1. Đầu trang phong cách tờ A4 truy xuất QR (chỉ giữ chữ, không gắn hộp icon/logo) */
    .dos-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 18px;
    }
    .dos-brand-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .dos-org-name {
      display: flex;
      flex-direction: column;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #121212;
      line-height: 1.26;
    }
    .dos-org-line {
      display: block;
    }
    .dos-org-sub {
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #8a8a84;
      line-height: 1.3;
      margin-top: 1px;
    }
    .dos-title-block {
      text-align: right;
      flex-shrink: 0;
    }
    .dos-main-title {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.035em;
      line-height: 1.08;
      color: #121212;
    }
    .dos-date-line {
      margin-top: 5px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #2c2c2a;
      font-variant-numeric: tabular-nums;
    }
    .dos-head-cont {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 9px;
      margin-bottom: 16px;
      border-bottom: 1px solid #e4e4df;
    }
    .dos-cont-org {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #121212;
    }
    .dos-cont-meta {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #575752;
      font-variant-numeric: tabular-nums;
    }

    /* 2. Khối nền xám phẳng 2 cột (tương đồng .tr-doc-parties) */
    .dos-parties {
      margin: 0 0 18px;
      background: #f4f4f2;
      padding: 18px 22px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 28px;
      border-radius: 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .dos-party-col {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .dos-party-kicker {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #121212;
      margin-bottom: 7px;
    }
    .dos-party-name {
      font-size: 13.5px;
      font-weight: 700;
      color: #121212;
      line-height: 1.35;
      margin-bottom: 5px;
    }
    .dos-party-lines {
      display: flex;
      flex-direction: column;
      gap: 2.5px;
      font-size: 11.5px;
      color: #575752;
      line-height: 1.48;
    }
    .dos-party-code {
      margin-top: 9px;
      font-size: 11.5px;
      font-weight: 600;
      color: #18181b;
      font-variant-numeric: tabular-nums;
    }
    .dos-party-code-sub {
      margin-top: 2px;
      font-size: 11px;
      font-weight: 600;
      color: #3f3f3b;
      font-variant-numeric: tabular-nums;
    }

    /* 3. Dải tiêu đề mục & Bảng kê đường kẻ mảnh tinh tế */
    .dos-meta-strip {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 7px;
    }
    .dos-meta-left {
      font-size: 10.5px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #6b6b66;
    }
    .dos-meta-right {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.035em;
      color: #121212;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    table.dos-table {
      width: 100%;
      border-collapse: collapse;
      border-top: 1px solid #cfcfc9;
      border-bottom: 1px solid #cfcfc9;
      border-left: 0.75px solid #e6e6e1;
      border-right: 0.75px solid #e6e6e1;
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-size: 11.2px;
      font-variant-numeric: tabular-nums;
      background: #ffffff;
    }
    .dos-table thead {
      display: table-header-group;
    }
    .dos-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .dos-table th {
      padding: 8px 7px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.035em;
      color: #18181b;
      background: #fafaf8;
      text-align: left;
      vertical-align: middle;
      line-height: 1.3;
      border-bottom: 1px solid #dfdfd9;
      border-right: 0.75px solid #e6e6e1;
    }
    .dos-table td {
      padding: 8px 7px;
      font-size: 11.2px;
      color: #3f3f3b;
      text-align: left;
      vertical-align: top;
      line-height: 1.44;
      overflow-wrap: break-word;
      border-top: 0.75px solid #ebeae5;
      border-right: 0.75px solid #e6e6e1;
      background: #ffffff;
    }
    .dos-table tbody tr:first-child td {
      border-top: none;
    }
    .dos-table th:last-child,
    .dos-table td:last-child {
      border-right: none;
    }
    .dos-table th.col-stt,
    .dos-table td.col-stt {
      width: 34px;
      min-width: 34px;
      padding-left: 4px;
      padding-right: 4px;
      text-align: center;
      white-space: nowrap;
      font-weight: 600;
      color: #575752;
    }
    .dos-table th.is-col-date,
    .dos-table td.is-col-date {
      width: 74px;
      white-space: nowrap;
      color: #575752;
    }
    .dos-table th.is-col-compact,
    .dos-table td.is-col-compact {
      width: 62px;
      white-space: nowrap;
      font-weight: 600;
      color: #18181b;
    }
    .dos-table th.is-col-recorder,
    .dos-table td.is-col-recorder {
      width: 66px;
    }
    .dos-table th.is-col-ref,
    .dos-table td.is-col-ref {
      width: 78px;
      font-weight: 600;
      color: #18181b;
    }
    .dos-empty-cell {
      text-align: center !important;
      padding: 20px 12px !important;
      color: #6b6b66 !important;
    }
    .trace-link {
      font-size: 10.8px;
      color: #14372f;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 2px;
      word-break: break-all;
    }
    .dos-status-ok {
      color: #15803d !important;
      font-weight: 600;
    }
    .dos-status-danger {
      color: #b91c1c !important;
      font-weight: 600;
    }
    .dos-status-muted {
      color: #575752;
      font-weight: 600;
    }

    /* 4. Khối tổng kết ô kẻ chéo & chỉ số đối soát (.tr-doc-summary-split) */
    .dos-summary-split {
      margin: 18px 0 0;
      display: grid;
      grid-template-columns: 236px minmax(0, 1fr);
      gap: 32px;
      align-items: start;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .dos-total-box {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .dos-total-label {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #2c2c2a;
    }
    .dos-hatch-box {
      margin-top: 7px;
      width: 100%;
      padding: 12px 16px;
      background: repeating-linear-gradient(
        -45deg,
        #f3f3f0,
        #f3f3f0 3px,
        #ffffff 3px,
        #ffffff 7px
      );
      border: 1px solid #ecece8;
      border-radius: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .dos-hatch-val {
      font-size: 21px;
      font-weight: 700;
      color: #121212;
      line-height: 1.16;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .dos-hatch-sub {
      font-size: 11px;
      font-weight: 500;
      color: #575752;
    }
    .dos-kv-totals {
      margin: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6.5px;
    }
    .dos-kv-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: baseline;
      gap: 14px;
      font-size: 11.2px;
    }
    .dos-kv-row dt {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #2c2c2a;
      white-space: nowrap;
    }
    .dos-kv-row dd {
      margin: 0;
      text-align: right;
      font-weight: 600;
      color: #18181b;
      font-variant-numeric: tabular-nums;
    }
    .dos-kv-row.is-grand {
      margin-top: 2px;
      padding-top: 6px;
      border-top: 1px solid #e4e4df;
      font-size: 11.5px;
    }
    .dos-kv-row.is-grand dd {
      font-weight: 700;
    }
    .dos-summary-note {
      margin: 10px 0 0;
      font-size: 11px;
      color: #6b6b66;
      line-height: 1.46;
    }

    /* 5. Phụ lục hình ảnh phẳng cạnh vuông đường mảnh */
    .dos-appendix-wrap {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid #e4e4df;
    }
    .dos-appendix-group {
      margin-top: 8px;
    }
    .dos-appendix-subhead {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.035em;
      color: #18181b;
      margin: 10px 0 8px;
    }
    .dos-evidence-grid {
      display: grid;
      gap: 12px;
    }
    .dos-evidence-grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .dos-evidence-grid-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .dos-evidence-card {
      border: 0.75px solid #dfdfd9;
      border-radius: 0;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .dos-evidence-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #f4f4f2;
      border-bottom: 0.75px solid #e6e6e1;
      font-size: 10.5px;
    }
    .dos-evidence-ref {
      font-weight: 700;
      color: #121212;
      letter-spacing: 0.03em;
    }
    .dos-evidence-date {
      color: #575752;
      font-weight: 500;
    }
    .dos-evidence-frame {
      height: 168px;
      background: #fafaf8;
      border-bottom: 0.75px solid #e6e6e1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      overflow: hidden;
    }
    .dos-evidence-frame img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .dos-photo-fallback {
      font-size: 10.8px;
      color: #6b6b66;
      text-align: center;
      padding: 12px;
    }
    .dos-evidence-meta {
      padding: 8px 10px;
      font-size: 10.8px;
      line-height: 1.44;
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: #3f3f3b;
    }
    .dos-evidence-activity {
      font-size: 11.4px;
      font-weight: 700;
      color: #121212;
      margin-bottom: 1px;
    }
    .dos-evidence-detail {
      color: #666662;
      margin-bottom: 2px;
    }
    .dos-evidence-row span:first-child {
      color: #6b6b66;
      font-weight: 600;
    }

    /* 6. Khối chữ ký xác thực & Con dấu QR cuối hồ sơ (.tr-doc-attest-grid) */
    .dos-attest-grid {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid #e4e4df;
      display: grid;
      grid-template-columns: 1fr 1.08fr 148px;
      gap: 20px;
      align-items: start;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .dos-attest-grid.is-two-cols {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 28px;
    }
    .dos-attest-col {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .dos-attest-col.is-bordered {
      padding-right: 16px;
      border-right: 1px solid #e2e2dd;
    }
    .dos-attest-heading {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #121212;
    }
    .dos-attest-col p {
      margin: 0;
      font-size: 10.8px;
      color: #575752;
      line-height: 1.46;
    }
    .dos-sig-space {
      margin-top: 2px;
      margin-bottom: 48px;
      font-size: 10.5px;
      color: #8a8a84;
    }
    .dos-sig-name {
      font-size: 11.5px;
      font-weight: 700;
      color: #121212;
    }
    .dos-sign-col {
      width: 148px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      justify-self: end;
    }
    .dos-sign-kicker {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #2c2c2a;
      margin-bottom: 5px;
    }
    .dos-qr-wrap {
      padding: 5px;
      border: 1px solid #dfdfd9;
      background: #ffffff;
      margin-bottom: 5px;
    }
    .dos-qr-img {
      width: 76px;
      height: 76px;
      display: block;
    }
    .dos-qr-placeholder {
      width: 76px;
      height: 76px;
      background: #f4f4f2;
    }
    .dos-sign-org {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #121212;
    }
    .dos-sign-code {
      margin-top: 1px;
      font-size: 10px;
      font-weight: 600;
      color: #575752;
      text-decoration: underline;
      text-underline-offset: 2px;
      word-break: break-all;
    }
    .dos-footer-bar {
      margin-top: 18px;
      padding-top: 9px;
      border-top: 1px solid #e4e4df;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 10.5px;
      color: #6b6b66;
      font-variant-numeric: tabular-nums;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    @media print {
      html, body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .print-toolbar {
        display: none !important;
      }
      .dos-a4-sheet {
        max-width: none !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .print-layout-thead {
        display: table-header-group !important;
      }
      .print-layout-tfoot {
        display: table-footer-group !important;
      }
      .print-margin-spacer {
        height: 12mm;
      }
      .print-layout-cell {
        padding: 0 13mm !important;
      }
      .print-page-break {
        page-break-before: always;
        break-before: page;
      }
      .dos-appendix-wrap {
        margin-top: 0;
        padding-top: 0;
        border-top: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <span class="print-toolbar-info">${
      isHouseholdDetail
        ? `Sổ nhật ký nông hộ ${escapeHtml(hh?.code || "")}${hasPhotoAppendix ? ` kèm ${preparedPhotos.length} ảnh minh chứng` : ""}`
        : `${escapeHtml(report.title)} (${Number(data.total) || 0} bản ghi)`
    }</span>
    <div class="print-toolbar-actions">
      <button type="button" id="report-btn-print" class="print-btn">In sổ / Lưu PDF</button>
      <button type="button" id="report-btn-close" class="print-btn secondary">Đóng cửa sổ</button>
    </div>
  </div>
  <main class="dos-a4-sheet">
    <table class="print-layout-frame" role="presentation">
      <thead class="print-layout-thead" aria-hidden="true">
        <tr><td><div class="print-margin-spacer"></div></td></tr>
      </thead>
      <tfoot class="print-layout-tfoot" aria-hidden="true">
        <tr><td><div class="print-margin-spacer"></div></td></tr>
      </tfoot>
      <tbody class="print-layout-body">
        <tr>
          <td class="print-layout-cell">
            <header class="dos-head">
              <div class="dos-brand-copy">
                <strong class="dos-org-name">
                  <span class="dos-org-line">${escapeHtml(coopLines.line1)}</span>
                  ${coopLines.line2 ? `<span class="dos-org-line">${escapeHtml(coopLines.line2)}</span>` : ""}
                </strong>
                <span class="dos-org-sub">${escapeHtml(coopSubLine)}</span>
              </div>
              <div class="dos-title-block">
                <h1 class="dos-main-title">${escapeHtml(shortMainTitle)}</h1>
                <div class="dos-date-line">Ngày xuất hồ sơ: <span>${day}/${month}/${year}</span></div>
              </div>
            </header>

            ${partiesHtml}

            <section class="dos-ledger">
              <div class="dos-meta-strip">
                <span class="dos-meta-left">${
                  hasPhotoAppendix
                    ? "Phần I / Bảng kê nhật ký canh tác theo trình tự thời gian"
                    : "Bảng kê nhật ký canh tác theo trình tự thời gian"
                }</span>
                <span class="dos-meta-right">Tổng cộng: ${Number(data.total) || 0} bản ghi</span>
              </div>
              <table class="dos-table">
                <thead>
                  <tr>
                    <th class="col-stt">STT</th>
                    ${theadHtml}
                  </tr>
                </thead>
                <tbody>
                  ${tbodyHtml}
                </tbody>
              </table>
            </section>

            ${summarySplitHtml}
            ${summaryModeNoteHtml}
            ${!hasPhotoAppendix ? closingBlockHtml : ""}
          </td>
        </tr>
      </tbody>
      ${
        hasPhotoAppendix
          ? `<tbody class="print-layout-body print-page-break">
               <tr>
                 <td class="print-layout-cell">
                   <div class="dos-appendix-wrap">
                     ${appendixHtml}
                   </div>
                   ${closingBlockHtml}
                 </td>
               </tr>
             </tbody>`
          : ""
      }
    </table>
  </main>
</body>
</html>`;
}

function buildPrintableReportHtml(
  report: PrintableReportDocSpec,
  data: ReportDataPayload,
  meta: PrintableReportContextMeta,
  preparedPhotos: PreparedPhoto[],
  qrDataUrl: string | null,
): string {
  if (
    data.type === "household-logbook" ||
    data.type === "journal" ||
    data.type === "spray"
  ) {
    return buildCultivationLogbookDossierHtml(
      report,
      data,
      meta,
      preparedPhotos,
      qrDataUrl,
    );
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "https://htxcune.com";
  const fontFaceCss = collectSelfHostedFontCss();
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const exportedAtLabel = `${hours}:${minutes} ngày ${day}/${month}/${year}`;

  const isHouseholdDetail = data.mode === "household_detail" && Boolean(data.householdMeta);
  const hh = data.householdMeta ?? null;
  const usePortraitA4 = isHouseholdDetail && data.headers.length <= 9;
  const pageOrientationCss = usePortraitA4
    ? "@page { size: A4 portrait; margin: 0; }"
    : "@page { size: A4 landscape; margin: 0; }";
  const sheetMaxWidth = usePortraitA4 ? "210mm" : "297mm";

  const dateRangeLabel =
    meta.from && meta.to
      ? `Từ ngày ${formatIsoToVn(meta.from)} đến ngày ${formatIsoToVn(meta.to)}`
      : meta.from
        ? `Từ ngày ${formatIsoToVn(meta.from)} đến nay`
        : meta.to
          ? `Tính đến ngày ${formatIsoToVn(meta.to)}`
          : "Toàn bộ thời gian canh tác";

  const coopUpperName = (
    hh?.coopLegalName || "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né"
  ).toUpperCase();
  const coopSubLine = hh?.coopAddress || "Xã Krông Búk, Tỉnh Đắk Lắk";

  const theadHtml = data.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const tbodyHtml =
    data.rows.length === 0
      ? `<tr><td colspan="${data.headers.length + 1}" class="empty-cell">Chưa có dữ liệu phù hợp trong khoảng thời gian đã chọn.</td></tr>`
      : data.rows
          .map(
            (row, idx) =>
              `<tr><td class="col-stt">${idx + 1}</td>${row
                .map((cell) => `<td>${renderCellHtml(cell, origin)}</td>`)
                .join("")}</tr>`,
          )
          .join("");

  const stats = data.summaryStats;
  const statsStripHtml = stats
    ? `<div class="stats-strip">
        <div class="stat-cell">
          <span class="stat-label">Tổng mục ghi nhận</span>
          <strong class="stat-val">${stats.totalRecords}</strong>
        </div>
        <div class="stat-cell">
          <span class="stat-label">HTX đã xác minh</span>
          <strong class="stat-val status-verified">${stats.verifiedCount}</strong>
        </div>
        <div class="stat-cell">
          <span class="stat-label">Nông hộ tự khai báo</span>
          <strong class="stat-val">${stats.selfDeclaredCount}</strong>
        </div>
        <div class="stat-cell">
          <span class="stat-label">Khớp tọa độ GPS vườn</span>
          <strong class="stat-val">${stats.gpsVerifiedCount}</strong>
        </div>
        <div class="stat-cell">
          <span class="stat-label">Ảnh hiện trường</span>
          <strong class="stat-val">${stats.fieldPhotoCount}${stats.videoCount > 0 ? ` (${stats.videoCount} video)` : ""}</strong>
        </div>
        ${
          stats.invoicePhotoCount > 0
            ? `<div class="stat-cell">
                 <span class="stat-label">Chứng từ vật tư</span>
                 <strong class="stat-val">${stats.invoicePhotoCount}</strong>
               </div>`
            : ""
        }
      </div>`
    : "";

  let householdProfileHtml = "";
  if (hh) {
    const safeTracePath = sanitizeTracePath(hh.tracePath);
    const fullTraceUrl = `${origin}${safeTracePath}`;
    const plotsLine =
      hh.plots.length > 0
        ? hh.plots
            .map(
              (p) =>
                `${p.plotCode} (${p.areaHa} ha${p.variety ? `, ${p.variety}` : ""}${p.plantedYear ? `, trồng ${p.plantedYear}` : ""})`,
            )
            .join("; ")
        : `Tổng ${hh.plotCount} thửa (${hh.areaHa} ha)`;

    householdProfileHtml = `<section class="hh-dossier-box">
      <div class="hh-dossier-main">
        <div class="hh-section-heading">Thông tin định danh nông hộ và vùng trồng</div>
        <div class="hh-info-grid">
          <div><strong>Chủ hộ canh tác:</strong> ${escapeHtml(hh.name)}</div>
          <div><strong>Mã hộ thành viên:</strong> <span class="num">${escapeHtml(hh.code)}</span></div>
          <div><strong>Địa bàn thôn / tổ:</strong> ${escapeHtml(hh.villageName)}</div>
          <div><strong>Điện thoại / CCCD:</strong> <span class="num">${escapeHtml(hh.phone || "-")} | ${escapeHtml(hh.cccd || "-")}</span></div>
          <div><strong>Mã vùng trồng (PUC):</strong> <span class="num">${escapeHtml(hh.pucCode)}</span></div>
          <div><strong>Mã Hải quan TQ (GACC):</strong> <span class="num">${escapeHtml(hh.gaccCode || "Theo hồ sơ vùng trồng")}</span></div>
          <div><strong>Quy mô canh tác:</strong> <span class="num">${hh.plotCount} thửa, ${hh.areaHa} ha</span></div>
          <div><strong>Trạng thái thẩm định:</strong> ${escapeHtml(hh.statusLabel)}</div>
          <div class="hh-info-span-all"><strong>Đơn vị vùng trồng:</strong> ${escapeHtml(hh.zoneName)}</div>
          <div class="hh-info-span-all"><strong>Chi tiết thửa vườn:</strong> <span class="num">${escapeHtml(plotsLine)}</span></div>
        </div>
      </div>
      <div class="hh-dossier-qr">
        ${
          qrDataUrl
            ? `<img src="${escapeHtml(qrDataUrl)}" alt="Mã QR hồ sơ số" class="hh-qr-img" />`
            : `<div class="hh-qr-placeholder">QR HỒ SƠ SỐ</div>`
        }
        <div class="hh-qr-caption">Hồ sơ truy xuất trực tuyến</div>
        <a href="${escapeHtml(fullTraceUrl)}" target="_blank" rel="noopener noreferrer" class="hh-qr-path">${escapeHtml(safeTracePath)}</a>
      </div>
    </section>`;
  }

  const fieldPhotos = preparedPhotos.filter((p) => p.category !== "invoice");
  const invoicePhotos = preparedPhotos.filter((p) => p.category === "invoice");
  const hasPhotoAppendix = fieldPhotos.length > 0 || invoicePhotos.length > 0;
  const gridColsClass = usePortraitA4 ? "evidence-grid-2" : "evidence-grid-3";

  let appendixHtml = "";
  if (hasPhotoAppendix) {
    const truncatedCount = Number(data.truncatedPhotoCount ?? 0);
    appendixHtml = `<section class="appendix-section">
      <div class="part-heading-bar">
        <h2 class="part-heading">Phần II. Phụ lục hình ảnh minh chứng thực địa</h2>
        <span class="part-sub">Mỗi hình ảnh được đánh mã đối chiếu trực tiếp với dòng nhật ký tương ứng tại Phần I</span>
      </div>
      ${
        fieldPhotos.length > 0
          ? `<div class="appendix-group">
               ${
                 invoicePhotos.length > 0
                   ? `<h3 class="appendix-subhead">1. Hình ảnh hiện trường chăm sóc và bảo vệ thực vật (${fieldPhotos.length} ảnh)</h3>`
                   : ""
               }
               <div class="evidence-grid ${gridColsClass}">
                 ${fieldPhotos.map(buildPhotoAppendixCardHtml).join("")}
               </div>
             </div>`
          : ""
      }
      ${
        invoicePhotos.length > 0
          ? `<div class="appendix-group">
               <h3 class="appendix-subhead">${fieldPhotos.length > 0 ? "2." : "1."} Chứng từ và hóa đơn vật tư nông nghiệp lưu nội bộ (${invoicePhotos.length} ảnh)</h3>
               <div class="evidence-grid ${gridColsClass}">
                 ${invoicePhotos.map(buildPhotoAppendixCardHtml).join("")}
               </div>
             </div>`
          : ""
      }
      ${
        truncatedCount > 0
          ? `<p class="appendix-note">Ghi chú: Còn ${truncatedCount} hình ảnh bổ sung của hộ được lưu trữ nguyên bản trên hệ thống điện tử. Quét mã QR ở đầu hồ sơ để tra cứu toàn bộ ảnh độ phân giải gốc.</p>`
          : ""
      }
    </section>`;
  }

  const summaryModeNoteHtml = !isHouseholdDetail
    ? `<p class="summary-mode-note">Ghi chú: Để đảm bảo tốc độ tra cứu và dung lượng tệp in ổn định cho báo cáo nhiều hộ, hình ảnh hiện trường độ phân giải cao được liên kết qua đường dẫn hồ sơ số của từng hộ hoặc xuất chi tiết theo từng nông hộ riêng biệt.</p>`
    : "";

  const leftSigRole = isHouseholdDetail ? "Đại diện Nông hộ canh tác" : "Người lập biểu";
  const leftSigName = hh ? escapeHtml(hh.name) : "";
  const docFullLabel = `${report.docTitle}${hh ? ` - ${hh.code}` : ""} - HTX Cư Né`;

  const closingBlockHtml = `
    <section class="doc-signatures">
      <div class="sig-box">
        <div class="sig-date">&nbsp;</div>
        <div class="sig-role">${escapeHtml(leftSigRole)}</div>
        <div class="sig-note">(Ký, ghi rõ họ tên)</div>
        ${leftSigName ? `<div class="sig-name">${leftSigName}</div>` : ""}
      </div>
      <div class="sig-box">
        <div class="sig-date">Ngày ${day} tháng ${month} năm ${year}</div>
        <div class="sig-role">TM. Ban Giám đốc HTX Cư Né</div>
        <div class="sig-note">(Ký tên, đóng dấu xác nhận)</div>
      </div>
    </section>
    <footer class="doc-export-foot">
      <span>${escapeHtml(docFullLabel)}</span>
      <span>Thời điểm xuất báo cáo: ${escapeHtml(exportedAtLabel)}</span>
    </footer>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docFullLabel)}</title>
  <style>
    ${fontFaceCss}
    ${pageOrientationCss}
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-variant-numeric: tabular-nums;
      color: #121212;
      margin: 0;
      padding: 20px 16px 36px;
      background: #f7f7f5;
      font-size: 12.5px;
      line-height: 1.45;
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .print-toolbar {
      max-width: ${sheetMaxWidth};
      margin: 0 auto 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: #ffffff;
      border: 1px solid #d4d4d2;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(20, 55, 47, 0.05);
    }
    .print-toolbar-info {
      font-size: 12.5px;
      color: #5f6d66;
      font-weight: 600;
    }
    .print-toolbar-actions {
      display: flex;
      gap: 8px;
    }
    .print-btn {
      padding: 7px 14px;
      border-radius: 6px;
      border: 1px solid #14372f;
      background: #14372f;
      color: #ffffff;
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
      outline: none;
    }
    .print-btn:focus-visible {
      box-shadow: 0 0 0 2px rgba(20, 55, 47, 0.28);
    }
    .print-btn.secondary {
      background: #ffffff;
      color: #14372f;
      border-color: #d4d4d2;
    }
    .a4-sheet-container {
      max-width: ${sheetMaxWidth};
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d4d4d2;
      padding: 14mm;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid #d4d4d2;
      margin-bottom: 14px;
    }
    .doc-org {
      max-width: 54%;
    }
    .doc-nation {
      text-align: right;
    }
    .doc-org strong, .doc-nation strong {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #14372f;
    }
    .doc-org span, .doc-nation span {
      display: inline-block;
      font-size: 11.5px;
      color: #5f6d66;
      margin-top: 2px;
    }
    .doc-nation span {
      font-weight: 600;
      color: #121212;
    }
    .doc-title-wrap {
      text-align: center;
      margin: 10px 0 14px;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 0 0 5px;
      color: #14372f;
      letter-spacing: -0.01em;
    }
    .doc-meta {
      font-size: 12px;
      color: #5f6d66;
      margin: 2px 0;
    }
    .hh-dossier-box {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      gap: 14px;
      border: 1px solid #d4d4d2;
      border-radius: 6px;
      padding: 12px 14px;
      background: #f7f7f5;
      margin-bottom: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .hh-dossier-main {
      flex: 1;
      min-width: 0;
    }
    .hh-section-heading {
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #14372f;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e5e3;
    }
    .hh-info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 14px;
      font-size: 11.8px;
      color: #121212;
    }
    .hh-info-span-all {
      grid-column: 1 / -1;
    }
    .hh-dossier-qr {
      width: 118px;
      flex-shrink: 0;
      border: 1px solid #e2e5e3;
      border-radius: 4px;
      background: #ffffff;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .hh-qr-img {
      width: 82px;
      height: 82px;
      display: block;
    }
    .hh-qr-placeholder {
      width: 82px;
      height: 82px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #d4d4d2;
      font-size: 10px;
      font-weight: 700;
      color: #5f6d66;
    }
    .hh-qr-caption {
      font-size: 9.8px;
      font-weight: 600;
      color: #5f6d66;
      margin-top: 4px;
      line-height: 1.25;
    }
    .hh-qr-path, .trace-link {
      font-size: 10px;
      color: #14372f;
      text-decoration: underline;
      word-break: break-all;
      margin-top: 2px;
    }
    .trace-link {
      font-size: 11px;
    }
    .stats-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
      border: 1px solid #d4d4d2;
      border-radius: 6px;
      background: #ffffff;
      margin-bottom: 14px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .stat-cell {
      padding: 7px 10px;
      border-right: 1px solid #e2e5e3;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .stat-cell:last-child {
      border-right: none;
    }
    .stat-label {
      font-size: 10.5px;
      color: #5f6d66;
      font-weight: 600;
    }
    .stat-val {
      font-size: 14px;
      font-weight: 700;
      color: #14372f;
      font-variant-numeric: tabular-nums;
    }
    .part-heading-bar {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      flex-wrap: wrap;
      margin: 12px 0 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #14372f;
    }
    .part-heading {
      font-size: 13.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #14372f;
      margin: 0;
      letter-spacing: 0.02em;
    }
    .part-sub {
      font-size: 11px;
      color: #5f6d66;
    }
    .print-layout-frame {
      width: 100%;
      border-collapse: collapse;
      border: none;
    }
    .print-layout-thead,
    .print-layout-tfoot {
      display: none;
    }
    .print-layout-cell {
      padding: 0;
      border: none;
      vertical-align: top;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-size: 11.2px;
      font-variant-numeric: tabular-nums;
    }
    .data-table thead {
      display: table-header-group;
    }
    .data-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .data-table th,
    .data-table td {
      border: 1px solid #c8cecb;
      padding: 6px 7px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    .data-table th {
      background: #f3f5f4;
      color: #14372f;
      font-weight: 700;
      text-align: center;
      font-size: 11px;
    }
    .data-table tbody tr:nth-child(even) {
      background: #fafbfa;
    }
    .col-stt {
      width: 34px;
      text-align: center;
      font-weight: 600;
    }
    .empty-cell {
      text-align: center;
      padding: 22px;
      color: #5f6d66;
    }
    .doc-summary {
      margin-top: 8px;
      font-size: 12px;
      font-weight: 700;
      color: #14372f;
    }
    .summary-mode-note, .appendix-note {
      margin: 8px 0 0;
      font-size: 11px;
      color: #5f6d66;
      line-height: 1.45;
    }
    .appendix-section {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid #e2e5e3;
    }
    .appendix-group {
      margin-top: 10px;
    }
    .appendix-subhead {
      font-size: 12px;
      font-weight: 700;
      color: #14372f;
      margin: 10px 0 8px;
    }
    .evidence-grid {
      display: grid;
      gap: 10px;
    }
    .evidence-grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .evidence-grid-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .evidence-card {
      border: 1px solid #d4d4d2;
      border-radius: 6px;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .evidence-card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 6px 9px;
      background: #f7f7f5;
      border-bottom: 1px solid #e2e5e3;
      font-size: 11px;
    }
    .evidence-ref {
      font-weight: 700;
      color: #14372f;
      font-variant-numeric: tabular-nums;
    }
    .evidence-date {
      color: #5f6d66;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .evidence-frame {
      height: 172px;
      background: #f7f7f5;
      border-bottom: 1px solid #e2e5e3;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      overflow: hidden;
    }
    .evidence-frame img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      border-radius: 2px;
    }
    .photo-fallback {
      font-size: 11px;
      color: #5f6d66;
      text-align: center;
      padding: 12px;
    }
    .evidence-meta {
      padding: 7px 9px;
      font-size: 10.8px;
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .evidence-activity {
      font-weight: 700;
      color: #121212;
      font-size: 11.4px;
    }
    .evidence-detail {
      color: #5f6d66;
      margin-bottom: 2px;
    }
    .evidence-row {
      color: #121212;
    }
    .status-verified {
      color: #15803d;
      font-weight: 700;
    }
    .status-declared {
      color: #9a6712;
      font-weight: 600;
    }
    .doc-signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 22px;
      padding-top: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sig-box {
      width: 44%;
      text-align: center;
    }
    .sig-date {
      font-style: italic;
      font-size: 11.5px;
      color: #5f6d66;
      margin-bottom: 3px;
    }
    .sig-role {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 12px;
      color: #14372f;
    }
    .sig-note {
      font-size: 11px;
      color: #5f6d66;
      margin-bottom: 56px;
    }
    .sig-name {
      font-size: 12px;
      font-weight: 700;
      color: #121212;
    }
    .doc-export-foot {
      margin-top: 20px;
      padding-top: 8px;
      border-top: 1px solid #e2e5e3;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 10.8px;
      color: #5f6d66;
      font-variant-numeric: tabular-nums;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .print-toolbar {
        display: none !important;
      }
      .a4-sheet-container {
        max-width: none !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .print-layout-thead {
        display: table-header-group !important;
      }
      .print-layout-tfoot {
        display: table-footer-group !important;
      }
      .print-margin-spacer {
        height: 12mm;
      }
      .print-layout-cell {
        padding: 0 12mm !important;
      }
      .print-page-break {
        page-break-before: always;
        break-before: page;
      }
      .appendix-section {
        margin-top: 0;
        padding-top: 0;
        border-top: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <span class="print-toolbar-info">${
      isHouseholdDetail
        ? `Hồ sơ chi tiết nông hộ ${escapeHtml(hh?.code || "")}${hasPhotoAppendix ? ` kèm ${preparedPhotos.length} ảnh minh chứng` : ""}`
        : `Báo cáo tổng hợp (${Number(data.total) || 0} bản ghi)`
    }</span>
    <div class="print-toolbar-actions">
      <button type="button" id="report-btn-print" class="print-btn">In báo cáo / Lưu PDF</button>
      <button type="button" id="report-btn-close" class="print-btn secondary">Đóng cửa sổ</button>
    </div>
  </div>
  <main class="a4-sheet-container">
    <table class="print-layout-frame" role="presentation">
      <thead class="print-layout-thead" aria-hidden="true">
        <tr><td><div class="print-margin-spacer"></div></td></tr>
      </thead>
      <tfoot class="print-layout-tfoot" aria-hidden="true">
        <tr><td><div class="print-margin-spacer"></div></td></tr>
      </tfoot>
      <tbody class="print-layout-body">
        <tr>
          <td class="print-layout-cell">
            <header class="doc-header">
              <div class="doc-org">
                <strong>${escapeHtml(coopUpperName)}</strong>
                <span>${escapeHtml(coopSubLine)}</span>
              </div>
              <div class="doc-nation">
                <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
                <span>Độc lập - Tự do - Hạnh phúc</span>
              </div>
            </header>

            <div class="doc-title-wrap">
              <h1 class="doc-title">${escapeHtml(report.docTitle)}</h1>
              <div class="doc-meta">
                ${
                  hh
                    ? `<strong>Hộ thành viên:</strong> ${escapeHtml(hh.name)} (${escapeHtml(hh.code)}) | <strong>Kỳ trích xuất:</strong> ${escapeHtml(dateRangeLabel)}`
                    : `<strong>Phạm vi địa bàn:</strong> ${escapeHtml(meta.villageName || "Tất cả thôn / tổ")} | <strong>Kỳ báo cáo:</strong> ${escapeHtml(dateRangeLabel)}`
                }
              </div>
              <div class="doc-meta">${escapeHtml(report.desc)}</div>
            </div>

            ${householdProfileHtml}
            ${statsStripHtml}

            ${
              hasPhotoAppendix
                ? `<div class="part-heading-bar">
                     <h2 class="part-heading">Phần I. Bảng kê nhật ký và hồ sơ theo trình tự thời gian</h2>
                     <span class="part-sub">Đơn vị kiểm soát: HTX Cư Né</span>
                   </div>`
                : ""
            }

            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-stt">STT</th>
                  ${theadHtml}
                </tr>
              </thead>
              <tbody>
                ${tbodyHtml}
              </tbody>
            </table>

            <div class="doc-summary">Tổng số bản ghi: ${Number(data.total) || 0}${
              hasPhotoAppendix ? ` | Tổng số hình ảnh phụ lục: ${preparedPhotos.length}` : ""
            }</div>
            ${summaryModeNoteHtml}
            ${!hasPhotoAppendix ? closingBlockHtml : ""}
          </td>
        </tr>
      </tbody>
      ${
        hasPhotoAppendix
          ? `<tbody class="print-layout-body print-page-break">
               <tr>
                 <td class="print-layout-cell">
                   ${appendixHtml}
                   ${closingBlockHtml}
                 </td>
               </tr>
             </tbody>`
          : ""
      }
    </table>
  </main>
</body>
</html>`;
}

async function waitForDocumentAssetsReady(doc: Document): Promise<void> {
  try {
    if (doc.fonts?.ready) {
      await Promise.race([
        doc.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
  } catch {
    // Ignore
  }
  const images = Array.from(doc.images || []);
  if (images.length > 0) {
    await Promise.race([
      Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          if (typeof img.decode === "function") {
            return img.decode().catch(() => undefined);
          }
          return new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        }),
      ),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
}

/** Dự phòng in qua iframe ẩn khi trình duyệt di động hoặc WebView chặn mở cửa sổ mới. */
function printHtmlViaHiddenIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      iframe.remove();
    }, 60_000);
  };

  iframe.onload = () => {
    const targetDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    const runPrint = async () => {
      if (targetDoc) {
        await waitForDocumentAssetsReady(targetDoc);
      }
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        cleanup();
      }
    };
    void runPrint();
  };

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  } else {
    iframe.remove();
  }
}

export async function renderPrintableReportAsync(
  win: Window | null,
  report: PrintableReportDocSpec,
  data: ReportDataPayload,
  meta: PrintableReportContextMeta,
  onPhotoProgress?: (done: number, total: number) => void,
): Promise<void> {
  const rawPhotos = data.evidencePhotos ?? [];
  if (rawPhotos.length > 0) {
    updatePrintWindowStatus(
      win,
      `Đang tối ưu hình ảnh minh chứng thực địa (0/${rawPhotos.length})...`,
    );
  } else {
    updatePrintWindowStatus(win, "Đang dàn trang hồ sơ chuẩn A4...");
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://htxcune.com";
  const [preparedPhotos, qrDataUrl] = await Promise.all([
    prepareEvidencePhotos(rawPhotos, (done, total) => {
      updatePrintWindowStatus(win, `Đang tối ưu hình ảnh minh chứng thực địa (${done}/${total})...`);
      onPhotoProgress?.(done, total);
    }),
    data.householdMeta
      ? buildQrDataUrl(`${origin}${sanitizeTracePath(data.householdMeta.tracePath)}`)
      : Promise.resolve(null),
  ]);

  const html = buildPrintableReportHtml(report, data, meta, preparedPhotos, qrDataUrl);

  if (win && !win.closed) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.getElementById("report-btn-print")?.addEventListener("click", () => {
      win.focus();
      win.print();
    });
    win.document.getElementById("report-btn-close")?.addEventListener("click", () => {
      win.close();
    });

    await waitForDocumentAssetsReady(win.document);
    if (!win.closed) {
      win.focus();
      win.print();
    }
    return;
  }

  printHtmlViaHiddenIframe(html);
}

