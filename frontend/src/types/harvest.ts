// Kiểu dữ liệu thô (DTO) cho khu quản trị "Chuỗi cung ứng & Lô hàng".
// Khớp backend: resources/harvest, enterprises, contracts, harvest-declarations, stamps.

export type HarvestLotStatus = "exported" | "delivered" | "in_transit" | "sampling";

export interface HarvestLotRecord {
  id: number;
  code: string;
  harvestedOn: string;
  weightTons: number;
  householdCount: number;
  buyer: string;
  market: string;
  qrCode: string | null;
  status: HarvestLotStatus;
  enterpriseId: number | null;
  enterpriseName: string | null;
  contractId: number | null;
  contractCode: string | null;
  packhouseCode: string | null;
  gradeAPct: number | null;
  gradeBPct: number | null;
  gradeCPct: number | null;
  avgBrix: number | null;
  treatmentMethod: string | null;
  transporter: string | null;
  vehiclePlate: string | null;
  temperatureC: number | null;
  departedAt: string | null;
  estimatedArrival: string | null;
}

/** Thân yêu cầu POST/PATCH /harvest (CreateHarvestLotDto). */
export interface HarvestLotInput {
  code: string;
  harvestedOn: string;
  weightTons: number;
  buyer: string;
  market: string;
  status: HarvestLotStatus;
  qrCode?: string | null;
  enterpriseId?: number;
  contractId?: number;
  packhouseCode?: string;
  gradeAPct?: number;
  gradeBPct?: number;
  gradeCPct?: number;
  avgBrix?: number;
  treatmentMethod?: string;
  transporter?: string;
  vehiclePlate?: string;
  temperatureC?: number;
  departedAt?: string;
  estimatedArrival?: string;
}

export interface HarvestContributionRecord {
  id: number;
  lotId: number;
  householdId: number;
  householdCode?: string | null;
  householdName?: string | null;
  villageName?: string | null;
  weightKg: number;
  createdAt?: string;
}

export type HarvestDeclarationStatus = "submitted" | "confirmed" | "rejected";

export interface HarvestDeclarationRecord {
  id: number;
  householdId: number;
  householdName: string | null;
  householdCode: string | null;
  villageName: string | null;
  plotCode: string;
  harvestedOn: string;
  weightKg: number;
  gradeAKg: number | null;
  gradeBKg: number | null;
  qualityRating: string | null;
  note: string | null;
  photoUrl: string | null;
  status: HarvestDeclarationStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt?: string;
}

export type StampAllocationStatus = "active" | "revoked" | "completed";

export interface StampAllocationRecord {
  id: number;
  allocationCode: string;
  householdId: number;
  householdName: string | null;
  householdCode: string | null;
  plotCode?: string | null;
  allocatedOn: string;
  season: string;
  maxQuotaStamps?: number | null;
  quantityAllocated: number;
  activatedCount: number;
  fromSerial: string;
  toSerial: string;
  status: StampAllocationStatus;
  notes: string | null;
}

export interface StampAllocationInput {
  householdId: number;
  plotCode?: string;
  season: string;
  quantity: number;
  notes?: string;
}

export interface FarmerStampRecord {
  id: number;
  serialCode: string;
  plotCode: string | null;
  status: "allocated" | "activated" | "revoked";
  activatedAt: string | null;
  fruitWeightKg: number | null;
  grade: "A" | "B" | "C" | null;
  photoUrl: string | null;
  harvestDate: string | null;
}

export interface EnterpriseRecord {
  id: number;
  code: string;
  name: string;
  taxCode: string | null;
  representative: string | null;
  phone: string | null;
  address: string | null;
  packhouseCode: string | null;
  status: "active" | "inactive";
  createdAt?: string;
}

export interface ContractRecord {
  id: number;
  code: string;
  enterpriseId: number;
  enterpriseName: string;
  packhouseCode: string | null;
  title: string;
  signedOn: string;
  validUntil: string;
  targetTons: number | null;
  priceGuarantee: string | null;
  market: string | null;
  status: "active" | "completed" | "expired";
  notes: string | null;
  createdAt?: string;
}

/** Bản ghi hộ dùng cho ô chọn hộ (GET /households). */
export interface HouseholdOption {
  id: number;
  code: string;
  name: string;
  villageName: string | null;
}
