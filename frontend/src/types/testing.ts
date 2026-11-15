// Kiểu dữ liệu khu quản trị - kết quả kiểm nghiệm.

export type LabResult = "pass" | "fail";
export type LabRecordStatus = "draft" | "verified";

export interface LabTestRow {
  id: number;
  code: string;
  householdId?: number;
  householdName: string;
  plotCode: string;
  sampledOn: string;
  cdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: LabResult;
  lab: string;
  recordStatus?: LabRecordStatus;
  scanAttachmentId?: number | null;
  scanUrl?: string | null;
}

export type LabTestRecord = LabTestRow;

export interface LabTestInput {
  code: string;
  householdId: number;
  plotCode: string;
  sampledOn: string;
  cdMgKg: number;
  residueMgKg: number;
  chlorpyrifosMgKg: number | null;
  yellowOPositive: boolean;
  result: LabResult;
  lab: string;
  recordStatus?: LabRecordStatus;
  scanAttachmentId?: number | null;
}
