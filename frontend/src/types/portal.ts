// Kiểu dữ liệu do /api/portal/* trả về (cổng hộ dân). Khớp hợp đồng API mục 2 của kế hoạch.

export type HouseholdStatus = "qualified" | "improve" | "pending" | "violation";
export type PlotStatus = "approved" | "improve" | "violation" | "pending";

/** Nhắc việc do server tính (chưa ghi nhật ký, vi phạm mở, cách ly thuốc, lịch kiểm tra, tập huấn, khai báo bị từ chối…). */
export interface PortalReminder {
  kind: string;
  title: string;
  detail?: string | null;
  /** Tab cần mở khi bấm (ví dụ `diary`, `inspection`, `learn`, `stamps`, `requests`). */
  tab: string;
  date?: string | null;
}

export interface PortalOverview {
  household: {
    id: number;
    code: string;
    name: string;
    phone: string;
    plotCount: number;
    areaHa: number;
    status: HouseholdStatus;
    villageName: string;
    villageLeader: string | null;
    avatarUrl?: string | null;
  };
  stats: {
    openViolations: number;
    pendingApprovals: number;
    lastJournalOn: string | null;
    journalLast30Days: number;
    harvestTotalKg: number;
    unreadNotifications?: number;
  };
  lastTest: { code: string; plotCode: string; sampledOn: string; result: "pass" | "fail" } | null;
  reminders?: PortalReminder[];
}

export interface PortalProfile {
  account: { fullName: string; username: string; email?: string | null; lastLoginAt: string | null };
  household: {
    code: string;
    name: string;
    phone: string | null;
    cccdMasked: string | null;
    villageName: string | null;
    villageLeader: string | null;
    plotCount: number;
    areaHa: number;
    status: HouseholdStatus;
    avatarUrl?: string | null;
  };
}

export interface PortalPlot {
  id?: number;
  code: string;
  sheet?: string | null;
  parcel?: string | null;
  village: string | null;
  zoneCode: string | null;
  variety: string | null;
  plantedYear: number | null;
  areaHa: number;
  source: "declared" | "measured" | "cadastral" | "demo";
  status: PlotStatus;
  lat?: number | null;
  lng?: number | null;
  geometryJson?: string | null;
}

export interface PortalPlots {
  data: PortalPlot[];
  /** false khi hệ thống chưa bật dữ liệu bản đồ (PostGIS). */
  available: boolean;
}

export interface PortalJournalEntry {
  id: number;
  entryOn: string;
  plotCode: string;
  activity: string;
  detail: string | null;
  recorder: string;
  hasPhoto: boolean;
  photoUrl?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** Thời điểm tạo bản ghi (để biết còn trong 24 giờ được phép xóa). */
  createdAt?: string | null;
  /** Server có thể trả sẵn cờ cho phép xóa. */
  canDelete?: boolean;
}

export interface CreateJournalBody {
  entryOn?: string;
  plotCode: string;
  activity: string;
  detail?: string;
  photoId: number;
  latitude?: number;
  longitude?: number;
}

export interface PortalSprayRecord {
  id: number;
  sprayedOn: string;
  pesticide: string;
  pesticideStatus: "allowed" | "banned" | "restricted";
  source: string | null;
  dose: string;
  areaHa: number;
  isolationDays: number;
  isolationEndsOn?: string | null;
  mrlStatus: "pass" | "exceeded";
  plotCode?: string | null;
  createdAt?: string | null;
  canDelete?: boolean;
}

export interface CreateSprayBody {
  sprayedOn?: string;
  pesticideId: number;
  dose: string;
  areaHa: number;
  source?: string;
  plotCode?: string;
}

export interface PortalLabTest {
  id: number;
  code: string;
  plotCode: string;
  sampledOn: string;
  cdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: "pass" | "fail";
  lab: string;
  householdName?: string;
}

export interface PortalScheduleItem {
  id: number;
  scheduledOn: string;
  title: string;
  officer: string;
  kind: "periodic" | "sudden" | "recheck";
  note?: string | null;
}

export interface PortalViolation {
  id: number;
  severity: "critical" | "warning";
  title: string;
  detectedOn: string;
  plotCode: string | null;
  description: string | null;
  status: "open" | "resolved";
  farmerResponse?: string | null;
  farmerResponseAt?: string | null;
  farmerResponsePhotoUrl?: string | null;
  resolvedOn?: string | null;
  resolutionNotes?: string | null;
  /** Vi phạm loại "chưa cập nhật nhật ký": phải ghi nhật ký mới mới được báo đã khắc phục. */
  isJournalViolation?: boolean;
  /** Ngày ghi nhật ký gần nhất cho đúng thửa vi phạm. */
  lastJournalOn?: string | null;
}

export interface PortalHarvest {
  id: number;
  lotCode: string;
  qrCode?: string | null;
  harvestedOn: string;
  weightKg: number;
  buyer: string;
  market: string;
  status: "exported" | "delivered" | "in_transit" | "sampling";
}

export interface PortalHarvestNotice {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export type HarvestDeclarationStatus = "submitted" | "confirmed" | "rejected";

export interface PortalHarvestDeclaration {
  id: number;
  plotCode: string;
  harvestedOn: string;
  weightKg: number | string;
  gradeAKg: number | string | null;
  gradeBKg: number | string | null;
  qualityRating: string | null;
  note: string | null;
  createdAt: string;
  status: HarvestDeclarationStatus;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  photoUrl?: string | null;
}

export interface CreateHarvestDeclarationBody {
  plotCode: string;
  harvestedOn?: string;
  weightKg: number;
  gradeAKg?: number;
  gradeBKg?: number;
  qualityRating?: string;
  note?: string;
  photoId?: number;
}

export interface PortalStampAllocation {
  id: number;
  allocationCode: string;
  allocatedOn: string;
  season: string | null;
  maxQuotaStamps?: number | null;
  quantityAllocated: number;
  fromSerial: string | null;
  toSerial: string | null;
  status: string;
  notes: string | null;
  plotCode?: string | null;
}

export interface PortalStamp {
  id: number;
  allocationId: number | null;
  plotCode: string | null;
  serialCode: string;
  status: "allocated" | "activated" | "revoked" | string;
  activatedAt: string | null;
  fruitWeightKg: number | string | null;
  grade: "A" | "B" | "C" | null;
  photoUrl?: string | null;
  harvestDate: string | null;
}

export interface PortalStamps {
  stats: { totalAllocated: number; totalActivated: number; remaining: number };
  allocations: PortalStampAllocation[];
  stamps: PortalStamp[];
}

export interface ActivateStampBody {
  serialCode: string;
  plotCode: string;
  fruitWeightKg: number;
  grade: "A" | "B" | "C";
  photoId?: number;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface PortalAttachment {
  id: number;
  url: string;
  mimeType: string;
  originalName: string | null;
}

export interface PortalApproval {
  id: number;
  code: string;
  requestType: string;
  submittedOn: string;
  docsCount: number;
  status: ApprovalStatus;
  note?: string | null;
  plotCode?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  attachments?: PortalAttachment[];
}

export interface CreateApprovalBody {
  requestType: string;
  note?: string;
  plotCode?: string;
  attachmentIds?: number[];
}

export type TrainingRegistrationStatus = "registered" | "attended" | "absent" | "cancelled";

export interface PortalTraining {
  id: number;
  title: string;
  heldOn: string | null;
  /** Giờ bắt đầu/kết thúc dạng `HH:MM[:SS]`. */
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  trainer: string | null;
  description: string | null;
  enrolled: number;
  capacity: number;
  completed: boolean;
  myStatus: TrainingRegistrationStatus | null;
}

export type NotificationKind = "approval" | "violation" | "harvest" | "training" | "schedule" | "lab" | "system";

export interface AppNotification {
  id: number;
  kind: NotificationKind | string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  data: AppNotification[];
  unread: number;
}

export interface PortalList<T> {
  data: T[];
}

export type PortalStampsResponse = PortalStamps;
export type PortalTrainingCourse = PortalTraining;

/** Một số danh sách portal có thể trả mảng trần hoặc `{ data }`; dùng `listOf()` để đọc an toàn. */
export type PortalListLike<T> = PortalList<T> | T[];

export function listOf<T>(value: PortalListLike<T> | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : (value.data ?? []);
}
