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
  enterpriseId: number | null;
  enterpriseName: string | null;
  enterprisePackhouseCode: string | null;
  assignedCommune: string | null;
  assignedRegion: string | null;
  coopCode: string;
  twoFactorEnabled: boolean;
  activeSessionCount: number;
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
  enterpriseId?: number | null;
  assignedCommune?: string | null;
  assignedRegion?: string | null;
  coopCode?: string | null;
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

export type DeletionTargetType = "account" | "household";
export type DeletionRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface DeletionRequestRecord {
  id: number;
  targetType: DeletionTargetType;
  targetId: number;
  targetName: string;
  targetCode: string;
  targetRole: Role | null;
  reason: string | null;
  requestedBy: number;
  requestedByName: string;
  requestedByRole: Role;
  status: DeletionRequestStatus;
  reviewedBy: number | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
