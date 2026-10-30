export interface Household {
  id: number;
  name: string;
  cccd: string;
  phone: string;
  village: string;
  plots: number;
  area: number;
  code: string;
  status: string;
  statusType: string;
}

export interface ApprovalRequest {
  id: string;
  name: string;
  type: string;
  date: string;
  docs: number;
  priority: string;
  priorityType: string;
}

export interface ScheduleItem {
  id: number;
  date: string;
  title: string;
  officer: string;
  plots: number;
  type: string;
}

export interface InspectionMinute {
  no: string;
  date: string;
  location: string;
  officer: string;
  result: string;
  resultType: string;
}

export interface JournalEntry {
  id: number;
  date: string;
  household: string;
  plotCode: string;
  activity: string;
  detail: string;
  recorder: string;
  hasPhoto: boolean;
}

export interface Violation {
  id: number;
  type: string;
  title: string;
  household: string;
  date: string;
  plot: string;
  desc: string;
}

export interface SprayRecord {
  id: number;
  date: string;
  household: string;
  pesticide: string;
  source: string;
  dose: string;
  area: string;
  isolation: string;
  mrl: string;
  mrlType: string;
}

export interface LabTest {
  code: string;
  household: string;
  sampleDate: string;
  cd: string;
  yellowO: string;
  residue: string;
  chlorpyrifos: string;
  result: string;
  resultType: string;
  lab: string;
}

export interface HarvestLot {
  id?: number;
  code: string;
  date: string;
  weight: string;
  households: number;
  buyer: string;
  market: string;
  qr: string;
  status: string;
  statusType: string;
  packhouseCode?: string;
  transporter?: string;
  vehiclePlate?: string;
  temperatureC?: number;
  avgBrix?: number;
  gradeAPct?: number;
  enterpriseName?: string;
  contractCode?: string;
}

export interface Enterprise {
  id: number;
  code: string;
  name: string;
  taxCode?: string;
  representative?: string;
  phone?: string;
  address?: string;
  packhouseCode?: string;
  status: "active" | "inactive";
}

export interface Contract {
  id: number;
  code: string;
  enterpriseId: number;
  enterpriseName?: string;
  packhouseCode?: string;
  title: string;
  signedOn: string;
  validUntil: string;
  targetTons: number;
  priceGuarantee?: string;
  market: string;
  status: "active" | "completed" | "expired";
  notes?: string;
}

export interface HarvestItem {
  id: number;
  lotId: number;
  itemType: "fruit" | "box";
  serialCode: string;
  weightKg?: number;
  grade?: "A" | "B" | "C";
  printedAt?: string;
  status: string;
  createdAt: string;
}

export interface TrainingCourse {
  id: number;
  title: string;
  date: string;
  location: string;
  trainer: string;
  enrolled: number;
  capacity: number;
  completed: boolean;
  progress: number;
}

export interface Pesticide {
  name: string;
  activeIngredient: string;
  concentration: string;
  manufacturer: string;
  mrl: string;
  isolation: string;
  status: string;
  statusType: string;
}

export interface Variety {
  name: string;
  origin: string;
  weight: string;
  year: string;
  desc: string;
}

export interface Village {
  name: string;
  leader: string;
  households: number;
  plots: number;
  area: string;
}

export interface Account {
  id: number;
  name: string;
  username: string;
  role: string;
  status: string;
  statusType: string;
  lastLogin: string;
}

export interface AuditLogEntry {
  id: number;
  time: string;
  user: string;
  ip: string;
  action: string;
  object: string;
  detail: string;
}
