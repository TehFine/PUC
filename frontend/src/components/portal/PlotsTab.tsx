"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { usePortal } from "@/hooks/use-portal";
import { formatKg, HARVEST_STATUS, PLOT_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalHarvest, PortalList, PortalOverview, PortalPlot, PortalPlots } from "@/types/portal";
import { Card, EmptyState, Pill, Sheet, StateBlock } from "./ui";
import GardenSignboardModal from "./GardenSignboardModal";
import PlotMapModal from "./PlotMapModal";

const SOURCE_LABEL = { declared: "Tự khai báo", measured: "Đo thực địa", cadastral: "Địa chính", demo: "Mẫu" } as const;

export default function PlotsTab() {
  const plots = usePortal<PortalPlots>("plots");
  const harvest = usePortal<PortalList<PortalHarvest>>("harvest");
  const overview = usePortal<PortalOverview>("overview");
  const [selectedLotForQr, setSelectedLotForQr] = useState<PortalHarvest | null>(null);
  const [signboardPlot, setSignboardPlot] = useState<PortalPlot | null>(null);
  const [mapViewPlot, setMapViewPlot] = useState<PortalPlot | null>(null);

  return (
    <div className="pt-stack">
      <div className="pt-grid-2 pt-plots-grid">
        <section className="pt-plots-section" aria-labelledby="plots-heading">
          <StateBlock loading={plots.loading} error={plots.error} />
          {plots.data && !plots.data.available && (
            <>
              <div className="pt-plots-header">
                <div className="pt-plots-header-info">
                  <h2 id="plots-heading" className="pt-plots-title">
                    Thửa đất của tôi
                  </h2>
                </div>
              </div>
              <EmptyState icon="map">Dữ liệu bản đồ thửa đất chưa được bật trên hệ thống. Vui lòng liên hệ cán bộ HTX.</EmptyState>
            </>
          )}
          {plots.data?.available && plots.data.data.length === 0 && (
            <>
              <div className="pt-plots-header">
                <div className="pt-plots-header-info">
                  <h2 id="plots-heading" className="pt-plots-title">
                    Thửa đất của tôi
                  </h2>
                </div>
              </div>
              <EmptyState icon="plot">Chưa có thửa đất nào được ghi nhận cho hộ của bạn. Bạn có thể gửi hồ sơ đăng ký thửa đất ở mục Hồ sơ.</EmptyState>
            </>
          )}
          {plots.data?.available && plots.data.data.length > 0 && (
            <>
              <div className="pt-plots-header">
                <div className="pt-plots-header-info">
                  <h2 id="plots-heading" className="pt-plots-title">
                    Thửa đất của tôi
                  </h2>
                </div>
              </div>

              <div className="pt-plot-card-list" role="list">
                {plots.data.data.map((plot) => (
                  <div
                    key={plot.code}
                    role="button"
                    tabIndex={0}
                    className="pt-plot-card pt-plot-reminder-card"
                    onClick={() => setMapViewPlot(plot)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setMapViewPlot(plot);
                      }
                    }}
                    title="Bấm vào thẻ để mở bản đồ toàn cảnh thửa đất"
                    aria-label={`Thửa đất ${plot.code}, bấm để mở bản đồ toàn cảnh`}
                  >
                    {/* Icon map từ public/placeholder.png */}
                    <img
                      src="/placeholder.png"
                      alt=""
                      width={26}
                      height={26}
                      className="pt-plot-trifold-icon"
                      aria-hidden="true"
                    />

                    {/* Nội dung thông tin thửa đất theo phong cách thẻ nhắc nhở */}
                    <div className="pt-plot-card-body">
                      <strong className="pt-plot-code">#{plot.code}</strong>
                    </div>

                    {/* Icon QR code ở cuối thẻ để người dùng bấm vào xem biển QR */}
                    <div className="pt-plot-card-end">
                      <button
                        type="button"
                        className="pt-plot-qr-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSignboardPlot(plot);
                        }}
                        title={`Xem và in biển cắm đầu lô vườn QR cho mã ${plot.code}`}
                        aria-label={`Mã QR biển cắm vườn ${plot.code}`}
                      >
                        <QrCode size={18} strokeWidth={2.2} aria-hidden="true" />
                        <span className="pt-plot-qr-action-label">Biển QR</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

      <section className="pt-plots-section pt-harvest-section" aria-labelledby="harvest-heading">
        <div className="pt-plots-header">
          <div className="pt-plots-header-info">
            <h2 id="harvest-heading" className="pt-plots-title">
              Lô thu hoạch
            </h2>
          </div>
        </div>
        <StateBlock loading={harvest.loading} error={harvest.error} />
        {harvest.data && harvest.data.data.length === 0 && <EmptyState icon="harvest">Chưa có lô thu hoạch nào của hộ bạn.</EmptyState>}
        {harvest.data && harvest.data.data.length > 0 && (
          <div className="pt-asset-card-grid">
            {harvest.data.data.map((lot) => (
              <HarvestAssetTagCard
                key={lot.id}
                lot={lot}
                onOpenModal={() => setSelectedLotForQr(lot)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Sheet hiển thị chi tiết mã QR của từng lô sản phẩm dạng thẻ vé Ticket Voucher */}
      {selectedLotForQr && (
        <Sheet
          title="Tem điện tử lô hàng"
          onClose={() => setSelectedLotForQr(null)}
        >
          <div className="pt-qr-modal-body">
            <div className="pt-ticket-container">
              <div className="pt-ticket-card">
                {/* ── 1. ĐẦU VÉ: ICON ĂN MỪNG & TIÊU ĐỀ ── */}
                <div className="pt-ticket-head">
                  <div className="pt-ticket-popper-wrap" aria-hidden="true">
                    <span className="pt-ticket-popper-icon">🎉</span>
                  </div>
                  <h3 className="pt-ticket-title">Tem điện tử hợp lệ!</h3>
                  <p className="pt-ticket-sub">
                    Lô sầu riêng đã được cấp mã truy xuất nguồn gốc chính thức
                  </p>
                </div>

                {/* Đường gạch đứt ngăn cách mờ */}
                <div className="pt-ticket-sub-divider" aria-hidden="true" />

                {/* ── 2. THÔNG TIN LÔ HÀNG (PHÍA TRÊN) ── */}
                <div className="pt-ticket-body">
                  <div className="pt-ticket-grid">
                    <div className="pt-ticket-col">
                      <span className="pt-ticket-label">MÃ LÔ HÀNG</span>
                      <strong className="pt-ticket-val">{selectedLotForQr.lotCode}</strong>
                    </div>
                    <div className="pt-ticket-col pt-ticket-col-right">
                      <span className="pt-ticket-label">SẢN LƯỢNG</span>
                      <strong className="pt-ticket-val pt-ticket-val-accent">{formatKg(selectedLotForQr.weightKg)}</strong>
                    </div>

                    <div className="pt-ticket-col">
                      <span className="pt-ticket-label">NGÀY THU HOẠCH</span>
                      <strong className="pt-ticket-val">{formatDate(selectedLotForQr.harvestedOn)}</strong>
                    </div>
                    <div className="pt-ticket-col pt-ticket-col-right">
                      <span className="pt-ticket-label">THỊ TRƯỜNG</span>
                      <strong className="pt-ticket-val">{selectedLotForQr.market}</strong>
                    </div>
                  </div>

                  {/* Thẻ đơn vị hợp tác / chứng nhận (kiểu thẻ Mastercard trong ảnh mẫu) */}
                  <div className="pt-ticket-entity-box">
                    <div className="pt-ticket-entity-badge" aria-hidden="true">
                      <span className="pt-ticket-badge-circle pt-badge-green">PUC</span>
                      <span className="pt-ticket-badge-circle pt-badge-gold">VG</span>
                    </div>
                    <div className="pt-ticket-entity-info">
                      <div className="pt-ticket-entity-name">{selectedLotForQr.buyer}</div>
                      <div className="pt-ticket-entity-meta">Vùng trồng PUC-KRB-001 · VietGAP</div>
                    </div>
                  </div>
                </div>

                {/* ── 3. ĐƯỜNG RÃNH XÉ VÉ (NOTCHES 2 BÊN & ĐƯỜNG ĐỨT NÉT) ── */}
                <div className="pt-ticket-perforation">
                  <div className="pt-ticket-notch pt-ticket-notch-l" aria-hidden="true" />
                  <div className="pt-ticket-dash-line" aria-hidden="true" />
                  <div className="pt-ticket-notch pt-ticket-notch-r" aria-hidden="true" />
                </div>

                {/* ── 4. CUỐNG VÉ: MÃ QR CODE (NẰM Ở VỊ TRÍ MÃ BARCODE TRONG ẢNH MẪU) ── */}
                <div className="pt-ticket-stub">
                  <div className="pt-ticket-qr-wrap">
                    <div className="pt-qr-frame">
                      <TicketQrImage lotCode={selectedLotForQr.lotCode} qrCode={selectedLotForQr.qrCode} />
                    </div>
                    <div className="pt-ticket-barcode-num">
                      <span>{selectedLotForQr.qrCode || selectedLotForQr.lotCode}</span>
                    </div>
                    <p className="pt-ticket-scan-hint">
                      Quét mã QR để kiểm tra nguồn gốc & nhật ký canh tác
                    </p>
                  </div>
                </div>

                {/* ── 5. CẠNH RĂNG CƯA ĐÁY VÉ (SCALLOPED BOTTOM TEETH) ── */}
                <div className="pt-ticket-scallop-bottom" aria-hidden="true">
                  <svg viewBox="0 0 320 14" preserveAspectRatio="none" className="pt-ticket-scallop-svg">
                    <path
                      d="M0,0 L320,0 L320,2 A20,12 0 0,1 280,2 A20,12 0 0,1 240,2 A20,12 0 0,1 200,2 A20,12 0 0,1 160,2 A20,12 0 0,1 120,2 A20,12 0 0,1 80,2 A20,12 0 0,1 40,2 A20,12 0 0,1 0,2 Z"
                      fill="#ffffff"
                    />
                  </svg>
                </div>
              </div>

              {/* Nút hành động xem toàn bộ hồ sơ truy xuất */}
              <a
                href={`/trace/${encodeURIComponent(selectedLotForQr.lotCode)}`}
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
      )}

      {signboardPlot && (
        <GardenSignboardModal
          plot={signboardPlot}
          householdName={overview.data?.household.name || "Hộ nông dân Krông Búk"}
          onClose={() => setSignboardPlot(null)}
        />
      )}

      {mapViewPlot && (
        <PlotMapModal
          plot={mapViewPlot}
          householdName={overview.data?.household.name || "Hộ nông dân Krông Búk"}
          onClose={() => setMapViewPlot(null)}
          onOpenSignboard={(p) => {
            setMapViewPlot(null);
            setSignboardPlot(p);
          }}
        />
      )}
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
      margin: 1,
      width: 280,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then((url) => {
      if (active) setSrc(url);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [lotCode, qrCode]);

  if (!src) {
    return <QrCode size={145} strokeWidth={1.8} className="pt-qr-code-icon" aria-hidden="true" />;
  }

  return <img src={src} alt={`Mã QR ${lotCode}`} width={145} height={145} style={{ display: "block", borderRadius: 4 }} />;
}

interface HarvestAssetTagCardProps {
  lot: PortalHarvest;
  onOpenModal: () => void;
}

function HarvestAssetTagCard({ lot, onOpenModal }: HarvestAssetTagCardProps) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const status = HARVEST_STATUS[lot.status];

  useEffect(() => {
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}/trace/${encodeURIComponent(lot.qrCode || lot.lotCode)}`;

    QRCode.toDataURL(targetUrl, {
      margin: 1.5,
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
      .catch((err) => {
        console.error("Failed to generate asset QR code", err);
      });

    return () => {
      active = false;
    };
  }, [lot.qrCode, lot.lotCode]);

  return (
    <div className="pt-asset-card" data-status={lot.status}>
      {/* ── WATERMARK DẤU MỘC XUẤT HÀNG NẰM CHÉO THẺ ── */}
      <div className="pt-asset-watermark" aria-hidden="true">
        <div className="pt-asset-watermark-inner">
          <span className="pt-asset-watermark-title">
            {lot.status === "exported" || lot.status === "delivered" ? "ĐÃ XUẤT" : status.label}
          </span>
          <span className="pt-asset-watermark-sub">XUẤT KHO · EXPORTED</span>
        </div>
      </div>

      {/* ── BÊN TRÁI: THÔNG TIN LÔ HÀNG ── */}
      <div className="pt-asset-left">
        <div className="pt-asset-top-row">
          <div className="pt-asset-code-line">
            <span className="pt-asset-code-val">LÔ {lot.lotCode}</span>
            <span className="pt-asset-code-divider">·</span>
            <span className="pt-asset-weight-val">{formatKg(lot.weightKg)}</span>
          </div>
        </div>

        {/* Phần chân thẻ: ASSET ID & thông tin bên dưới */}
        <div className="pt-asset-footer">
          <div className="pt-asset-id-group">
            <span className="pt-asset-id-label">ASSET ID</span>
            <strong className="pt-asset-id-val">{lot.qrCode || lot.lotCode}</strong>
          </div>
          <div className="pt-asset-meta">
            <span>Ngày thu: {formatDate(lot.harvestedOn)}</span>
            <span className="pt-asset-meta-dot">·</span>
            <span>{lot.buyer} ({lot.market})</span>
          </div>
        </div>
      </div>

      {/* ── BÊN PHẢI: MÃ QR CODE VỪA BẤM ĐƯỢC VỪA QUÉT ĐƯỢC ── */}
      <div className="pt-asset-right">
        <button
          type="button"
          className="pt-asset-qr-btn"
          onClick={onOpenModal}
          title="Bấm để mở tem vé chi tiết hoặc dùng camera quét trực tiếp"
          aria-label={`Mã QR lô ${lot.lotCode} - Bấm để mở tem chi tiết`}
        >
          <div className="pt-asset-qr-box">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`Mã QR tra cứu lô ${lot.lotCode}`}
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
