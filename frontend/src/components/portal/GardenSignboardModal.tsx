"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X, Printer, TreePine, QrCode } from "lucide-react";
import type { PortalPlot } from "@/types/portal";

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
    <div className="signboard-overlay">
      <div className="signboard-modal">
        <div className="signboard-header no-print">
          <div>
            <div className="signboard-sub">Hình 1 - Bước 1: Gắn mã định danh lô canh tác</div>
            <h3 className="signboard-title">Biển cắm đầu lô vườn QR – {plot.code}</h3>
          </div>
          <button type="button" className="signboard-close" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <div className="signboard-toolbar no-print">
          <p className="signboard-note">
            Bà con in biển này ra khổ A4 hoặc ép plastic chống nước để cắm tại cọc mốc đầu lô đất canh tác.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>
            <Printer size={15} />
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
        .signboard-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(14, 28, 22, 0.7);
          backdrop-filter: blur(4px);
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .signboard-modal {
          background: #ffffff;
          border-radius: 16px;
          max-width: 780px;
          width: 100%;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.35);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          max-height: 90vh;
        }

        .signboard-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8e5;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8faf9;
        }

        .signboard-sub {
          font-size: 11px;
          font-weight: 700;
          color: #166534;
          text-transform: uppercase;
        }

        .signboard-title {
          font-size: 17px;
          font-weight: 800;
          color: #14372f;
          margin: 2px 0 0;
        }

        .signboard-close {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid #d5ded9;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .signboard-toolbar {
          padding: 12px 20px;
          background: #ffffff;
          border-bottom: 1px solid #edf1ef;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .signboard-note {
          margin: 0;
          font-size: 12.5px;
          color: #556c62;
        }

        .signboard-preview-wrap {
          padding: 24px;
          background: #edf2ee;
          overflow-y: auto;
          display: flex;
          justify-content: center;
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
          border-left: 4px solid #16a34a;
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
        }

        .plate-qr-img {
          width: 140px;
          height: 140px;
          border-radius: 4px;
        }

        .plate-qr-caption {
          font-size: 9.5px;
          font-weight: 800;
          color: #15803d;
          margin-top: 6px;
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

        @media print {
          body * {
            visibility: hidden !important;
          }
          .signboard-overlay,
          .garden-signboard-plate,
          .garden-signboard-plate * {
            visibility: visible !important;
          }
          .no-print {
            display: none !important;
          }
          .signboard-overlay {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: #fff !important;
            padding: 0 !important;
          }
          .garden-signboard-plate {
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            border: 3px solid #000 !important;
          }
        }
      `}</style>
    </div>
  );
}
