"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { KpiChartView, renderKpiValue, type ChartPoint, type KpiChartSpec } from "@/components/ui/charts/KpiCharts";
import { useApiList } from "@/hooks/use-api";
import BlockState from "@/components/admin/shared/BlockState";
import DeleteDialog from "@/components/admin/shared/DeleteDialog";
import Pagination from "@/components/admin/shared/Pagination";
import { formatVn, percent, timeText } from "@/components/admin/shared/form-utils";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import TrainingFormModal from "@/components/admin/training/TrainingFormModal";
import TrainingRegistrationsModal from "@/components/admin/training/TrainingRegistrationsModal";
import { formatDate } from "@/utils/format";
import type { TrainingCourseRecord } from "@/types/training";

const PAGE_SIZE = 25;

export default function Training() {
  const { can } = useAuth();
  const canCreate = can("training", "create");
  const canUpdate = can("training", "update");
  const canDelete = can("training", "delete");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [completedFilter, setCompletedFilter] = useState("");
  const [page, setPage] = useState(1);

  const list = useApiList<TrainingCourseRecord>("training", {
    q: debouncedSearch || undefined,
    completed: completedFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const [editing, setEditing] = useState<TrainingCourseRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<TrainingCourseRecord | null>(null);
  const [registrationsCourse, setRegistrationsCourse] = useState<TrainingCourseRecord | null>(null);

  const kpis = useMemo<
    { val: string; label: string; sub: string; chart: KpiChartSpec }[]
  >(() => {
    const rows = list.rows;
    const totalCourses = list.total || rows.length;
    const completedCount = rows.filter((r) => r.completed).length;
    const totalEnrolled = rows.reduce((sum, r) => sum + (Number(r.enrolled) || 0), 0);
    const totalCapacity = rows.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0);
    const avgFill = percent(totalEnrolled, totalCapacity);
    const completedPct = percent(completedCount, Math.max(rows.length, 1));

    const barPoints: ChartPoint[] =
      rows.length > 0
        ? rows.slice(0, 6).map((c, idx) => ({
            label: `K${idx + 1}`,
            value: Number(c.enrolled) || 0,
          }))
        : [
            { label: "K1", value: 0 },
            { label: "K2", value: 0 },
          ];

    const areaPoints: ChartPoint[] =
      barPoints.length >= 2 ? barPoints : [...barPoints, { label: "K2", value: barPoints[0]?.value ?? 0 }];

    return [
      {
        val: String(totalCourses),
        label: "Khóa học tổ chức",
        sub: `${completedCount} khóa đã hoàn thành`,
        chart: { kind: "bars", tone: "lime", unit: " HV", highlight: "max", data: barPoints },
      },
      {
        val: formatVn(totalEnrolled),
        label: "Lượt nông dân đăng ký",
        sub: `${formatVn(avgFill, 1)}% quy mô tiếp nhận`,
        chart: {
          kind: "area",
          tone: "ink",
          unit: " lượt",
          highlight: "max",
          caption: `Tổng sức chứa ${formatVn(totalCapacity)} học viên`,
          data: areaPoints,
        },
      },
      {
        val: String(completedCount),
        label: "Khóa đã hoàn tất",
        sub: "VietGAP + GACC",
        chart: {
          kind: "gauge",
          tone: "lime",
          value: Math.round(completedPct),
          caption: `${completedCount}/${rows.length || 0} khóa`,
        },
      },
      {
        val: `${formatVn(avgFill, 0)}%`,
        label: "Tỷ lệ lấp đầy lớp",
        sub: `${totalEnrolled}/${totalCapacity || 0} học viên`,
        chart: {
          kind: "gauge",
          tone: "sky",
          value: Math.min(100, Math.round(avgFill)),
          caption: `${formatVn(totalEnrolled)} học viên`,
        },
      },
    ];
  }, [list.rows, list.total]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tập Huấn &amp; Đào Tạo</h1>
        </div>
        {canCreate && (
          <div className="header-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              Tạo khóa tập huấn
            </button>
          </div>
        )}
      </div>

      <div className="kpi-grid-4">
        {kpis.map(({ val, label, sub, chart }, i) => (
          <div key={i} className="kpi-card has-chart">
            <div className="kpi-head">
              <div className="kpi-val">{renderKpiValue(val)}</div>
              <div className="kpi-meta">
                <div className="kpi-label">{label}</div>
                <div className="kpi-trend up">{sub}</div>
              </div>
            </div>
            <KpiChartView chart={chart} label={label} />
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo tên khóa tập huấn, giảng viên, địa điểm…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="filter-select"
          value={completedFilter}
          aria-label="Lọc theo trạng thái khóa học"
          onChange={(e) => {
            setCompletedFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả khóa học</option>
          <option value="false">Sắp diễn ra / Đang mở ĐK</option>
          <option value="true">Đã hoàn thành</option>
        </select>
      </div>

      <BlockState
        loading={list.loading}
        error={list.error}
        empty={list.rows.length === 0}
        emptyText="Chưa có khóa tập huấn nào phù hợp."
        onRetry={() => void list.refresh()}
      />

      {list.rows.length > 0 && (
        <>
          <div className="training-grid">
            {list.rows.map((c) => {
              const progress = Math.min(100, Math.round(percent(c.enrolled, c.capacity)));
              const startStr = timeText(c.startsAt);
              const endStr = timeText(c.endsAt);
              const timeRange = startStr && endStr ? `${startStr} – ${endStr}` : startStr || endStr || "";
              return (
                <div key={c.id} className="training-card">
                  <div className="training-card-top">
                    <div className="training-card-title">{c.title}</div>
                    <div className="training-card-date" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className={`badge ${c.completed ? "badge-green" : "badge-blue"}`}>
                        {c.completed ? "Đã hoàn thành" : "Đang mở đăng ký"}
                      </span>
                      <span>
                        {formatDate(c.heldOn)}
                        {timeRange ? ` · ${timeRange}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="training-card-body">
                    <div className="training-card-row">
                      <span>Địa điểm</span>
                      <strong>{c.location || "—"}</strong>
                    </div>
                    <div className="training-card-row">
                      <span>Giảng viên</span>
                      <strong>{c.trainer || "—"}</strong>
                    </div>
                    <div className="training-card-row">
                      <span>Tham dự</span>
                      <strong>
                        {c.enrolled}/{c.capacity} người
                      </strong>
                    </div>
                    {c.description && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.45 }}>
                        {c.description}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 10.5,
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      >
                        <span>Tỷ lệ đăng ký</span>
                        <span style={{ color: "var(--green-700)", fontWeight: 600 }}>{progress}%</span>
                      </div>
                      <div className="training-progress">
                        <div className="training-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => setRegistrationsCourse(c)}
                      >
                        Danh sách đăng ký
                      </button>
                      {canUpdate && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(c)}>
                          Sửa
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(c)}>
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} unit="khóa học" onChange={setPage} />
          </div>
        </>
      )}

      {registrationsCourse && (
        <TrainingRegistrationsModal
          course={registrationsCourse}
          canUpdate={canUpdate}
          onClose={() => setRegistrationsCourse(null)}
          onChanged={() => void list.refresh()}
        />
      )}

      {editing && (
        <TrainingFormModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void list.refresh()}
        />
      )}

      {deleting && (
        <DeleteDialog
          title="Xóa khóa tập huấn"
          message={
            <>
              Xóa khóa tập huấn <strong>{deleting.title}</strong>? Danh sách đăng ký của khóa này cũng sẽ bị xóa.
            </>
          }
          path={`/training/${deleting.id}`}
          successMessage="Đã xóa khóa tập huấn."
          onClose={() => setDeleting(null)}
          onDeleted={() => void list.refresh()}
        />
      )}
    </>
  );
}
