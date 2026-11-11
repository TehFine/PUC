"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";
import type { PortalPlot } from "@/types/portal";
import { triggerBlobDownload } from "@/utils/download";
import { Sheet } from "./ui";

interface Props {
  plot: PortalPlot;
  householdName: string;
  onClose: () => void;
}

async function renderSignboardPngBlob(
  plot: PortalPlot,
  householdName: string,
  qrDataUrl: string,
): Promise<Blob> {
  const W = 1320;
  const H = 840;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  try {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Không khởi tạo được bộ vẽ ảnh.");

    // Nền trắng & khung viền xanh đậm
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 10;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    // Tiêu đề quốc hiệu & đơn vị
    ctx.textAlign = "center";
    ctx.fillStyle = "#b91c1c";
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", W / 2, 86);

    ctx.fillStyle = "#14532d";
    ctx.font = "800 26px Arial, sans-serif";
    ctx.fillText("HTX KINH DOANH - DỊCH VỤ TỔNG HỢP CƯ NÉ – ĐẮK LẮK", W / 2, 124);

    ctx.fillStyle = "#0f172a";
    ctx.font = "900 36px Arial, sans-serif";
    ctx.fillText("BIỂN ĐỊNH DANH LÔ CANH TÁC SẦU RIÊNG", W / 2, 174);

    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 200);
    ctx.lineTo(W - 64, 200);
    ctx.stroke();

    // Hộp nổi bật Mã lô canh tác
    ctx.fillStyle = "#ecfdf5";
    ctx.fillRect(64, 230, 790, 68);
    ctx.textAlign = "left";
    ctx.fillStyle = "#334155";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText("MÃ SỐ LÔ CANH TÁC:", 84, 273);
    ctx.fillStyle = "#15803d";
    ctx.font = '900 32px Inter, -apple-system, "Segoe UI", Arial, sans-serif';
    ctx.fillText(plot.code, 380, 275);

    // Các dòng thông tin lô
    const parcelInfo =
      plot.parcel || plot.sheet
        ? `Thửa ${plot.parcel || "—"}, Tờ ${plot.sheet || "—"}`
        : String(plot.plantedYear || "2020");

    const rows: [string, string, boolean][] = [
      ["Mã số vùng trồng (PUC):", plot.zoneCode || "—", true],
      ["Chủ hộ canh tác:", householdName, true],
      ["Diện tích lô:", `${plot.areaHa} ha`, false],
      ["Giống sầu riêng:", plot.variety || "Đô Na", false],
      ["Số thửa / Tờ bản đồ:", parcelInfo, false],
      ["Quy chuẩn áp dụng:", "VietGAP & Nghị định thư GACC", false],
    ];

    let y = 350;
    for (const [label, val, bold] of rows) {
      ctx.fillStyle = "#475569";
      ctx.font = "600 24px Arial, sans-serif";
      ctx.fillText(label, 68, y);

      ctx.fillStyle = "#0f172a";
      ctx.font = `${bold ? "800" : "600"} 25px Arial, sans-serif`;
      ctx.fillText(val, 380, y, 470);
      y += 62;
    }

    // Khung QR bên phải
    const qrBoxX = 890;
    const qrBoxY = 272;
    const qrBoxW = 356;
    const qrBoxH = 356;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH);
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 3;
    ctx.strokeRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH);
    ctx.restore();

    if (qrDataUrl) {
      const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = qrDataUrl;
      });
      ctx.drawImage(qrImg, qrBoxX + 28, qrBoxY + 28, 300, 300);
    }

    // Chân biển
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 738);
    ctx.lineTo(W - 64, 738);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "600 18px Arial, sans-serif";
    ctx.fillText("Hệ thống truy xuất nguồn gốc nông sản CheckVN · Cục Bảo vệ Thực vật", 64, 778);

    ctx.textAlign = "right";
    ctx.fillStyle = "#b91c1c";
    ctx.font = "800 18px Arial, sans-serif";
    ctx.fillText("NGHIÊM CẤM TỰ Ý THAY ĐỔI BIỂN CẮM RANH GIỚI VÙNG TRỒNG", W - 64, 778);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Không xuất được tệp ảnh PNG.");
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export default function GardenSignboardModal({ plot, householdName, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [downloadingPng, setDownloadingPng] = useState(false);

  useEffect(() => {
    let active = true;
    const url = `${window.location.origin}/trace/${encodeURIComponent(plot.code)}`;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      color: { dark: "#0f372a", light: "#ffffff" },
    }).then((res) => {
      if (active) setQrDataUrl(res);
    });
    return () => {
      active = false;
    };
  }, [plot.code]);

  const safeCode = (plot.code || "lo-vuon").replace(/[^a-zA-Z0-9-_]+/g, "-");
  const traceHref = `/trace/${encodeURIComponent(plot.code)}`;

  const handlePrint = () => {
    const previousTitle = document.title;
    document.title = `Bien-cam-vuon-${safeCode}`;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
    setTimeout(restoreTitle, 1500);
  };

  const handleDownloadPng = async () => {
    if (downloadingPng || !qrDataUrl) return;
    setDownloadingPng(true);
    try {
      const blob = await renderSignboardPngBlob(plot, householdName, qrDataUrl);
      triggerBlobDownload(blob, `Bien-cam-vuon-${safeCode}.png`);
    } catch {
      handlePrint();
    } finally {
      setDownloadingPng(false);
    }
  };

  return (
    <Sheet
      title={`Biển cắm vườn – ${plot.code}`}
      onClose={onClose}
      className="pt-signboard-sheet"
    >
      <div className="signboard-sheet-content">
        <div className="signboard-toolbar no-print">
          <p className="signboard-note">
            Bà con in biển này ra khổ A4 hoặc tải ảnh sắc nét gửi tiệm in ép plastic chống nước cắm tại đầu lô đất.
          </p>
          <div className="signboard-action-btns">
            <button
              type="button"
              className="signboard-download-btn"
              onClick={() => void handleDownloadPng()}
              disabled={!qrDataUrl || downloadingPng}
            >
              <Download size={15} />
              <span>{downloadingPng ? "Đang tạo ảnh…" : "Tải ảnh PNG"}</span>
            </button>
            <button
              type="button"
              className="signboard-print-btn"
              onClick={handlePrint}
              disabled={!qrDataUrl}
            >
              <Printer size={16} />
              <span>In biển cắm vườn</span>
            </button>
          </div>
        </div>

        <div className="signboard-preview-wrap">
          {/* Biển cắm vườn thực tế chuẩn CheckVN & Cục BVTV */}
          <div className="garden-signboard-plate">
            <div className="plate-top">
              <div className="plate-flag">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div className="plate-org">HTX KINH DOANH - DỊCH VỤ TỔNG HỢP CƯ NÉ – ĐẮK LẮK</div>
              <div className="plate-main-title">BIỂN ĐỊNH DANH LÔ CANH TÁC SẦU RIÊNG</div>
            </div>

            <div className="plate-grid">
              <div className="plate-info">
                <div className="plate-row highlight-box">
                  <span className="plate-lbl">MÃ SỐ LÔ CANH TÁC:</span>
                  <strong className="plate-val big-code">{plot.code}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Mã số vùng trồng (PUC):</span>
                  <strong className="plate-val">{plot.zoneCode || "—"}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Chủ hộ canh tác:</span>
                  <strong className="plate-val">{householdName}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Diện tích lô:</span>
                  <span className="plate-val">{plot.areaHa} ha</span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Giống sầu riêng:</span>
                  <span className="plate-val">{plot.variety || "Đô Na"}</span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Số thửa / Tờ bản đồ:</span>
                  <span className="plate-val">
                    {plot.parcel || plot.sheet ? `Thửa ${plot.parcel || "—"}, Tờ ${plot.sheet || "—"}` : (plot.plantedYear || "2020")}
                  </span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Quy chuẩn áp dụng:</span>
                  <span className="plate-val">VietGAP &amp; Nghị định thư GACC</span>
                </div>
              </div>

              <a
                href={traceHref}
                target="_blank"
                rel="noopener noreferrer"
                className="plate-qr-box plate-qr-link"
                title={`Bấm vào mã QR để mở trang truy xuất nguồn gốc lô ${plot.code}`}
                aria-label={`Bấm vào mã QR để mở trang truy xuất nguồn gốc lô ${plot.code}`}
              >
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt={plot.code} className="plate-qr-img" />
                ) : (
                  <div className="plate-qr-skeleton" />
                )}
              </a>
            </div>

            <div className="plate-bottom">
              <span>Hệ thống truy xuất nguồn gốc nông sản CheckVN · Cục Bảo vệ Thực vật</span>
              <span className="protect-warning">NGHIÊM CẤM TỰ Ý THAY ĐỔI BIỂN CẮM RANH GIỚI VÙNG TRỒNG</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .pt-sheet.pt-signboard-sheet {
          max-width: 740px;
          --drawer-w: 760px;
        }

        .signboard-sheet-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .signboard-toolbar {
          padding: 12px 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
        }

        .signboard-note {
          margin: 0;
          font-size: 12.5px;
          color: #475569;
          line-height: 1.45;
        }

        .signboard-action-btns {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .signboard-download-btn,
        .signboard-print-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          background: #dfe9f8;
          color: #0084ff;
          border: none;
          border-radius: 999px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: none;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .signboard-download-btn {
          background: #ecfdf5;
          color: #15803d;
        }

        .signboard-download-btn:hover:not(:disabled) {
          background: #d1fae5;
          color: #166534;
          transform: translateY(-1px);
        }

        .signboard-print-btn:hover:not(:disabled) {
          background: #d0dff5;
          color: #006ee6;
          transform: translateY(-1px);
          box-shadow: none;
        }

        .signboard-download-btn:disabled,
        .signboard-print-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .signboard-preview-wrap {
          padding: 16px;
          background: #edf2ee;
          border-radius: 16px;
          display: flex;
          justify-content: center;
          overflow-x: hidden;
        }

        /* ─── Biển cắm chuẩn thiết kế thực địa ─── */
        .garden-signboard-plate {
          background: #ffffff;
          border: 4px solid #14532d;
          border-radius: 12px;
          width: 100%;
          max-width: 660px;
          padding: 20px 24px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
          color: #111;
          box-sizing: border-box;
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
          letter-spacing: 0.8px;
        }

        .plate-org {
          font-size: 13px;
          font-weight: 800;
          color: #14532d;
          margin-top: 2px;
        }

        .plate-main-title {
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
          margin-top: 4px;
          letter-spacing: 0.5px;
        }

        .plate-grid {
          display: grid;
          grid-template-columns: 1fr 190px;
          gap: 16px;
          align-items: center;
        }

        .plate-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .plate-row {
          font-size: 12.5px;
          display: flex;
          gap: 8px;
        }
        .plate-lbl {
          color: #555;
          min-width: 150px;
        }
        .plate-val {
          color: #0f172a;
          font-weight: 600;
        }

        .highlight-box {
          background: #ecfdf5;
          padding: 6px 10px;
          border-radius: 6px;
        }
        .big-code {
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.015em;
          font-size: 16px;
          color: #15803d;
          font-weight: 900;
        }

        .plate-qr-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          border: 2px dashed #cbd5e1;
          padding: 10px;
          border-radius: 8px;
          background: #f8fafc;
          box-sizing: border-box;
        }

        .plate-qr-link {
          text-decoration: none;
          color: inherit;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
        }

        .plate-qr-link:hover {
          border-color: #16a34a;
          background: #f0fdf4;
          box-shadow: 0 6px 18px rgba(21, 128, 61, 0.12);
          transform: translateY(-2px);
        }

        .plate-qr-link:active {
          transform: scale(0.98);
        }

        .plate-qr-link:focus-visible {
          outline: 2px solid #15803d;
          outline-offset: 2px;
        }

        .plate-qr-img,
        .plate-qr-skeleton {
          width: 154px;
          height: 154px;
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
          font-size: 8.75px;
          font-weight: 600;
          color: #64748b;
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
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            padding: 10px 14px;
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
            padding: 9px 12px;
          }

          .signboard-preview-wrap {
            padding: 12px 8px;
            border-radius: 12px;
          }

          .garden-signboard-plate {
            padding: 14px 12px;
            border-width: 3px;
            border-radius: 10px;
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
            padding: 6px 9px;
          }

          .big-code {
            font-size: 15px;
          }

          .plate-qr-box {
            margin: 6px auto 0;
            width: 100%;
            max-width: 220px;
            padding: 10px;
          }

          .plate-qr-img,
          .plate-qr-skeleton {
            width: 144px;
            height: 144px;
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
            padding: 8px 10px;
          }

          .signboard-note {
            font-size: 11.5px;
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
            max-width: 190px;
            padding: 8px;
          }

          .plate-qr-img {
            width: 125px;
            height: 125px;
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
          .signboard-sheet-content,
          .signboard-preview-wrap {
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

          .garden-signboard-plate {
            position: static !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            border: 3px solid #14532d !important;
            padding: 20px 24px !important;
            margin: 0 auto !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .garden-signboard-plate,
          .garden-signboard-plate * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .plate-grid {
            display: grid !important;
            grid-template-columns: 1fr 190px !important;
            gap: 16px !important;
            align-items: center !important;
          }
          .plate-row {
            display: flex !important;
            justify-content: flex-start !important;
            gap: 8px !important;
          }
          .plate-lbl {
            min-width: 150px !important;
          }
          .plate-val {
            text-align: left !important;
          }
          .plate-qr-box {
            max-width: none !important;
            margin: 0 !important;
          }
          .plate-bottom {
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            gap: 16px !important;
            text-align: left !important;
          }
          .protect-warning {
            text-align: right !important;
          }
        }
      `}</style>
    </Sheet>
  );
}
