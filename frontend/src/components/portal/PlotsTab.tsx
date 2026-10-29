"use client";

import { useState } from "react";
import { ArrowUpRight, QrCode } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import { formatKg, HARVEST_STATUS, PLOT_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalHarvest, PortalList, PortalPlots } from "@/types/portal";
import { Card, EmptyState, Pill, Sheet, StateBlock } from "./ui";

const SOURCE_LABEL = { declared: "Tự khai báo", measured: "Đo thực địa", cadastral: "Địa chính", demo: "Mẫu" } as const;

export default function PlotsTab() {
  const plots = usePortal<PortalPlots>("plots");
  const harvest = usePortal<PortalList<PortalHarvest>>("harvest");
  const [selectedLotForQr, setSelectedLotForQr] = useState<PortalHarvest | null>(null);

  return (
    <div className="pt-grid-2">
      <Card title="Thửa đất của tôi">
        <StateBlock loading={plots.loading} error={plots.error} />
        {plots.data && !plots.data.available && (
          <EmptyState icon="map">Dữ liệu bản đồ thửa đất chưa được bật trên hệ thống. Vui lòng liên hệ cán bộ HTX.</EmptyState>
        )}
        {plots.data?.available && plots.data.data.length === 0 && (
          <EmptyState icon="plot">Chưa có thửa đất nào được ghi nhận cho hộ của bạn. Bạn có thể gửi hồ sơ đăng ký thửa đất ở mục Hồ sơ.</EmptyState>
        )}
        {plots.data?.available && plots.data.data.length > 0 && (
          <ul className="pt-list">
            {plots.data.data.map((plot) => {
              const status = PLOT_STATUS[plot.status];
              return (
                <li key={plot.code} className="pt-row pt-row-wrap">
                  <div className="pt-row-main">
                    <strong>{plot.code}</strong>
                    <span>
                      {plot.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha
                      {plot.variety ? ` · ${plot.variety}` : ""}
                      {plot.plantedYear ? ` · trồng ${plot.plantedYear}` : ""}
                    </span>
                    <span>
                      {plot.zoneCode ? `Vùng ${plot.zoneCode} · ` : ""}
                      {SOURCE_LABEL[plot.source]}
                    </span>
                  </div>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Sản phẩm & Lô thu hoạch đã giao">
        <StateBlock loading={harvest.loading} error={harvest.error} />
        {harvest.data && harvest.data.data.length === 0 && <EmptyState icon="harvest">Chưa có lô thu hoạch nào của hộ bạn.</EmptyState>}
        {harvest.data && harvest.data.data.length > 0 && (
          <ul className="pt-list">
            {harvest.data.data.map((lot) => {
              const status = HARVEST_STATUS[lot.status];
              return (
                <li key={lot.id} className="pt-row pt-row-wrap pt-harvest-row">
                  <div className="pt-row-main">
                    <div className="pt-harvest-title-line">
                      <strong>{formatKg(lot.weightKg)}</strong>
                      <span className="pt-lot-code-tag">Lô {lot.lotCode}</span>
                    </div>
                    <span>
                      Ngày thu hoạch: {formatDate(lot.harvestedOn)}
                    </span>
                    <span>
                      {lot.buyer} · {lot.market}
                    </span>
                  </div>
                  <div className="pt-harvest-actions">
                    <button
                      type="button"
                      className="pt-qr-lot-btn"
                      onClick={() => setSelectedLotForQr(lot)}
                      title={`Xem mã QR truy xuất nguồn gốc lô ${lot.lotCode}`}
                      aria-label={`Mã QR lô ${lot.lotCode}`}
                    >
                      <QrCode size={14} strokeWidth={2.2} aria-hidden="true" />
                      <span>{lot.qrCode || "Mã QR"}</span>
                    </button>
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Sheet hiển thị chi tiết mã QR của từng lô sản phẩm của hộ */}
      {selectedLotForQr && (
        <Sheet
          title="Mã QR Truy Xuất Nguồn Gốc"
          onClose={() => setSelectedLotForQr(null)}
        >
          <div className="pt-qr-modal-body">
            <div className="pt-qr-modal-card">
              <div className="pt-qr-badge">
                <QrCode size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>TEM ĐIỆN TỬ VÙNG TRỒNG PUC</span>
              </div>
              <h3 className="pt-qr-modal-title">Sầu Riêng Krông Búk</h3>
              <p className="pt-qr-modal-sub">
                Lô sản phẩm: <strong>{selectedLotForQr.lotCode}</strong>
                {selectedLotForQr.qrCode ? ` · Mã tem: ${selectedLotForQr.qrCode}` : ""}
              </p>

              <div className="pt-qr-visual-box">
                <div className="pt-qr-frame">
                  <QrCode size={150} strokeWidth={1.8} className="pt-qr-code-icon" aria-hidden="true" />
                  <div className="pt-qr-center-tag">PUC</div>
                </div>
                <div className="pt-qr-code-text">{selectedLotForQr.qrCode || selectedLotForQr.lotCode}</div>
              </div>

              <div className="pt-qr-meta-grid">
                <div className="pt-qr-meta-item">
                  <span className="pt-qr-meta-label">Sản lượng đóng góp</span>
                  <strong className="pt-qr-meta-val">{formatKg(selectedLotForQr.weightKg)}</strong>
                </div>
                <div className="pt-qr-meta-item">
                  <span className="pt-qr-meta-label">Ngày thu hoạch</span>
                  <strong className="pt-qr-meta-val">{formatDate(selectedLotForQr.harvestedOn)}</strong>
                </div>
                <div className="pt-qr-meta-item">
                  <span className="pt-qr-meta-label">Đơn vị thu mua</span>
                  <strong className="pt-qr-meta-val">{selectedLotForQr.buyer}</strong>
                </div>
                <div className="pt-qr-meta-item">
                  <span className="pt-qr-meta-label">Thị trường xuất khẩu</span>
                  <strong className="pt-qr-meta-val">{selectedLotForQr.market}</strong>
                </div>
              </div>

              <a
                href={`/trace/${encodeURIComponent(selectedLotForQr.lotCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pt-btn pt-btn-primary pt-qr-open-btn"
              >
                <span>Xem toàn bộ hồ sơ truy xuất nguồn gốc</span>
                <ArrowUpRight size={16} strokeWidth={2.4} aria-hidden="true" />
              </a>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
