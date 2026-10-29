"use client";

import { useMemo, useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { PESTICIDE_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PesticideDto, TrainingDto, VarietyDto } from "@/types/api";
import { Card, EmptyState, Pill, StateBlock } from "./ui";
import {
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";

const keepTraining = (item: TrainingDto) => item;
const keepPesticide = (item: PesticideDto) => item;
const keepVariety = (item: VarietyDto) => item;

type View = "training" | "pesticides" | "varieties";
type StatusFilter = "all" | "allowed" | "restricted" | "banned";

function TrainingList() {
  const { data, loading, error } = useResource<TrainingDto, TrainingDto>("training", keepTraining);
  const upcoming = data.filter((item) => !item.completed);
  const done = data.filter((item) => item.completed);
  return (
    <div className="pt-grid-2">
      <Card title="Lớp tập huấn sắp diễn ra">
        <StateBlock loading={loading} error={error} />
        {!loading && !error && upcoming.length === 0 && (
          <EmptyState icon="learn">Chưa có lớp tập huấn nào sắp diễn ra.</EmptyState>
        )}
        <div className="pt-pest-list">
          {upcoming.map((item) => (
            <article key={item.id} className="pt-training-card">
              <div className="pt-training-date">
                <Calendar size={13} style={{ display: "inline", marginRight: 4 }} />
                <div>{formatDate(item.heldOn)}</div>
              </div>
              <div className="pt-training-main">
                <h3 className="pt-training-title">{item.title}</h3>
                <div className="pt-training-details">
                  <div className="pt-training-detail-row">
                    <MapPin size={13} color="#64748b" />
                    <span>{item.location ?? "—"}</span>
                  </div>
                  <div className="pt-training-detail-row">
                    <UserCheck size={13} color="#64748b" />
                    <span>Giảng viên: {item.trainer ?? "—"}</span>
                  </div>
                  <div className="pt-training-badge-slot">
                    Đã đăng ký {item.enrolled}/{item.capacity} chỗ
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
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
    </div>
  );
}

function PesticideList() {
  const { data, loading, error } = useResource<PesticideDto, PesticideDto>("pesticides", keepPesticide);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const counts = useMemo(() => {
    return {
      all: data.length,
      allowed: data.filter((d) => d.status === "allowed").length,
      restricted: data.filter((d) => d.status === "restricted").length,
      banned: data.filter((d) => d.status === "banned").length,
    };
  }, [data]);

  const shown = useMemo(() => {
    return data.filter((item) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        `${item.name} ${item.activeIngredient} ${item.manufacturer ?? ""}`
          .toLowerCase()
          .includes(q);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [data, query, statusFilter]);

  return (
    <Card
      title="Danh mục thuốc BVTV"
      action={
        <span className="pt-badge-alert" style={{ background: "rgba(22, 163, 74, 0.12)", color: "#15803d" }}>
          {shown.length} loại
        </span>
      }
    >
      <div className="pt-pest-wrap">
        {/* Hộp tìm kiếm */}
        <div className="pt-pest-search-box">
          <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
          <input
            className="pt-pest-search-input"
            type="search"
            placeholder="Tìm theo tên thuốc, hoạt chất hoặc hãng..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm kiếm thuốc bảo vệ thực vật"
          />
          {query && (
            <button
              type="button"
              className="pt-pest-search-clear"
              onClick={() => setQuery("")}
              aria-label="Xóa từ khóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Thanh filter trạng thái */}
        <div className="pt-pest-filter-bar" role="tablist" aria-label="Lọc theo trạng thái thuốc">
          <button
            type="button"
            className={`pt-pest-filter-chip ${statusFilter === "all" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            Tất cả <span className="pt-pest-filter-count">{counts.all}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-allowed ${statusFilter === "allowed" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("allowed")}
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            Được phép <span className="pt-pest-filter-count">{counts.allowed}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-restricted ${statusFilter === "restricted" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("restricted")}
          >
            <AlertTriangle size={13} aria-hidden="true" />
            Hạn chế <span className="pt-pest-filter-count">{counts.restricted}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-banned ${statusFilter === "banned" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("banned")}
          >
            <Ban size={13} aria-hidden="true" />
            Bị cấm <span className="pt-pest-filter-count">{counts.banned}</span>
          </button>
        </div>

        {/* Dòng trạng thái lọc */}
        {(statusFilter !== "all" || query.trim()) && (
          <div className="pt-pest-summary-bar">
            <span>
              Đang hiển thị <strong>{shown.length}</strong> / {data.length} loại thuốc
            </span>
            <button
              type="button"
              className="pt-pest-reset-btn"
              onClick={() => {
                setStatusFilter("all");
                setQuery("");
              }}
            >
              Đặt lại bộ lọc
            </button>
          </div>
        )}

        <StateBlock loading={loading} error={error} />

        {/* Danh sách thẻ thuốc trực quan */}
        <div className="pt-pest-list">
          {shown.map((item) => {
            const status = PESTICIDE_STATUS[item.status];
            const isAllowed = item.status === "allowed";
            const isRestricted = item.status === "restricted";
            const isBanned = item.status === "banned";

            return (
              <article key={item.id} className={`pt-pest-card pt-pest-card-${item.status}`}>
                {/* Phần trên: Tên thương phẩm + Huy hiệu trạng thái */}
                <div className="pt-pest-card-top">
                  <div className="pt-pest-card-identity">
                    <h3 className="pt-pest-card-name">{item.name}</h3>
                    <div className="pt-pest-card-ing-wrap">
                      <span className="pt-pest-card-ing-label">Hoạt chất:</span>
                      <strong className="pt-pest-card-ing-val">{item.activeIngredient}</strong>
                      {item.concentration && <span className="pt-pest-card-conc">{item.concentration}</span>}
                      {item.manufacturer && <span className="pt-pest-card-mfg">· {item.manufacturer}</span>}
                    </div>
                  </div>

                  <div className={`pt-pest-status-badge pt-pest-status-${item.status}`}>
                    {isAllowed && <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden="true" />}
                    {isRestricted && <AlertTriangle size={13} strokeWidth={2.4} aria-hidden="true" />}
                    {isBanned && <Ban size={13} strokeWidth={2.4} aria-hidden="true" />}
                    <span>{status.label}</span>
                  </div>
                </div>

                {/* Phần dưới: Lưới 2 ô thông số kỹ thuật (Cách ly & MRL) */}
                <div className="pt-pest-specs-grid">
                  <div className="pt-pest-spec-box">
                    <div className="pt-pest-spec-head">
                      <Clock size={12} className="pt-pest-spec-icon" aria-hidden="true" />
                      <span>Thời gian cách ly</span>
                    </div>
                    <div className="pt-pest-spec-body">
                      {item.isolationDays != null ? (
                        <div className="pt-pest-spec-metric">
                          <span className="pt-pest-spec-val">{item.isolationDays}</span>
                          <span className="pt-pest-spec-unit">ngày</span>
                        </div>
                      ) : (
                        <span className="pt-pest-spec-empty">Không áp dụng</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-pest-spec-box">
                    <div className="pt-pest-spec-head">
                      <ShieldCheck size={12} className="pt-pest-spec-icon" aria-hidden="true" />
                      <span>Dư lượng tối đa (MRL)</span>
                    </div>
                    <div className="pt-pest-spec-body">
                      {item.mrlMgKg != null ? (
                        <div className="pt-pest-spec-metric">
                          <span className="pt-pest-spec-val">{item.mrlMgKg}</span>
                          <span className="pt-pest-spec-unit">mg/kg</span>
                        </div>
                      ) : (
                        <span className="pt-pest-spec-empty">Không áp dụng</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!loading && !error && shown.length === 0 && (
          <EmptyState icon="search">Không tìm thấy thuốc phù hợp với tiêu chí lọc.</EmptyState>
        )}
      </div>
    </Card>
  );
}

function VarietyList() {
  const { data, loading, error } = useResource<VarietyDto, VarietyDto>("varieties", keepVariety);
  return (
    <Card title="Giống sầu riêng">
      <StateBlock loading={loading} error={error} />
      <div className="pt-pest-list">
        {data.map((item) => (
          <article key={item.id} className="pt-variety-card">
            <div className="pt-variety-head">
              <h3 className="pt-variety-name">{item.name}</h3>
              {item.origin && (
                <span className="pt-variety-origin">
                  <MapPin size={11} /> {item.origin}
                </span>
              )}
            </div>
            <div className="pt-variety-specs">
              {item.weightRange && (
                <div className="pt-variety-spec">
                  <span>Trọng lượng:</span> <strong>{item.weightRange}</strong>
                </div>
              )}
              {item.harvestYears && (
                <div className="pt-variety-spec">
                  <span>Thu hoạch sau:</span> <strong>{item.harvestYears}</strong>
                </div>
              )}
            </div>
            {item.description && <p className="pt-variety-desc">{item.description}</p>}
          </article>
        ))}
      </div>
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
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
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
