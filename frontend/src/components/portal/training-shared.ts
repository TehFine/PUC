"use client";

import { useMemo } from "react";
import { usePortal } from "@/hooks/use-portal";
import type { TrainingDto } from "@/types/api";
import { listOf, type PortalListLike, type PortalTrainingCourse } from "@/types/portal";

export type TrainingCourseItem = TrainingDto & Partial<Omit<PortalTrainingCourse, keyof TrainingDto>>;

export function usePortalTrainings() {
  const portalQuery = usePortal<PortalListLike<PortalTrainingCourse>>("training");
  const data: TrainingCourseItem[] = useMemo(() => listOf(portalQuery.data), [portalQuery.data]);
  const loading = portalQuery.loading && data.length === 0;
  const error = data.length === 0 ? portalQuery.error : null;
  return { data, loading, error, refresh: portalQuery.refresh };
}

export function getTrainingKicker(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("vietgap")) return "Quy chuẩn VietGAP";
  if (lower.includes("gacc") || lower.includes("xuất khẩu")) return "Tiêu chuẩn GACC";
  if (lower.includes("sâu bệnh") || lower.includes("phòng trừ")) return "Kỹ thuật phòng trừ";
  if (lower.includes("phần mềm") || lower.includes("quản lý")) return "Chuyển đổi số PUC";
  if (lower.includes("tưới tiêu")) return "Kỹ thuật canh tác";
  if (lower.includes("hữu cơ")) return "Nông nghiệp hữu cơ";
  return "Lớp tập huấn";
}

