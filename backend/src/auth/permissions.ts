export const ROLES = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
  "htx_officer",
  "inspector",
  "village_officer",
  "enterprise",
  "farmer",
] as const;
export type Role = (typeof ROLES)[number];

/** Nhóm vai trò có toàn quyền quản trị tài khoản, mở khóa và duyệt cấp lại mật khẩu cho mọi tài khoản. */
export const ADMIN_PRIVILEGED_ROLES: readonly Role[] = ["admin", "htx_head", "support_specialist"];

/** Nhóm vai trò Ban điều hành và Quản trị hệ thống (không cho phép khôi phục mật khẩu qua trang công khai). */
export const MANAGEMENT_ROLES: readonly Role[] = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
];

/** Nhóm vai trò thuộc ban điều hành, hỗ trợ hệ thống và cán bộ trung tâm của Hợp tác xã (phạm vi HTX-CUNE). */
export const COOP_STAFF_ROLES: readonly Role[] = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
  "htx_officer",
];

export function isAdminPrivilegedRole(role?: string | null): boolean {
  return typeof role === "string" && (ADMIN_PRIVILEGED_ROLES as readonly string[]).includes(role);
}

export function isManagementRole(role?: string | null): boolean {
  return typeof role === "string" && (MANAGEMENT_ROLES as readonly string[]).includes(role);
}

export function isCoopStaffRole(role?: string | null): boolean {
  return typeof role === "string" && (COOP_STAFF_ROLES as readonly string[]).includes(role);
}

export const ACTIONS = ["read", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCES = [
  "households",
  "approvals",
  "schedule",
  "minutes",
  "journal",
  "violations",
  "spray",
  "testing",
  "harvest",
  "training",
  "pesticides",
  "varieties",
  "villages",
  "accounts",
  "deletion-requests",
  "trace-requests",
  "system-alerts",
  "audit-log",
  "plots",
  "plot-measurements",
  "portal",
  "registrations",
  "contracts",
  "enterprises",
  "fertilizers",
  "news",
  "stamps",
  "harvest-declarations",
  "training-registrations",
  "dashboard",
  "reports",
] as const;
export type ResourceKey = (typeof RESOURCES)[number];

const ALL: Role[] = [...ROLES];
const STAFF: Role[] = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
  "htx_officer",
  "inspector",
  "village_officer",
];
const DASHBOARD_READERS: Role[] = [...STAFF, "enterprise"];
const OVERSIGHT: Role[] = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
  "htx_officer",
  "inspector",
];
const SUPPLY_CHAIN_READERS: Role[] = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
  "htx_officer",
  "inspector",
  "enterprise",
];
const ADMIN: Role[] = ["admin", "htx_head", "support_specialist"];
const DELETION_REVIEWERS: Role[] = ["htx_deputy"];
const PLOT_SHAPE_EDITORS: Role[] = ["admin", "htx_head", "htx_deputy", "support_specialist"];
const ACCOUNTS_READERS: Role[] = ["admin", "htx_head", "htx_deputy", "support_specialist"];
const AUDIT_READERS: Role[] = ["admin", "htx_head", "htx_deputy", "support_specialist"];
const HTX: Role[] = ["admin", "htx_head", "htx_deputy", "support_specialist", "htx_officer"];
const INSPECTOR: Role[] = ["admin", "htx_head", "htx_deputy", "support_specialist", "inspector"];
const HTX_OR_INSPECTOR: Role[] = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
  "htx_officer",
  "inspector",
];
const FIELD_WRITERS: Role[] = [
  "admin",
  "htx_head",
  "htx_deputy",
  "support_specialist",
  "htx_officer",
  "village_officer",
];
const FARMER: Role[] = ["farmer"];

/**
 * Ma trận quyền: tài nguyên × hành động → các vai trò được phép.
 * Phản ánh bảng "Phân quyền" trên giao diện:
 *  - Quản trị viên: toàn quyền.
 *  - Cán bộ HTX: duyệt hồ sơ, quản lý dữ liệu nghiệp vụ, không quản lý tài khoản/audit.
 *  - Kiểm tra viên: tạo biên bản, kiểm nghiệm, vi phạm; xem nhật ký canh tác.
 *  - Cán bộ Thôn: xem hộ trong thôn của mình, ghi nhật ký canh tác.
 *  - Doanh nghiệp / CSĐG: xem lô hàng, kiểm nghiệm, hợp đồng và quét QR mở rộng cấp Doanh nghiệp.
 *  - Nông dân: chỉ xem danh mục (thuốc BVTV, giống, thôn) và đào tạo.
 * Thiếu một hành động nghĩa là không vai trò nào được phép (kể cả admin).
 */
export const POLICY: Record<ResourceKey, Partial<Record<Action, Role[]>>> = {
  households: { read: STAFF, create: HTX, update: HTX, delete: ADMIN },
  approvals: { read: OVERSIGHT, create: HTX, update: HTX, delete: ADMIN },
  schedule: { read: STAFF, create: HTX_OR_INSPECTOR, update: HTX_OR_INSPECTOR, delete: ADMIN },
  minutes: { read: STAFF, create: INSPECTOR, update: INSPECTOR, delete: ADMIN },
  journal: { read: STAFF, create: FIELD_WRITERS, update: FIELD_WRITERS, delete: ADMIN },
  violations: { read: OVERSIGHT, create: INSPECTOR, update: INSPECTOR, delete: ADMIN },
  spray: { read: STAFF, create: FIELD_WRITERS, update: FIELD_WRITERS, delete: ADMIN },
  testing: { read: SUPPLY_CHAIN_READERS, create: INSPECTOR, update: INSPECTOR, delete: ADMIN },
  harvest: { read: SUPPLY_CHAIN_READERS, create: HTX, update: HTX, delete: ADMIN },
  training: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  pesticides: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  varieties: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  villages: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  accounts: { read: ACCOUNTS_READERS, create: ADMIN, update: ADMIN, delete: ADMIN },
  "deletion-requests": {
    read: ACCOUNTS_READERS,
    create: ADMIN,
    update: DELETION_REVIEWERS,
    delete: ADMIN,
  },
  "trace-requests": {
    read: [...MANAGEMENT_ROLES],
    update: [...MANAGEMENT_ROLES],
    delete: [...MANAGEMENT_ROLES],
  },
  "system-alerts": {
    read: ACCOUNTS_READERS,
    create: [...MANAGEMENT_ROLES],
    update: [...MANAGEMENT_ROLES],
  },
  "audit-log": { read: AUDIT_READERS },
  plots: { read: STAFF, create: HTX, update: PLOT_SHAPE_EDITORS },
  "plot-measurements": { read: STAFF, create: HTX_OR_INSPECTOR },
  // Cổng hộ dân: chỉ tài khoản nông dân được xem/ghi dữ liệu của chính hộ mình (phạm vi áp dụng ở PortalService).
  portal: { read: FARMER, create: FARMER },
  // Duyệt tài khoản hộ dân tự đăng ký (xem, duyệt = update, từ chối = delete).
  registrations: { read: HTX, update: HTX, delete: HTX },
  contracts: { read: SUPPLY_CHAIN_READERS, create: HTX, update: HTX, delete: ADMIN },
  // Danh bạ doanh nghiệp (mã số thuế, SĐT, người đại diện): chỉ cán bộ giám sát chuỗi cung ứng;
  // tài khoản doanh nghiệp chỉ thấy hồ sơ của chính mình (phạm vi áp dụng ở EnterprisesService).
  enterprises: { read: SUPPLY_CHAIN_READERS, create: HTX, update: HTX, delete: ADMIN },
  fertilizers: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  // Bản tin: cán bộ HTX soạn/đăng; người xem công khai đọc qua /api/public/news.
  news: { read: HTX, create: HTX, update: HTX, delete: HTX },
  // Cấp phát tem nông hộ (tạo đợt cấp = create, thu hồi = update).
  stamps: { read: OVERSIGHT, create: HTX, update: HTX },
  // Khai báo thu hoạch của hộ: cán bộ HTX xác nhận/từ chối (= update).
  "harvest-declarations": { read: OVERSIGHT, update: HTX },
  // Danh sách hộ đăng ký tập huấn, điểm danh (= update).
  "training-registrations": { read: STAFF, update: HTX },
  dashboard: { read: DASHBOARD_READERS },
  reports: { read: OVERSIGHT },
};

export function can(role: Role, resource: ResourceKey, action: Action): boolean {
  return POLICY[resource][action]?.includes(role) ?? false;
}

export function permissionsFor(role: Role): Record<string, Action[]> {
  const result: Record<string, Action[]> = {};
  for (const resource of RESOURCES) {
    const actions = ACTIONS.filter((action) => can(role, resource, action));
    if (actions.length > 0) result[resource] = actions;
  }
  return result;
}
