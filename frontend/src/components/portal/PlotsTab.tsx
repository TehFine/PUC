"use client";

import { usePortal } from "@/hooks/use-portal";
import { formatKg, HARVEST_STATUS, PLOT_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalHarvest, PortalList, PortalPlots } from "@/types/portal";
import { Card, EmptyState, Pill, StateBlock } from "./ui";

const SOURCE_LABEL = { declared: "Tự khai báo", measured: "Đo thực địa", cadastral: "Địa chính", demo: "Mẫu" } as const;

export default function PlotsTab() {
  const plots = usePortal<PortalPlots>("plots");
  const harvest = usePortal<PortalList<PortalHarvest>>("harvest");

  return (
    <div className="pt-stack">
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

      <Card title="Sản lượng đã giao">
        <StateBlock loading={harvest.loading} error={harvest.error} />
        {harvest.data && harvest.data.data.length === 0 && <EmptyState icon="harvest">Chưa có lô thu hoạch nào của hộ bạn.</EmptyState>}
        {harvest.data && harvest.data.data.length > 0 && (
          <ul className="pt-list">
            {harvest.data.data.map((lot) => {
              const status = HARVEST_STATUS[lot.status];
              return (
                <li key={lot.id} className="pt-row pt-row-wrap">
                  <div className="pt-row-main">
                    <strong>{formatKg(lot.weightKg)}</strong>
                    <span>
                      Lô {lot.lotCode} · {formatDate(lot.harvestedOn)}
                    </span>
                    <span>
                      {lot.buyer} · {lot.market}
                    </span>
                  </div>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
