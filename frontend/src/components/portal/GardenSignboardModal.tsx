"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/Toast";
import type { PortalPlot } from "@/types/portal";
import { triggerBlobDownload } from "@/utils/download";
import { Sheet } from "./ui";

interface Props {
  plot: PortalPlot;
  householdName: string;
  onClose: () => void;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function buildSignboardRows(plot: PortalPlot, householdName: string) {
  const treePart =
    plot.treeCount != null && plot.treeCount > 0
      ? ` (${Number(plot.treeCount).toLocaleString("vi-VN")} cây / 株)`
      : " (Số cây: Chưa cập nhật)";
  const quotaText =
    plot.maxQuotaKg && plot.maxQuotaKg > 0
      ? `${Number(plot.maxQuotaKg).toLocaleString("vi-VN")} kg / vụ`
      : "Theo biên bản thẩm định đầu vụ";
  const parcelInfo =
    plot.parcel || plot.sheet
      ? `Thửa ${plot.parcel || "-"}, Tờ ${plot.sheet || "-"}`
      : plot.plantedYear
        ? `Năm trồng ${plot.plantedYear}`
        : "Chưa cập nhật";

  return [
    { label: "Mã vùng PUC / 果园编码:", value: plot.zoneCode?.trim() || "Chưa có mã vùng", strong: true },
    { label: "Chủ hộ / 农户代表:", value: householdName, strong: true },
    { label: "Quy mô / 面积与株数:", value: `${plot.areaHa} ha${treePart}`, strong: false },
    { label: "Trần sản lượng / 核定配额:", value: quotaText, strong: true },
    { label: "Giống / 榴莲品种:", value: plot.variety?.trim() || "Chưa cập nhật", strong: false },
    { label: "Địa chính / 地籍档案:", value: parcelInfo, strong: false },
    { label: "Quy chuẩn / 执行标准:", value: "VietGAP và Nghị định thư GACC", strong: false },
  ];
}

async function renderSignboardPngBlob(
  plot: PortalPlot,
  householdName: string,
  qrDataUrl: string,
): Promise<Blob> {
  const W = 1600;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  try {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
    }
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Không khởi tạo được bộ vẽ ảnh.");

    const fontStack = '"Bai Jamjuree", Arial, sans-serif';
    const padOuter = 44;
    const innerX = 96;

    // Nền trắng & khung viền xanh đậm ngoài trời có khoảng lề cân đối 4 cạnh
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 10;
    ctx.strokeRect(padOuter, padOuter, W - padOuter * 2, H - padOuter * 2);

    // Tiêu đề quốc hiệu, mô hình điểm cấp xã & 3 ngôn ngữ (VI / 中文 / EN)
    ctx.textAlign = "center";
    ctx.fillStyle = "#b91c1c";
    ctx.font = `700 22px ${fontStack}`;
    ctx.fillText("UBND XÃ KRÔNG BÚK - MÔ HÌNH ĐIỂM TRUY XUẤT NGUỒN GỐC TỈNH ĐẮK LẮK", W / 2, 112);

    ctx.fillStyle = "#14532d";
    ctx.font = `800 27px ${fontStack}`;
    ctx.fillText("HTX KINH DOANH - DỊCH VỤ TỔNG HỢP CƯ NÉ - XÃ KRÔNG BÚK, ĐẮK LẮK", W / 2, 152);

    ctx.fillStyle = "#0f172a";
    ctx.font = `800 38px ${fontStack}`;
    ctx.fillText("BIỂN ĐỊNH DANH THỬA VƯỜN SẦU RIÊNG", W / 2, 204);

    ctx.fillStyle = "#334155";
    ctx.font = `700 21px ${fontStack}`;
    ctx.fillText("榴莲注册果园地块标识牌 / REGISTERED DURIAN PARCEL SIGNBOARD", W / 2, 240);

    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(innerX, 268);
    ctx.lineTo(W - innerX, 268);
    ctx.stroke();

    // Hộp nổi bật Mã thửa canh tác
    const leftColW = 940;
    ctx.fillStyle = "#ecfdf5";
    ctx.fillRect(innerX, 300, leftColW, 74);
    ctx.strokeStyle = "#bbf7d0";
    ctx.lineWidth = 2;
    ctx.strokeRect(innerX, 300, leftColW, 74);

    ctx.textAlign = "left";
    ctx.fillStyle = "#334155";
    ctx.font = `700 24px ${fontStack}`;
    ctx.fillText("MÃ THỬA / 地块编号:", innerX + 22, 346);
    ctx.fillStyle = "#15803d";
    ctx.font = `800 34px ${fontStack}`;
    ctx.fillText(plot.code, innerX + 360, 348);

    const rows = buildSignboardRows(plot, householdName);
    let y = 432;
    for (const row of rows) {
      ctx.fillStyle = "#475569";
      ctx.font = `600 24px ${fontStack}`;
      ctx.fillText(row.label, innerX + 6, y);

      ctx.fillStyle = "#0f172a";
      ctx.font = `${row.strong ? "700" : "600"} 25px ${fontStack}`;
      ctx.fillText(row.value, innerX + 360, y, leftColW - 366);
      y += 68;
    }

    // Mã QR truy xuất nguồn gốc bên phải kèm khung lề sạch
    if (qrDataUrl) {
      const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = qrDataUrl;
      });
      const qrBoxSize = 408;
      const qrBoxX = W - innerX - qrBoxSize;
      const qrBoxY = 334;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      ctx.strokeStyle = "#d4d4d2";
      ctx.lineWidth = 2;
      ctx.strokeRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      ctx.drawImage(qrImg, qrBoxX + 18, qrBoxY + 18, qrBoxSize - 36, qrBoxSize - 36);

      ctx.textAlign = "center";
      ctx.fillStyle = "#475569";
      ctx.font = `600 18px ${fontStack}`;
      ctx.fillText("Quét mã QR truy xuất hồ sơ thửa vườn", qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize + 34);
    }

    // Chân biển
    const footerLineY = H - 142;
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(innerX, footerLineY);
    ctx.lineTo(W - innerX, footerLineY);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#475569";
    ctx.font = `600 18px ${fontStack}`;
    ctx.fillText(
      "Liên thông dữ liệu vùng trồng Xã Krông Búk - Hỗ trợ Thẻ Đoàn Thẩm định Thực địa (VI / 中文 / EN)",
      innerX,
      footerLineY + 44,
    );

    ctx.textAlign = "right";
    ctx.fillStyle = "#b91c1c";
    ctx.font = `700 18px ${fontStack}`;
    ctx.fillText("NGHIÊM CẤM TỰ Ý DI DỜI BIỂN ĐỊNH DANH THỬA VƯỜN", W - innerX, footerLineY + 44);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Không xuất được tệp ảnh PNG.");
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function printSignboardViaIsolatedSheet(
  plot: PortalPlot,
  householdName: string,
  qrDataUrl: string,
  safeCode: string,
): void {
  const fontFaceCss = collectSelfHostedFontCss();
  const rows = buildSignboardRows(plot, householdName);
  const rowsHtml = rows
    .map(
      (r) => `<div class="p-row">
        <span class="p-lbl">${escapeHtml(r.label)}</span>
        <span class="p-val${r.strong ? " is-strong" : ""}">${escapeHtml(r.value)}</span>
      </div>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Bien-cam-vuon-${escapeHtml(safeCode)}</title>
  <style>
    ${fontFaceCss}
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #ffffff;
      color: #0f172a;
      font-family: "Bai Jamjuree", Arial, Helvetica, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    .print-stage {
      width: 100%;
      min-height: 184mm;
      padding: 6mm 8mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .plate {
      width: 100%;
      max-width: 242mm;
      margin: 0 auto;
      background: #ffffff;
      border: 3.5px solid #14532d;
      border-radius: 8px;
      padding: 9mm 11mm 8.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .p-top {
      text-align: center;
      border-bottom: 2px solid #14532d;
      padding-bottom: 4.2mm;
      margin-bottom: 6mm;
    }
    .p-flag {
      font-size: 13.5px;
      font-weight: 700;
      color: #b91c1c;
      letter-spacing: 0.05em;
    }
    .p-org {
      font-size: 16.5px;
      font-weight: 800;
      color: #14532d;
      margin-top: 1.4mm;
    }
    .p-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 1.8mm;
      letter-spacing: 0.02em;
    }
    .p-sub {
      font-size: 13.5px;
      font-weight: 700;
      color: #334155;
      margin-top: 1.2mm;
    }
    .p-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 68mm;
      gap: 8mm;
      align-items: center;
    }
    .p-info {
      display: flex;
      flex-direction: column;
      gap: 3mm;
      min-width: 0;
    }
    .p-row {
      display: grid;
      grid-template-columns: 56mm minmax(0, 1fr);
      gap: 3.5mm;
      align-items: baseline;
      font-size: 15px;
      line-height: 1.38;
      padding: 0 3.4mm;
    }
    .p-row.is-highlight {
      background: #ecfdf5;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 2.5mm 3.4mm;
      margin-bottom: 0.6mm;
      align-items: center;
    }
    .p-lbl {
      color: #475569;
      font-weight: 600;
      white-space: nowrap;
    }
    .p-val {
      color: #0f172a;
      font-weight: 600;
      word-break: break-word;
    }
    .p-val.is-strong {
      font-weight: 700;
    }
    .p-big-code {
      font-size: 21px;
      font-weight: 800;
      color: #15803d;
      letter-spacing: 0.015em;
    }
    .p-qr-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2.2mm;
    }
    .p-qr-frame {
      padding: 3mm;
      border: 1px solid #d4d4d2;
      border-radius: 6px;
      background: #ffffff;
    }
    .p-qr-img {
      width: 60mm;
      height: 60mm;
      display: block;
    }
    .p-qr-caption {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      text-align: center;
      line-height: 1.3;
    }
    .p-bottom {
      margin-top: 6mm;
      padding-top: 3.6mm;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6mm;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      line-height: 1.35;
    }
    .p-warn {
      color: #b91c1c;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }
    @media (max-width: 215mm) {
      .print-stage {
        min-height: auto;
        padding: 6mm 2mm;
      }
      .plate {
        max-width: 184mm;
        padding: 7mm 8mm;
      }
      .p-flag {
        font-size: 11px;
      }
      .p-org {
        font-size: 13.5px;
      }
      .p-title {
        font-size: 19px;
      }
      .p-sub {
        font-size: 11.5px;
      }
      .p-grid {
        grid-template-columns: minmax(0, 1fr) 48mm;
        gap: 5mm;
      }
      .p-info {
        gap: 2.4mm;
      }
      .p-row {
        grid-template-columns: 45mm minmax(0, 1fr);
        gap: 2.8mm;
        font-size: 12px;
        padding: 0 2.4mm;
      }
      .p-row.is-highlight {
        padding: 2mm 2.4mm;
      }
      .p-big-code {
        font-size: 16.5px;
      }
      .p-qr-frame {
        padding: 2.2mm;
      }
      .p-qr-img {
        width: 42mm;
        height: 42mm;
      }
      .p-qr-caption {
        font-size: 9.5px;
      }
      .p-bottom {
        margin-top: 4.5mm;
        padding-top: 3mm;
        font-size: 9px;
        gap: 4mm;
      }
    }
  </style>
</head>
<body>
  <div class="print-stage">
    <div class="plate">
      <div class="p-top">
        <div class="p-flag">UBND XÃ KRÔNG BÚK - MÔ HÌNH ĐIỂM TRUY XUẤT NGUỒN GỐC TỈNH ĐẮK LẮK</div>
        <div class="p-org">HTX KINH DOANH - DỊCH VỤ TỔNG HỢP CƯ NÉ - XÃ KRÔNG BÚK, ĐẮK LẮK</div>
        <div class="p-title">BIỂN ĐỊNH DANH THỬA VƯỜN SẦU RIÊNG</div>
        <div class="p-sub">榴莲注册果园地块标识牌 / REGISTERED DURIAN PARCEL SIGNBOARD</div>
      </div>

      <div class="p-grid">
        <div class="p-info">
          <div class="p-row is-highlight">
            <span class="p-lbl">MÃ THỬA / 地块编号:</span>
            <strong class="p-val p-big-code">${escapeHtml(plot.code)}</strong>
          </div>
          ${rowsHtml}
        </div>

        <div class="p-qr-col">
          <div class="p-qr-frame">
            <img src="${qrDataUrl}" alt="${escapeHtml(plot.code)}" class="p-qr-img" />
          </div>
          <div class="p-qr-caption">Quét mã QR truy xuất hồ sơ thửa vườn</div>
        </div>
      </div>

      <div class="p-bottom">
        <span>Liên thông dữ liệu vùng trồng Xã Krông Búk - Hỗ trợ Thẻ Đoàn Thẩm định Thực địa (VI / 中文 / EN)</span>
        <span class="p-warn">NGHIÊM CẤM TỰ Ý DI DỜI BIỂN ĐỊNH DANH THỬA VƯỜN</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  const previousTitle = document.title;
  document.title = `Bien-cam-vuon-${safeCode}`;

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
    document.title = previousTitle;
    setTimeout(() => {
      iframe.remove();
    }, 60_000);
  };

  iframe.onload = () => {
    const targetDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    const runPrint = async () => {
      try {
        if (targetDoc?.fonts?.ready) {
          await Promise.race([
            targetDoc.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 1200)),
          ]);
        }
        const imgs = Array.from(targetDoc?.images ?? []);
        await Promise.all(
          imgs.map((img) =>
            img.complete && img.naturalWidth > 0
              ? Promise.resolve()
              : typeof img.decode === "function"
                ? img.decode().catch(() => undefined)
                : Promise.resolve(),
          ),
        );
      } catch {
        // Ignore font/image decode timeout
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
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
  if (!doc) {
    cleanup();
    window.print();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
}

export default function GardenSignboardModal({ plot, householdName, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [fetchedSignboard, setFetchedSignboard] = useState<{
    plotCode: string;
    qrToken?: string | null;
    treeCount?: number | null;
    maxQuotaKg?: number | null;
  } | null>(null);
  const [downloadingPng, setDownloadingPng] = useState(false);

  useEffect(() => {
    if (plot.qrToken) return;

    let active = true;
    fetch(`/api/harvest/plot-signboards?q=${encodeURIComponent(plot.code)}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          payload: {
            data?: Array<{
              plotCode: string;
              qrToken?: string | null;
              treeCount?: number | null;
              maxQuotaKg?: number | null;
            }>;
          } | null,
        ) => {
          if (!active || !payload?.data) return;
          const exact = payload.data.find(
            (r) => r.plotCode.toUpperCase() === plot.code.toUpperCase(),
          );
          if (exact) {
            setFetchedSignboard(exact);
          }
        },
      )
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [plot.code, plot.qrToken]);

  const matchedFallback =
    fetchedSignboard && fetchedSignboard.plotCode.toUpperCase() === plot.code.toUpperCase()
      ? fetchedSignboard
      : null;
  const resolvedToken = plot.qrToken ?? matchedFallback?.qrToken ?? null;
  const resolvedTreeCount = plot.treeCount ?? matchedFallback?.treeCount ?? null;
  const resolvedMaxQuotaKg = plot.maxQuotaKg ?? matchedFallback?.maxQuotaKg ?? null;

  useEffect(() => {
    let active = true;
    const pathPart = resolvedToken
      ? `/t/${encodeURIComponent(resolvedToken)}`
      : `/trace/${encodeURIComponent(plot.code)}`;
    const url = `${window.location.origin}${pathPart}`;
    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(url, {
          margin: 1,
          width: 640,
          errorCorrectionLevel: "Q",
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((res) => {
        if (active) setQrDataUrl(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [plot.code, resolvedToken]);

  const safeCode = (plot.code || "lo-vuon").replace(/[^a-zA-Z0-9-_]+/g, "-");
  const traceHref = resolvedToken
    ? `/t/${encodeURIComponent(resolvedToken)}`
    : `/trace/${encodeURIComponent(plot.code)}`;

  const enrichedPlot: PortalPlot = {
    ...plot,
    qrToken: resolvedToken,
    treeCount: resolvedTreeCount,
    maxQuotaKg: resolvedMaxQuotaKg,
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    printSignboardViaIsolatedSheet(enrichedPlot, householdName, qrDataUrl, safeCode);
    toast.success("Đã mở bản in biển cắm vườn");
  };

  const handleDownloadPng = async () => {
    if (downloadingPng || !qrDataUrl) return;
    setDownloadingPng(true);
    try {
      const blob = await renderSignboardPngBlob(
        enrichedPlot,
        householdName,
        qrDataUrl,
      );
      triggerBlobDownload(blob, `Bien-cam-vuon-${safeCode}.png`);
      toast.success("Đã tải ảnh biển cắm vườn");
    } catch {
      handlePrint();
    } finally {
      setDownloadingPng(false);
    }
  };

  return (
    <Sheet
      title={`Biển cắm vườn 3 ngôn ngữ - ${plot.code}`}
      onClose={onClose}
      className="pt-signboard-sheet"
    >
      <div className="signboard-sheet-content">
        <div className="signboard-toolbar no-print">
          <div className="signboard-action-btns">
            <button
              type="button"
              className="signboard-download-btn"
              onClick={() => void handleDownloadPng()}
              disabled={!qrDataUrl || downloadingPng}
            >
              <span>{downloadingPng ? "Đang tạo ảnh…" : "Tải ảnh PNG"}</span>
            </button>
            <button
              type="button"
              className="signboard-print-btn"
              onClick={handlePrint}
              disabled={!qrDataUrl}
            >
              <span>In biển cắm vườn</span>
            </button>
          </div>
        </div>

        <div className="signboard-preview-wrap">
          {/* Biển cắm vườn 3 ngôn ngữ phục vụ thẩm định thực địa */}
          <div className="garden-signboard-plate">
            <div className="plate-top">
              <div className="plate-flag">
                UBND XÃ KRÔNG BÚK - MÔ HÌNH ĐIỂM TRUY XUẤT NGUỒN GỐC TỈNH ĐẮK LẮK
              </div>
              <div className="plate-org">
                HTX KINH DOANH - DỊCH VỤ TỔNG HỢP CƯ NÉ - XÃ KRÔNG BÚK, ĐẮK LẮK
              </div>
              <div className="plate-main-title">BIỂN ĐỊNH DANH THỬA VƯỜN SẦU RIÊNG</div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "#334155",
                  marginTop: 3,
                }}
              >
                榴莲注册果园地块标识牌 / REGISTERED DURIAN PARCEL SIGNBOARD
              </div>
            </div>

            <div className="plate-grid">
              <div className="plate-info">
                <div className="plate-row highlight-box">
                  <span className="plate-lbl">MÃ THỬA / 地块编号:</span>
                  <strong className="plate-val big-code">{plot.code}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Mã vùng PUC / 果园编码:</span>
                  <strong className="plate-val">{plot.zoneCode?.trim() || "Chưa có mã vùng"}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Chủ hộ / 农户代表:</span>
                  <strong className="plate-val">{householdName}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Quy mô / 面积与株数:</span>
                  <span className="plate-val">
                    {plot.areaHa} ha
                    {resolvedTreeCount != null && resolvedTreeCount > 0
                      ? ` (${Number(resolvedTreeCount).toLocaleString("vi-VN")} cây / 株)`
                      : " (Số cây: Chưa cập nhật)"}
                  </span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Trần sản lượng / 核定配额:</span>
                  <strong className="plate-val">
                    {resolvedMaxQuotaKg && resolvedMaxQuotaKg > 0
                      ? `${Number(resolvedMaxQuotaKg).toLocaleString("vi-VN")} kg / vụ`
                      : "Theo biên bản thẩm định đầu vụ"}
                  </strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Giống / 榴莲品种:</span>
                  <span className="plate-val">{plot.variety?.trim() || "Chưa cập nhật"}</span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Địa chính / 地籍档案:</span>
                  <span className="plate-val">
                    {plot.parcel || plot.sheet
                      ? `Thửa ${plot.parcel || "-"}, Tờ ${plot.sheet || "-"}`
                      : plot.plantedYear
                        ? `Năm trồng ${plot.plantedYear}`
                        : "Chưa cập nhật"}
                  </span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Quy chuẩn / 执行标准:</span>
                  <span className="plate-val">VietGAP và Nghị định thư GACC</span>
                </div>
              </div>

              <a
                href={traceHref}
                target="_blank"
                rel="noopener noreferrer"
                className="plate-qr-box plate-qr-link"
                title={`Bấm vào mã QR để mở trang truy xuất nguồn gốc thửa ${plot.code}`}
                aria-label={`Bấm vào mã QR để mở trang truy xuất nguồn gốc thửa ${plot.code}`}
              >
                <div className="plate-qr-frame">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt={plot.code} className="plate-qr-img" />
                  ) : (
                    <div className="plate-qr-skeleton" />
                  )}
                </div>
                <span className="plate-qr-caption">Quét mã QR truy xuất hồ sơ thửa vườn</span>
              </a>
            </div>

            <div className="plate-bottom">
              <span>
                Liên thông dữ liệu vùng trồng Xã Krông Búk - Hỗ trợ Thẻ Đoàn Thẩm định Thực địa (VI / 中文 / EN)
              </span>
              <span className="protect-warning">
                NGHIÊM CẤM TỰ Ý DI DỜI BIỂN ĐỊNH DANH THỬA VƯỜN
              </span>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .pt-sheet.pt-signboard-sheet {
          --drawer-w: 760px;
        }
        @media (min-width: 760px) {
          .pt-sheet.pt-signboard-sheet {
            max-width: 740px;
          }
        }

        .signboard-sheet-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .signboard-toolbar {
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 0;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .signboard-action-btns {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .signboard-download-btn,
        .signboard-print-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-family: inherit;
          background: #dfe9f8;
          color: #0084ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 10px 18px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: none;
          outline: none;
          transition: background-color 0.16s ease, color 0.16s ease;
          flex-shrink: 0;
        }

        .signboard-download-btn {
          background: #ecfdf5;
          color: #15803d;
          border-color: #a7f3d0;
        }

        .signboard-download-btn:hover:not(:disabled) {
          background: #d1fae5;
          color: #166534;
        }

        .signboard-print-btn:hover:not(:disabled) {
          background: #d0dff5;
          color: #006ee6;
          box-shadow: none;
        }

        .signboard-download-btn:disabled,
        .signboard-print-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .signboard-preview-wrap {
          padding: 18px;
          background: #edf2ee;
          border: 1px solid #d4d4d2;
          border-radius: 8px;
          display: flex;
          justify-content: center;
          overflow-x: hidden;
        }

        /* ─── Biển cắm chuẩn thiết kế thực địa ─── */
        .garden-signboard-plate {
          background: #ffffff;
          border: 3.5px solid #14532d;
          border-radius: 8px;
          width: 100%;
          max-width: 660px;
          padding: 22px 26px 20px;
          box-shadow: 0 8px 22px rgba(20, 55, 47, 0.08);
          color: #0f172a;
          box-sizing: border-box;
          font-variant-numeric: tabular-nums;
        }

        .plate-top {
          text-align: center;
          border-bottom: 2px solid #14532d;
          padding-bottom: 10px;
          margin-bottom: 16px;
        }

        .plate-flag {
          font-size: 11px;
          font-weight: 700;
          color: #b91c1c;
          letter-spacing: 0.6px;
        }

        .plate-org {
          font-size: 13px;
          font-weight: 800;
          color: #14532d;
          margin-top: 3px;
        }

        .plate-main-title {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin-top: 4px;
          letter-spacing: 0.4px;
        }

        .plate-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 188px;
          gap: 18px;
          align-items: center;
        }

        .plate-info {
          display: flex;
          flex-direction: column;
          gap: 7.5px;
          min-width: 0;
        }

        .plate-row {
          font-size: 12.5px;
          display: grid;
          grid-template-columns: 162px minmax(0, 1fr);
          align-items: baseline;
          gap: 10px;
          padding: 0 10px;
          font-variant-numeric: tabular-nums;
        }
        .plate-lbl {
          color: #475569;
          font-weight: 600;
          white-space: nowrap;
        }
        .plate-val {
          color: #0f172a;
          font-weight: 600;
          word-break: break-word;
        }

        .highlight-box {
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          padding: 6px 10px;
          border-radius: 6px;
          align-items: center;
        }
        .big-code {
          font-family: inherit;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.015em;
          font-size: 16px;
          color: #15803d;
          font-weight: 800;
        }

        .plate-qr-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-align: center;
          border: none;
          padding: 0;
          border-radius: 6px;
          background: transparent;
          box-sizing: border-box;
        }

        .plate-qr-frame {
          padding: 8px;
          border: 1px solid #d4d4d2;
          border-radius: 6px;
          background: #ffffff;
        }

        .plate-qr-caption {
          font-size: 10px;
          font-weight: 600;
          color: #475569;
          line-height: 1.3;
        }

        .plate-qr-link {
          text-decoration: none;
          color: inherit;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: opacity 0.16s ease;
        }

        .plate-qr-link:hover {
          opacity: 0.88;
        }

        .plate-qr-link:active {
          opacity: 0.82;
        }

        .plate-qr-link:focus-visible {
          outline: 2px solid #15803d;
          outline-offset: 2px;
        }

        .plate-qr-img,
        .plate-qr-skeleton {
          width: 164px;
          height: 164px;
          border-radius: 4px;
          display: block;
        }

        .plate-bottom {
          margin-top: 16px;
          padding-top: 10px;
          border-top: 1px solid #cbd5e1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          font-size: 9px;
          font-weight: 600;
          color: #475569;
          line-height: 1.4;
        }
        .plate-bottom > span:first-child {
          text-align: left;
        }
        .protect-warning {
          color: #b91c1c;
          font-weight: 800;
          text-align: right;
        }

        /* ─── Responsive cho màn hình di động (≤ 640px) ─── */
        @media (max-width: 640px) {
          .signboard-toolbar {
            padding: 0;
          }

          .signboard-action-btns {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .signboard-download-btn,
          .signboard-print-btn {
            width: 100%;
            padding: 10px 12px;
          }

          .signboard-preview-wrap {
            padding: 12px 8px;
            border-radius: 8px;
          }

          .garden-signboard-plate {
            padding: 14px 12px;
            border-width: 3px;
            border-radius: 8px;
            max-width: 100%;
          }

          .plate-top {
            margin-bottom: 12px;
            padding-bottom: 8px;
          }

          .plate-flag {
            font-size: 10px;
            letter-spacing: 0.4px;
          }

          .plate-org {
            font-size: 11.5px;
          }

          .plate-main-title {
            font-size: 14.5px;
            line-height: 1.25;
            letter-spacing: 0.2px;
            margin-top: 4px;
          }

          .plate-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .plate-info {
            gap: 6.5px;
          }

          .plate-row {
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            padding: 0 4px;
          }

          .plate-lbl {
            min-width: 0;
            flex-shrink: 0;
            color: #475569;
          }

          .plate-val {
            text-align: right;
            word-break: break-word;
          }

          .highlight-box {
            padding: 6px 8px;
          }

          .big-code {
            font-size: 15px;
          }

          .plate-qr-box {
            margin: 6px auto 0;
            padding: 0;
          }

          .plate-qr-img,
          .plate-qr-skeleton {
            width: 152px;
            height: 152px;
          }

          .plate-bottom {
            margin-top: 13px;
            padding-top: 8px;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            text-align: center;
            font-size: 9px;
            line-height: 1.35;
          }
          .plate-bottom > span:first-child,
          .protect-warning {
            text-align: center;
          }
        }

        /* ─── Tối ưu cho màn hình siêu nhỏ (≤ 380px như iPhone SE) ─── */
        @media (max-width: 380px) {
          .signboard-toolbar {
            padding: 0;
          }

          .signboard-preview-wrap {
            padding: 8px 4px;
          }

          .garden-signboard-plate {
            padding: 12px 10px;
            border-width: 2.5px;
          }

          .plate-flag {
            font-size: 9px;
          }

          .plate-org {
            font-size: 10.5px;
          }

          .plate-main-title {
            font-size: 13px;
          }

          .plate-row {
            font-size: 11px;
            gap: 6px;
          }

          .big-code {
            font-size: 13.5px;
          }

          .plate-qr-box {
            padding: 0;
          }

          .plate-qr-img {
            width: 136px;
            height: 136px;
          }

          .plate-bottom {
            font-size: 8.5px;
          }
        }

        @page {
          size: A4 landscape;
          margin: 12mm;
        }

        @media print {
          html,
          body {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body > *:not(.pt-sheet-backdrop),
          .pt-sheet-backdrop:not(:has(.pt-signboard-sheet)) {
            display: none !important;
          }

          .no-print,
          .pt-sheet-topbar {
            display: none !important;
          }

          .pt-sheet-backdrop:has(.pt-signboard-sheet),
          .pt-sheet.pt-signboard-sheet,
          .pt-signboard-sheet .pt-sheet-body,
          .signboard-sheet-content {
            position: static !important;
            inset: auto !important;
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            transform: none !important;
            animation: none !important;
            opacity: 1 !important;
            background: #ffffff !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .signboard-preview-wrap {
            position: static !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            min-height: 184mm !important;
            padding: 6mm 8mm !important;
            margin: 0 !important;
            background: #ffffff !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }

          .garden-signboard-plate {
            position: static !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 242mm !important;
            border: 3.5px solid #14532d !important;
            border-radius: 8px !important;
            padding: 9mm 11mm 8.5mm !important;
            margin: 0 auto !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .garden-signboard-plate,
          .garden-signboard-plate * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .plate-top {
            padding-bottom: 4.2mm !important;
            margin-bottom: 6mm !important;
          }
          .plate-flag {
            font-size: 13.5px !important;
          }
          .plate-org {
            font-size: 16.5px !important;
          }
          .plate-main-title {
            font-size: 24px !important;
          }
          .plate-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 68mm !important;
            gap: 8mm !important;
            align-items: center !important;
          }
          .plate-info {
            gap: 3mm !important;
          }
          .plate-row {
            display: grid !important;
            grid-template-columns: 56mm minmax(0, 1fr) !important;
            gap: 3.5mm !important;
            align-items: baseline !important;
            font-size: 15px !important;
            padding: 0 3.4mm !important;
          }
          .highlight-box {
            padding: 2.5mm 3.4mm !important;
          }
          .big-code {
            font-size: 21px !important;
          }
          .plate-lbl {
            width: auto !important;
            min-width: 0 !important;
          }
          .plate-val {
            text-align: left !important;
          }
          .plate-qr-box {
            max-width: none !important;
            margin: 0 auto !important;
            padding: 0 !important;
          }
          .plate-qr-frame {
            padding: 3mm !important;
            border: 1px solid #d4d4d2 !important;
            border-radius: 6px !important;
          }
          .plate-qr-img {
            width: 60mm !important;
            height: 60mm !important;
          }
          .plate-qr-caption {
            font-size: 11px !important;
          }
          .plate-bottom {
            margin-top: 6mm !important;
            padding-top: 3.6mm !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            gap: 6mm !important;
            font-size: 11px !important;
            text-align: left !important;
          }
          .protect-warning {
            text-align: right !important;
            white-space: nowrap !important;
          }
        }
      `}</style>
    </Sheet>
  );
}
