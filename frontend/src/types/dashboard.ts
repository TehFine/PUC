// Kiểu dữ liệu `GET /dashboard/summary`. Mọi trường đều có thể thiếu: giao diện phải hiển thị phòng thủ.
import type { HouseholdStatus } from "./households";

export interface DashboardCounts {
  households?: number;
  plots?: number;
  areaHa?: number;
  qualifiedHouseholds?: number;
  openViolations?: number;
  pendingApprovals?: number;
  pendingRegistrations?: number;
  pendingDeclarations?: number;
  labTests?: number;
  labTestsPassed?: number;
  journalLast30Days?: number;
  harvestTons?: number;
  trainingCourses?: number;
}

export interface DashboardHouseholdStatus {
  status: HouseholdStatus;
  count: number;
}

export interface DashboardVillage {
  id: number;
  name: string;
  households?: number;
  qualified?: number;
  plots?: number;
  areaHa?: number;
}

export interface DashboardTrendPoint {
  month: string;
  count: number;
}

export interface DashboardViolation {
  id: number;
  severity: "critical" | "warning";
  title: string;
  householdLabel?: string | null;
  detectedOn: string;
  status?: "open" | "resolved";
}

export interface DashboardPendingApproval {
  id: number;
  code: string;
  applicantName: string;
  requestType: string;
  submittedOn: string;
  priority?: "high" | "medium" | "low";
}

export interface DashboardSchedule {
  id: number;
  scheduledOn: string;
  title: string;
  officer?: string | null;
  kind?: "periodic" | "sudden" | "recheck";
  plotCount?: number;
}

export interface DashboardSummary {
  counts?: DashboardCounts;
  /** Backend trả mảng; một số phiên bản trả dạng `{ qualified: 10, ... }` nên chấp nhận cả hai. */
  householdStatus?: DashboardHouseholdStatus[] | Partial<Record<HouseholdStatus, number>>;
  villages?: DashboardVillage[];
  journalTrend?: DashboardTrendPoint[];
  labTests?: { total?: number; pass?: number; fail?: number };
  recentViolations?: DashboardViolation[];
  pendingApprovals?: DashboardPendingApproval[];
  upcomingSchedule?: DashboardSchedule[];
  harvest?: { lots?: number; tons?: number };
}
