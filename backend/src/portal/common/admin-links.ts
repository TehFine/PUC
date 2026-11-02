/** Đường dẫn khu quản trị dùng trong thông báo gửi cán bộ (`/admin?section=<SectionId>`). */
export const ADMIN_LINKS = {
  approval: "/admin?section=approval",
  violations: "/admin?section=journal",
  harvest: "/admin?section=harvest",
  training: "/admin?section=training",
} as const;

/** Các vai trò cán bộ HTX nhận thông báo khi hộ gửi dữ liệu cần xử lý. */
export const HTX_ROLES = ["admin", "htx_officer"];
/** Cán bộ HTX và kiểm tra viên (dùng cho phản hồi vi phạm). */
export const INSPECTION_ROLES = ["admin", "htx_officer", "inspector"];
