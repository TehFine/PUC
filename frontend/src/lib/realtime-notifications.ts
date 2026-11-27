"use client";

import { useEffect } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { toast } from "@/components/ui/Toast";
import { refreshMountedApiQueries } from "@/hooks/use-api";
import {
  invalidateQueries,
  NOTIFICATIONS_PATH,
  optimisticMarkNotificationRead,
  portalPath,
  prependRealtimeNotification,
  type PortalKey,
} from "@/hooks/use-portal";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
} from "@/lib/api-client";
import { notifySystemAlertsChanged } from "@/lib/system-alert";
import type { NotificationKind } from "@/types/notifications";

interface RealtimeNotificationPayload {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: null;
  createdAt: string;
}

type RealtimeStreamMessage =
  | { type: "notification"; item: RealtimeNotificationPayload }
  | { type: "notifications-sync"; readIds?: number[]; readAll?: boolean }
  | { type: "system-alert"; audience: "all" | "farmer" | "staff"; active: boolean }
  | { type: "data-sync"; tags: string[] };

const STREAM_URL = "/api/notifications/stream";
const SEEN_IDS_CAP = 120;
const ALL_PORTAL_PATHS: string[] = (
  [
    "overview",
    "profile",
    "plots",
    "care-protocol",
    "journal",
    "spray",
    "lab-tests",
    "schedule",
    "violations",
    "harvest",
    "harvest-notices",
    "harvest-declarations",
    "stamps",
    "approvals",
    "training",
  ] satisfies PortalKey[]
).map(portalPath);

let subscriberCount = 0;
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let hasOpenedOnce = false;
let lifecycleBound = false;
const toastedIds = new Set<number>();

function rememberToastedId(id: number): boolean {
  if (toastedIds.has(id)) return false;
  if (toastedIds.size >= SEEN_IDS_CAP) {
    const oldest = toastedIds.values().next().value;
    if (oldest !== undefined) toastedIds.delete(oldest);
  }
  toastedIds.add(id);
  return true;
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeActiveStream(): void {
  clearReconnectTimer();
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function syncRelatedLiveQueries(item: RealtimeNotificationPayload): void {
  const link = (item.link || "").toLowerCase();

  invalidateQueries(NOTIFICATIONS_PATH);
  notifyCountsChanged();

  if (
    item.kind === "protocol" ||
    item.kind === "violation" ||
    link.includes("journal") ||
    link.includes("spray") ||
    link.includes("diary")
  ) {
    refreshMountedApiQueries("/journal");
    refreshMountedApiQueries("/spray");
    refreshMountedApiQueries("/violations");
    refreshMountedApiQueries("/care-protocol");
    refreshMountedApiQueries("/dashboard");
    invalidateQueries(
      portalPath("journal"),
      portalPath("spray"),
      portalPath("violations"),
      portalPath("care-protocol"),
      portalPath("overview"),
    );
    return;
  }

  if (item.kind === "training" || link.includes("learn") || link.includes("training")) {
    refreshMountedApiQueries("/training");
    refreshMountedApiQueries("/dashboard");
    invalidateQueries(
      portalPath("training"),
      portalPath("overview"),
      "/pesticides?pageSize=500",
      "/fertilizers?pageSize=500",
      "/varieties?pageSize=500",
    );
    return;
  }

  if (
    item.kind === "schedule" ||
    item.kind === "lab" ||
    link.includes("inspection") ||
    link.includes("minutes")
  ) {
    refreshMountedApiQueries("/schedule");
    refreshMountedApiQueries("/minutes");
    refreshMountedApiQueries("/testing");
    refreshMountedApiQueries("/dashboard");
    invalidateQueries(
      portalPath("schedule"),
      portalPath("lab-tests"),
      portalPath("overview"),
    );
    return;
  }

  if (item.kind === "harvest" || link.includes("harvest") || link.includes("stamp")) {
    refreshMountedApiQueries("/harvest");
    refreshMountedApiQueries("/stamp-allocations");
    refreshMountedApiQueries("/stamps");
    refreshMountedApiQueries("/dashboard");
    invalidateQueries(
      portalPath("harvest"),
      portalPath("harvest-notices"),
      portalPath("harvest-declarations"),
      portalPath("stamps"),
      portalPath("overview"),
    );
    return;
  }

  if (link.includes("trace-requests") || link.startsWith("/trace/")) {
    refreshMountedApiQueries("/trace-requests");
    refreshMountedApiQueries("/audit-log");
    refreshMountedApiQueries("/dashboard");
    return;
  }

  if (link.includes("deletions") || link.includes("deletion-requests")) {
    refreshMountedApiQueries("/deletion-requests");
    refreshMountedApiQueries("/households");
    refreshMountedApiQueries("/accounts");
    refreshMountedApiQueries("/audit-log");
    refreshMountedApiQueries("/dashboard");
    return;
  }

  if (link.includes("households") || link.includes("plot")) {
    refreshMountedApiQueries("/households");
    refreshMountedApiQueries("/plots");
    refreshMountedApiQueries("/accounts");
    refreshMountedApiQueries("/dashboard");
    invalidateQueries(portalPath("profile"), portalPath("plots"), portalPath("overview"));
    return;
  }

  if (item.kind === "approval" || link.includes("approval") || link.includes("registration")) {
    refreshMountedApiQueries("/approvals");
    refreshMountedApiQueries("/registrations");
    refreshMountedApiQueries("/trace-requests");
    refreshMountedApiQueries("/deletion-requests");
    refreshMountedApiQueries("/accounts");
    refreshMountedApiQueries("/audit-log");
    refreshMountedApiQueries("/dashboard");
    invalidateQueries(portalPath("approvals"), portalPath("overview"));
    return;
  }

  if (item.kind === "system") {
    refreshMountedApiQueries("/system-alerts");
    refreshMountedApiQueries("/households");
    refreshMountedApiQueries("/accounts");
    refreshMountedApiQueries("/registrations");
    refreshMountedApiQueries("/news");
    refreshMountedApiQueries("/dashboard");
    invalidateQueries(
      portalPath("overview"),
      portalPath("profile"),
      portalPath("plots"),
      "/pesticides?pageSize=500",
      "/fertilizers?pageSize=500",
      "/varieties?pageSize=500",
    );
    if (link.startsWith("#system-alert-")) {
      notifySystemAlertsChanged();
    }
  }
}

function handleStreamData(raw: string): void {
  if (!raw) return;
  let parsed: RealtimeStreamMessage | null = null;
  try {
    parsed = JSON.parse(raw) as RealtimeStreamMessage;
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;

  if (parsed.type === "notification" && parsed.item) {
    prependRealtimeNotification(parsed.item);
    syncRelatedLiveQueries(parsed.item);
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      rememberToastedId(parsed.item.id)
    ) {
      toast.info(parsed.item.title);
    }
    return;
  }

  if (parsed.type === "notifications-sync") {
    if (parsed.readAll) {
      optimisticMarkNotificationRead();
    } else if (Array.isArray(parsed.readIds) && parsed.readIds.length > 0) {
      optimisticMarkNotificationRead(parsed.readIds);
    }
    invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
    notifyCountsChanged();
    return;
  }

  if (parsed.type === "system-alert") {
    notifySystemAlertsChanged();
    invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
    refreshMountedApiQueries("/system-alerts");
    return;
  }

  if (parsed.type === "data-sync" && Array.isArray(parsed.tags)) {
    const tagSet = new Set(parsed.tags);
    if (tagSet.has("dashboard")) {
      refreshMountedApiQueries("/dashboard");
      refreshMountedApiQueries("/trace-requests");
      refreshMountedApiQueries("/deletion-requests");
      refreshMountedApiQueries("/audit-log");
      refreshMountedApiQueries("/journal");
      refreshMountedApiQueries("/spray");
      refreshMountedApiQueries("/violations");
      refreshMountedApiQueries("/care-protocol");
      refreshMountedApiQueries("/approvals");
      refreshMountedApiQueries("/registrations");
      refreshMountedApiQueries("/harvest");
      refreshMountedApiQueries("/stamp-allocations");
      refreshMountedApiQueries("/testing");
      refreshMountedApiQueries("/schedule");
      refreshMountedApiQueries("/minutes");
      refreshMountedApiQueries("/households");
      refreshMountedApiQueries("/contracts");
      refreshMountedApiQueries("/enterprises");
      refreshMountedApiQueries("/reports");
      refreshMountedApiQueries("/system-alerts");
      notifyCountsChanged();
    }
    if (tagSet.has("auth")) {
      refreshMountedApiQueries("/accounts");
      refreshMountedApiQueries("/registrations");
      refreshMountedApiQueries("/deletion-requests");
      notifyCountsChanged();
    }
    if (tagSet.has("plots")) {
      refreshMountedApiQueries("/plots");
      refreshMountedApiQueries("/households");
      refreshMountedApiQueries("/harvest");
      refreshMountedApiQueries("/contracts");
      invalidateQueries(portalPath("plots"), portalPath("overview"), portalPath("profile"));
    }
    if (tagSet.has("catalog")) {
      refreshMountedApiQueries("/households");
      refreshMountedApiQueries("/villages");
      refreshMountedApiQueries("/pesticides");
      refreshMountedApiQueries("/fertilizers");
      refreshMountedApiQueries("/varieties");
      refreshMountedApiQueries("/training");
      invalidateQueries(
        "/pesticides?pageSize=500",
        "/fertilizers?pageSize=500",
        "/varieties?pageSize=500",
        portalPath("training"),
        portalPath("overview"),
        portalPath("profile"),
      );
    }
    if (tagSet.has("news")) {
      refreshMountedApiQueries("/news");
    }
    if (tagSet.has("portal")) {
      invalidateQueries(...ALL_PORTAL_PATHS);
    }
  }
}

function scheduleReconnect(): void {
  if (subscriberCount <= 0 || reconnectTimer !== null || typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const delay = Math.min(12_000, 800 * 2 ** Math.min(reconnectAttempt, 3));
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectStreamIfNeeded();
  }, delay);
}

function connectStreamIfNeeded(): void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;
  if (subscriberCount <= 0 || eventSource !== null) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  clearReconnectTimer();
  try {
    const es = new EventSource(STREAM_URL, { withCredentials: true });
    eventSource = es;

    es.onopen = () => {
      const wasReconnect = hasOpenedOnce || reconnectAttempt > 0;
      hasOpenedOnce = true;
      reconnectAttempt = 0;
      invalidateQueries(NOTIFICATIONS_PATH);
      notifyCountsChanged();
      if (wasReconnect) {
        refreshMountedApiQueries();
      }
    };

    es.onmessage = (event) => {
      if (typeof event.data === "string") {
        handleStreamData(event.data);
      }
    };

    es.onerror = () => {
      if (eventSource === es) {
        es.close();
        eventSource = null;
        scheduleReconnect();
      }
    };
  } catch {
    scheduleReconnect();
  }
}

function ensureLifecycleListeners(): void {
  if (lifecycleBound || typeof window === "undefined") return;
  lifecycleBound = true;

  const onResetAuth = () => {
    toastedIds.clear();
    reconnectAttempt = 0;
    hasOpenedOnce = false;
    closeActiveStream();
    if (subscriberCount > 0) {
      connectStreamIfNeeded();
    }
  };

  const onOnline = () => {
    reconnectAttempt = 0;
    if (subscriberCount > 0) {
      connectStreamIfNeeded();
      invalidateQueries(NOTIFICATIONS_PATH);
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible" && subscriberCount > 0) {
      connectStreamIfNeeded();
    }
  };

  const onLogoutOrExpired = () => {
    toastedIds.clear();
    reconnectAttempt = 0;
    hasOpenedOnce = false;
    closeActiveStream();
  };

  window.addEventListener(AUTH_LOGOUT_EVENT, onLogoutOrExpired);
  window.addEventListener(AUTH_EXPIRED_EVENT, onLogoutOrExpired);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, onResetAuth);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
}

/** Kiểm tra nhanh xem luồng SSE thời gian thực hiện đang kết nối mở (`OPEN`) hay không. */
export function isRealtimeStreamConnected(): boolean {
  return typeof EventSource !== "undefined" && eventSource !== null && eventSource.readyState === EventSource.OPEN;
}

/**
 * Kết nối kênh nhận thông báo thời gian thực (SSE `/api/notifications/stream`) dùng chung toàn tab.
 * Tự động đồng bộ chuông thông báo, dải băng hệ thống và làm mới bảng dữ liệu liên quan ngay khi có sự kiện mới.
 */
export function useRealtimeNotifications(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    ensureLifecycleListeners();
    subscriberCount += 1;
    connectStreamIfNeeded();

    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0) {
        closeActiveStream();
      }
    };
  }, [enabled]);
}

