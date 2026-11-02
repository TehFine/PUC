"use client";

import { SkeletonCards } from "@/components/ui/Skeleton";

/** Hộp trạng thái cho vùng không phải bảng (lưới thẻ, danh sách): đang tải (Apple spinner + skeleton) / lỗi / trống. */
export default function BlockState({
  loading,
  error,
  empty,
  emptyText = "Chưa có dữ liệu",
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText?: string;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <div className="card empty-state" role="alert" style={{ color: "#b73c20" }}>
        {error}{" "}
        {onRetry && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onRetry} style={{ marginLeft: 8 }}>
            Thử lại
          </button>
        )}
      </div>
    );
  }
  if (loading && empty) {
    return <SkeletonCards count={3} label="Đang tải dữ liệu…" />;
  }
  if (empty) return <div className="card empty-state">{emptyText}</div>;
  return null;
}
