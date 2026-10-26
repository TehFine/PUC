export const ROLES = [
  {
    name: "Quản trị viên",
    count: "1 người",
    perms: [
      { label: "Toàn quyền hệ thống", ok: true },
      { label: "Duyệt hồ sơ", ok: true },
      { label: "Quản lý tài khoản", ok: true },
      { label: "Xuất báo cáo", ok: true },
      { label: "Xem nhật ký audit", ok: true },
    ],
  },
  {
    name: "Cán bộ HTX",
    count: "3 người",
    perms: [
      { label: "Toàn quyền hệ thống", ok: false },
      { label: "Duyệt hồ sơ", ok: true },
      { label: "Quản lý tài khoản", ok: false },
      { label: "Xuất báo cáo", ok: true },
      { label: "Xem nhật ký audit", ok: false },
    ],
  },
  {
    name: "Kiểm tra viên",
    count: "2 người",
    perms: [
      { label: "Toàn quyền hệ thống", ok: false },
      { label: "Duyệt hồ sơ", ok: false },
      { label: "Tạo biên bản", ok: true },
      { label: "Xem nhật ký canh tác", ok: true },
      { label: "Xuất báo cáo", ok: false },
    ],
  },
  {
    name: "Cán bộ Thôn",
    count: "6 người",
    perms: [
      { label: "Xem hộ trong thôn", ok: true },
      { label: "Ghi nhật ký canh tác", ok: true },
      { label: "Duyệt hồ sơ", ok: false },
      { label: "Xuất báo cáo", ok: false },
      { label: "Quản lý tài khoản", ok: false },
    ],
  },
];

export const ACTION_COLORS: Record<string, string> = {
  "Duyệt hồ sơ": "badge-green",
  "Cập nhật": "badge-blue",
  "Tạo mới": "badge-blue",
  "Ghi nhật ký": "badge-gold",
  "Xuất báo cáo": "badge-gray",
  "Cảnh báo": "badge-red",
};

export const STATUS_CLASS: Record<string, string> = { green: "badge-green", red: "badge-red" };
