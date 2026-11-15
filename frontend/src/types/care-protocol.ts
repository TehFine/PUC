// Kiểu dữ liệu Lộ trình Quy trình chăm sóc sầu riêng 2026-2027 (`/api/portal/care-protocol`, `/api/care-protocol`).

export type ComplianceSeverity = "warning" | "violation";
export type ComplianceStatus = "compliant" | "warning" | "violation";

export interface ComplianceIssue {
  code: string;
  severity: ComplianceSeverity;
  message: string;
}

export type MilestoneTimelineState =
  | "completed"
  | "skipped_prior"
  | "overdue_critical"
  | "overdue"
  | "due_now"
  | "upcoming_current"
  | "upcoming_next"
  | "upcoming";

export type PlanOverallHealth =
  | "completed"
  | "overdue_critical"
  | "overdue"
  | "due_now"
  | "on_track";

export interface ProtocolProductSpec {
  id: string;
  name: string;
  dosage: string;
}

export interface SequentialMilestoneSpec {
  code: string;
  seq: number;
  stageCode: string;
  stageOrder: string;
  stageName: string;
  stageDurationLabel: string;
  dayLabel: string;
  cycleDayStart: number;
  cycleDayEnd: number;
  treeState: string;
  treeStateOptions: string[];
  actionSummary: string;
  standardDosageSummary: string;
  defaultJournalActivity: string;
  requiresInvoicePhoto: boolean;
  products: ProtocolProductSpec[];
  forbiddenTerms: string[];
  notes: string;
}

export interface SenProRuleSpec {
  code: string;
  shootState: string;
  requiredRatio: string;
  effectLabel: string;
  actionSummary: string;
}

export interface CareMilestoneDeclaration {
  id: number;
  planId: number;
  householdId: number;
  plotCode: string;
  stageCode: string;
  milestoneCode: string;
  isSenpro: boolean;
  scheduledOn: string | null;
  dueOn: string | null;
  performedOn: string;
  expectedTreeState: string;
  actualTreeState: string;
  followedStandard: boolean;
  selectedProducts: string[];
  actualDosage: string;
  extraInputs: string | null;
  supplierName: string | null;
  pesticideId: number | null;
  pesticideName: string | null;
  pesticideDose: string | null;
  fieldPhotoUrl: string | null;
  invoicePhotoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  gpsVerified: boolean;
  gpsDistanceM: number | null;
  journalEntryId: number | null;
  journalRecordHash: string | null;
  sprayRecordId: number | null;
  complianceStatus: ComplianceStatus;
  complianceIssues: ComplianceIssue[];
  farmerNote: string | null;
  createdAt: string;
}

export interface CareMilestoneItem extends SequentialMilestoneSpec {
  scheduledOn: string;
  dueOn: string;
  state: MilestoneTimelineState;
  daysOverdue: number;
  daysUntilScheduled: number;
  declaration: CareMilestoneDeclaration | null;
}

export interface PlotCarePlanTimeline {
  id: number;
  householdId: number;
  householdCode: string;
  householdName: string;
  householdPhone: string;
  villageName: string;
  plotCode: string;
  season: string;
  cycleStartOn: string;
  startMilestoneSeq: number;
  currentMilestoneCode: string;
  status: "active" | "completed" | "paused";
  note: string | null;
  updatedAt: string;
  overallHealth: PlanOverallHealth;
  completedCount: number;
  totalApplicableCount: number;
  progressPct: number;
  deviationCount: number;
  activeMilestone: CareMilestoneItem | null;
  nextMilestone: CareMilestoneItem | null;
  milestones: CareMilestoneItem[];
  senProDeclarations: CareMilestoneDeclaration[];
}

export interface CareProtocolPortalResponse {
  season: string;
  today: string;
  senProRules: SenProRuleSpec[];
  plans: PlotCarePlanTimeline[];
}

export interface ConfigurePlotCarePlanBody {
  plotCode: string;
  householdId?: number;
  mode: "start_cycle" | "current_milestone";
  anchorDate: string;
  milestoneCode?: string;
  note?: string;
}

export interface DeclareCareMilestoneBody {
  plotCode: string;
  milestoneCode: string;
  performedOn?: string;
  actualTreeState: string;
  followedStandard: boolean;
  selectedProducts: string[];
  actualDosage: string;
  extraInputs?: string;
  supplierName?: string;
  pesticideId?: number;
  pesticideDose?: string;
  fieldPhotoId: number;
  invoicePhotoId?: number;
  latitude?: number;
  longitude?: number;
  farmerNote?: string;
  lateReason?: string;
}

export interface DeclareCareMilestoneResponse {
  declarationId: number;
  complianceStatus: ComplianceStatus;
  complianceIssues: ComplianceIssue[];
  nextMilestone: {
    code: string;
    stageOrder: string;
    stageName: string;
    dayLabel: string;
    treeState: string;
    scheduledOn: string;
    dueOn: string;
    actionSummary: string;
  } | null;
  plan: PlotCarePlanTimeline;
}

export interface AdminCarePlanSummary {
  id: number;
  householdId: number;
  householdCode: string;
  householdName: string;
  householdPhone: string;
  villageName: string;
  plotCode: string;
  season: string;
  cycleStartOn: string;
  status: "active" | "completed" | "paused";
  overallHealth: PlanOverallHealth;
  completedCount: number;
  totalApplicableCount: number;
  progressPct: number;
  deviationCount: number;
  totalDeclarations: number;
  activeMilestone: {
    code: string;
    stageOrder: string;
    stageName: string;
    dayLabel: string;
    treeState: string;
    scheduledOn: string;
    dueOn: string;
    state: MilestoneTimelineState;
    daysOverdue: number;
    actionSummary: string;
  } | null;
  nextMilestone: {
    code: string;
    stageOrder: string;
    stageName: string;
    dayLabel: string;
    scheduledOn: string;
  } | null;
  latestDeclaration: CareMilestoneDeclaration | null;
  updatedAt: string;
}

export interface AdminCareProtocolListResponse {
  season: string;
  today: string;
  kpi: {
    totalPlans: number;
    onTrack: number;
    dueNow: number;
    overdue: number;
    deviated: number;
    completed: number;
  };
  data: AdminCarePlanSummary[];
}

export interface CareProtocolCatalogResponse {
  season: string;
  totalMilestones: number;
  milestones: SequentialMilestoneSpec[];
  senProRules: SenProRuleSpec[];
}

export interface CareProtocolScanResponse {
  scanned: number;
  dueNotifications: number;
  overdueWarnings: number;
  criticalViolations: number;
}
