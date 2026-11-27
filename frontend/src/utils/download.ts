import { isSafeRasterDataUrl } from "./url-safety";

/**
 * Tiện ích tải tệp (Blob / Data URL / Excel OOXML .xlsx) tương thích mọi trình duyệt
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
  if (!isSafeRasterDataUrl(dataUrl)) return;
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

const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXCEL_MAX_CELL_CHARS = 32_767;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Làm sạch ký tự điều khiển XML 1.0 không hợp lệ và chặn Spreadsheet Formula Injection (=, +, -, @, tab, CR/LF, |). */
function sanitizeSpreadsheetText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const cleaned = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
  if (cleaned === "") return "";
  const isFormulaLike =
    /^[=+\-@\t\r\n|]/.test(raw) || /^[=+\-@\t\r\n|]/.test(cleaned) || /^\s+[=+\-@|]/.test(cleaned);
  const safe = isFormulaLike ? `'${cleaned}` : cleaned;
  return safe.length > EXCEL_MAX_CELL_CHARS ? safe.slice(0, EXCEL_MAX_CELL_CHARS) : safe;
}

function sanitizeExcelSheetName(sheetName?: string): string {
  const cleaned = (sheetName ?? "")
    .replace(/[:\\/?*[\]\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
  const safe = Array.from(cleaned || "Du lieu")
    .slice(0, 31)
    .join("")
    .replace(/^'+|'+$/g, "")
    .trim();
  return safe || "Du lieu";
}

function excelColumnName(colIndex0: number): string {
  let index = colIndex0 + 1;
  let name = "";
  while (index > 0) {
    const rem = (index - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function buildZipStoreArchive(files: Array<{ path: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosYear = Math.max(1980, Math.min(2107, now.getFullYear())) - 1980;
  const dosDate = (dosYear << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.content);
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.byteLength;

    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.byteLength, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.byteLength, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    localOffset += localHeader.byteLength + size;
    centralSize += centralHeader.byteLength;
  }

  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localOffset, true);
  ev.setUint16(20, 0, true);

  return new Blob(
    [
      ...localParts.map((part) => part as BlobPart),
      ...centralParts.map((part) => part as BlobPart),
      endRecord as BlobPart,
    ],
    { type: EXCEL_MIME_TYPE },
  );
}

/**
 * Đóng gói bảng dữ liệu thành tệp Excel chuẩn OOXML (.xlsx) không phụ thuộc thư viện ngoài:
 * - Bảo toàn số 0 ở đầu số điện thoại, CCCD, mã lô/thửa bằng ô chuỗi inlineStr định dạng Text (@)
 * - Chống công thức độc hại (Spreadsheet Formula Injection)
 * - Tự căn độ rộng cột, cố định dòng tiêu đề trên cùng và mở trực tiếp trên Excel / Google Sheets / LibreOffice
 */
export function buildExcelXlsxBlob(headers: string[], rows: unknown[][], sheetName?: string): Blob {
  const safeSheetName = sanitizeExcelSheetName(sheetName);
  const colCount = Math.max(
    headers.length,
    rows.reduce((max, row) => Math.max(max, row.length), 0),
  );

  const colWidths = new Array<number>(Math.max(colCount, 1)).fill(12);
  headers.forEach((header, idx) => {
    const len = sanitizeSpreadsheetText(header).length;
    colWidths[idx] = Math.min(48, Math.max(colWidths[idx], len + 5));
  });
  const sampleLimit = Math.min(rows.length, 200);
  for (let r = 0; r < sampleLimit; r += 1) {
    const row = rows[r];
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      const firstLineLen = sanitizeSpreadsheetText(cell)
        .split("\n")
        .reduce((m, line) => Math.max(m, line.length), 0);
      colWidths[c] = Math.min(48, Math.max(colWidths[c], firstLineLen + 3));
    }
  }

  const colsXml =
    colCount > 0
      ? `<cols>${colWidths
          .slice(0, colCount)
          .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";

  const sheetRowsXml: string[] = [];

  if (headers.length > 0) {
    const headerCells = headers
      .map((h, cIdx) => {
        const ref = `${excelColumnName(cIdx)}1`;
        const text = encodeXmlText(sanitizeSpreadsheetText(h));
        return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
      })
      .join("");
    sheetRowsXml.push(`<row r="1" ht="24" customHeight="1">${headerCells}</row>`);
  }

  const rowOffset = headers.length > 0 ? 2 : 1;
  for (let rIdx = 0; rIdx < rows.length; rIdx += 1) {
    const excelRowNum = rIdx + rowOffset;
    const row = rows[rIdx];
    const cellsXml: string[] = [];
    for (let cIdx = 0; cIdx < row.length; cIdx += 1) {
      const rawVal = row[cIdx];
      if (rawVal === null || rawVal === undefined || rawVal === "") continue;
      const ref = `${excelColumnName(cIdx)}${excelRowNum}`;
      if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
        cellsXml.push(`<c r="${ref}" s="2"><v>${rawVal}</v></c>`);
      } else {
        const text = encodeXmlText(sanitizeSpreadsheetText(rawVal));
        if (!text) continue;
        cellsXml.push(
          `<c r="${ref}" s="0" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`,
        );
      }
    }
    sheetRowsXml.push(`<row r="${excelRowNum}">${cellsXml.join("")}</row>`);
  }

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${encodeXmlText(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2">` +
    `<font><sz val="11"/><color rgb="FF121212"/><name val="Arial"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FF14372F"/><name val="Arial"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F3"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border>` +
    `<left style="thin"><color rgb="FFD4D4D2"/></left>` +
    `<right style="thin"><color rgb="FFD4D4D2"/></right>` +
    `<top style="thin"><color rgb="FFD4D4D2"/></top>` +
    `<bottom style="thin"><color rgb="FFD4D4D2"/></bottom>` +
    `<diagonal/>` +
    `</border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3">` +
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const sheetViewsXml =
    headers.length > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;

  const worksheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    sheetViewsXml +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    colsXml +
    `<sheetData>${sheetRowsXml.join("")}</sheetData>` +
    `</worksheet>`;

  return buildZipStoreArchive([
    { path: "[Content_Types].xml", content: contentTypesXml },
    { path: "_rels/.rels", content: rootRelsXml },
    { path: "xl/workbook.xml", content: workbookXml },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { path: "xl/styles.xml", content: stylesXml },
    { path: "xl/worksheets/sheet1.xml", content: worksheetXml },
  ]);
}

