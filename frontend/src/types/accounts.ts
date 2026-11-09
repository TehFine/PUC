// Kiểu dữ liệu thô (DTO) cho quản trị hệ thống: tài khoản và nhật ký thao tác.
import type { Role } from "@/types/api";

export type AccountStatus = "active" | "locked";

export interface AccountRecord {
  id: number;
  fullName: string;
  username: string;
  email?: string | null;
  role: Role;
  status: AccountStatus;
  villageId: number | null;
  villageName: string | null;
  householdId: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Thân yêu cầu POST/PATCH /accounts. `password` bắt buộc khi tạo, tùy chọn khi sửa (đặt lại mật khẩu). */
export interface AccountInput {
  fullName: string;
  username: string;
  email?: string | null;
  password?: string;
  role: Role;
  status: AccountStatus;
  villageId: number | null;
  householdId: number | null;
}

export interface AuditLogRecord {
  id: number;
  occurredAt: string;
  userId: number | null;
  userName: string | null;
  ip: string | null;
  action: string;
  object: string | null;
  detail: string | null;
}
