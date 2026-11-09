// Kiểu dữ liệu khu quản trị – nghiệp vụ hộ nông dân (DTO gốc của backend, camelCase).
import type { HouseholdDto } from "./api";

export type HouseholdStatus = HouseholdDto["status"];

export interface HouseholdRow extends HouseholdDto {
  createdAt?: string;
  updatedAt?: string;
  accountId?: number | null;
  accountUsername?: string | null;
  accountEmail?: string | null;
  accountStatus?: "active" | "locked" | "pending" | null;
}

export type HouseholdRecord = HouseholdRow;

/** Thân `POST /households` (PATCH dùng một phần các trường). */
export interface HouseholdInput {
  code: string;
  name: string;
  cccd: string;
  phone: string;
  villageId: number;
  plotCount?: number;
  areaHa?: number;
  status?: HouseholdStatus;
}

/** Kết quả `POST /households/import { rows }`. */
export interface HouseholdImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}
