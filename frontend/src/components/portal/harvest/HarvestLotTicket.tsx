"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { formatKg, HARVEST_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalHarvest } from "@/types/portal";
import { Sheet } from "../ui";

interface HarvestAssetTagCardProps {
  lot: PortalHarvest;
  pucCode?: string;
  onOpenModal: () => void;
}

export function HarvestAssetTagCard({
  lot,
  pucCode = "PUC-KRB-001",
  onOpenModal,
}: HarvestAssetTagCardProps) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const status = HARVEST_STATUS[lot.status];

  const watermarkTitle =
    lot.status === "exported" || lot.status === "delivered"
      ? "ĐÃ XUẤT KHO"
      : (status?.label || lot.status).toUpperCase();

  const watermarkSub =
    lot.status === "exported" || lot.status === "delivered"
      ? "HTX KRÔNG BÚK · ĐÃ KIỂM TRA"
      : "HTX KRÔNG BÚK · GIÁM SÁT";

  useEffect(() => {
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}/trace/${encodeURIComponent(lot.qrCode || lot.lotCode)}`;

    QRCode.toDataURL(targetUrl, {
      margin: 0,
      width: 320,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setQrSrc(url);
      })
      .catch(() => {
        // Ignore QR generation error
      });

    return () => {
      active = false;
    };
  }, [lot.qrCode, lot.lotCode]);

  return (
    <div className="pt-asset-card" data-status={lot.status}>
      <div className="pt-asset-watermark" aria-hidden="true">
        <div className="pt-asset-watermark-inner">
          <span className="pt-asset-watermark-title">{watermarkTitle}</span>
          <span className="pt-asset-watermark-sub">{watermarkSub}</span>
        </div>
      </div>

      <div className="pt-asset-left">
        <div className="pt-asset-sub-title">
          <span>SẦU RIÊNG TƯƠI</span>
          <span className="pt-asset-dot">·</span>
          <span className="pt-asset-hide-mobile">HTX KRÔNG BÚK</span>
          <span className="pt-asset-dot pt-asset-hide-mobile">·</span>
          <span>{pucCode}</span>
        </div>

        <div className="pt-asset-code-line">
          <span className="pt-asset-code-val">LÔ {lot.lotCode}</span>
          <span className="pt-asset-code-divider">·</span>
          <span className="pt-asset-weight-val">KLT: {formatKg(lot.weightKg)}</span>
        </div>

        <div className="pt-asset-id-group">
          <span className="pt-asset-id-label">MÃ TRUY XUẤT</span>
          <strong className="pt-asset-id-val">{lot.qrCode || lot.lotCode}</strong>
        </div>

        <div className="pt-asset-meta">
          <span>Ngày thu: {formatDate(lot.harvestedOn)}</span>
          <span className="pt-asset-meta-dot">·</span>
          <span>{lot.buyer} ({lot.market === "Trung Quốc" ? "Xuất khẩu TQ" : lot.market})</span>
        </div>
      </div>

      <div className="pt-asset-right">
        <button
          type="button"
          className="pt-asset-qr-btn"
          onClick={onOpenModal}
          title="Bấm để mở tem vé chi tiết hoặc dùng máy ảnh quét trực tiếp"
          aria-label={`Mã QR tra cứu nguồn gốc lô ${lot.lotCode} - Bấm để mở tem chi tiết`}
        >
          <div className="pt-asset-qr-box">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`Mã QR tra cứu nguồn gốc lô ${lot.lotCode}`}
                className="pt-asset-qr-img"
              />
            ) : (
              <div className="pt-asset-qr-loading" aria-hidden="true">
                <QrCode size={110} strokeWidth={1.8} />
              </div>
            )}
            <div className="pt-asset-qr-overlay">
              <span className="pt-asset-qr-badge">
                <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden="true" />
                <span>Bấm mở</span>
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function TicketQrImage({ lotCode, qrCode }: { lotCode: string; qrCode?: string | null }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}/trace/${encodeURIComponent(qrCode || lotCode)}`;

    QRCode.toDataURL(targetUrl, {
      margin: 0,
      width: 320,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "H",
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [lotCode, qrCode]);

  if (!src) {
    return <QrCode size={110} strokeWidth={1.8} className="pt-qr-code-icon" aria-hidden="true" />;
  }

  return <img src={src} alt={`Mã QR ${lotCode}`} className="pt-qr-frame-img" />;
}

export function HarvestLotQrModal({
  lot,
  onClose,
}: {
  lot: PortalHarvest;
  onClose: () => void;
}) {
  return (
    <Sheet title="Tem điện tử lô hàng" onClose={onClose}>
      <div className="pt-qr-modal-body">
        <div className="pt-ticket-container">
          <div className="pt-ticket-card">
            <div className="pt-ticket-head">
              <div className="pt-ticket-popper-wrap" aria-hidden="true">
                <img
                  src="/check-mark.png"
                  alt="Tem hợp lệ"
                  width={28}
                  height={28}
                  className="pt-ticket-check-icon"
                />
              </div>
              <h3 className="pt-ticket-title">Tem điện tử hợp lệ!</h3>
              <p className="pt-ticket-sub">
                Lô sầu riêng đã được cấp mã truy xuất nguồn gốc chính thức
              </p>
            </div>

            <div className="pt-ticket-sub-divider" aria-hidden="true" />

            <div className="pt-ticket-body">
              <div className="pt-ticket-grid">
                <div className="pt-ticket-col">
                  <span className="pt-ticket-label">MÃ LÔ HÀNG</span>
                  <strong className="pt-ticket-val">{lot.lotCode}</strong>
                </div>
                <div className="pt-ticket-col pt-ticket-col-right">
                  <span className="pt-ticket-label">KHỐI LƯỢNG TỊNH (KLT)</span>
                  <strong className="pt-ticket-val pt-ticket-val-accent">{formatKg(lot.weightKg)}</strong>
                </div>

                <div className="pt-ticket-col">
                  <span className="pt-ticket-label">NGÀY THU HOẠCH</span>
                  <strong className="pt-ticket-val">{formatDate(lot.harvestedOn)}</strong>
                </div>
                <div className="pt-ticket-col pt-ticket-col-right">
                  <span className="pt-ticket-label">THỊ TRƯỜNG</span>
                  <strong className="pt-ticket-val">{lot.market}</strong>
                </div>
              </div>

              <div className="pt-ticket-entity-box">
                <div className="pt-ticket-entity-badge" aria-hidden="true">
                  <span className="pt-ticket-badge-circle pt-badge-green">PUC</span>
                  <span className="pt-ticket-badge-circle pt-badge-gold">VG</span>
                </div>
                <div className="pt-ticket-entity-info">
                  <div className="pt-ticket-entity-name">{lot.buyer}</div>
                  <div className="pt-ticket-entity-meta">Vùng trồng PUC-KRB-001 · VietGAP</div>
                </div>
              </div>
            </div>

            <div className="pt-ticket-perforation">
              <div className="pt-ticket-notch pt-ticket-notch-l" aria-hidden="true" />
              <div className="pt-ticket-dash-line" aria-hidden="true" />
              <div className="pt-ticket-notch pt-ticket-notch-r" aria-hidden="true" />
            </div>

            <div className="pt-ticket-stub">
              <div className="pt-ticket-qr-wrap">
                <div className="pt-qr-frame">
                  <TicketQrImage lotCode={lot.lotCode} qrCode={lot.qrCode} />
                </div>
                <div className="pt-ticket-barcode-num">
                  <span>{lot.qrCode || lot.lotCode}</span>
                </div>
                <p className="pt-ticket-scan-hint">
                  Quét mã QR để kiểm tra nguồn gốc &amp; nhật ký canh tác
                </p>
              </div>
            </div>

            <div className="pt-ticket-scallop-bottom" aria-hidden="true">
              <svg viewBox="0 0 320 14" preserveAspectRatio="none" className="pt-ticket-scallop-svg">
                <path
                  d="M0,0 L320,0 L320,2 A20,12 0 0,1 280,2 A20,12 0 0,1 240,2 A20,12 0 0,1 200,2 A20,12 0 0,1 160,2 A20,12 0 0,1 120,2 A20,12 0 0,1 80,2 A20,12 0 0,1 40,2 A20,12 0 0,1 0,2 Z"
                  fill="#ffffff"
                />
              </svg>
            </div>
          </div>

          <a
            href={`/trace/${encodeURIComponent(lot.lotCode)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pt-btn pt-btn-primary pt-ticket-open-btn"
          >
            <span>Xem toàn bộ hồ sơ truy xuất</span>
            <ArrowUpRight size={17} strokeWidth={2.4} aria-hidden="true" />
          </a>
        </div>
      </div>
    </Sheet>
  );
}
