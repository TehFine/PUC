"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { PESTICIDE_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PesticideDto, TrainingDto, VarietyDto } from "@/types/api";
import { Card, EmptyState, Pill, StateBlock } from "./ui";

const keepTraining = (item: TrainingDto) => item;
const keepPesticide = (item: PesticideDto) => item;
const keepVariety = (item: VarietyDto) => item;

type View = "training" | "pesticides" | "varieties";

function TrainingList() {
  const { data, loading, error } = useResource<TrainingDto, TrainingDto>("training", keepTraining);
  const upcoming = data.filter((item) => !item.completed);
  const done = data.filter((item) => item.completed);
  return (
    <>
      <Card title="Lớp tập huấn sắp diễn ra">
        <StateBlock loading={loading} error={error} />
        {!loading && !error && upcoming.length === 0 && <EmptyState icon="learn">Chưa có lớp tập huấn nào sắp diễn ra.</EmptyState>}
        <ul className="pt-list">
          {upcoming.map((item) => (
            <li key={item.id} className="pt-row">
              <div className="pt-date">{formatDate(item.heldOn)}</div>
              <div className="pt-row-main">
                <strong>{item.title}</strong>
                <span>
                  {item.location ?? "—"} · {item.trainer ?? "—"}
                </span>
                <span>
                  Đã đăng ký {item.enrolled}/{item.capacity} chỗ
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {done.length > 0 && (
        <Card title="Đã hoàn thành">
          <ul className="pt-list">
            {done.map((item) => (
              <li key={item.id} className="pt-row">
                <div className="pt-row-main">
                  <strong>{item.title}</strong>
                  <span>{item.trainer ?? "—"}</span>
                </div>
                <Pill tone="gray">Đã diễn ra</Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function PesticideList() {
  const { data, loading, error } = useResource<PesticideDto, PesticideDto>("pesticides", keepPesticide);
  const [query, setQuery] = useState("");
  const shown = data.filter((item) => `${item.name} ${item.activeIngredient}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Card title="Danh mục thuốc BVTV">
      <input className="pt-search" type="search" placeholder="Tìm theo tên thuốc hoặc hoạt chất" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm thuốc" />
      <StateBlock loading={loading} error={error} />
      <ul className="pt-list">
        {shown.map((item) => {
          const status = PESTICIDE_STATUS[item.status];
          return (
            <li key={item.id} className="pt-row pt-row-wrap">
              <div className="pt-row-main">
                <strong>{item.name}</strong>
                <span>
                  {item.activeIngredient}
                  {item.concentration ? ` · ${item.concentration}` : ""}
                </span>
                <span>
                  Cách ly {item.isolationDays ?? "—"} ngày · MRL {item.mrlMgKg ?? "—"} mg/kg
                </span>
              </div>
              <Pill tone={status.tone}>{status.label}</Pill>
            </li>
          );
        })}
      </ul>
      {!loading && !error && shown.length === 0 && <EmptyState icon="search">Không tìm thấy thuốc phù hợp.</EmptyState>}
    </Card>
  );
}

function VarietyList() {
  const { data, loading, error } = useResource<VarietyDto, VarietyDto>("varieties", keepVariety);
  return (
    <Card title="Giống sầu riêng">
      <StateBlock loading={loading} error={error} />
      <ul className="pt-list">
        {data.map((item) => (
          <li key={item.id} className="pt-row">
            <div className="pt-row-main">
              <strong>{item.name}</strong>
              <span>
                {item.origin ?? "—"}
                {item.weightRange ? ` · ${item.weightRange}` : ""}
                {item.harvestYears ? ` · thu hoạch sau ${item.harvestYears}` : ""}
              </span>
              {item.description && <span>{item.description}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function LearnTab() {
  const [view, setView] = useState<View>("training");
  const items: { id: View; label: string }[] = [
    { id: "training", label: "Tập huấn" },
    { id: "pesticides", label: "Thuốc BVTV" },
    { id: "varieties", label: "Giống cây" },
  ];

  return (
    <div className="pt-stack">
      <div className="pt-segmented" role="tablist" aria-label="Kiến thức">
        {items.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {view === "training" && <TrainingList />}
      {view === "pesticides" && <PesticideList />}
      {view === "varieties" && <VarietyList />}
    </div>
  );
}
