"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useApiList } from "@/hooks/use-api";
import BlockState from "@/components/admin/shared/BlockState";
import DeleteDialog from "@/components/admin/shared/DeleteDialog";
import Pagination from "@/components/admin/shared/Pagination";
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
import type { HouseholdRecord } from "@/types/households";

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

  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = usePersistedState("admin:households:zone", "");
  const debouncedSearch = useDebounced(search);
  const [villageId, setVillageId] = usePersistedState("admin:households:village", "");
  const [status, setStatus] = usePersistedState("admin:households:status", "");
  const [page, setPage] = usePersistedState("admin:households:page", 1);

  const { villages, options: villageOptions } = useVillageOptions();
  const effectiveQuery = [debouncedSearch.trim(), zoneFilter].filter(Boolean).join(" ") || undefined;
  const list = useApiList<HouseholdRecord>("households", {
    q: effectiveQuery,
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

  return (
    <>
      {canCreate && (
        <div className="page-header">
          <div className="header-actions">
            <button type="button" className="btn btn-outline" onClick={() => setImporting(true)}>
              Import CSV/Excel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              Thêm hộ mới
            </button>
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
            return (
              <button
                key={z.code}
                type="button"
                className={`zone-legend-item ${active ? "is-active" : ""}`}
                onClick={() => {
                  setZoneFilter(active ? "" : z.code);
                  setPage(1);
                }}
                title={`Lọc các hộ thuộc vùng ${z.code} (${z.label})`}
                style={{
                  background: zc.bg,
                  color: zc.text,
                }}
              >
                <span className="zone-legend-code">{z.code}</span>
                <span className="zone-legend-sub">{z.label}</span>
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
          <ul className="admin-diary-day-card admin-hh-list" role="list" aria-label="Danh sách hộ nông dân">
            {list.rows.map((h) => {
              const zc = getZoneColor(h.code);
              const areaLabel = formatAreaLabel(h.villageName, h.villageId);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    className="admin-diary-row admin-hh-row"
                    onClick={() => setViewing(h)}
                  >
                    <strong className="admin-diary-hh">{h.name}</strong>
                    <span className="admin-diary-right admin-hh-right">
                      <span className="admin-hh-area" style={{ color: zc.text }}>
                        {areaLabel}
                      </span>
                      <DetailArrowIcon className="admin-diary-arrow" size={20} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="admin-diary-pagination">
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
        <DeleteDialog
          title="Xóa hộ nông dân"
          message={
            <>
              Bạn có chắc chắn muốn xóa hộ <strong>{deleting.name}</strong> (mã <code>{deleting.code}</code>)? Thao tác này không
              thể hoàn tác.
            </>
          }
          path={`/households/${deleting.id}`}
          successMessage={`Đã xóa hộ ${deleting.name}.`}
          onClose={() => setDeleting(null)}
          onDeleted={() => void list.refresh()}
        />
      )}

      {importing && (
        <HouseholdImportModal
          villages={villages}
          onClose={() => setImporting(false)}
          onImported={() => void list.refresh()}
        />
      )}
    </>
  );
}
