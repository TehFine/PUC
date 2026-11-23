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

export const ROLES: {
  role: Role;
  name: string;
  perms: { label: string; ok: boolean }[];
}[] = [
  {
    role: "htx_head",
    name: "Trưởng HTX",
    perms: [
      { label: "Điều hành HTX, duyệt hồ sơ và khai báo thu hoạch", ok: true },
      { label: "Soạn thông báo gửi toàn thể nông hộ (đồng gửi Phó HTX)", ok: true },
      { label: "Phê duyệt cấp quyền xem hồ sơ truy xuất đột xuất cho đoàn công tác", ok: true },
      { label: "Cấp tài khoản và phân quyền nhân sự cấp dưới", ok: true },
      { label: "Đề nghị xóa thành viên (cần Phó HTX phê duyệt chéo)", ok: true },
      { label: "Xuất báo cáo kiểm toán và xem nhật ký hệ thống", ok: true },
    ],
  },
  {
    role: "htx_deputy",
    name: "Phó HTX",
    perms: [
      { label: "Điều hành nghiệp vụ vùng trồng và hộ dân", ok: true },
      { label: "Soạn thông báo gửi toàn thể nông hộ (đồng gửi Trưởng HTX)", ok: true },
      { label: "Phê duyệt cấp quyền xem hồ sơ truy xuất đột xuất cho đoàn công tác", ok: true },
      { label: "Phê duyệt chéo yêu cầu xóa tài khoản và hộ thành viên", ok: true },
      { label: "Duyệt hồ sơ, lô hàng, cấp tem và lập biên bản kiểm tra", ok: true },
      { label: "Tự tạo hoặc tự xóa tài khoản không qua đề nghị", ok: false },
    ],
  },
  {
    role: "support_specialist",
    name: "Chuyên viên hỗ trợ hệ thống",
    perms: [
      { label: "Cấp tài khoản và hỗ trợ đặt lại mật khẩu", ok: true },
      { label: "Phê duyệt cấp quyền xem hồ sơ truy xuất đột xuất cho đoàn công tác", ok: true },
      { label: "Đề nghị xóa thành viên (cần Phó HTX phê duyệt chéo)", ok: true },
      { label: "Hỗ trợ kỹ thuật hồ sơ, thửa đất và nhật ký", ok: true },
      { label: "Phát thông báo khẩn và xử lý sự cố", ok: true },
      { label: "Xem nhật ký thao tác hệ thống", ok: true },
    ],
  },
  {
    role: "admin",
    name: "Quản trị viên",
    perms: [
      { label: "Quản trị cấu hình hệ thống và danh mục", ok: true },
      { label: "Phê duyệt cấp quyền xem hồ sơ truy xuất đột xuất cho đoàn công tác", ok: true },
      { label: "Cấp mới và cập nhật tài khoản", ok: true },
      { label: "Đề nghị xóa thành viên (cần Phó HTX phê duyệt chéo)", ok: true },
      { label: "Xuất báo cáo kiểm toán", ok: true },
      { label: "Xem nhật ký thao tác hệ thống", ok: true },
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
