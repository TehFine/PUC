import type { Role } from "./permissions";

export interface AuthUser {
  id: number;
  fullName: string;
  username: string;
  email?: string | null;
  role: Role;
  villageId: number | null;
  /** Hộ gắn với tài khoản nông dân (null với các vai trò khác). */
  householdId: number | null;
  /** Doanh nghiệp / cơ sở đóng gói gắn với tài khoản đối tác (enterprise). */
  enterpriseId?: number | null;
  /** Xã được giao quản lý (dành cho cán bộ xã). */
  assignedCommune?: string | null;
  /** Địa bàn được giao quản lý (dành cho Chi cục / Thanh tra). */
  assignedRegion?: string | null;
  /** Mã HTX quản lý (mặc định HTX-CUNE). */
  coopCode?: string;
  /** Đã bật xác thực 2 lớp (OTP) hay chưa. */
  twoFactorEnabled?: boolean;
  /** Mã phiên đăng nhập (refresh_tokens.id) phục vụ đăng xuất từ xa từng thiết bị. */
  sessionId?: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
