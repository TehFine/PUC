// Kiểu dữ liệu thô (DTO) cho khu quản trị "Danh mục hệ thống".
// Khớp backend: resources/pesticides, varieties, villages và tài nguyên mới fertilizers (migration 007).

export type PesticideStatus = "allowed" | "banned" | "restricted";

export interface PesticideRecord {
  id: number;
  name: string;
  activeIngredient: string;
  concentration: string | null;
  manufacturer: string | null;
  mrlMgKg: number | null;
  isolationDays: number | null;
  status: PesticideStatus;
}

export type FertilizerCategory = "organic" | "npk" | "foliar" | "microbial" | "restricted";
export type FertilizerStatus = "encouraged" | "allowed" | "warning";

export interface FertilizerRecord {
  id: number;
  name: string;
  category: FertilizerCategory;
  formula: string;
  manufacturer: string;
  dosage: string;
  applicationMethod: string;
  timing: string;
  status: FertilizerStatus;
  imageUrl: string | null;
  description: string | null;
}

export type VarietyCategory = "export" | "native" | "premium" | "new";
export type VarietyStatus = "allowed" | "encouraged" | "trial";

export interface FarmingTechniques {
  density: string;
  pollination: string;
  thinning: string;
  specialNotes: string;
}

export interface VarietyRecord {
  id: number;
  name: string;
  origin: string | null;
  weightRange: string | null;
  harvestYears: string | null;
  description: string | null;
  category: VarietyCategory | null;
  status: VarietyStatus | null;
  fleshColor: string | null;
  seedRate: string | null;
  brix: string | null;
  yieldPerHa: string | null;
  imageUrl: string | null;
  marketPotential: string | null;
  morphology: string[] | null;
  farmingTechniques: FarmingTechniques | null;
}

export interface VillageRecord {
  id: number;
  name: string;
  leader: string | null;
  householdCount: number;
  plotCount: number;
  areaHa: number;
}
