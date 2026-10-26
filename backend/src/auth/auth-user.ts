import type { Role } from "./permissions";

export interface AuthUser {
  id: number;
  fullName: string;
  username: string;
  role: Role;
  villageId: number | null;
  /** Hộ gắn với tài khoản nông dân (null với các vai trò khác). */
  householdId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
