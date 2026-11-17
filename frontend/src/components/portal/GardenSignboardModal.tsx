"use client";

import { useEffect, useState } from "react";
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
  const W = 1360;
  const H = 880;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  try {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Không khởi tạo được bộ vẽ ảnh.");

    // Nền trắng & khung viền xanh đậm ngoài trời
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 10;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    // Tiêu đề quốc hiệu, mô hình điểm cấp xã & 3 ngôn ngữ (VI / 中文 / EN)
    ctx.textAlign = "center";
    ctx.fillStyle = "#b91c1c";
    ctx.font = "700 20px Arial, sans-serif";
    ctx.fillText("UBND XÃ CƯ NÉ - MÔ HÌNH ĐIỂM TRUY XUẤT NGUỒN GỐC TỈNH ĐẮK LẮK", W / 2, 78);

    ctx.fillStyle = "#14532d";
    ctx.font = "800 24px Arial, sans-serif";
    ctx.fillText("HTX KINH DOANH - DỊCH VỤ TỔNG HỢP CƯ NÉ - KRÔNG BÚK, ĐẮK LẮK", W / 2, 114);

    ctx.fillStyle = "#0f172a";
    ctx.font = "900 34px Arial, sans-serif";
    ctx.fillText("BIỂN ĐỊNH DANH THỬA VƯỜN SẦU RIÊNG", W / 2, 160);

    ctx.fillStyle = "#334155";
    ctx.font = "700 20px Arial, sans-serif";
    ctx.fillText("榴莲注册果园地块标识牌  /  REGISTERED DURIAN PARCEL SIGNBOARD", W / 2, 192);

    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 214);
    ctx.lineTo(W - 64, 214);
    ctx.stroke();

    // Hộp nổi bật Mã thửa canh tác
    ctx.fillStyle = "#ecfdf5";
    ctx.fillRect(64, 238, 804, 66);
    ctx.textAlign = "left";
    ctx.fillStyle = "#334155";
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText("MÃ THỬA / 地块编号:", 82, 280);
    ctx.fillStyle = "#15803d";
    ctx.font = '900 32px Inter, -apple-system, "Segoe UI", Arial, sans-serif';
    ctx.fillText(plot.code, 390, 282);

    // Các dòng thông tin song ngữ Việt - Trung phục vụ đoàn kiểm tra thực địa
    const treePart = plot.treeCount && plot.treeCount > 0 ? ` (${plot.treeCount} cây / 株)` : "";
    const quotaText =
      plot.maxQuotaKg && plot.maxQuotaKg > 0
        ? `${Number(plot.maxQuotaKg).toLocaleString("vi-VN")} kg / vụ`
        : "Theo biên bản thẩm định đầu vụ";
    const parcelInfo =
      plot.parcel || plot.sheet
        ? `Thửa ${plot.parcel || "-"}, Tờ ${plot.sheet || "-"}`
        : `Năm trồng ${plot.plantedYear || "2020"}`;

    const rows: [string, string, boolean][] = [
      ["Mã vùng PUC / 果园编码:", plot.zoneCode || "VN-DLOR-0086", true],
      ["Chủ hộ / 农户代表:", householdName, true],
      ["Quy mô / 面积与株数:", `${plot.areaHa} ha${treePart}`, false],
      ["Trần sản lượng / 核定配额:", quotaText, true],
      ["Giống / 榴莲品种:", plot.variety || "Monthong (Dona) & Ri6", false],
      ["Địa chính / 地籍档案:", parcelInfo, false],
      ["Quy chuẩn / 执行标准:", "VietGAP & Nghị định thư GACC", false],
    ];

    let y = 350;
    for (const [label, val, bold] of rows) {
      ctx.fillStyle = "#475569";
      ctx.font = "600 22px Arial, sans-serif";
      ctx.fillText(label, 68, y);

      ctx.fillStyle = "#0f172a";
      ctx.font = `${bold ? "800" : "600"} 23px Arial, sans-serif`;
      ctx.fillText(val, 390, y, 476);
      y += 56;
    }

    // Mã QR truy xuất nguồn gốc bên phải
    if (qrDataUrl) {
      const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = qrDataUrl;
      });
      ctx.drawImage(qrImg, 916, 286, 360, 360);
    }

    // Chân biển
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 766);
    ctx.lineTo(W - 64, 766);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#475569";
    ctx.font = "600 17px Arial, sans-serif";
    ctx.fillText(
      "Liên thông dữ liệu vùng trồng Xã Cư Né - Hỗ trợ Thẻ Đoàn Thẩm định Thực địa (VI / 中文 / EN)",
      64,
      808,
    );

    ctx.textAlign = "right";
    ctx.fillStyle = "#b91c1c";
    ctx.font = "800 17px Arial, sans-serif";
    ctx.fillText("NGHIÊM CẤM TỰ Ý DI DỜI BIỂN ĐỊNH DANH THỬA VƯỜN", W - 64, 808);

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
      credentials: "include",
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
          width: 340,
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
      const blob = await renderSignboardPngBlob(
        enrichedPlot,
        householdName,
        qrDataUrl,
      );
      triggerBlobDownload(blob, `Bien-cam-vuon-${safeCode}.png`);
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
                UBND XÃ CƯ NÉ - MÔ HÌNH ĐIỂM TRUY XUẤT NGUỒN GỐC TỈNH ĐẮK LẮK
              </div>
              <div className="plate-org">
                HTX KINH DOANH - DỊCH VỤ TỔNG HỢP CƯ NÉ - KRÔNG BÚK, ĐẮK LẮK
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
                  <strong className="plate-val">{plot.zoneCode || "VN-DLOR-0086"}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Chủ hộ / 农户代表:</span>
                  <strong className="plate-val">{householdName}</strong>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Quy mô / 面积与株数:</span>
                  <span className="plate-val">
                    {plot.areaHa} ha
                    {resolvedTreeCount && resolvedTreeCount > 0
                      ? ` (${resolvedTreeCount} cây / 株)`
                      : ""}
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
                  <span className="plate-val">{plot.variety || "Monthong (Dona) & Ri6"}</span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Địa chính / 地籍档案:</span>
                  <span className="plate-val">
                    {plot.parcel || plot.sheet
                      ? `Thửa ${plot.parcel || "-"}, Tờ ${plot.sheet || "-"}`
                      : `Năm trồng ${plot.plantedYear || "2020"}`}
                  </span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Quy chuẩn / 执行标准:</span>
                  <span className="plate-val">VietGAP và GACC</span>
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
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt={plot.code} className="plate-qr-img" />
                ) : (
                  <div className="plate-qr-skeleton" />
                )}
              </a>
            </div>

            <div className="plate-bottom">
              <span>
                Liên thông dữ liệu vùng trồng Xã Cư Né - Hỗ trợ Thẻ Đoàn Thẩm định Thực địa (VI / 中文 / EN)
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
          background: #dfe9f8;
          color: #0084ff;
          border: none;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: none;
          transition: background-color 0.16s ease, color 0.16s ease;
          flex-shrink: 0;
        }

        .signboard-download-btn {
          background: #ecfdf5;
          color: #15803d;
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
          justify-content: center;
          text-align: center;
          border: none;
          padding: 0;
          border-radius: 6px;
          background: transparent;
          box-sizing: border-box;
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
          transform: scale(0.98);
        }

        .plate-qr-link:focus-visible {
          outline: 2px solid #15803d;
          outline-offset: 2px;
        }

        .plate-qr-img,
        .plate-qr-skeleton {
          width: 172px;
          height: 172px;
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
            padding: 0;
          }

          .plate-qr-img,
          .plate-qr-skeleton {
            width: 156px;
            height: 156px;
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
