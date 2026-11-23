"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  usePersistedEditableSelection,
  usePersistedRecordSelection,
  usePersistedState,
} from "@/lib/back-navigation";
import { lazyChunk } from "@/lib/lazy-chunk";

const LabTestCertificateModal = dynamic(
  () => lazyChunk(() => import("@/components/portal/LabTestCertificateModal")),
  { ssr: false },
);
const LabTestFormModal = dynamic(
  () => lazyChunk(() => import("@/components/admin/testing/LabTestFormModal")),
  { ssr: false },
);
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from "@/components/ui/chart-theme";
import { AreaTrend, CapsuleDonutChart, type DonutItem } from "@/components/ui/charts/KpiCharts";
import { Microscope } from "@/components/ui/PublicIcon";
import { useApiList } from "@/hooks/use-api";
import DeleteDialog from "@/components/admin/shared/DeleteDialog";
import Pagination from "@/components/admin/shared/Pagination";
import TableState from "@/components/admin/shared/TableState";
import { formatVn, percent } from "@/components/admin/shared/form-utils";
import { badgeOf, LAB_RESULT, optionsOf } from "@/components/admin/shared/labels";
import { useHouseholdOptions } from "@/components/admin/shared/options";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { usePerformanceTier } from "@/lib/network";
import { formatDate } from "@/utils/format";
import { isSafeMediaUrl } from "@/utils/url-safety";
import type { LabTestRecord } from "@/types/testing";

const PAGE_SIZE = 25;
const RESULT_OPTIONS = optionsOf(LAB_RESULT);

export default function Testing() {
  const { can } = useAuth();
  const perfTier = usePerformanceTier();
  const canCreate = can("testing", "create");
  const canUpdate = can("testing", "update");
  const canDelete = can("testing", "delete");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [resultFilter, setResultFilter] = usePersistedState("admin:testing:result", "");
  const [page, setPage] = usePersistedState("admin:testing:page", 1);

  const [deleting, setDeleting] = useState<LabTestRecord | null>(null);
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    let rafId = 0;
    let timerId = 0;
    if (perfTier === "lite") {
      timerId = window.setTimeout(() => setChartsReady(true), 48);
    } else {
      rafId = window.requestAnimationFrame(() => setChartsReady(true));
    }
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (timerId) window.clearTimeout(timerId);
    };
  }, [perfTier]);

  const list = useApiList<LabTestRecord>("testing", {
    q: debouncedSearch || undefined,
    result: resultFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const [selectedTest, setSelectedTest] = usePersistedRecordSelection(
    "admin:testing:selected",
    list.rows,
    (r) => r.id,
    list.loading,
  );
  const [editing, setEditing] = usePersistedEditableSelection(
    "admin:testing:edit",
    list.rows,
    (r) => r.id,
    list.loading,
  );
  const { options: householdOptions } = useHouseholdOptions(Boolean(editing) && (canCreate || canUpdate));

  const cdData = useMemo(
    () =>
      list.rows.slice(0, 8).map((r) => ({
        plot: r.plotCode || r.code,
        cd: Number(r.cdMgKg) || 0,
      })),
    [list.rows],
  );

  const residuePoints = useMemo(() => {
    const base = list.rows.slice(0, 8).map((r) => ({
      label: r.plotCode || r.code,
      value: Number(r.residueMgKg) || 0,
    }));
    if (base.length === 1) return [base[0], { label: `${base[0].label} (2)`, value: base[0].value }];
    return base;
  }, [list.rows]);

  const { passData, passRate } = useMemo(() => {
    const passCount = list.rows.filter((r) => r.result === "pass").length;
    const failCount = list.rows.filter((r) => r.result === "fail").length;
    const items: DonutItem[] = [
      { name: "Đạt chuẩn", value: passCount, color: "#10b981" },
      { name: "Không đạt", value: failCount, color: "#ef4444" },
    ];
    return {
      passData: items,
      passRate: percent(passCount, list.rows.length),
    };
  }, [list.rows]);

  const maxResidue = useMemo(
    () =>
      list.rows.reduce<{ code: string; val: number }>(
        (best, r) => (Number(r.residueMgKg) > best.val ? { code: r.plotCode || r.code, val: Number(r.residueMgKg) } : best),
        { code: "-", val: 0 },
      ),
    [list.rows],
  );

  const hasAnyFilter = Boolean(debouncedSearch || resultFilter);
  const isCompletelyEmpty = !list.loading && !list.error && list.total === 0 && !hasAnyFilter;

  return (
    <>
      {isCompletelyEmpty ? (
        <section className="admin-empty-stage" aria-label="Trạng thái phiếu kiểm nghiệm">
          <Microscope size={42} className="admin-empty-stage-icon" />
          <h2 className="admin-empty-stage-title">Chưa có phiếu kiểm nghiệm</h2>
          <p className="admin-empty-stage-desc">
            {canCreate
              ? "Lưu kết quả phân tích Cadimi, Vàng O và dư lượng thuốc BVTV để đối chiếu điều kiện an toàn trước thu hoạch."
              : "Kết quả phân tích Cadimi, Vàng O và dư lượng thuốc BVTV sẽ hiển thị tại đây ngay khi có mẫu kiểm nghiệm mới."}
          </p>
          {canCreate && (
            <div className="admin-empty-stage-actions">
              <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                Thêm phiếu kiểm nghiệm
              </button>
            </div>
          )}
        </section>
      ) : (
        canCreate && (
          <div className="page-header">
            <div className="header-actions">
              <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                Thêm phiếu kiểm nghiệm
              </button>
            </div>
          </div>
        )
      )}

      {list.rows.length > 0 && (
        <div className="charts-row-3">
          <div className="chart-card">
            <div className="chart-title">Cadmium (Cd), mg/kg</div>
            {chartsReady ? (
              <ResponsiveContainer width="100%" height={180} debounce={120}>
                <BarChart data={cdData} margin={{ left: -20, right: 12, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cdOkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#48bb78" stopOpacity={1} />
                      <stop offset="100%" stopColor="#2f855a" stopOpacity={0.88} />
                    </linearGradient>
                    <linearGradient id="cdBadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={1} />
                      <stop offset="100%" stopColor="#e0674a" stopOpacity={0.92} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="plot" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 0.06]}
                    ticks={[0, 0.015, 0.03, 0.045, 0.06]}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => (val === 0 ? "0" : String(val))}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "rgba(20, 55, 47, 0.04)", radius: 6 }}
                    formatter={(val: unknown) => [`${val} mg/kg`, "Hàm lượng Cd"]}
                    labelFormatter={(lbl) => `Khu vực: ${lbl}`}
                  />
                  <ReferenceLine
                    y={0.05}
                    stroke="#e0674a"
                    strokeDasharray="3 3"
                    strokeWidth={1.2}
                    strokeOpacity={0.75}
                  />
                  <Bar
                    dataKey="cd"
                    name="Cd (mg/kg)"
                    barSize={14}
                    radius={[4, 4, 0, 0]}
                    background={{ fill: "rgba(20, 55, 47, 0.04)", radius: 4 }}
                    isAnimationActive={perfTier !== "lite"}
                  >
                    {cdData.map((e, i) => (
                      <Cell key={i} fill={e.cd > 0.05 ? "url(#cdBadGrad)" : "url(#cdOkGrad)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180 }} aria-hidden="true" />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 12,
                fontSize: 10.5,
                color: "var(--text-muted)",
                marginTop: 8,
              }}
            >
              <span style={{ color: "#15803d", fontWeight: 500 }}>Đạt chuẩn (&le; 0.05)</span>
              <span style={{ color: "#b91c1c", fontWeight: 500 }}>Vượt chuẩn (&gt; 0.05)</span>
              <span style={{ color: "#9a6712", fontWeight: 500 }}>Ngưỡng GACC: 0.05 mg/kg</span>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">Dư lượng thuốc BVTV, ppm</div>
            {chartsReady ? (
              <AreaTrend
                data={residuePoints}
                unit=" ppm"
                formatValue={(v) => v.toFixed(2)}
                highlight="max"
                height={190}
                caption={
                  maxResidue.val > 0
                    ? `Mức cao nhất tại ${maxResidue.code}: ${maxResidue.val.toFixed(2)} ppm`
                    : ""
                }
                ariaLabel="Dư lượng thuốc BVTV theo mẫu"
              />
            ) : (
              <div style={{ height: 190 }} aria-hidden="true" />
            )}
          </div>

          <div className="chart-card">
            <div className="chart-title">Tỷ lệ mẫu đạt và không đạt</div>
            {chartsReady ? (
              <CapsuleDonutChart data={passData} unit=" mẫu" ariaLabel="Tỷ lệ mẫu kiểm nghiệm đạt chuẩn xuất khẩu" />
            ) : (
              <div style={{ height: 156 }} aria-hidden="true" />
            )}
            <div style={{ fontSize: 12, color: "#15803d", textAlign: "center", fontWeight: 600, marginTop: 8 }}>
              {formatVn(passRate, 1)}% mẫu đạt tiêu chuẩn xuất khẩu
            </div>
          </div>
        </div>
      )}

      {!isCompletelyEmpty && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo mã mẫu, tên hộ, mã thửa, phòng lab…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={resultFilter}
              aria-label="Lọc theo kết quả kiểm nghiệm"
              onChange={(e) => {
                setResultFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Mọi kết quả</option>
              {RESULT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-header-left">Kết quả kiểm nghiệm gần đây</div>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{list.total} mẫu kiểm nghiệm</span>
            </div>
            <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>Mã mẫu</th>
                    <th>Hộ / Thửa</th>
                    <th>Ngày lấy mẫu</th>
                    <th>Cd (mg/kg)</th>
                    <th>Vàng O</th>
                    <th>Dư lượng TBV</th>
                    <th>Chlorpyrifos</th>
                    <th>Kết quả</th>
                    <th>Đơn vị lab</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    colSpan={10}
                    loading={list.loading}
                    error={list.error}
                    empty={list.rows.length === 0}
                    emptyText="Không tìm thấy phiếu kiểm nghiệm nào"
                    onRetry={() => void list.refresh()}
                  />
                  {list.rows.map((t) => {
                    const resBadge = badgeOf(LAB_RESULT, t.result);
                    const chlorAbsent = t.chlorpyrifosMgKg === null || t.chlorpyrifosMgKg === undefined || Number(t.chlorpyrifosMgKg) === 0;
                    return (
                      <tr key={t.id}>
                        <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "#256b45", fontWeight: 600 }}>{t.code}</td>
                        <td style={{ fontSize: 12.5 }}>
                          <strong>{t.householdName}</strong> - <span style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}>{t.plotCode}</span>
                        </td>
                        <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(t.sampledOn)}</td>
                        <td
                          style={{
                            textAlign: "center",
                            color: Number(t.cdMgKg) > 0.05 ? "#c0392b" : "#256b45",
                            fontWeight: 600,
                          }}
                        >
                          {formatVn(t.cdMgKg, 3)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`badge ${!t.yellowOPositive ? "badge-green" : "badge-red"}`}>
                            {t.yellowOPositive ? "Dương tính" : "Âm tính"}
                          </span>
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color: Number(t.residueMgKg) > 0.1 ? "#c0392b" : "var(--text-primary)",
                            fontWeight: 500,
                          }}
                        >
                          {formatVn(t.residueMgKg, 3)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`badge ${chlorAbsent ? "badge-green" : "badge-red"}`}>
                            {chlorAbsent ? "KPH" : `${formatVn(t.chlorpyrifosMgKg, 3)}`}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${resBadge.badge}`}>{resBadge.label}</span>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          <div>{t.lab}</div>
                          {t.labAccreditationCode && (
                            <div
                              style={{
                                fontSize: 10.5,
                                color: "#166534",
                                fontFamily: "var(--font-num-stack)",
                                fontVariantNumeric: "tabular-nums",
                                marginTop: 2,
                              }}
                            >
                              {t.labAccreditationCode}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setSelectedTest(t)}
                            >
                              Xem phiếu
                            </button>
                            {isSafeMediaUrl(t.scanUrl) && (
                              <a
                                href={t.scanUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-sm"
                                style={{ textDecoration: "none" }}
                              >
                                Bản scan
                              </a>
                            )}
                            {canUpdate && (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(t)}>
                                Sửa
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(t)}>
                                Xóa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} unit="mẫu" onChange={setPage} />
            </div>
          </div>
        </>
      )}

      {selectedTest && <LabTestCertificateModal test={selectedTest} onClose={() => setSelectedTest(null)} />}

      {editing && (
        <LabTestFormModal
          initial={editing === "new" ? null : editing}
          householdOptions={householdOptions}
          onClose={() => setEditing(null)}
          onSaved={() => void list.refresh()}
        />
      )}

      {deleting && (
        <DeleteDialog
          title="Xóa phiếu kiểm nghiệm"
          message={
            <>
              Xóa phiếu kiểm nghiệm <strong>{deleting.code}</strong> của hộ <strong>{deleting.householdName}</strong> (thửa{" "}
              <code>{deleting.plotCode}</code>)?
            </>
          }
          path={`/testing/${deleting.id}`}
          successMessage={`Đã xóa phiếu kiểm nghiệm ${deleting.code}.`}
          onClose={() => setDeleting(null)}
          onDeleted={() => void list.refresh()}
        />
      )}
    </>
  );
}
