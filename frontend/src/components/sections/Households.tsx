"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useApiList } from "@/hooks/use-api";
import BlockState from "@/components/admin/shared/BlockState";
import { requestSystemTab } from "@/components/admin/shared/counts-events";
import Pagination from "@/components/admin/shared/Pagination";
import DeletionRequestModal from "@/components/settings/DeletionRequestModal";
import { HOUSEHOLD_STATUS, optionsOf } from "@/components/admin/shared/labels";
import { useVillageOptions } from "@/components/admin/shared/options";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { getZoneColor, KNOWN_ZONES } from "@/components/zones/zone-data";
import {
  usePersistedEditableSelection,
  usePersistedRecordSelection,
  usePersistedState,
} from "@/lib/back-navigation";
import { lazyChunk } from "@/lib/lazy-chunk";
import type { DeletionRequestRecord } from "@/types/accounts";
import type { HouseholdRecord } from "@/types/households";

const BroadcastNoticeModal = dynamic(
  () => lazyChunk(() => import("@/components/admin/households/BroadcastNoticeModal")),
  { ssr: false },
);
const HouseholdAccountModal = dynamic(() => lazyChunk(() => import("@/components/admin/households/HouseholdAccountModal")), { ssr: false });
const HouseholdDetailModal = dynamic(() => lazyChunk(() => import("@/components/admin/households/HouseholdDetailModal")), { ssr: false });
const HouseholdFormModal = dynamic(() => lazyChunk(() => import("@/components/admin/households/HouseholdFormModal")), { ssr: false });
const HouseholdImportModal = dynamic(() => lazyChunk(() => import("@/components/admin/households/HouseholdImportModal")), { ssr: false });

const PAGE_SIZE = 25;
const STATUS_OPTIONS = optionsOf(HOUSEHOLD_STATUS);

function formatAreaLabel(villageName?: string | null, villageId?: number | null): string {
  const raw = (villageName || (villageId != null ? `Thôn #${villageId}` : "Chưa rõ địa bàn")).trim();
  return raw.replace(/\s*[—–]\s*/g, ", ");
}

export default function Households() {
  const { can } = useAuth();
  const canCreate = can("households", "create");
  const canUpdate = can("households", "update");
  const canDelete = can("households", "delete");
  const canReadDeletionRequests = can("deletion-requests", "read");
  const canBroadcastNotice = can("system-alerts", "create");

  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = usePersistedState("admin:households:zone", "");
  const debouncedSearch = useDebounced(search);
  const [villageId, setVillageId] = usePersistedState("admin:households:village", "");
  const [status, setStatus] = usePersistedState("admin:households:status", "");
  const [page, setPage] = usePersistedState("admin:households:page", 1);

  const { villages, options: villageOptions } = useVillageOptions();
  const list = useApiList<HouseholdRecord>("households", {
    q: debouncedSearch.trim() || undefined,
    zone: zoneFilter || undefined,
    villageId: villageId || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const [viewing, setViewing] = usePersistedRecordSelection(
    "admin:households:view",
    list.rows,
    (r) => r.id,
    list.loading,
  );
  const [editing, setEditing] = usePersistedEditableSelection(
    "admin:households:edit",
    list.rows,
    (r) => r.id,
    list.loading,
  );
  const [issuingAccount, setIssuingAccount] = usePersistedRecordSelection(
    "admin:households:account",
    list.rows,
    (r) => r.id,
    list.loading,
  );
  const [deleting, setDeleting] = useState<HouseholdRecord | null>(null);
  const [importing, setImporting] = usePersistedState("admin:households:import", false);
  const [broadcasting, setBroadcasting] = useState(false);

  const pendingDelList = useApiList<DeletionRequestRecord>(
    canReadDeletionRequests ? "deletion-requests" : null,
    {
      status: "pending",
      targetType: "household",
      pageSize: 200,
    },
  );

  const pendingReqByHhId = useMemo(() => {
    const map = new Map<number, DeletionRequestRecord>();
    for (const r of pendingDelList.rows) {
      map.set(Number(r.targetId), r);
    }
    return map;
  }, [pendingDelList.rows]);

  return (
    <>
      {(canCreate || canBroadcastNotice) && (
        <div className="page-header">
          <div className="header-actions">
            {canBroadcastNotice && (
              <button type="button" className="btn btn-outline" onClick={() => setBroadcasting(true)}>
                Thông báo toàn hộ
              </button>
            )}
            {canCreate && (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setImporting(true)}>
                  Import CSV/Excel
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                  Thêm hộ mới
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo tên, CCCD, số ĐT, mã vùng…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="filter-select"
          value={villageId}
          aria-label="Lọc theo thôn"
          onChange={(e) => {
            setVillageId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả địa bàn</option>
          {villageOptions.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label.replace(/\s*[—–]\s*/g, ", ")}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={status}
          aria-label="Lọc theo trạng thái"
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi trạng thái</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="zone-legend-card">
        <div className="zone-legend-title">Phân màu theo Mã vùng trồng</div>
        <div className="zone-legend-grid">
          <button
            type="button"
            className={`zone-legend-item ${zoneFilter === "" ? "is-active" : ""}`}
            onClick={() => {
              setZoneFilter("");
              setPage(1);
            }}
            style={{
              background: zoneFilter === "" ? "#0f172a" : "#ffffff",
              color: zoneFilter === "" ? "#ffffff" : "#1e293b",
            }}
          >
            <span className="zone-legend-code" style={{ fontFamily: "var(--font-body-stack)" }}>
              Tất cả vùng
            </span>
            <span className="zone-legend-sub">Hiển thị toàn bộ các hộ</span>
          </button>
          {KNOWN_ZONES.map((z) => {
            const zc = getZoneColor(z.code);
            const active = zoneFilter === z.code;
            const cleanZoneLabel = z.label.replace(/\s*[—–]\s*/g, ", ");
            return (
              <button
                key={z.code}
                type="button"
                className={`zone-legend-item ${active ? "is-active" : ""}`}
                onClick={() => {
                  setZoneFilter(active ? "" : z.code);
                  setPage(1);
                }}
                title={`Lọc các hộ thuộc vùng ${z.code} (${cleanZoneLabel})`}
                style={{
                  background: zc.bg,
                  color: zc.text,
                }}
              >
                <span className="zone-legend-code">{z.code}</span>
                <span className="zone-legend-sub">{cleanZoneLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      <BlockState
        loading={list.loading}
        error={list.error}
        empty={list.rows.length === 0}
        emptyText="Không tìm thấy hộ nông dân phù hợp."
        onRetry={() => void list.refresh()}
      />

      {list.rows.length > 0 && (
        <>
          <ul className="admin-hh-list" role="list" aria-label="Danh sách hộ nông dân">
            {list.rows.map((h) => {
              const zc = getZoneColor(h.code);
              const areaLabel = formatAreaLabel(h.villageName, h.villageId);
              const areaParts = areaLabel
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
              const primaryArea = areaParts[0] || areaLabel;
              const subArea = areaParts.length > 1 ? areaParts.slice(1).join(", ") : "";
              const pendingDel = pendingReqByHhId.get(Number(h.id));
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    className="admin-diary-row admin-hh-row"
                    onClick={() => setViewing(h)}
                  >
                    <span className="admin-audit-row-main">
                      <strong className="admin-diary-hh">{h.name}</strong>
                      {pendingDel ? (
                        <span className="admin-audit-row-sub" style={{ color: "#9a6712" }}>
                          Chờ Phó HTX duyệt xóa
                        </span>
                      ) : null}
                    </span>
                    <span className="admin-diary-right admin-hh-right">
                      <span className="admin-diary-meta-stack">
                        <span className="admin-hh-area" style={{ color: zc.text }}>
                          {primaryArea}
                        </span>
                        {subArea ? (
                          <span className="admin-diary-verify-sub">{subArea}</span>
                        ) : null}
                      </span>
                      <DetailArrowIcon className="admin-diary-arrow" size={20} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="admin-hh-pagination">
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} unit="hộ" onChange={setPage} />
          </div>
        </>
      )}

      {viewing && (
        <HouseholdDetailModal
          household={viewing}
          onClose={() => setViewing(null)}
          onEdit={
            canUpdate
              ? () => {
                  const target = viewing;
                  setViewing(null);
                  setEditing(target);
                }
              : undefined
          }
          onIssueAccount={
            canUpdate
              ? () => {
                  const target = viewing;
                  setViewing(null);
                  setIssuingAccount(target);
                }
              : undefined
          }
          onDelete={
            canDelete
              ? () => {
                  const target = viewing;
                  setViewing(null);
                  setDeleting(target);
                }
              : undefined
          }
          hasPendingDeletion={pendingReqByHhId.has(Number(viewing.id))}
          onViewPendingDeletion={
            canReadDeletionRequests && pendingReqByHhId.has(Number(viewing.id))
              ? () => {
                  const req = pendingReqByHhId.get(Number(viewing.id));
                  setViewing(null);
                  requestSystemTab("deletions", req?.id ?? null);
                }
              : undefined
          }
        />
      )}

      {editing && (
        <HouseholdFormModal
          initial={editing === "new" ? null : editing}
          villageOptions={villageOptions}
          onClose={() => setEditing(null)}
          onSaved={() => void list.refresh()}
        />
      )}

      {issuingAccount && (
        <HouseholdAccountModal
          household={issuingAccount}
          onClose={() => setIssuingAccount(null)}
          onIssued={() => void list.refresh()}
        />
      )}

      {deleting && (
        <DeletionRequestModal
          targetType="household"
          targetId={deleting.id}
          targetName={deleting.name}
          targetCode={deleting.code}
          onClose={() => setDeleting(null)}
          onRequested={() => {
            setDeleting(null);
            void pendingDelList.refresh();
            void list.refresh();
          }}
        />
      )}

      {importing && (
        <HouseholdImportModal
          villages={villages}
          onClose={() => setImporting(false)}
          onImported={() => void list.refresh()}
        />
      )}

      {broadcasting && (
        <BroadcastNoticeModal onClose={() => setBroadcasting(false)} />
      )}
    </>
  );
}
