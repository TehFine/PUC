import { PageSkeleton } from "@/components/ui/Skeleton";

/** Hiện ngay khi chuyển vào cổng hộ dân, trước khi mã trang tải xong (quan trọng khi mạng yếu). */
export default function Loading() {
  return <PageSkeleton label="Đang mở cổng hộ dân…" />;
}
