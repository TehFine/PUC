// Kiểu dữ liệu khu quản trị – nhật ký canh tác, vi phạm, phun thuốc.

export interface JournalRow {
  id: number;
  entryOn: string;
  householdId: number;
  householdName: string;
  plotCode: string;
  activity: string;
  detail: string | null;
  recorder: string;
  hasPhoto: boolean;
  photoUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export type ViolationSeverity = "critical" | "warning";
export type ViolationStatus = "open" | "resolved";

export interface ViolationRow {
  id: number;
  severity: ViolationSeverity;
  title: string;
  householdLabel: string;
  householdId?: number | null;
  detectedOn: string;
  plotCode: string | null;
  description: string | null;
  status: ViolationStatus;
  farmerResponse?: string | null;
  farmerResponseAt?: string | null;
  farmerResponsePhotoUrl?: string | null;
  resolvedOn?: string | null;
  resolutionNotes?: string | null;
  /** Vi phạm loại "chưa cập nhật nhật ký" (backend nhận diện theo tiêu đề). */
  isJournalViolation?: boolean;
  /** Ngày ghi nhật ký gần nhất của hộ cho đúng thửa vi phạm, dùng để đối chiếu khi xác nhận khắc phục. */
  lastJournalOn?: string | null;
}

export type MrlStatus = "pass" | "exceeded";

export interface SprayRow {
  id: number;
  sprayedOn: string;
  householdId: number;
  householdName: string;
  pesticideId: number;
  pesticideName: string;
  source: string | null;
  dose: string;
  areaHa: number;
  isolationDays: number | null;
  mrlStatus: MrlStatus;
  plotCode?: string | null;
}
