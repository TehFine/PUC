"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useApi, useApiList } from "@/hooks/use-api";
import {
  ADMIN_LAST_URL_KEY,
  readInitialUrlSubTab,
  usePersistedEditableSelection,
  usePersistedRecordSelection,
  usePersistedState,
  useUrlSubTab,
} from "@/lib/back-navigation";
import {
  acknowledgeAdminEntity,
  acknowledgeAdminScope,
  useAdminNotificationBadges,
  useAutoAcknowledgeAdminScope,
} from "@/lib/notification-badges";
import { daysSince } from "@/lib/portal-labels";
import BlockState from "@/components/admin/shared/BlockState";
import {
  ADMIN_JOURNAL_TAB_EVENT,
  consumePendingJournalTab,
  type AdminJournalTabId,
} from "@/components/admin/shared/counts-events";
import DeleteDialog from "@/components/admin/shared/DeleteDialog";
import Pagination from "@/components/admin/shared/Pagination";
import TabBar, { type TabItem } from "@/components/admin/shared/TabBar";
import { formatVn } from "@/components/admin/shared/form-utils";
import { badgeOf, MRL_STATUS, optionsOf, SEVERITY, VIOLATION_STATUS } from "@/components/admin/shared/labels";
import { useHouseholdOptions, usePesticideOptions } from "@/components/admin/shared/options";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { getZoneColor } from "@/components/zones/zone-data";
import {
  HouseholdLogbookExportModal,
  JournalDetailModal,
  JournalFormModal,
} from "@/components/admin/journal/JournalModals";
import SprayFormModal, { SprayDetailModal } from "@/components/admin/journal/SprayFormModal";
import {
  ViolationDetailModal,
  ViolationFormModal,
  ViolationResolveModal,
} from "@/components/admin/journal/ViolationModals";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { extractSafeMediaUrls, MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { formatDate } from "@/utils/format";
import type { DashboardSummary } from "@/types/dashboard";
import type { JournalRow, SprayRow, ViolationRow } from "@/types/journal";

type Tab = AdminJournalTabId;
const PAGE_SIZE = 25;

const SEVERITY_OPTIONS = optionsOf(SEVERITY);
const VIOLATION_STATUS_OPTIONS = optionsOf(VIOLATION_STATUS);
const MRL_OPTIONS = optionsOf(MRL_STATUS);

interface AdminDiaryDayGroup<T> {
  date: string;
  label: string;
  householdCount: number;
  items: T[];
}

function normalizeDayKey(raw: string | null | undefined): string {
  if (!raw) return "0000-00-00";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw.trim();
}

function formatAdminDayLabel(isoDate: string): string {
  if (isoDate === "0000-00-00") return "Chưa rõ ngày";
  const formatted = formatDate(isoDate);
  const diff = daysSince(isoDate);
  if (diff === 0) return `Hôm nay, ${formatted}`;
  if (diff === 1) return `Hôm qua, ${formatted}`;
  return formatted;
}

function groupDiaryRowsByDay<T>(
  rows: T[],
  getDate: (row: T) => string,
  getHouseholdKey: (row: T) => number | string,
): AdminDiaryDayGroup<T>[] {
  const buckets = new Map<string, { items: T[]; households: Set<number | string> }>();
  for (const row of rows) {
    const key = normalizeDayKey(getDate(row));
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { items: [], households: new Set() };
      buckets.set(key, bucket);
    }
    bucket.items.push(row);
    bucket.households.add(getHouseholdKey(row));
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, bucket]) => ({
      date,
      label: formatAdminDayLabel(date),
      householdCount: bucket.households.size,
      items: bucket.items,
    }));
}

export default function Journal() {
  const { can } = useAuth();
  const canReadViolations = can("violations", "read");
  const canVerifyDiary = can("approvals", "read");
  const canExportReports = can("reports", "read");

  const canUpdateJournal = can("journal", "update");
  const canDeleteJournal = can("journal", "delete");

  const canCreateViolation = can("violations", "create");
  const canUpdateViolation = can("violations", "update");
  const canDeleteViolation = can("violations", "delete");

  const canUpdateSpray = can("spray", "update");
  const canDeleteSpray = can("spray", "delete");

  const isJournalTab = (raw: string): raw is Tab =>
    raw === "journal" || raw === "violations" || raw === "spray";

  const [tab, setTab] = useState<Tab>(
    () => consumePendingJournalTab() ?? readInitialUrlSubTab("sub", "journal", isJournalTab, ADMIN_LAST_URL_KEY),
  );

  const selectTab = useUrlSubTab<Tab>(
    "sub",
    tab,
    setTab,
    "journal",
    isJournalTab,
  );

  useEffect(() => {
    const onTab = (event: Event) => {
      const storedTab = consumePendingJournalTab();
      const next = (event as CustomEvent<Tab>).detail ?? storedTab;
      if (next) selectTab(next);
    };
    window.addEventListener(ADMIN_JOURNAL_TAB_EVENT, onTab);
    return () => window.removeEventListener(ADMIN_JOURNAL_TAB_EVENT, onTab);
  }, [selectTab]);

  // Filters & pagination for Journal
  const [jSearch, setJSearch] = useState("");
  const debouncedJSearch = useDebounced(jSearch);
  const [jHouseholdId, setJHouseholdId] = usePersistedState("admin:journal:hh", "");
  const [jPage, setJPage] = usePersistedState("admin:journal:page", 1);

  // Filters & pagination for Violations
  const [vSearch, setVSearch] = useState("");
  const debouncedVSearch = useDebounced(vSearch);
  const [vSeverity, setVSeverity] = usePersistedState("admin:violations:severity", "");
  const [vStatus, setVStatus] = usePersistedState("admin:violations:status", "");
  const [vPage, setVPage] = usePersistedState("admin:violations:page", 1);

  // Filters & pagination for Spray
  const [sSearch, setSSearch] = useState("");
  const debouncedSSearch = useDebounced(sSearch);
  const [sMrl, setSMrl] = usePersistedState("admin:spray:mrl", "");
  const [sPage, setSPage] = usePersistedState("admin:spray:page", 1);

  const journalList = useApiList<JournalRow>("journal", {
    q: debouncedJSearch || undefined,
    householdId: jHouseholdId || undefined,
    page: jPage,
    pageSize: PAGE_SIZE,
  });

  const violationsList = useApiList<ViolationRow>(canReadViolations ? "violations" : null, {
    q: debouncedVSearch || undefined,
    severity: vSeverity || undefined,
    status: vStatus || undefined,
    page: vPage,
    pageSize: PAGE_SIZE,
  });

  const sprayList = useApiList<SprayRow>("spray", {
    q: debouncedSSearch || undefined,
    mrlStatus: sMrl || undefined,
    page: sPage,
    pageSize: PAGE_SIZE,
  });

  // Modals for Spray (chỉ tải danh mục thuốc BVTV khi cần mở biểu mẫu)
  const [viewingSpray, setViewingSpray] = usePersistedRecordSelection(
    "admin:spray:view",
    sprayList.rows,
    (r) => r.id,
    sprayList.loading,
  );
  const [editingSpray, setEditingSpray] = usePersistedRecordSelection(
    "admin:spray:edit",
    sprayList.rows,
    (r) => r.id,
    sprayList.loading,
  );
  const [deletingSpray, setDeletingSpray] = useState<SprayRow | null>(null);

  // Options for selectors
  const { households, options: householdOptions } = useHouseholdOptions();
  const { pesticides, options: pesticideOptions } = usePesticideOptions(Boolean(editingSpray));

  // Dashboard summary
  const { data: summary, refresh: refreshSummary } = useApi<DashboardSummary>("/dashboard/summary");

  // Compute real KPIs from summary & loaded lists (no hardcoded numbers)
  const qualifiedHouseholds =
    summary?.counts?.qualifiedHouseholds ?? households.filter((h) => h.status === "qualified").length;
  const improveHouseholds = useMemo(() => {
    const raw = summary?.householdStatus;
    if (Array.isArray(raw)) {
      let sum = 0;
      for (const item of raw) {
        if (item && (item.status === "improve" || item.status === "pending")) {
          sum += Number(item.count) || 0;
        }
      }
      return sum;
    }
    if (raw && typeof raw === "object") {
      return (Number(raw.improve) || 0) + (Number(raw.pending) || 0);
    }
    return households.filter((h) => h.status === "improve" || h.status === "pending").length;
  }, [summary?.householdStatus, households]);
  const openViolations =
    summary?.counts?.openViolations ??
    (canReadViolations ? violationsList.rows.filter((v) => v.status === "open").length : 0);
  const journalRecent = summary?.counts?.journalLast30Days ?? journalList.total;

  // Modals for Journal
  const [viewingJournal, setViewingJournal] = usePersistedRecordSelection(
    "admin:journal:view",
    journalList.rows,
    (r) => r.id,
    journalList.loading,
  );
  const [editingJournal, setEditingJournal] = usePersistedRecordSelection(
    "admin:journal:edit",
    journalList.rows,
    (r) => r.id,
    journalList.loading,
  );
  const [deletingJournal, setDeletingJournal] = useState<JournalRow | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTargetHouseholdId, setExportTargetHouseholdId] = useState<string>("");

  // Modals for Violations
  const [viewingViolation, setViewingViolation] = usePersistedRecordSelection(
    "admin:violations:view",
    violationsList.rows,
    (r) => r.id,
    violationsList.loading,
  );
  const [resolvingViolation, setResolvingViolation] = usePersistedRecordSelection(
    "admin:violations:resolve",
    violationsList.rows,
    (r) => r.id,
    violationsList.loading,
  );
  const [editingViolation, setEditingViolation] = usePersistedEditableSelection(
    "admin:violations:edit",
    violationsList.rows,
    (r) => r.id,
    violationsList.loading,
  );
  const [deletingViolation, setDeletingViolation] = useState<ViolationRow | null>(null);
  const [previewMedia, setPreviewMedia] = usePersistedState<{
    urls: string[];
    title: string;
    subtitle?: string;
  } | null>(
    "admin:journal:preview-media",
    null,
    (v): v is { urls: string[]; title: string; subtitle?: string } | null =>
      v === null || (typeof v === "object" && v !== null && Array.isArray((v as { urls?: unknown }).urls)),
  );

  const { getSubBadge } = useAdminNotificationBadges();

  const tabs: TabItem<Tab>[] = [
    {
      id: "journal",
      label: "Nhật ký canh tác",
      badge: journalList.total,
      pendingBadge: getSubBadge("journal", "journal"),
    },
    ...(canReadViolations
      ? [
          {
            id: "violations" as const,
            label: "Vi phạm",
            badge: openViolations || violationsList.total,
            pendingBadge: getSubBadge("journal", "violations"),
          },
        ]
      : []),
    {
      id: "spray",
      label: "Nhật ký phun thuốc",
      badge: sprayList.total,
      pendingBadge: getSubBadge("journal", "spray"),
    },
  ];

  const activeTab: Tab = !canReadViolations && tab === "violations" ? "journal" : tab;

  useAutoAcknowledgeAdminScope("journal", activeTab);

  useEffect(() => {
    const activeViolationId = viewingViolation?.id ?? resolvingViolation?.id;
    if (activeViolationId) {
      acknowledgeAdminEntity("journal", "violations", activeViolationId);
    }
  }, [viewingViolation?.id, resolvingViolation?.id]);

  useEffect(() => {
    if (viewingJournal?.id) {
      acknowledgeAdminScope("journal", "journal");
    }
  }, [viewingJournal?.id]);

  useEffect(() => {
    if (viewingSpray?.id) {
      acknowledgeAdminScope("journal", "spray");
    }
  }, [viewingSpray?.id]);

  const journalDayGroups = useMemo(
    () => groupDiaryRowsByDay(journalList.rows, (r) => r.entryOn, (r) => r.householdId || r.householdName),
    [journalList.rows],
  );

  const sprayDayGroups = useMemo(
    () => groupDiaryRowsByDay(sprayList.rows, (r) => r.sprayedOn, (r) => r.householdId || r.householdName),
    [sprayList.rows],
  );

  const openExportModalFromCurrentFilter = () => {
    if (jHouseholdId) {
      setExportTargetHouseholdId(jHouseholdId);
      setExportModalOpen(true);
      return;
    }
    if (activeTab === "journal" && jSearch.trim() && journalList.rows.length > 0) {
      const distinctHhIds = Array.from(
        new Set(journalList.rows.map((r) => r.householdId).filter((id) => Number(id) > 0)),
      );
      if (distinctHhIds.length === 1) {
        setExportTargetHouseholdId(String(distinctHhIds[0]));
        setExportModalOpen(true);
        return;
      }
    }
    if (activeTab === "spray" && sSearch.trim() && sprayList.rows.length > 0) {
      const distinctHhIds = Array.from(
        new Set(sprayList.rows.map((r) => r.householdId).filter((id) => Number(id) > 0)),
      );
      if (distinctHhIds.length === 1) {
        setExportTargetHouseholdId(String(distinctHhIds[0]));
        setExportModalOpen(true);
        return;
      }
    }
    setExportTargetHouseholdId("");
    setExportModalOpen(true);
  };

  return (
    <>
      {(canExportReports || (canReadViolations && canCreateViolation)) && (
        <div className="page-header">
          <div className="header-actions">
            {canExportReports && (
              <button type="button" className="btn btn-outline" onClick={openExportModalFromCurrentFilter}>
                Xuất sổ PDF
              </button>
            )}
            {canReadViolations && canCreateViolation && (
              <button type="button" className="btn btn-primary" onClick={() => setEditingViolation("new")}>
                Ghi nhận vi phạm
              </button>
            )}
          </div>
        </div>
      )}

      <div className="compliance-kpi" role="region" aria-label="Tổng hợp tuân thủ canh tác">
        <div className="comp-kpi-row ok">
          <span className="comp-kpi-label">Hộ đủ chuẩn xuất khẩu</span>
          <strong className="comp-kpi-num">{formatVn(qualifiedHouseholds)}</strong>
        </div>
        <div className="comp-kpi-row warn">
          <span className="comp-kpi-label">Hộ cần cải thiện, chờ duyệt</span>
          <strong className="comp-kpi-num">{formatVn(improveHouseholds)}</strong>
        </div>
        <div className="comp-kpi-row danger">
          <span className="comp-kpi-label">Vi phạm đang mở</span>
          <strong className="comp-kpi-num">{formatVn(openViolations)}</strong>
        </div>
        <div className="comp-kpi-row info">
          <span className="comp-kpi-label">Nhật ký 30 ngày</span>
          <strong className="comp-kpi-num">{formatVn(journalRecent)}</strong>
        </div>
      </div>

      <TabBar
        tabs={tabs}
        active={activeTab}
        onChange={selectTab}
        onActivate={(id) => acknowledgeAdminScope("journal", id)}
      />

      {activeTab === "journal" && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo hộ, mã thửa, hoạt động, người ghi…"
                value={jSearch}
                onChange={(e) => {
                  setJSearch(e.target.value);
                  setJPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={jHouseholdId}
              aria-label="Lọc theo hộ nông dân"
              onChange={(e) => {
                setJHouseholdId(e.target.value);
                setJPage(1);
              }}
            >
              <option value="">Tất cả hộ nông dân</option>
              {householdOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <BlockState
            loading={journalList.loading}
            error={journalList.error}
            empty={journalList.rows.length === 0}
            emptyText="Chưa có nhật ký canh tác nào phù hợp."
            variant="journal"
            onRetry={() => void journalList.refresh()}
          />

          {journalDayGroups.length > 0 && (
            <>
              <div className="admin-diary-day-groups">
                {journalDayGroups.map((group) => (
                  <section key={group.date} className="admin-diary-day-group" aria-label={`Nhật ký ngày ${group.label}`}>
                    <div className="admin-diary-day-head">
                      <span className="admin-diary-day-label">{group.label}</span>
                      <span className="admin-diary-day-count">
                        {group.householdCount > 1
                          ? `${group.householdCount} hộ, ${group.items.length} bản ghi`
                          : `${group.items.length} bản ghi`}
                      </span>
                    </div>
                    <ul className="admin-diary-day-card" role="list">
                      {group.items.map((j) => {
                        const zc = getZoneColor(j.plotCode);

                        return (
                          <li key={j.id}>
                            <button
                              type="button"
                              className="admin-diary-row"
                              onClick={() => setViewingJournal(j)}
                            >
                              <strong className="admin-diary-hh">{j.householdName}</strong>
                              <span className="admin-diary-right">
                                <span className="admin-diary-meta-stack">
                                  <span className="admin-diary-plot" style={{ color: zc.text }}>
                                    Thửa {j.plotCode}
                                  </span>
                                  <span
                                    className={`admin-diary-verify-sub ${
                                      j.verificationStatus === "verified" || j.trustLevel === 1 ? "is-verified" : ""
                                    }`}
                                    style={
                                      j.verificationStatus !== "verified" && j.trustLevel === 3
                                        ? { color: "#9a6712", fontWeight: 600 }
                                        : undefined
                                    }
                                  >
                                    {j.verificationStatus === "verified"
                                      ? "HTX đã xác minh"
                                      : j.trustLevel === 3
                                        ? "Cần đối chiếu thực địa"
                                        : j.trustLevel === 1
                                          ? "Xác thực thực địa cao"
                                          : "Tự khai báo"}
                                  </span>
                                </span>
                                <DetailArrowIcon className="admin-diary-arrow" size={20} />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
              <div className="admin-diary-pagination">
                <Pagination page={jPage} pageSize={PAGE_SIZE} total={journalList.total} unit="bản ghi" onChange={setJPage} />
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "violations" && canReadViolations && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo tiêu đề vi phạm, hộ, mã thửa…"
                value={vSearch}
                onChange={(e) => {
                  setVSearch(e.target.value);
                  setVPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={vSeverity}
              aria-label="Lọc theo mức độ vi phạm"
              onChange={(e) => {
                setVSeverity(e.target.value);
                setVPage(1);
              }}
            >
              <option value="">Mọi mức độ</option>
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={vStatus}
              aria-label="Lọc theo trạng thái vi phạm"
              onChange={(e) => {
                setVStatus(e.target.value);
                setVPage(1);
              }}
            >
              <option value="">Mọi trạng thái</option>
              {VIOLATION_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <BlockState
            loading={violationsList.loading}
            error={violationsList.error}
            empty={violationsList.rows.length === 0}
            emptyText="Không có vi phạm nào phù hợp."
            variant="warningFlag"
            onRetry={() => void violationsList.refresh()}
          />

          {violationsList.rows.length > 0 && (
            <>
              <div>
                {violationsList.rows.map((v) => {
                  const sev = badgeOf(SEVERITY, v.severity);
                  const st = badgeOf(VIOLATION_STATUS, v.status);
                  return (
                    <div key={v.id} className={`violation-item ${v.severity}`}>
                      <div className="violation-body">
                        <div className="violation-head">
                          <div className="violation-badges">
                            <span className={`badge ${sev.badge}`}>{sev.label}</span>
                            <span className={`badge ${st.badge}`}>{st.label}</span>
                          </div>
                          <div className="violation-title">{v.title}</div>
                        </div>
                        {v.description && <div className="violation-desc">{v.description}</div>}
                        {v.farmerResponse && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "8px 12px",
                              borderRadius: 6,
                              background: "#f3f7ee",
                              border: "1px solid #d4d4d2",
                              fontSize: 12.5,
                            }}
                          >
                            <strong>Giải trình của hộ:</strong> {v.farmerResponse}
                            {(() => {
                              const respUrls = extractSafeMediaUrls(v.farmerResponsePhotoUrls, v.farmerResponsePhotoUrl);
                              if (respUrls.length === 0) return null;
                              return (
                                <button
                                  type="button"
                                  style={{ marginLeft: 8, cursor: "pointer", border: "none", fontFamily: "inherit" }}
                                  className="badge badge-blue"
                                  onClick={() =>
                                    setPreviewMedia({
                                      urls: respUrls,
                                      title: v.householdLabel,
                                      subtitle: `Ảnh giải trình ngày ${formatDate(v.detectedOn)}`,
                                    })
                                  }
                                >
                                  {respUrls.length > 1 ? `Xem ảnh (${respUrls.length})` : "Xem ảnh"}
                                </button>
                              );
                            })()}
                          </div>
                        )}
                        {v.resolutionNotes && (
                          <div style={{ marginTop: 6, fontSize: 12.5, color: "#277a48" }}>
                            <strong>Kết quả xử lý ({formatDate(v.resolvedOn)}):</strong> {v.resolutionNotes}
                          </div>
                        )}
                        <div className="violation-meta">
                          <span>Hộ: {v.householdLabel}</span>
                          <span>Ngày: {formatDate(v.detectedOn)}</span>
                          <span>Thửa: {v.plotCode || "-"}</span>
                        </div>
                      </div>
                      <div className="violation-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingViolation(v)}>
                          Chi tiết
                        </button>
                        {canUpdateViolation && v.status === "open" && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setResolvingViolation(v)}>
                            Xử lý
                          </button>
                        )}
                        {canUpdateViolation && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingViolation(v)}>
                            Sửa
                          </button>
                        )}
                        {canDeleteViolation && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingViolation(v)}>
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="admin-diary-pagination">
                <Pagination
                  page={vPage}
                  pageSize={PAGE_SIZE}
                  total={violationsList.total}
                  unit="vi phạm"
                  onChange={setVPage}
                />
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "spray" && (
        <>
          <div className="filter-bar">
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <input
                type="text"
                className="filter-input"
                placeholder="Tìm theo hộ, tên thuốc BVTV, nguồn gốc…"
                value={sSearch}
                onChange={(e) => {
                  setSSearch(e.target.value);
                  setSPage(1);
                }}
              />
            </div>
            <select
              className="filter-select"
              value={sMrl}
              aria-label="Lọc theo trạng thái MRL"
              onChange={(e) => {
                setSMrl(e.target.value);
                setSPage(1);
              }}
            >
              <option value="">Mọi trạng thái MRL</option>
              {MRL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <BlockState
            loading={sprayList.loading}
            error={sprayList.error}
            empty={sprayList.rows.length === 0}
            emptyText="Chưa có nhật ký phun thuốc nào phù hợp."
            variant="sprayer"
            onRetry={() => void sprayList.refresh()}
          />

          {sprayDayGroups.length > 0 && (
            <>
              <div className="admin-diary-day-groups">
                {sprayDayGroups.map((group) => (
                  <section
                    key={group.date}
                    className="admin-diary-day-group"
                    aria-label={`Nhật ký phun thuốc ngày ${group.label}`}
                  >
                    <div className="admin-diary-day-head">
                      <span className="admin-diary-day-label">{group.label}</span>
                      <span className="admin-diary-day-count">
                        {group.householdCount > 1
                          ? `${group.householdCount} hộ, ${group.items.length} lần phun`
                          : `${group.items.length} lần phun`}
                      </span>
                    </div>
                    <ul className="admin-diary-day-card" role="list">
                      {group.items.map((s) => {
                        const zc = s.plotCode ? getZoneColor(s.plotCode) : null;

                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="admin-diary-row"
                              onClick={() => setViewingSpray(s)}
                            >
                              <strong className="admin-diary-hh">{s.householdName}</strong>
                              <span className="admin-diary-right">
                                <span className="admin-diary-meta-stack">
                                  <span
                                    className="admin-diary-plot"
                                    style={zc ? { color: zc.text } : undefined}
                                  >
                                    {s.plotCode ? `Thửa ${s.plotCode}` : "Toàn vườn"}
                                  </span>
                                  <span
                                    className={`admin-diary-verify-sub ${
                                      s.verificationStatus === "verified" || s.trustLevel === 1 ? "is-verified" : ""
                                    }`}
                                    style={
                                      s.verificationStatus !== "verified" && s.trustLevel === 3
                                        ? { color: "#9a6712", fontWeight: 600 }
                                        : undefined
                                    }
                                  >
                                    {s.verificationStatus === "verified"
                                      ? "HTX đã xác minh"
                                      : s.trustLevel === 3
                                        ? "Cần đối chiếu thực địa"
                                        : s.trustLevel === 1
                                          ? "Xác thực thực địa cao"
                                          : "Tự khai báo"}
                                  </span>
                                </span>
                                <DetailArrowIcon className="admin-diary-arrow" size={20} />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
              <div className="admin-diary-pagination">
                <Pagination page={sPage} pageSize={PAGE_SIZE} total={sprayList.total} unit="lần phun" onChange={setSPage} />
              </div>
            </>
          )}
        </>
      )}

      {viewingJournal && (
        <JournalDetailModal
          entry={viewingJournal}
          canVerify={canVerifyDiary}
          onVerified={() => void journalList.refresh()}
          onClose={() => setViewingJournal(null)}
          onExportHousehold={
            canExportReports && viewingJournal.householdId
              ? () => {
                const hhId = String(viewingJournal.householdId);
                setViewingJournal(null);
                setExportTargetHouseholdId(hhId);
                setExportModalOpen(true);
              }
              : undefined
          }
          onEdit={
            canUpdateJournal
              ? () => {
                const row = viewingJournal;
                setViewingJournal(null);
                setEditingJournal(row);
              }
              : undefined
          }
          onDelete={
            canDeleteJournal
              ? () => {
                const row = viewingJournal;
                setViewingJournal(null);
                setDeletingJournal(row);
              }
              : undefined
          }
        />
      )}

      {viewingSpray && (
        <SprayDetailModal
          record={viewingSpray}
          canVerify={canVerifyDiary}
          onVerified={() => void sprayList.refresh()}
          onClose={() => setViewingSpray(null)}
          onExportHousehold={
            canExportReports && viewingSpray.householdId
              ? () => {
                const hhId = String(viewingSpray.householdId);
                setViewingSpray(null);
                setExportTargetHouseholdId(hhId);
                setExportModalOpen(true);
              }
              : undefined
          }
          onEdit={
            canUpdateSpray
              ? () => {
                const row = viewingSpray;
                setViewingSpray(null);
                setEditingSpray(row);
              }
              : undefined
          }
          onDelete={
            canDeleteSpray
              ? () => {
                const row = viewingSpray;
                setViewingSpray(null);
                setDeletingSpray(row);
              }
              : undefined
          }
        />
      )}

      {editingJournal && (
        <JournalFormModal
          initial={editingJournal}
          householdOptions={householdOptions}
          onClose={() => setEditingJournal(null)}
          onSaved={() => {
            void journalList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {deletingJournal && (
        <DeleteDialog
          title="Xóa nhật ký canh tác"
          message={
            <>
              Xóa nhật ký canh tác ngày <strong>{formatDate(deletingJournal.entryOn)}</strong> của hộ{" "}
              <strong>{deletingJournal.householdName}</strong>?
            </>
          }
          path={`/journal/${deletingJournal.id}`}
          successMessage="Đã xóa nhật ký canh tác."
          onClose={() => setDeletingJournal(null)}
          onDeleted={() => {
            void journalList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {exportModalOpen && (
        <HouseholdLogbookExportModal
          householdOptions={householdOptions}
          households={households}
          initialHouseholdId={exportTargetHouseholdId || jHouseholdId}
          onClose={() => {
            setExportModalOpen(false);
            setExportTargetHouseholdId("");
          }}
        />
      )}

      {viewingViolation && (
        <ViolationDetailModal
          violation={viewingViolation}
          canUpdate={canUpdateViolation}
          onClose={() => setViewingViolation(null)}
          onResolve={() => {
            const row = viewingViolation;
            setViewingViolation(null);
            setResolvingViolation(row);
          }}
          onEdit={() => {
            const row = viewingViolation;
            setViewingViolation(null);
            setEditingViolation(row);
          }}
        />
      )}

      {resolvingViolation && (
        <ViolationResolveModal
          violation={resolvingViolation}
          onClose={() => setResolvingViolation(null)}
          onResolved={() => {
            void violationsList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {editingViolation && (
        <ViolationFormModal
          initial={editingViolation === "new" ? null : editingViolation}
          households={households}
          householdOptions={householdOptions}
          onClose={() => setEditingViolation(null)}
          onSaved={() => {
            void violationsList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {deletingViolation && (
        <DeleteDialog
          title="Xóa cảnh báo vi phạm"
          message={
            <>
              Xóa cảnh báo vi phạm <strong>{deletingViolation.title}</strong> ({deletingViolation.householdLabel})?
            </>
          }
          path={`/violations/${deletingViolation.id}`}
          successMessage="Đã xóa cảnh báo vi phạm."
          onClose={() => setDeletingViolation(null)}
          onDeleted={() => {
            void violationsList.refresh();
            void refreshSummary();
          }}
        />
      )}

      {editingSpray && (
        <SprayFormModal
          initial={editingSpray}
          householdOptions={householdOptions}
          pesticides={pesticides}
          pesticideOptions={pesticideOptions}
          onClose={() => setEditingSpray(null)}
          onSaved={() => void sprayList.refresh()}
        />
      )}

      {deletingSpray && (
        <DeleteDialog
          title="Xóa nhật ký phun thuốc"
          message={
            <>
              Xóa bản ghi phun thuốc <strong>{deletingSpray.pesticideName}</strong> của hộ{" "}
              <strong>{deletingSpray.householdName}</strong> ({formatDate(deletingSpray.sprayedOn)})?
            </>
          }
          path={`/spray/${deletingSpray.id}`}
          successMessage="Đã xóa nhật ký phun thuốc."
          onClose={() => setDeletingSpray(null)}
          onDeleted={() => void sprayList.refresh()}
        />
      )}

      {previewMedia && (
        <MediaBottomSheet
          urls={previewMedia.urls}
          title={previewMedia.title}
          subtitle={previewMedia.subtitle}
          onClose={() => setPreviewMedia(null)}
        />
      )}
    </>
  );
}
