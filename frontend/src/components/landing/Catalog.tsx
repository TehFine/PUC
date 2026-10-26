"use client";

import { useMemo, useState } from "react";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { usePublic, type PublicCatalog, type PublicPesticide } from "./use-public";

type Tab = "pesticides" | "varieties" | "training";
type Filter = "all" | PublicPesticide["status"];

const STATUS_LABEL: Record<PublicPesticide["status"], string> = {
  allowed: "Được phép",
  restricted: "Hạn chế",
  banned: "Bị cấm",
};
const STATUS_TONE: Record<PublicPesticide["status"], string> = { allowed: "ok", restricted: "warn", banned: "bad" };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "allowed", label: "Được phép" },
  { id: "restricted", label: "Hạn chế" },
  { id: "banned", label: "Bị cấm" },
];

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("vi-VN");
};

function Status({ state, onRetry }: { state: "loading" | "error" | "empty"; onRetry?: () => void }) {
  if (state === "loading") return <SkeletonRows count={5} label="Đang tải dữ liệu từ hệ thống…" />;
  if (state === "error")
    return (
      <p className="lp-catalog-state">
        Chưa tải được dữ liệu từ hệ thống.{" "}
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Thử lại
          </button>
        )}
      </p>
    );
  return <p className="lp-catalog-state">Không có mục nào phù hợp.</p>;
}

/** Danh mục dùng chung (thuốc BVTV, giống, tập huấn) lấy trực tiếp từ hệ thống. */
export default function Catalog() {
  const { data, loading, error } = usePublic<PublicCatalog>("catalog");
  const [tab, setTab] = useState<Tab>("pesticides");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const pesticides = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.pesticides ?? []).filter(
      (item) => (filter === "all" || item.status === filter) && (!term || `${item.name} ${item.activeIngredient}`.toLowerCase().includes(term)),
    );
  }, [data, query, filter]);

  const counts = {
    pesticides: data?.pesticides.length,
    varieties: data?.varieties.length,
    training: data?.training.length,
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: "pesticides", label: "Thuốc bảo vệ thực vật" },
    { id: "varieties", label: "Giống cây" },
    { id: "training", label: "Tập huấn sắp tới" },
  ];

  const state = loading ? "loading" : error ? "error" : null;

  return (
    <div className="lp-catalog lp-glass">
      <div className="lp-tabs" role="tablist" aria-label="Danh mục tra cứu">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
            {item.label}
            {counts[item.id] !== undefined && <sup>{counts[item.id]}</sup>}
          </button>
        ))}
      </div>

      {state && <Status state={state} onRetry={() => window.location.reload()} />}

      {!state && tab === "pesticides" && (
        <>
          <div className="lp-catalog-tools">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên thuốc hoặc thành phần chính…" aria-label="Tìm thuốc bảo vệ thực vật" />
            <div className="lp-chips" role="group" aria-label="Lọc theo tình trạng">
              {FILTERS.map((item) => (
                <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? "on" : ""} onClick={() => setFilter(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {pesticides.length === 0 ? (
            <Status state="empty" />
          ) : (
            <div className="lp-table-wrap">
              <table className="lp-table">
                <thead>
                  <tr>
                    <th>Tên thuốc</th>
                    <th>Thành phần chính</th>
                    <th>Mức còn sót tối đa (mg/kg)</th>
                    <th>Cách ly (ngày)</th>
                    <th>Tình trạng</th>
                  </tr>
                </thead>
                <tbody>
                  {pesticides.map((item) => (
                    <tr key={`${item.name}-${item.activeIngredient}`} className={item.status === "banned" ? "is-banned" : ""}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.concentration && <small>{item.concentration}</small>}
                      </td>
                      <td>{item.activeIngredient}</td>
                      <td>{item.mrlMgKg ?? "—"}</td>
                      <td>{item.isolationDays ?? "—"}</td>
                      <td>
                        <em className={`lp-badge ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</em>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!state && tab === "varieties" &&
        (data?.varieties.length ? (
          <ul className="lp-cards">
            {data.varieties.map((item) => (
              <li key={item.name}>
                <strong>{item.name}</strong>
                {item.origin && <small>Nguồn gốc: {item.origin}</small>}
                <dl>
                  {item.weightRange && (
                    <div>
                      <dt>Trọng lượng trái</dt>
                      <dd>{item.weightRange}</dd>
                    </div>
                  )}
                  {item.harvestYears && (
                    <div>
                      <dt>Cho trái sau</dt>
                      <dd>{item.harvestYears}</dd>
                    </div>
                  )}
                </dl>
                {item.description && <p>{item.description}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Status state="empty" />
        ))}

      {!state && tab === "training" &&
        (data?.training.length ? (
          <ul className="lp-cards">
            {data.training.map((item) => (
              <li key={`${item.title}-${item.heldOn}`}>
                <span className="lp-label">
                  {formatDate(item.heldOn)}
                </span>
                <strong>{item.title}</strong>
                {item.location && <small>Địa điểm: {item.location}</small>}
                {item.trainer && <small>Giảng viên: {item.trainer}</small>}
                <small>
                  Đã đăng ký {item.enrolled}/{item.capacity}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lp-catalog-state">Hiện chưa có lớp tập huấn sắp diễn ra.</p>
        ))}
    </div>
  );
}
