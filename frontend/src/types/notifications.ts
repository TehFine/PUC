// Thông báo trong ứng dụng (`GET /notifications`).

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
