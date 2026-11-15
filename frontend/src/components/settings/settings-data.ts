import type { Role } from "@/types/api";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị viên",
  htx_officer: "Cán bộ HTX",
  inspector: "Kiểm tra viên",
  village_officer: "Cán bộ Thôn",
  enterprise: "Doanh nghiệp / CSĐG",
  farmer: "Nông dân",
};

export const ROLES: {
  role: Role;
  name: string;
  perms: { label: string; ok: boolean }[];
}[] = [
  {
    role: "admin",
    name: "Quản trị viên",
    perms: [
      { label: "Toàn quyền hệ thống", ok: true },
      { label: "Duyệt hồ sơ & Khai báo", ok: true },
      { label: "Quản lý tài khoản", ok: true },
      { label: "Xuất báo cáo", ok: true },
      { label: "Xem nhật ký audit", ok: true },
    ],
  },
  {
    role: "htx_officer",
    name: "Cán bộ HTX",
    perms: [
      { label: "Toàn quyền hệ thống", ok: false },
      { label: "Duyệt hồ sơ & Khai báo", ok: true },
      { label: "Quản lý lô hàng & Cấp tem", ok: true },
      { label: "Xuất báo cáo", ok: true },
      { label: "Quản lý tài khoản", ok: false },
    ],
  },
  {
    role: "inspector",
    name: "Kiểm tra viên",
    perms: [
      { label: "Toàn quyền hệ thống", ok: false },
      { label: "Tạo lịch & Biên bản kiểm tra", ok: true },
      { label: "Cập nhật kết quả kiểm nghiệm", ok: true },
      { label: "Ghi nhận & Đóng vi phạm", ok: true },
      { label: "Quản lý tài khoản", ok: false },
    ],
  },
  {
    role: "village_officer",
    name: "Cán bộ Thôn",
    perms: [
      { label: "Xem hộ trong thôn phụ trách", ok: true },
      { label: "Ghi nhật ký canh tác & Phun thuốc", ok: true },
      { label: "Duyệt hồ sơ", ok: false },
      { label: "Xuất báo cáo", ok: true },
      { label: "Quản lý tài khoản", ok: false },
    ],
  },
  {
    role: "enterprise",
    name: "Doanh nghiệp / Cơ sở đóng gói",
    perms: [
      { label: "Quét QR mở rộng cấp Doanh nghiệp (vùng nguồn & sản lượng)", ok: true },
      { label: "Xem lô hàng xuất khẩu & Hợp đồng liên kết", ok: true },
      { label: "Xem trạng thái kiểm nghiệm chi tiết", ok: true },
      { label: "Xem CCCD, SĐT & ranh giới từng thửa cá nhân", ok: false },
      { label: "Quản lý tài khoản & Nhật ký hệ thống", ok: false },
    ],
  },
  {
    role: "farmer",
    name: "Nông dân (Cổng hộ dân)",
    perms: [
      { label: "Ghi nhật ký & Khai báo thu hoạch", ok: true },
      { label: "Kích hoạt tem truy xuất QR", ok: true },
      { label: "Gửi hồ sơ đề nghị & Phản hồi vi phạm", ok: true },
      { label: "Tra cứu thuốc BVTV, phân bón & giống", ok: true },
      { label: "Truy cập khu quản trị", ok: false },
    ],
  },
];

export const ACTION_COLORS: Record<string, string> = {
  "Duyệt hồ sơ": "badge-green",
  "Cập nhật": "badge-blue",
  "Tạo mới": "badge-blue",
  "Xóa": "badge-red",
  "Ghi nhật ký": "badge-gold",
  "Xuất báo cáo": "badge-gray",
  "Tra cứu QR mở rộng": "badge-blue",
  "Cảnh báo": "badge-red",
};

export const STATUS_CLASS: Record<string, string> = { green: "badge-green", red: "badge-red" };
