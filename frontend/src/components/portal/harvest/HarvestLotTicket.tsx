"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, QrCode } from "@/components/ui/PublicIcon";
import { WatermarkStamp } from "@/components/ui/WatermarkStamp";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT, AUTH_SCOPE_CHANGED_EVENT } from "@/lib/api-client";
import { formatKg, HARVEST_STATUS } from "@/lib/portal-labels";
import { triggerDataUrlDownload } from "@/utils/download";
import { formatDate } from "@/utils/format";
import type { PortalHarvest } from "@/types/portal";
import { Sheet } from "../ui";

const MAX_QR_CACHE = 64;
const qrDataUrlCache = new Map<string, string>();

const clearQrDataUrlCache = () => {
  qrDataUrlCache.clear();
};

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_LOGOUT_EVENT, clearQrDataUrlCache);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearQrDataUrlCache);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, clearQrDataUrlCache);
}

function setQrCacheEntry(key: string, url: string) {
  if (qrDataUrlCache.has(key)) {
    qrDataUrlCache.delete(key);
  } else if (qrDataUrlCache.size >= MAX_QR_CACHE) {
    const oldest = qrDataUrlCache.keys().next().value;
    if (oldest !== undefined) qrDataUrlCache.delete(oldest);
  }
  qrDataUrlCache.set(key, url);
}

interface HarvestAssetTagCardProps {
  lot: PortalHarvest;
  pucCode?: string;
  onOpenModal: () => void;
}

export function HarvestAssetTagCard({
  lot,
  pucCode = "66-PUC-SR0001-00728",
  onOpenModal,
}: HarvestAssetTagCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tokenOrCode = lot.qrToken || lot.qrCode || lot.lotCode;
  const routePrefix = lot.qrToken ? "/t/" : "/trace/";
  const codeKey = `Q:${tokenOrCode}`;
  const [asyncQr, setAsyncQr] = useState<{ key: string; url: string } | null>(null);
  const [nearView, setNearView] = useState<boolean>(
    () =>
      qrDataUrlCache.has(codeKey) ||
      (typeof window !== "undefined" && typeof IntersectionObserver === "undefined"),
  );
  const qrSrc = qrDataUrlCache.get(codeKey) ?? (asyncQr?.key === codeKey ? asyncQr.url : "");
  const status = HARVEST_STATUS[lot.status] ?? HARVEST_STATUS.sampling;

  const watermarkTitle =
    lot.status === "exported"
      ? "ĐÃ XUẤT KHO"
      : lot.status === "delivered"
        ? "ĐÃ GIAO HÀNG"
        : lot.status === "in_transit"
          ? "ĐANG VẬN CHUYỂN"
          : lot.status === "sampling"
            ? "ĐANG LẤY MẪU"
            : (status?.label || lot.status).toUpperCase();

  const watermarkBottom =
    lot.status === "exported" || lot.status === "delivered"
      ? "KIỂM ĐỊNH VIETGAP"
      : "GIÁM SÁT VÙNG TRỒNG";

  useEffect(() => {
    if (nearView) return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNearView(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nearView]);

  useEffect(() => {
    if (!nearView || qrDataUrlCache.has(codeKey)) return;
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}${routePrefix}${encodeURIComponent(tokenOrCode)}`;

    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(targetUrl, {
          margin: 1,
          width: 320,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
          errorCorrectionLevel: "Q",
        }),
      )
      .then((url) => {
        setQrCacheEntry(codeKey, url);
        if (active) setAsyncQr({ key: codeKey, url });
      })
      .catch(() => {
        // Ignore QR generation error
      });

    return () => {
      active = false;
    };
  }, [nearView, codeKey, routePrefix, tokenOrCode]);

  return (
    <div ref={cardRef} className="pt-asset-card" data-status={lot.status}>
      <div className="pt-asset-watermark" aria-hidden="true">
        <WatermarkStamp
          topText="HTX SẦU RIÊNG CƯ NÉ"
          centerText={watermarkTitle}
          bottomText={watermarkBottom}
        />
      </div>

      <div className="pt-asset-left">
        <div className="pt-asset-sub-title">
          <span>SẦU RIÊNG TƯƠI</span>
          <span className="pt-asset-dot">-</span>
          <span className="pt-asset-hide-mobile">HTX CƯ NÉ</span>
          <span className="pt-asset-dot pt-asset-hide-mobile">-</span>
          <span>{pucCode}</span>
        </div>

        <div className="pt-asset-code-line">
          <span className="pt-asset-code-val">LÔ {lot.lotCode}</span>
          <span className="pt-asset-code-divider">-</span>
          <span className="pt-asset-weight-val">KLT: {formatKg(lot.weightKg)}</span>
        </div>

        <div className="pt-asset-id-group">
          <span className="pt-asset-id-label">MÃ TRUY XUẤT</span>
          <strong className="pt-asset-id-val">{lot.qrCode || lot.lotCode}</strong>
        </div>

        <div className="pt-asset-meta">
          <span>Ngày thu: {formatDate(lot.harvestedOn)}</span>
          <span className="pt-asset-meta-dot">-</span>
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
                loading="lazy"
                decoding="async"
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

function TicketQrImage({
  lotCode,
  qrCode,
  qrToken,
}: {
  lotCode: string;
  qrCode?: string | null;
  qrToken?: string | null;
}) {
  const tokenOrCode = qrToken || qrCode || lotCode;
  const routePrefix = qrToken ? "/t/" : "/trace/";
  const codeKey = `Q:${tokenOrCode}`;
  const [src, setSrc] = useState<string>(() => qrDataUrlCache.get(codeKey) ?? "");

  useEffect(() => {
    if (qrDataUrlCache.has(codeKey)) {
      return;
    }
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}${routePrefix}${encodeURIComponent(tokenOrCode)}`;

    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(targetUrl, {
          margin: 1,
          width: 320,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "Q",
        }),
      )
      .then((url) => {
        setQrCacheEntry(codeKey, url);
        if (active) setSrc(url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [codeKey, routePrefix, tokenOrCode]);

  if (!src) {
    return <QrCode size={110} strokeWidth={1.8} className="pt-qr-code-icon" aria-hidden="true" />;
  }

  return <img src={src} alt={`Mã QR ${lotCode}`} className="pt-qr-frame-img" decoding="async" />;
}

export function HarvestLotQrModal({
  lot,
  pucCode = "66-PUC-SR0001-00728",
  onClose,
}: {
  lot: PortalHarvest;
  pucCode?: string;
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
                  loading="lazy"
                  decoding="async"
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
                  <div className="pt-ticket-entity-meta">Vùng trồng {pucCode} - VietGAP</div>
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
                <a
                  href={
                    lot.qrToken
                      ? `/t/${encodeURIComponent(lot.qrToken)}`
                      : `/trace/${encodeURIComponent(lot.qrCode || lot.lotCode)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pt-qr-frame"
                  style={{ textDecoration: "none", cursor: "pointer" }}
                  title={`Bấm vào mã QR để xem trang truy xuất lô ${lot.lotCode}`}
                  aria-label={`Bấm vào mã QR để xem trang truy xuất lô ${lot.lotCode}`}
                >
                  <TicketQrImage lotCode={lot.lotCode} qrCode={lot.qrCode} qrToken={lot.qrToken} />
                </a>
                <div className="pt-ticket-barcode-num">
                  <span>{lot.qrCode || lot.lotCode}</span>
                </div>
                <p className="pt-ticket-scan-hint">
                  Quét hoặc chạm trực tiếp vào mã QR để kiểm tra nguồn gốc &amp; nhật ký canh tác
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

          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            <button
              type="button"
              className="pt-btn pt-btn-ghost pt-ticket-open-btn"
              onClick={() => {
                const codeKey = `Q:${lot.qrToken || lot.qrCode || lot.lotCode}`;
                const dataUrl = qrDataUrlCache.get(codeKey);
                if (dataUrl) {
                  triggerDataUrlDownload(dataUrl, `QR-lo-hang-${lot.lotCode}.png`);
                }
              }}
            >
              <Download size={16} strokeWidth={2.2} aria-hidden="true" />
              <span>Tải mã QR</span>
            </button>
            <a
              href={
                lot.qrToken
                  ? `/t/${encodeURIComponent(lot.qrToken)}`
                  : `/trace/${encodeURIComponent(lot.qrCode || lot.lotCode)}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="pt-btn pt-btn-primary pt-ticket-open-btn"
            >
              <span>Xem toàn bộ hồ sơ truy xuất</span>
              <ArrowUpRight size={17} strokeWidth={2.4} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
