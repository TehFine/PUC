export const ROLES = ["admin", "htx_officer", "inspector", "village_officer", "farmer"] as const;
export type Role = (typeof ROLES)[number];

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
  "audit-log",
  "plots",
  "plot-measurements",
  "portal",
  "registrations",
  "contracts",
  "enterprises",
] as const;
export type ResourceKey = (typeof RESOURCES)[number];

const ALL: Role[] = [...ROLES];
const STAFF: Role[] = ["admin", "htx_officer", "inspector", "village_officer"];
const OVERSIGHT: Role[] = ["admin", "htx_officer", "inspector"];
const ADMIN: Role[] = ["admin"];
const HTX: Role[] = ["admin", "htx_officer"];
const INSPECTOR: Role[] = ["admin", "inspector"];
const HTX_OR_INSPECTOR: Role[] = ["admin", "htx_officer", "inspector"];
const FIELD_WRITERS: Role[] = ["admin", "htx_officer", "village_officer"];
const FARMER: Role[] = ["farmer"];

/**
 * Ma trận quyền: tài nguyên × hành động → các vai trò được phép.
 * Phản ánh bảng "Phân quyền" trên giao diện:
 *  - Quản trị viên: toàn quyền.
 *  - Cán bộ HTX: duyệt hồ sơ, quản lý dữ liệu nghiệp vụ, không quản lý tài khoản/audit.
 *  - Kiểm tra viên: tạo biên bản, kiểm nghiệm, vi phạm; xem nhật ký canh tác.
 *  - Cán bộ Thôn: xem hộ trong thôn của mình, ghi nhật ký canh tác.
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
  testing: { read: OVERSIGHT, create: INSPECTOR, update: INSPECTOR, delete: ADMIN },
  harvest: { read: OVERSIGHT, create: HTX, update: HTX, delete: ADMIN },
  training: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  pesticides: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  varieties: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  villages: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
  accounts: { read: ADMIN, create: ADMIN, update: ADMIN, delete: ADMIN },
  "audit-log": { read: ADMIN },
  plots: { read: STAFF, create: HTX },
  "plot-measurements": { read: STAFF, create: HTX_OR_INSPECTOR },
  // Cổng hộ dân: chỉ tài khoản nông dân được xem/ghi dữ liệu của chính hộ mình (phạm vi áp dụng ở PortalService).
  portal: { read: FARMER, create: FARMER },
  // Duyệt tài khoản hộ dân tự đăng ký (xem, duyệt = update, từ chối = delete).
  registrations: { read: HTX, update: HTX, delete: HTX },
  contracts: { read: STAFF, create: HTX, update: HTX, delete: ADMIN },
  enterprises: { read: ALL, create: HTX, update: HTX, delete: ADMIN },
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
