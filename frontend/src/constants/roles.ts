import type { Role } from "@/types/api";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị viên",
  htx_officer: "Cán bộ HTX",
  inspector: "Kiểm tra viên",
  village_officer: "Cán bộ Thôn",
  farmer: "Nông dân",
};
