// Kiểu dữ liệu khu quản trị – hồ sơ chờ duyệt, lịch kiểm tra, biên bản.

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ApprovalPriority = "high" | "medium" | "low";

export interface ApprovalRow {
  id: number;
  code: string;
  applicantName: string;
  requestType: string;
  submittedOn: string;
  docsCount: number;
  priority: ApprovalPriority;
  status: ApprovalStatus;
  householdId?: number | null;
  note?: string | null;
  plotCode?: string | null;
  reviewNote?: string | null;
}

export interface ApprovalAttachment {
  id: number;
  url: string;
  mimeType?: string | null;
  originalName?: string | null;
  sizeBytes?: number | null;
}

/** `GET /approvals/:id` có thêm danh sách tệp đính kèm. */
export interface ApprovalDetail extends ApprovalRow {
  attachments?: ApprovalAttachment[];
}

export interface ApprovalInput {
  code: string;
  applicantName: string;
  requestType: string;
  submittedOn: string;
  priority: ApprovalPriority;
  docsCount?: number;
  householdId?: number | null;
  plotCode?: string | null;
  note?: string | null;
}

export type ScheduleKind = "periodic" | "sudden" | "recheck";

export interface ScheduleRow {
  id: number;
  scheduledOn: string;
  title: string;
  officer: string;
  plotCount: number;
  kind: ScheduleKind;
}

export type MinuteResult = "pass" | "fail" | "improve";

export interface MinuteRow {
  id: number;
  code: string;
  heldOn: string;
  location: string;
  officer: string;
  result: MinuteResult;
}
