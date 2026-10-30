import { ROLE_LABELS } from "@/constants/roles";
import type {
  AccountDto,
  ApprovalDto,
  AuditLogDto,
  HarvestDto,
  HouseholdDto,
  JournalDto,
  LabTestDto,
  MinuteDto,
  PesticideDto,
  ScheduleDto,
  SprayDto,
  TrainingDto,
  VarietyDto,
  ViolationDto,
  VillageDto,
} from "@/types/api";
import type {
  Account,
  ApprovalRequest,
  AuditLogEntry,
  HarvestLot,
  Household,
  InspectionMinute,
  JournalEntry,
  LabTest,
  Pesticide,
  ScheduleItem,
  SprayRecord,
  TrainingCourse,
  Variety,
  Village,
  Violation,
} from "@/types/entities";
import { formatDate, formatDateTime, formatNumber } from "@/utils/format";

type Tone = "green" | "gold" | "red" | "blue";
const label = <K extends string>(map: Record<K, readonly [string, Tone]>, key: K) => map[key];

const HOUSEHOLD_STATUS = {
  qualified: ["Đủ chuẩn XK", "green"],
  improve: ["Cần cải thiện", "gold"],
  pending: ["Chờ duyệt", "blue"],
  violation: ["Vi phạm", "red"],
} as const;

const PRIORITY = { high: ["Cao", "red"], medium: ["TB", "gold"], low: ["Thấp", "blue"] } as const;
const SCHEDULE_KIND = { periodic: "Định kỳ", sudden: "Đột xuất", recheck: "Phúc tra" } as const;
const MINUTE_RESULT = {
  pass: ["Đạt", "green"],
  fail: ["Không đạt", "red"],
  improve: ["Cần cải thiện", "gold"],
} as const;
const MRL_STATUS = { pass: ["Đạt", "green"], exceeded: ["Vượt ngưỡng", "red"] } as const;
const LAB_RESULT = { pass: ["Đạt", "green"], fail: ["Không đạt", "red"] } as const;
const HARVEST_STATUS = {
  exported: ["Đã xuất", "green"],
  delivered: ["Đã giao", "green"],
  in_transit: ["Đang vận chuyển", "gold"],
  sampling: ["Đang lấy mẫu", "blue"],
} as const;
const PESTICIDE_STATUS = {
  allowed: ["Được phép", "green"],
  banned: ["Bị cấm (GACC)", "red"],
  restricted: ["Hạn chế", "gold"],
} as const;

export function mapHousehold(dto: HouseholdDto): Household {
  const [status, statusType] = label(HOUSEHOLD_STATUS, dto.status);
  return {
    id: dto.id,
    name: dto.name,
    cccd: dto.cccd,
    phone: dto.phone,
    village: dto.villageName,
    plots: dto.plotCount,
    area: dto.areaHa,
    code: dto.code,
    status,
    statusType,
  };
}

export function mapApproval(dto: ApprovalDto): ApprovalRequest {
  const [priority, priorityType] = label(PRIORITY, dto.priority);
  return {
    id: dto.code,
    name: dto.applicantName,
    type: dto.requestType,
    date: formatDate(dto.submittedOn),
    docs: dto.docsCount,
    priority,
    priorityType,
  };
}

export const mapSchedule = (dto: ScheduleDto): ScheduleItem => ({
  id: dto.id,
  date: formatDate(dto.scheduledOn),
  title: dto.title,
  officer: dto.officer,
  plots: dto.plotCount,
  type: SCHEDULE_KIND[dto.kind],
});

export function mapMinute(dto: MinuteDto): InspectionMinute {
  const [result, resultType] = label(MINUTE_RESULT, dto.result);
  return {
    no: dto.code,
    date: formatDate(dto.heldOn),
    location: dto.location,
    officer: dto.officer,
    result,
    resultType,
  };
}

export const mapJournal = (dto: JournalDto): JournalEntry => ({
  id: dto.id,
  date: formatDate(dto.entryOn),
  household: dto.householdName,
  plotCode: dto.plotCode,
  activity: dto.activity,
  detail: dto.detail ?? "",
  recorder: dto.recorder,
  hasPhoto: dto.hasPhoto,
});

export const mapViolation = (dto: ViolationDto): Violation => ({
  id: dto.id,
  type: dto.severity,
  title: dto.title,
  household: dto.householdLabel,
  date: formatDate(dto.detectedOn),
  plot: dto.plotCode ?? "—",
  desc: dto.description ?? "",
});

export function mapSpray(dto: SprayDto): SprayRecord {
  const [mrl, mrlType] = label(MRL_STATUS, dto.mrlStatus);
  return {
    id: dto.id,
    date: formatDate(dto.sprayedOn),
    household: dto.householdName,
    pesticide: dto.pesticideName,
    source: dto.source ?? "—",
    dose: dto.dose,
    area: `${dto.areaHa} ha`,
    isolation: `${dto.isolationDays} ngày`,
    mrl,
    mrlType,
  };
}

export function mapLabTest(dto: LabTestDto): LabTest {
  const [result, resultType] = label(LAB_RESULT, dto.result);
  return {
    code: dto.code,
    household: `${dto.householdName} – ${dto.plotCode}`,
    sampleDate: formatDate(dto.sampledOn),
    cd: formatNumber(dto.cdMgKg, 2),
    yellowO: dto.yellowOPositive ? "Dương tính" : "Âm tính",
    residue: formatNumber(dto.residueMgKg, 2),
    chlorpyrifos: dto.chlorpyrifosMgKg === null ? "KPH" : formatNumber(dto.chlorpyrifosMgKg, 2),
    result,
    resultType,
    lab: dto.lab,
  };
}

export function mapHarvest(dto: HarvestDto): HarvestLot {
  const [status, statusType] = label(HARVEST_STATUS, dto.status);
  return {
    id: dto.id,
    code: dto.code,
    date: formatDate(dto.harvestedOn),
    weight: formatNumber(dto.weightTons, 3),
    households: dto.householdCount,
    buyer: dto.buyer,
    market: dto.market,
    qr: dto.qrCode ?? "—",
    status,
    statusType,
    packhouseCode: dto.packhouseCode,
    transporter: dto.transporter,
    vehiclePlate: dto.vehiclePlate,
    temperatureC: dto.temperatureC,
    avgBrix: dto.avgBrix,
    gradeAPct: dto.gradeAPct,
    enterpriseName: dto.enterpriseName,
    contractCode: dto.contractCode,
  };
}

export function mapEnterprise(dto: import("@/types/api").EnterpriseDto): import("@/types/entities").Enterprise {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    taxCode: dto.taxCode ?? undefined,
    representative: dto.representative ?? undefined,
    phone: dto.phone ?? undefined,
    address: dto.address ?? undefined,
    packhouseCode: dto.packhouseCode ?? undefined,
    status: dto.status,
  };
}

export function mapContract(dto: import("@/types/api").ContractDto): import("@/types/entities").Contract {
  return {
    id: dto.id,
    code: dto.code,
    enterpriseId: dto.enterpriseId,
    enterpriseName: dto.enterpriseName,
    packhouseCode: dto.packhouseCode ?? undefined,
    title: dto.title,
    signedOn: formatDate(dto.signedOn),
    validUntil: formatDate(dto.validUntil),
    targetTons: dto.targetTons,
    priceGuarantee: dto.priceGuarantee ?? undefined,
    market: dto.market,
    status: dto.status,
    notes: dto.notes ?? undefined,
  };
}

export const mapTraining = (dto: TrainingDto): TrainingCourse => ({
  id: dto.id,
  title: dto.title,
  date: dto.completed ? "Đã hoàn thành" : formatDate(dto.heldOn),
  location: dto.location ?? "—",
  trainer: dto.trainer ?? "—",
  enrolled: dto.enrolled,
  capacity: dto.capacity,
  completed: dto.completed,
  progress: dto.capacity > 0 ? Math.round((dto.enrolled / dto.capacity) * 100) : 0,
});

export function mapPesticide(dto: PesticideDto): Pesticide {
  const [status, statusType] = label(PESTICIDE_STATUS, dto.status);
  return {
    name: dto.name,
    activeIngredient: dto.activeIngredient,
    concentration: dto.concentration ?? "—",
    manufacturer: dto.manufacturer ?? "—",
    mrl: dto.mrlMgKg === null ? "—" : `${dto.mrlMgKg} mg/kg`,
    isolation: dto.isolationDays === null ? "—" : `${dto.isolationDays} ngày`,
    status,
    statusType,
  };
}

export const mapVariety = (dto: VarietyDto): Variety => ({
  name: dto.name,
  origin: dto.origin ?? "—",
  weight: dto.weightRange ?? "—",
  year: dto.harvestYears ?? "—",
  desc: dto.description ?? "",
});

export const mapVillage = (dto: VillageDto): Village => ({
  name: dto.name,
  leader: dto.leader ?? "—",
  households: dto.householdCount,
  plots: dto.plotCount,
  area: `${dto.areaHa} ha`,
});

export const mapAccount = (dto: AccountDto): Account => ({
  id: dto.id,
  name: dto.fullName,
  username: dto.username,
  role: ROLE_LABELS[dto.role],
  status: dto.status === "active" ? "Hoạt động" : "Khóa",
  statusType: dto.status === "active" ? "green" : "red",
  lastLogin: formatDateTime(dto.lastLoginAt),
});

export const mapAuditLog = (dto: AuditLogDto): AuditLogEntry => ({
  id: dto.id,
  time: formatDateTime(dto.occurredAt),
  user: dto.userName ?? "—",
  ip: dto.ip ?? "—",
  action: dto.action,
  object: dto.object ?? "—",
  detail: dto.detail ?? "",
});
