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
      const fullUrl = item.url.startsWith("http") ? item.url : `${origin}${item.url}`;
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

function buildPrintableReportHtml(
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

  const isHouseholdDetail = data.mode === "household_detail" && Boolean(data.householdMeta);
  const hh = data.householdMeta ?? null;
  const usePortraitA4 = isHouseholdDetail && data.headers.length <= 9;
  const pageOrientationCss = usePortraitA4
    ? "@page { size: A4 portrait; margin: 12mm; }"
    : "@page { size: A4 landscape; margin: 12mm; }";
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
  const coopSubLine = hh?.coopAddress || "Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk";

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
    const fullTraceUrl = `${origin}${hh.tracePath}`;
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
        <a href="${escapeHtml(fullTraceUrl)}" target="_blank" rel="noopener noreferrer" class="hh-qr-path">${escapeHtml(hh.tracePath)}</a>
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

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.docTitle)}${hh ? ` - ${escapeHtml(hh.code)}` : ""} - HTX Cư Né</title>
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
    table {
      width: 100%;
      border-collapse: collapse;
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-size: 11.2px;
      font-variant-numeric: tabular-nums;
    }
    thead {
      display: table-header-group;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #c8cecb;
      padding: 6px 7px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      background: #f3f5f4;
      color: #14372f;
      font-weight: 700;
      text-align: center;
      font-size: 11px;
    }
    tbody tr:nth-child(even) {
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
      page-break-before: always;
      break-before: page;
      padding-top: 4px;
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
    @media print {
      .print-toolbar {
        display: none !important;
      }
      body {
        background: #ffffff;
        padding: 0;
      }
      .a4-sheet-container {
        max-width: none;
        border: none;
        padding: 0;
        box-shadow: none;
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

    <table>
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

    ${appendixHtml}

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
      ? buildQrDataUrl(`${origin}${data.householdMeta.tracePath}`)
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

