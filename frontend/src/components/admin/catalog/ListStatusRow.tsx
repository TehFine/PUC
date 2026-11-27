"use client";

import { ContextualEmptyBox } from "@/components/ui/EmptyStateArt";
import { Skeleton } from "@/components/ui/Skeleton";
import { LoadingToastBridge } from "@/components/ui/Toast";

/**
 * Một hàng trạng thái trong <tbody>: đang tải (dòng skeleton giữ khung, thông báo nằm ở Toast) / lỗi / không có dữ liệu.
 * Trả về null khi đã có dữ liệu để hiển thị.
 */
export default function ListStatusRow({
  colSpan,
  loading,
  error,
  empty,
  emptyText = "Chưa có dữ liệu.",
  onRetry,
}: {
  colSpan: number;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText?: string;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <tr>
        <td colSpan={colSpan} className="empty-state">
          <span role="alert" style={{ color: "#b73c20" }}>
            {error}{" "}
            {onRetry && (
              <button type="button" className="btn btn-outline btn-sm" onClick={onRetry} style={{ marginLeft: 8 }}>
                Thử lại
              </button>
            )}
          </span>
        </td>
      </tr>
    );
  }
  if (loading && empty) {
    const widths = ["65%", "80%", "55%", "72%"];
    return (
      <>
        <LoadingToastBridge label="Đang tải dữ liệu…" />
        {Array.from({ length: 4 }, (_, rowIdx) => (
          <tr key={`sk-${rowIdx}`} aria-hidden="true">
            {Array.from({ length: colSpan }, (__, colIdx) => (
              <td key={colIdx}>
                <Skeleton
                  h={13}
                  w={colIdx === 0 ? 68 : widths[(rowIdx + colIdx) % widths.length]}
                  r={6}
                />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }
  if (empty) {
    return (
      <tr>
        <td colSpan={colSpan} className="empty-state">
          <ContextualEmptyBox>{emptyText}</ContextualEmptyBox>
        </td>
      </tr>
    );
  }
  return null;
}
