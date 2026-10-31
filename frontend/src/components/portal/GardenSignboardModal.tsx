"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, QrCode } from "lucide-react";
import type { PortalPlot } from "@/types/portal";
import { Sheet } from "./ui";

interface Props {
  plot: PortalPlot;
  householdName: string;
  onClose: () => void;
}

export default function GardenSignboardModal({ plot, householdName, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    const url = `${window.location.origin}/trace/${encodeURIComponent(plot.code)}`;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 220,
      color: { dark: "#0f372a", light: "#ffffff" },
    }).then(setQrDataUrl);
  }, [plot.code]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Sheet
      title={`Biển cắm đầu lô vườn QR – ${plot.code}`}
      onClose={onClose}
      className="pt-signboard-sheet"
    >
      <div className="signboard-sheet-content">
        <div className="signboard-sub no-print">Hình 1 - Bước 1: Gắn mã định danh lô canh tác</div>

        <div className="signboard-toolbar no-print">
          <p className="signboard-note">
            Bà con in biển này ra khổ A4 hoặc ép plastic chống nước để cắm tại cọc mốc đầu lô đất canh tác.
          </p>
          <button type="button" className="signboard-print-btn" onClick={handlePrint}>
            <Printer size={16} />
            <span>In biển cắm vườn</span>
          </button>
        </div>

        <div className="signboard-preview-wrap">
          {/* Biển cắm vườn thực tế chuẩn CheckVN & Cục BVTV */}
          <div className="garden-signboard-plate">
            <div className="plate-top">
              <div className="plate-flag">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div className="plate-org">HỢP TÁC XÃ NÔNG NGHIỆP KRÔNG BÚK – ĐẮK LẮK</div>
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
                  <strong className="plate-val">VN-DLOR-0086</strong>
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
                  <span className="plate-val">{plot.variety || "Monthong (Dona)"}</span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Năm trồng:</span>
                  <span className="plate-val">{plot.plantedYear || "2018"}</span>
                </div>

                <div className="plate-row">
                  <span className="plate-lbl">Quy chuẩn áp dụng:</span>
                  <span className="plate-val">VietGAP &amp; Nghị định thư GACC</span>
                </div>
              </div>

              <div className="plate-qr-box">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt={plot.code} className="plate-qr-img" />
                ) : (
                  <div className="plate-qr-skeleton" />
                )}
                <div className="plate-qr-caption">
                  <QrCode size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                  QUÉT QR XEM HỒ SƠ LÔ VƯỜN
                </div>
              </div>
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
        }

        .signboard-sheet-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .signboard-sub {
          font-size: 11px;
          font-weight: 700;
          color: #166534;
          text-transform: uppercase;
          letter-spacing: 0.4px;
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

        .signboard-print-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          background: #f8f23a;
          color: #14372f;
          border: 1px solid rgba(20, 55, 47, 0.12);
          border-radius: 999px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(248, 242, 58, 0.45);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .signboard-print-btn:hover {
          background: #fcf65f;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(248, 242, 58, 0.6);
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
          font-family: monospace;
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

        .plate-qr-img {
          width: 140px;
          height: 140px;
          border-radius: 4px;
          display: block;
        }

        .plate-qr-caption {
          font-size: 9.5px;
          font-weight: 800;
          color: #15803d;
          margin-top: 6px;
          text-align: center;
        }

        .plate-bottom {
          margin-top: 16px;
          padding-top: 10px;
          border-top: 1px solid #cbd5e1;
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          font-weight: 600;
          color: #64748b;
        }
        .protect-warning {
          color: #b91c1c;
          font-weight: 800;
        }

        /* ─── Responsive cho màn hình di động (≤ 640px) ─── */
        @media (max-width: 640px) {
          .signboard-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            padding: 10px 14px;
          }

          .signboard-print-btn {
            width: 100%;
            padding: 9px 16px;
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

          .plate-qr-img {
            width: 140px;
            height: 140px;
          }

          .plate-qr-caption {
            font-size: 9px;
            margin-top: 5px;
          }

          .plate-bottom {
            margin-top: 13px;
            padding-top: 8px;
            flex-direction: column;
            gap: 6px;
            text-align: center;
            font-size: 9px;
            line-height: 1.35;
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

        @media print {
          body * {
            visibility: hidden !important;
          }
          .garden-signboard-plate,
          .garden-signboard-plate * {
            visibility: visible !important;
          }
          .no-print,
          .pt-sheet-backdrop,
          .pt-sheet-topbar {
            display: none !important;
          }
          .garden-signboard-plate {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            border: 3px solid #000 !important;
            padding: 20px 24px !important;
          }
          .plate-grid {
            display: grid !important;
            grid-template-columns: 1fr 190px !important;
            gap: 16px !important;
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
            text-align: left !important;
          }
        }
      `}</style>
    </Sheet>
  );
}
