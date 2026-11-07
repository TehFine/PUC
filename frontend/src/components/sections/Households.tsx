"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useApiList } from "@/hooks/use-api";
import DeleteDialog from "@/components/admin/shared/DeleteDialog";
import Pagination from "@/components/admin/shared/Pagination";
import TableState from "@/components/admin/shared/TableState";
import { formatVn } from "@/components/admin/shared/form-utils";
import { badgeOf, HOUSEHOLD_STATUS, optionsOf } from "@/components/admin/shared/labels";
import { useVillageOptions } from "@/components/admin/shared/options";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import HouseholdDetailModal from "@/components/admin/households/HouseholdDetailModal";
import HouseholdFormModal from "@/components/admin/households/HouseholdFormModal";
import HouseholdImportModal from "@/components/admin/households/HouseholdImportModal";
import { getZoneColor, KNOWN_ZONES } from "@/components/zones/zone-data";
import type { HouseholdRecord } from "@/types/households";

const PAGE_SIZE = 25;
const STATUS_OPTIONS = optionsOf(HOUSEHOLD_STATUS);

export default function Households() {
  const { can } = useAuth();
  const canCreate = can("households", "create");
  const canUpdate = can("households", "update");
  const canDelete = can("households", "delete");

  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const debouncedSearch = useDebounced(search);
  const [villageId, setVillageId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { villages, options: villageOptions } = useVillageOptions();
  const effectiveQuery = [debouncedSearch.trim(), zoneFilter].filter(Boolean).join(" ") || undefined;
  const list = useApiList<HouseholdRecord>("households", {
    q: effectiveQuery,
    villageId: villageId || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const [viewing, setViewing] = useState<HouseholdRecord | null>(null);
  const [editing, setEditing] = useState<HouseholdRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<HouseholdRecord | null>(null);
  const [importing, setImporting] = useState(false);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Quản lý Hộ Nông Dân</h1>
        </div>
        {canCreate && (
          <div className="header-actions">
            <button type="button" className="btn btn-outline" onClick={() => setImporting(true)}>
              Import CSV/Excel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              Thêm hộ mới
            </button>
          </div>
        )}
      </div>

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
          <option value="">Tất cả thôn</option>
          {villageOptions.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
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
              background: zoneFilter === "" ? "#0f172a" : "#f1f5f9",
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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Họ &amp; Tên</th>
              <th>CCCD</th>
              <th>Số ĐT</th>
              <th>Thôn / Tổ</th>
              <th>Số thửa</th>
              <th>Diện tích</th>
              <th>Mã vùng trồng / Mã hộ</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={10}
              loading={list.loading}
              error={list.error}
              empty={list.rows.length === 0}
              emptyText="Không tìm thấy hộ nông dân phù hợp"
              onRetry={() => void list.refresh()}
            />
            {list.rows.map((h, i) => {
              const st = badgeOf(HOUSEHOLD_STATUS, h.status);
              const zc = getZoneColor(h.code);
              return (
                <tr key={h.id} style={{ background: zc.rowTint }}>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{h.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>{h.cccd}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{h.phone}</td>
                  <td>{h.villageName || `Thôn #${h.villageId}`}</td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{h.plotCount}</td>
                  <td style={{ fontWeight: 500 }}>{formatVn(h.areaHa, 2)} ha</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        fontFamily: "monospace",
                        fontSize: 12,
                        background: zc.bg,
                        color: zc.text,
                        border: "none",
                        padding: "4px 10px",
                        borderRadius: 8,
                        fontWeight: 700,
                      }}
                    >
                      {h.code}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${st.badge}`}>{st.label}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewing(h)}>
                        Xem
                      </button>
                      {canUpdate && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(h)}>
                          Sửa
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(h)}>
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
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} unit="hộ" onChange={setPage} />
      </div>

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
