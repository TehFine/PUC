// Kiểu dữ liệu "chuẩn" do backend trả về (camelCase, enum, ngày ISO, số là number).
// Các mapper trong lib/mappers.ts chuyển sang kiểu hiển thị ở types/entities.ts.

export type Role = "admin" | "htx_officer" | "inspector" | "village_officer" | "farmer";
export type Action = "read" | "create" | "update" | "delete";

export interface AuthUser {
  id: number;
  fullName: string;
  username: string;
  role: Role;
  villageId: number | null;
  householdId: number | null;
}

export interface AuthSession {
  user: AuthUser;
  permissions: Record<string, Action[]>;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HouseholdDto {
  id: number;
  code: string;
  name: string;
  cccd: string;
  phone: string;
  villageId: number;
  villageName: string;
  plotCount: number;
  areaHa: number;
  status: "qualified" | "improve" | "pending" | "violation";
}

export interface ApprovalDto {
  id: number;
  code: string;
  applicantName: string;
  requestType: string;
  submittedOn: string;
  docsCount: number;
  priority: "high" | "medium" | "low";
  status: "pending" | "approved" | "rejected";
}

export interface ScheduleDto {
  id: number;
  scheduledOn: string;
  title: string;
  officer: string;
  plotCount: number;
  kind: "periodic" | "sudden" | "recheck";
}

export interface MinuteDto {
  id: number;
  code: string;
  heldOn: string;
  location: string;
  officer: string;
  result: "pass" | "fail" | "improve";
}

export interface JournalDto {
  id: number;
  entryOn: string;
  householdName: string;
  plotCode: string;
  activity: string;
  detail: string | null;
  recorder: string;
  hasPhoto: boolean;
}

export interface ViolationDto {
  id: number;
  severity: "critical" | "warning";
  title: string;
  householdLabel: string;
  detectedOn: string;
  plotCode: string | null;
  description: string | null;
}

export interface SprayDto {
  id: number;
  sprayedOn: string;
  householdName: string;
  pesticideName: string;
  source: string | null;
  dose: string;
  areaHa: number;
  isolationDays: number;
  mrlStatus: "pass" | "exceeded";
}

export interface LabTestDto {
  id: number;
  code: string;
  householdName: string;
  plotCode: string;
  sampledOn: string;
  cdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: "pass" | "fail";
  lab: string;
}

export interface HarvestDto {
  id: number;
  code: string;
  harvestedOn: string;
  weightTons: number;
  householdCount: number;
  buyer: string;
  market: string;
  qrCode: string | null;
  status: "exported" | "delivered" | "in_transit" | "sampling";
}

export interface TrainingDto {
  id: number;
  title: string;
  heldOn: string | null;
  location: string | null;
  trainer: string | null;
  enrolled: number;
  capacity: number;
  completed: boolean;
}

export interface PesticideDto {
  id: number;
  name: string;
  activeIngredient: string;
  concentration: string | null;
  manufacturer: string | null;
  mrlMgKg: number | null;
  isolationDays: number | null;
  status: "allowed" | "banned" | "restricted";
}

export interface VarietyDto {
  id: number;
  name: string;
  origin: string | null;
  weightRange: string | null;
  harvestYears: string | null;
  description: string | null;
}

export interface VillageDto {
  id: number;
  name: string;
  leader: string | null;
  householdCount: number;
  plotCount: number;
  areaHa: number;
}

export interface AccountDto {
  id: number;
  fullName: string;
  username: string;
  role: Role;
  status: "active" | "locked";
  villageName: string | null;
  lastLoginAt: string | null;
}

export interface AuditLogDto {
  id: number;
  occurredAt: string;
  userName: string | null;
  ip: string | null;
  action: string;
  object: string | null;
  detail: string | null;
}
