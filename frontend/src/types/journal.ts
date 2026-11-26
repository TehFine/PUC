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
  photoUrls?: string[];
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  gpsVerified?: boolean;
  gpsDistanceM?: number | null;
  captureSource?: "in_app_camera" | "camera" | "upload" | "system" | string | null;
  clientCapturedAt?: string | null;
  offlineQueued?: boolean;
  signboardQrVerified?: boolean;
  trustLevel?: 1 | 2 | 3 | number | null;
  trustFlags?: string[];
  serverRecordedAt?: string | null;
  declaredOn?: string | null;
  lateDeclarationDays?: number;
  entryDelayHours?: number;
  isLateEntry?: boolean;
  lateReason?: string | null;
  recordHash?: string | null;
  verificationStatus?: "self_declared" | "verified";
  verifiedByUserId?: number | null;
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  updatedByUserId?: number | null;
  updatedByName?: string | null;
  updatedByRole?: string | null;
  updatedAt?: string | null;
  editCount?: number;
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
  farmerResponsePhotoUrls?: string[];
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
  note?: string | null;
  photoUrl?: string | null;
  photoUrls?: string[];
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  gpsVerified?: boolean;
  gpsDistanceM?: number | null;
  captureSource?: "in_app_camera" | "camera" | "upload" | "system" | string | null;
  clientCapturedAt?: string | null;
  offlineQueued?: boolean;
  signboardQrVerified?: boolean;
  trustLevel?: 1 | 2 | 3 | number | null;
  trustFlags?: string[];
  serverRecordedAt?: string | null;
  declaredOn?: string | null;
  lateDeclarationDays?: number;
  entryDelayHours?: number;
  isLateEntry?: boolean;
  lateReason?: string | null;
  recordHash?: string | null;
  recordedByRole?: string | null;
  verificationStatus?: "self_declared" | "verified";
  verifiedByUserId?: number | null;
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  updatedByUserId?: number | null;
  updatedByName?: string | null;
  updatedByRole?: string | null;
  updatedAt?: string | null;
  editCount?: number;
}
