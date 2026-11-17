import type { Role } from "@/types/api";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị viên",
  htx_head: "Trưởng HTX",
  htx_deputy: "Phó HTX",
  support_specialist: "Chuyên viên hỗ trợ hệ thống",
  htx_officer: "Cán bộ HTX",
  inspector: "Kiểm tra viên",
  village_officer: "Cán bộ Thôn",
  enterprise: "Doanh nghiệp / CSĐG",
  farmer: "Nông dân",
};

export function isCoopStaffRole(role?: Role | null): boolean {
  return (
    role === "admin" ||
    role === "htx_head" ||
    role === "htx_deputy" ||
    role === "support_specialist" ||
    role === "htx_officer"
  );
}

/** Chỉ Quản trị hệ thống, Trưởng HTX, Phó HTX và Chuyên viên hỗ trợ hệ thống được sửa hoặc vẽ lại hình dạng ranh giới thửa đất. */
export function canRedrawPlotShapeByRole(role?: Role | null): boolean {
  return (
    role === "admin" ||
    role === "htx_head" ||
    role === "htx_deputy" ||
    role === "support_specialist"
  );
}
