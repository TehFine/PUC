"use client";

import { usePortal } from "@/hooks/use-portal";
import { daysSince } from "@/lib/portal-labels";
import { AreaTrend, GaugeArc, SoftBars, type ChartPoint } from "@/components/ui/charts/KpiCharts";
import type { PortalHarvest, PortalJournalEntry, PortalList } from "@/types/portal";
import { Card } from "./ui";

const WEEKS = 6;
const pad = (n: number) => String(n).padStart(2, "0");

/** dd/MM của ngày cách hôm nay `back` ngày. */
function shortDate(back: number): string {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** Đếm số lần ghi nhật ký theo từng tuần (tuần cuối = 7 ngày gần nhất). */
function weeklyCounts(entries: PortalJournalEntry[]): number[] {
  const counts = new Array<number>(WEEKS).fill(0);
  for (const entry of entries) {
    const days = daysSince(entry.entryOn);
    if (days === null || days < 0) continue;
    const week = Math.floor(days / 7);
    if (week < WEEKS) counts[WEEKS - 1 - week] += 1;
  }
  return counts;
}

/** Biểu đồ trang chủ hộ dân — toàn bộ lấy từ nhật ký và các lô giao HTX của chính hộ đó. */
export default function HomeCharts() {
  const journal = usePortal<PortalList<PortalJournalEntry>>("journal");
  const harvest = usePortal<PortalList<PortalHarvest>>("harvest");

  const entries = journal.data?.data ?? [];
  const counts = weeklyCounts(entries);
  const activity: ChartPoint[] = counts.map((value, i) => ({ label: shortDate((WEEKS - i) * 7 - 1), value }));
  const hasActivity = journal.data !== null;
  const activeWeeks = counts.slice(-4).filter((c) => c > 0).length;

  const lots = [...(harvest.data?.data ?? [])]
    .sort((a, b) => a.harvestedOn.localeCompare(b.harvestedOn))
    .slice(-6)
    .map((lot) => {
      const [, month, day] = lot.harvestedOn.split("-");
      return { label: `${day}/${month}`, value: lot.weightKg };
    });
  const formatKgValue = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

  if (!hasActivity && lots.length === 0) return null;

  return (
    <div className="pt-charts">
      {hasActivity && (
        <Card title="Hoạt động canh tác">
          <p className="pt-chart-sub">Số lần ghi nhật ký theo tuần, {WEEKS} tuần gần nhất</p>
          <div className="pt-chart is-bleed">
            <AreaTrend data={activity} tone="lime" unit=" lần" highlight="last" height={170} caption="Tần suất ghi nhận đều đặn giúp đảm bảo tiêu chuẩn VietGAP" ariaLabel="Số lần ghi nhật ký theo tuần" />
          </div>
        </Card>
      )}

      {lots.length > 0 && (
        <Card title="Sản lượng giao HTX">
          <p className="pt-chart-sub">Khối lượng từng lô (kg)</p>
          <div className="pt-chart is-bleed">
            <SoftBars data={lots} tone="ink" unit=" kg" highlight="max" height={160} formatValue={formatKgValue} ariaLabel="Khối lượng từng lô giao HTX" />
          </div>
        </Card>
      )}

      {hasActivity && (
        <Card title="Nhịp ghi nhật ký">
          <p className="pt-chart-sub">Số tuần có ghi nhật ký trong 4 tuần qua</p>
          <div className="pt-chart is-gauge">
            <GaugeArc
              value={Math.round((activeWeeks / 4) * 100)}
              caption={`${activeWeeks}/4 tuần`}
              tone="lime"
              ariaLabel="Nhịp ghi nhật ký"
            />
          </div>
        </Card>
      )}
    </div>
  );
}
