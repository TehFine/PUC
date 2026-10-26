import { PageSkeleton } from "@/components/ui/Skeleton";

/** Hiện ngay khi chuyển vào trang quản trị, trước khi mã trang tải xong (quan trọng khi mạng yếu). */
export default function Loading() {
  return <PageSkeleton label="Đang mở trang quản trị…" />;
}
