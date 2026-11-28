"use client";

import { useState } from "react";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { Modal } from "@/components/ui/Modal";
import { ROLE_LABELS } from "@/constants/roles";
import { useApi } from "@/hooks/use-api";
import type { TraceAccessLogDto } from "@/types/api";

export default function TraceAccessLogsModal({
  initialLotCode = "",
  onClose,
}: {
  initialLotCode?: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialLotCode);
  const [scopeFilter, setScopeFilter] = useState<"" | "true" | "false">("");
  const debouncedQ = useDebounced(q);

  const queryParams = new URLSearchParams();
  if (debouncedQ.trim()) queryParams.set("q", debouncedQ.trim());
  if (scopeFilter) queryParams.set("scopeGranted", scopeFilter);
  queryParams.set("limit", "80");

  const logsApi = useApi<{ data?: TraceAccessLogDto[] }>(
    `/harvest/trace-access-logs?${queryParams.toString()}`,
  );
  const rows = logsApi.data?.data ?? [];

  return (
    <Modal
      title="Nhật ký quét QR"
      onClose={onClose}
      width={860}
      footer={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div
        style={{
          padding: "10px 13px",
          borderRadius: 8,
          background: "#f8faf8",
          border: "1px solid #d4d4d2",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "#1f2937",
          marginBottom: 14,
        }}
      >
        Mọi lượt quét hoặc tra cứu mã QR có đăng nhập đều được hệ thống ghi nhận tự động (người xem, vai trò, mã lô, thời điểm và kết quả kiểm tra phạm vi) để làm bằng chứng đối chiếu minh bạch.
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Tìm theo mã lô, họ tên hoặc tài khoản người quét…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value as "" | "true" | "false")}
        >
          <option value="">Tất cả kết quả phạm vi</option>
          <option value="true">Đúng phạm vi (Cấp chi tiết)</option>
          <option value="false">Ngoài phạm vi (Từ chối chi tiết)</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Người quét</th>
              <th>Vai trò</th>
              <th>Mã lô / Token</th>
              <th>Cấp trả về</th>
              <th>Kết quả phạm vi</th>
            </tr>
          </thead>
          <tbody>
            <ListStatusRow
              colSpan={6}
              loading={logsApi.loading}
              error={logsApi.error}
              empty={rows.length === 0}
              emptyText="Chưa có lượt quét tra cứu nào được ghi nhận."
              variant="qrNotFound"
              onRetry={logsApi.refresh}
            />
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {new Date(r.viewedAt).toLocaleString("vi-VN")}
                </td>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.fullName}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {r.username} {r.ip ? `(${r.ip})` : ""}
                  </div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {r.userRole === "field_auditor"
                    ? "Đoàn Thẩm định Thực địa"
                    : (ROLE_LABELS[r.userRole] ?? r.userRole)}
                </td>
                <td style={{ fontSize: 12.5 }}>
                  <strong>{r.lotCode || r.scannedCode}</strong>
                </td>
                <td style={{ fontSize: 12 }}>
                  {r.viewerTier === "authority"
                    ? "Cấp 3 (Quản lý)"
                    : r.viewerTier === "enterprise"
                      ? "Cấp 2 (Doanh nghiệp)"
                      : r.viewerTier === "field_audit"
                        ? "Thẩm định thực địa (Thẻ Đoàn)"
                        : "Cấp 1 (Công khai)"}
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span className={`badge ${r.scopeGranted ? "badge-green" : "badge-gold"}`}>
                      {r.scopeGranted ? "Được xem chi tiết" : "Từ chối ngoài phạm vi"}
                    </span>
                    {r.scopeReason && (
                      <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        {r.scopeReason}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

