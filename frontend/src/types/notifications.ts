// Thông báo trong ứng dụng (`GET /notifications`) & thông báo khẩn toàn hệ thống (`GET /health`, `/system-alerts`).

export type NotificationKind = "approval" | "violation" | "harvest" | "training" | "schedule" | "lab" | "system";

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  data: NotificationItem[];
  unread: number;
}

export type SystemAlertSeverity = "critical" | "warning";
export type SystemAlertAudience = "all" | "farmer" | "staff";

export interface SystemAlertRecord {
  id: number;
  severity: SystemAlertSeverity;
  title: string;
  message: string;
  audience: SystemAlertAudience;
  active: boolean;
  createdBy: number | null;
  createdByName: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SystemAlertListResponse {
  active: SystemAlertRecord | null;
  data: SystemAlertRecord[];
}

export interface HealthCheckResponse {
  status: "ok" | "degraded";
  database: "up" | "down";
  alert?: SystemAlertRecord | null;
}
