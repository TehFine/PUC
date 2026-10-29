// Kiểu dữ liệu do /api/portal/* trả về (cổng hộ dân).

export type HouseholdStatus = "qualified" | "improve" | "pending" | "violation";
export type PlotStatus = "approved" | "improve" | "violation" | "pending";

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
  };
  stats: {
    openViolations: number;
    pendingApprovals: number;
    lastJournalOn: string | null;
    journalLast30Days: number;
    harvestTotalKg: number;
  };
  lastTest: { code: string; plotCode: string; sampledOn: string; result: "pass" | "fail" } | null;
}

export interface PortalPlot {
  code: string;
  village: string | null;
  zoneCode: string | null;
  variety: string | null;
  plantedYear: number | null;
  areaHa: number;
  source: "declared" | "measured" | "cadastral" | "demo";
  status: PlotStatus;
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
  mrlStatus: "pass" | "exceeded";
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
}

export interface PortalScheduleItem {
  id: number;
  scheduledOn: string;
  title: string;
  officer: string;
  kind: "periodic" | "sudden" | "recheck";
}

export interface PortalViolation {
  id: number;
  severity: "critical" | "warning";
  title: string;
  detectedOn: string;
  plotCode: string | null;
  description: string | null;
  status: "open" | "resolved";
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

export interface PortalApproval {
  id: number;
  code: string;
  requestType: string;
  submittedOn: string;
  docsCount: number;
  status: "pending" | "approved" | "rejected";
}

export interface PortalList<T> {
  data: T[];
}
