"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/components/admin/catalog/use-debounced";
import BlockState from "@/components/admin/shared/BlockState";
import Pagination from "@/components/admin/shared/Pagination";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { Modal, ModalDismissButton } from "@/components/ui/Modal";
import { useApiList } from "@/hooks/use-api";
import { daysSince } from "@/lib/portal-labels";
import type { AuditLogRecord } from "@/types/accounts";
import { formatDate } from "@/utils/format";

const PAGE_SIZE = 20;

interface AuditDayGroup {
  date: string;
  label: string;
  items: AuditLogRecord[];
}

function resolveActionTone(action: string): string {
  if (/thất bại|cảnh báo|khóa|xóa|từ chối|thu hồi/i.test(action)) return "#b91c1c";
  if (/duyệt|tạo mới|bật|kích hoạt|mở/i.test(action)) return "#15803d";
  if (/cập nhật|đổi|đặt lại/i.test(action)) return "#14372f";
  return "#5f6d66";
}

function formatSafeAuditDetail(detail: string | null | undefined): string {
  if (!detail) return "-";
  const trimmed = detail.trim();
  if (!trimmed) return "-";
  if (/^Trường\s*:/i.test(trimmed)) return "Đã cập nhật thông tin hồ sơ";
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return "Theo bộ lọc phạm vi quản lý";
  if (/bộ lọc:\s*\{.*\}$/i.test(trimmed)) return "Bản kiểm toán theo phạm vi quản lý";
  if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+\s*\(\d+\s*bytes\)$/i.test(trimmed)) return "Đã lưu tệp minh chứng";
  return trimmed;
}

function toLocalDayKey(isoOrRaw: string | null | undefined): string {
  if (!isoOrRaw) return "0000-00-00";
  const d = new Date(isoOrRaw);
  if (Number.isNaN(d.getTime())) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoOrRaw.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "0000-00-00";
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatAuditDayLabel(isoDate: string): string {
  if (isoDate === "0000-00-00") return "Chưa rõ ngày";
  const formatted = formatDate(isoDate);
  const diff = daysSince(isoDate);
  if (diff === 0) return `Hôm nay, ${formatted}`;
  if (diff === 1) return `Hôm qua, ${formatted}`;
  return formatted;
}

function formatTimeShort(isoOrRaw: string | null | undefined): string {
  if (!isoOrRaw) return "";
  const d = new Date(isoOrRaw);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatFullAuditTime(isoOrRaw: string | null | undefined): string {
  if (!isoOrRaw) return "-";
  const d = new Date(isoOrRaw);
  if (Number.isNaN(d.getTime())) return isoOrRaw;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${hh}:${mm}:${ss}, ${dd}/${mo}/${yyyy}`;
}

export default function AuditLogTab() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [viewingLog, setViewingLog] = useState<AuditLogRecord | null>(null);
  const debouncedQ = useDebounced(q);

  const list = useApiList<AuditLogRecord>("audit-log", {
    q: debouncedQ,
    action,
    page,
    pageSize: PAGE_SIZE,
  });

  const dayGroups = useMemo<AuditDayGroup[]>(() => {
    const buckets = new Map<string, AuditLogRecord[]>();
    for (const row of list.rows) {
      const key = toLocalDayKey(row.occurredAt);
      const arr = buckets.get(key);
      if (arr) arr.push(row);
      else buckets.set(key, [row]);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        label: formatAuditDayLabel(date),
        items,
      }));
  }, [list.rows]);

  return (
    <>
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo người dùng, đối tượng, chi tiết..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="filter-select"
          value={action}
          aria-label="Lọc theo hành động"
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi hành động</option>
          <option value="Tạo mới">Tạo mới</option>
          <option value="Cập nhật">Cập nhật</option>
          <option value="Xóa">Xóa</option>
          <option value="Duyệt hồ sơ">Duyệt hồ sơ</option>
          <option value="Ghi nhật ký">Ghi nhật ký</option>
          <option value="Xuất báo cáo">Xuất báo cáo</option>
          <option value="Cảnh báo">Cảnh báo</option>
        </select>
      </div>

      <BlockState
        loading={list.loading}
        error={list.error}
        empty={list.rows.length === 0}
        emptyText="Chưa có nhật ký thao tác nào phù hợp."
        onRetry={() => void list.refresh()}
      />

      {dayGroups.length > 0 && (
        <>
          <div className="admin-diary-day-groups">
            {dayGroups.map((group) => (
              <section
                key={group.date}
                className="admin-diary-day-group"
                aria-label={`Nhật ký thao tác ngày ${group.label}`}
              >
                <div className="admin-diary-day-head">
                  <span className="admin-diary-day-label">{group.label}</span>
                  <span className="admin-diary-day-count">{group.items.length} thao tác</span>
                </div>
                <ul className="admin-diary-day-card" role="list">
                  {group.items.map((log) => {
                    const timeStr = formatTimeShort(log.occurredAt);
                    const summaryTarget = log.object || formatSafeAuditDetail(log.detail);
                    const subText =
                      timeStr && summaryTarget && summaryTarget !== "-"
                        ? `${timeStr}, ${summaryTarget}`
                        : timeStr || (summaryTarget !== "-" ? summaryTarget : "");

                    return (
                      <li key={log.id}>
                        <button
                          type="button"
                          className="admin-diary-row"
                          onClick={() => setViewingLog(log)}
                        >
                          <span className="admin-audit-row-main">
                            <strong className="admin-diary-hh">{log.userName || "Hệ thống"}</strong>
                            {subText && <span className="admin-audit-row-sub">{subText}</span>}
                          </span>
                          <span className="admin-diary-right">
                            <span
                              className="admin-diary-plot"
                              style={{ color: resolveActionTone(log.action) }}
                            >
                              {log.action}
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
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={list.total}
              unit="thao tác"
              onChange={setPage}
            />
          </div>
        </>
      )}

      {viewingLog && (
        <Modal
          title="Chi tiết nhật ký thao tác"
          onClose={() => setViewingLog(null)}
          width={540}
          footer={
            <ModalDismissButton className="btn btn-primary" onFallbackClose={() => setViewingLog(null)}>
              Đóng
            </ModalDismissButton>
          }
        >
          <div className="admin-detail-list-card">
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Thời gian</span>
              <div
                className="admin-detail-list-value"
                style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}
              >
                {formatFullAuditTime(viewingLog.occurredAt)}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Người dùng</span>
              <div className="admin-detail-list-value" style={{ fontWeight: 600 }}>
                {viewingLog.userName || "Hệ thống"}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Hành động</span>
              <div
                className="admin-detail-list-value"
                style={{ fontWeight: 600, color: resolveActionTone(viewingLog.action) }}
              >
                {viewingLog.action}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Đối tượng</span>
              <div
                className="admin-detail-list-value"
                style={{ color: "#256b45", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              >
                {viewingLog.object || "-"}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Địa chỉ IP</span>
              <div
                className="admin-detail-list-value"
                style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}
              >
                {viewingLog.ip || "-"}
              </div>
            </div>
            <div className="admin-detail-list-row">
              <span className="admin-detail-list-label">Chi tiết</span>
              <div className="admin-detail-list-value">{formatSafeAuditDetail(viewingLog.detail)}</div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
