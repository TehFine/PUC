"use client";

import { ContextualEmptyBox } from "@/components/ui/EmptyStateArt";
import { Skeleton } from "@/components/ui/Skeleton";
import { LoadingToastBridge } from "@/components/ui/Toast";

/**
 * Dòng trạng thái cho bảng: đang tải (dòng skeleton giữ khung, thông báo nằm ở Toast) / lỗi / trống.
 * Trả về `null` khi đã có dữ liệu để bảng hiển thị bình thường.
 */
export default function TableState({
  colSpan,
  loading,
  error,
  empty,
  emptyText = "Chưa có dữ liệu",
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
        <td colSpan={colSpan} className="empty-state" role="alert" style={{ color: "#b73c20" }}>
          {error}{" "}
          {onRetry && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onRetry} style={{ marginLeft: 8 }}>
              Thử lại
            </button>
          )}
        </td>
      </tr>
    );
  }
  if (loading && empty) {
    const widths = ["68%", "82%", "56%", "74%", "62%", "48%"];
    return (
      <>
        <LoadingToastBridge label="Đang tải dữ liệu…" />
        {Array.from({ length: 4 }, (_, rowIdx) => (
          <tr key={`sk-${rowIdx}`} aria-hidden="true">
            {Array.from({ length: colSpan }, (__, colIdx) => (
              <td key={colIdx}>
                <Skeleton
                  h={13}
                  w={colIdx === 0 ? 72 : widths[(rowIdx + colIdx) % widths.length]}
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
