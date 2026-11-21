"use client";

import { useState } from "react";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import Pager from "@/components/admin/catalog/Pager";
import { useDebounced } from "@/components/admin/catalog/use-debounced";
import { useApiList } from "@/hooks/use-api";
import type { AuditLogRecord } from "@/types/accounts";

const PAGE_SIZE = 20;

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

export default function AuditLogTab() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);

  const list = useApiList<AuditLogRecord>("audit-log", {
    q: debouncedQ,
    action,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo người dùng, đối tượng, chi tiết…"
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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người dùng</th>
              <th>Địa chỉ IP</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            <ListStatusRow
              colSpan={6}
              loading={list.loading}
              error={list.error}
              empty={list.rows.length === 0}
              onRetry={list.refresh}
            />
            {list.rows.map((log) => (
              <tr key={log.id}>
                <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {log.occurredAt ? new Date(log.occurredAt).toLocaleString("vi-VN") : "-"}
                </td>
                <td style={{ fontWeight: 500 }}>{log.userName || "Hệ thống"}</td>
                <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "var(--text-muted)" }}>{log.ip || "-"}</td>
                <td>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: resolveActionTone(log.action) }}>
                    {log.action}
                  </span>
                </td>
                <td style={{ fontSize: 12.5, color: "#256b45", fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums" }}>{log.object || "-"}</td>
                <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{formatSafeAuditDetail(log.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="table-footer">
          <span>
            Hiển thị <strong>{list.rows.length}</strong> trong tổng số <strong>{list.total}</strong> thao tác
          </span>
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onChange={setPage} />
        </div>
      </div>
    </>
  );
}
