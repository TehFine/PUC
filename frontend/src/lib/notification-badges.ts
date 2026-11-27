"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PortalTabId } from "@/components/portal/PortalApp";
import {
  getCachedNotificationItems,
  invalidateQueries,
  NOTIFICATIONS_PATH,
  optimisticMarkNotificationRead,
  portalPath,
  useSharedQuery,
} from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import { resolveValidPortalRoute, type SectionId } from "@/lib/route-validation";
import type { NotificationItem, NotificationList } from "@/types/notifications";

export interface AdminNotificationTarget {
  section: SectionId;
  sub?: string;
  entityId?: number;
}

const inflightReadIds = new Set<number>();

function parseEntityIdFromLink(rawLink: string): number | undefined {
  const match = /[?&](?:id|violationId|scheduleId)=(\d+)/i.exec(rawLink);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Ánh xạ thống nhất từng thông báo quản trị về đúng mục điều hướng (`section`), tab con (`sub`)
 * và mã bản ghi (`entityId`) để số đếm ở Chuông, Sidebar và Tab con luôn khớp 100%.
 */
export function classifyAdminNotification(item: NotificationItem): AdminNotificationTarget | null {
  const rawLink = (item.link || "").trim();
  const link = rawLink.toLowerCase();
  const entityId = parseEntityIdFromLink(rawLink);

  if (
    rawLink.startsWith("/trace/") ||
    rawLink.startsWith("/login") ||
    rawLink.startsWith("/#") ||
    rawLink.startsWith("/gioi-thieu")
  ) {
    return null;
  }

  if (
    link.includes("sub=trace-requests") ||
    link.includes("sub=deletions") ||
    link.includes("deletion-requests") ||
    link.includes("section=system") ||
    link.startsWith("#system-alert-")
  ) {
    if (link.includes("sub=trace-requests")) {
      return { section: "system", sub: "trace-requests", entityId };
    }
    if (link.includes("sub=deletions") || link.includes("deletion-requests")) {
      return { section: "system", sub: "deletions", entityId };
    }
    if (link.includes("sub=alerts") || link.startsWith("#system-alert-")) {
      return { section: "system", sub: "alerts", entityId };
    }
    if (link.includes("sub=roles")) {
      return { section: "system", sub: "roles", entityId };
    }
    if (link.includes("sub=audit")) {
      return { section: "system", sub: "audit", entityId };
    }
    return { section: "system", sub: "accounts", entityId };
  }

  if (link.includes("section=households")) {
    return { section: "households", entityId };
  }

  if (link.includes("section=zones")) {
    return { section: "zones", entityId };
  }

  if (link.includes("section=news")) {
    return { section: "news", entityId };
  }

  if (item.kind === "training" || link.includes("section=training") || link.includes("section=catalog")) {
    if (link.includes("sub=pesticide")) return { section: "catalog", sub: "pesticide", entityId };
    if (link.includes("sub=fertilizer")) return { section: "catalog", sub: "fertilizer", entityId };
    if (link.includes("sub=variety")) return { section: "catalog", sub: "variety", entityId };
    if (link.includes("sub=diseases")) return { section: "catalog", sub: "diseases", entityId };
    if (link.includes("sub=village")) return { section: "catalog", sub: "village", entityId };
    if (link.includes("sub=standards")) return { section: "catalog", sub: "standards", entityId };
    return { section: "catalog", sub: "protocol", entityId };
  }

  if (link.includes("sub=spray") || link.includes("section=spray")) {
    return { section: "journal", sub: "spray", entityId };
  }
  if (item.kind === "violation" || link.includes("violation")) {
    return { section: "journal", sub: "violations", entityId };
  }
  if (item.kind === "protocol" || link.includes("tab=protocol") || link.includes("section=journal")) {
    return { section: "journal", sub: "journal", entityId };
  }

  if (
    link.includes("section=registrations") ||
    link.includes("section=schedule") ||
    link.includes("section=minutes") ||
    link.includes("section=approval") ||
    item.kind === "approval"
  ) {
    if (link.includes("registration")) {
      return { section: "approval", sub: "registrations", entityId };
    }
    if (link.includes("schedule") || (item.kind === "schedule" && !link.includes("minutes"))) {
      return { section: "approval", sub: "schedule", entityId };
    }
    if (link.includes("minutes")) {
      return { section: "approval", sub: "minutes", entityId };
    }
    return { section: "approval", sub: "pending", entityId };
  }

  if (link.includes("section=harvest") || item.kind === "harvest") {
    if (link.includes("sub=stamps")) return { section: "harvest", sub: "stamps", entityId };
    if (link.includes("sub=plans")) return { section: "harvest", sub: "plans", entityId };
    if (link.includes("sub=contracts")) return { section: "harvest", sub: "contracts", entityId };
    if (link.includes("sub=enterprises")) return { section: "harvest", sub: "enterprises", entityId };
    return { section: "harvest", sub: "lots", entityId };
  }

  if (link.includes("section=testing") || item.kind === "lab") {
    return { section: "testing", entityId };
  }

  if (link.includes("section=reports")) {
    return { section: "reports", entityId };
  }

  return null;
}

/**
 * Ánh xạ thông báo của nông hộ về đúng tab chức năng trên Cổng hộ dân.
 * Các thông báo phát thanh chung (`system` không gắn tab cụ thể) giữ trên chuông để hộ dân bấm đọc nội dung.
 */
export function classifyPortalNotification(
  item: Pick<NotificationItem, "link"> & { kind?: string | null },
): PortalTabId | null {
  const kind = (item.kind || "").toLowerCase();
  const rawLink = (item.link || "").trim();
  const link = rawLink.toLowerCase();

  if (kind === "system") {
    if (!rawLink.startsWith("/portal")) return null;
    const qIdx = rawLink.indexOf("?");
    if (qIdx < 0) return null;
    const sp = new URLSearchParams(rawLink.slice(qIdx));
    if (!sp.has("tab") && !sp.has("sub") && !sp.has("view")) return null;
    const parsed = resolveValidPortalRoute(sp);
    if (!parsed || parsed.tab === "home") return null;
    return parsed.tab;
  }

  if (rawLink.startsWith("/portal")) {
    const qIdx = rawLink.indexOf("?");
    if (qIdx >= 0) {
      const sp = new URLSearchParams(rawLink.slice(qIdx));
      const parsed = resolveValidPortalRoute(sp);
      if (parsed) {
        if (parsed.tab === "home" && !sp.has("tab")) return null;
        return parsed.tab;
      }
    }
    return null;
  }

  if (kind === "protocol" || kind === "violation") return "diary";
  if (kind === "harvest") return "stamps";
  if (kind === "schedule" || kind === "lab") return "inspection";
  if (kind === "training") return "learn";

  if (link.includes("plot")) return "plots";
  if (link.includes("diary") || link.includes("journal") || link.includes("spray") || link.includes("violation")) {
    return "diary";
  }
  if (link.includes("stamp") || link.includes("harvest")) return "stamps";
  if (link.includes("inspect") || link.includes("lab") || link.includes("schedule")) return "inspection";
  if (link.includes("learn") || link.includes("training")) return "learn";

  return null;
}

/**
 * Đánh dấu đã đọc một tập ID thông báo: cập nhật lạc quan 0ms trên bộ nhớ đệm dùng chung
 * (giúp số đếm ở Chuông, Thanh bên và Tab biến mất cùng một nhịp render), sau đó gửi lên máy chủ để đẩy SSE sang mọi phiên khác.
 */
export async function markNotificationsReadBatch(
  ids: number[],
  options?: { syncPortalOverview?: boolean },
): Promise<void> {
  const cleanIds = Array.from(
    new Set(
      ids
        .map((raw) => Number(raw))
        .filter((id) => Number.isInteger(id) && id > 0 && !inflightReadIds.has(id)),
    ),
  ).slice(0, 100);

  if (cleanIds.length === 0) return;

  for (const id of cleanIds) {
    inflightReadIds.add(id);
  }
  optimisticMarkNotificationRead(cleanIds);

  try {
    if (cleanIds.length === 1) {
      await api.post(`/notifications/${cleanIds[0]}/read`);
    } else {
      await api.post("/notifications/read-batch", { ids: cleanIds });
    }
    if (options?.syncPortalOverview) {
      invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
    } else {
      invalidateQueries(NOTIFICATIONS_PATH);
    }
    notifyCountsChanged();
  } catch {
    invalidateQueries(NOTIFICATIONS_PATH);
  } finally {
    for (const id of cleanIds) {
      inflightReadIds.delete(id);
    }
  }
}

/** Đánh dấu đã đọc mọi thông báo chưa đọc thuộc một mục / tab con của khu quản trị. */
export function acknowledgeAdminScope(section: SectionId, sub?: string): void {
  const items = getCachedNotificationItems();
  if (items.length === 0) return;
  const matchingIds: number[] = [];
  for (const item of items) {
    if (item.readAt || item.id <= 0) continue;
    const target = classifyAdminNotification(item);
    if (!target || target.section !== section) continue;
    if (sub !== undefined && target.sub !== sub) continue;
    matchingIds.push(item.id);
  }
  if (matchingIds.length > 0) {
    void markNotificationsReadBatch(matchingIds);
  }
}

/** Đánh dấu đã đọc thông báo gắn với một bản ghi cụ thể (hoặc thông báo chung không gắn ID của cùng tab) khi người dùng bấm mở xem. */
export function acknowledgeAdminEntity(
  section: SectionId,
  sub: string | undefined,
  entityId: number,
): void {
  const items = getCachedNotificationItems();
  if (items.length === 0) return;
  const matchingIds: number[] = [];
  for (const item of items) {
    if (item.readAt || item.id <= 0) continue;
    const target = classifyAdminNotification(item);
    if (!target || target.section !== section) continue;
    if (sub !== undefined && target.sub !== sub) continue;
    if (target.entityId === undefined || Number(target.entityId) === Number(entityId)) {
      matchingIds.push(item.id);
    }
  }
  if (matchingIds.length > 0) {
    void markNotificationsReadBatch(matchingIds);
  }
}

function canStaffSeeTarget(
  target: AdminNotificationTarget,
  can: (resource: string, action: "read" | "create" | "update" | "delete") => boolean,
): boolean {
  switch (target.section) {
    case "households":
      return can("households", "read");
    case "zones":
      return can("plots", "read");
    case "journal":
      if (target.sub === "violations") return can("violations", "read");
      if (target.sub === "spray") return can("spray", "read");
      return can("journal", "read");
    case "reports":
      return can("reports", "read");
    case "testing":
      return can("testing", "read");
    case "harvest":
      if (target.sub === "stamps") return can("stamps", "read");
      if (target.sub === "contracts") return can("contracts", "read");
      if (target.sub === "enterprises") return can("enterprises", "read");
      if (target.sub === "plans") return can("households", "read");
      return can("harvest", "read");
    case "news":
      return can("news", "read");
    case "approval":
      if (target.sub === "registrations") return can("registrations", "read");
      if (target.sub === "schedule") return can("schedule", "read");
      if (target.sub === "minutes") return can("minutes", "read");
      return can("approvals", "read");
    case "catalog":
      return can("pesticides", "read");
    case "system":
      if (!can("accounts", "read")) return false;
      if (target.sub === "trace-requests") return can("trace-requests", "read");
      if (target.sub === "deletions") return can("deletion-requests", "read");
      return true;
    default:
      return true;
  }
}

/**
 * Bộ đếm thông báo chưa đọc thời gian thực dùng chung giữa Chuông thông báo, Sidebar và toàn bộ Tab con khu quản trị.
 */
export function useAdminNotificationBadges() {
  const { status, session, can } = useAuth();
  const enabled = status === "authenticated" && session?.user.role !== "farmer";
  const notifications = useSharedQuery<NotificationList>(enabled ? NOTIFICATIONS_PATH : null);

  const { sectionBadges, subBadges, unreadTotal } = useMemo(() => {
    const nextSections: Partial<Record<SectionId, number>> = {};
    const nextSubs: Record<string, number> = {};
    const items = notifications.data?.data ?? [];
    let unread = 0;

    for (const item of items) {
      if (item.readAt) continue;
      unread += 1;
      const target = classifyAdminNotification(item);
      if (!target || !canStaffSeeTarget(target, can)) continue;
      nextSections[target.section] = (nextSections[target.section] ?? 0) + 1;
      if (target.sub) {
        const subKey = `${target.section}:${target.sub}`;
        nextSubs[subKey] = (nextSubs[subKey] ?? 0) + 1;
      }
    }

    return {
      sectionBadges: nextSections,
      subBadges: nextSubs,
      unreadTotal: unread,
    };
  }, [notifications.data?.data, can]);

  const getSectionBadge = useCallback(
    (section: SectionId): number => sectionBadges[section] ?? 0,
    [sectionBadges],
  );

  const getSubBadge = useCallback(
    (section: SectionId, sub: string): number => subBadges[`${section}:${sub}`] ?? 0,
    [subBadges],
  );

  return {
    unreadTotal,
    hasLoaded: notifications.data !== null,
    sectionBadges,
    getSectionBadge,
    getSubBadge,
  };
}

/**
 * Khi người dùng chuyển vào xem một mục hoặc một tab con (hoặc mở trang thẳng vào tab đó khi màn hình đang hiển thị),
 * tự động đánh dấu đã đọc các thông báo chưa đọc thuộc phạm vi vừa mở để số ở Tab, Thanh bên và Chuông mất đồng thời.
 * Các thông báo mới phát sinh qua SSE trong lúc đang mở sẵn tab vẫn hiện số cho đến khi người dùng thao tác xem.
 */
export function useAutoAcknowledgeAdminScope(section: SectionId | null, sub?: string): void {
  const { status, session } = useAuth();
  const enabled = Boolean(section) && status === "authenticated" && session?.user.role !== "farmer";
  const notifications = useSharedQuery<NotificationList>(enabled ? NOTIFICATIONS_PATH : null);
  const scopeKey = section ? `${section}:${sub ?? "*"}` : null;
  const acknowledgedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    acknowledgedScopeRef.current = null;
  }, [scopeKey]);

  useEffect(() => {
    if (!enabled || !section || !scopeKey || notifications.data === null) return;

    const tryAcknowledge = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (acknowledgedScopeRef.current === scopeKey) return;
      acknowledgedScopeRef.current = scopeKey;
      acknowledgeAdminScope(section, sub);
    };

    tryAcknowledge();
    if (acknowledgedScopeRef.current === scopeKey || typeof document === "undefined") return;

    document.addEventListener("visibilitychange", tryAcknowledge);
    window.addEventListener("focus", tryAcknowledge);
    return () => {
      document.removeEventListener("visibilitychange", tryAcknowledge);
      window.removeEventListener("focus", tryAcknowledge);
    };
  }, [enabled, section, sub, scopeKey, notifications.data]);
}
