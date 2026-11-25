"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Bell } from "@/components/ui/PublicIcon";
import {
  notifyCountsChanged,
  requestAdminNavigate,
  requestApprovalTab,
  requestHarvestTab,
  requestJournalTab,
  requestSystemTab,
} from "@/components/admin/shared/counts-events";
import { EmptyState, Sheet } from "@/components/portal/ui";
import {
  invalidateQueries,
  NOTIFICATIONS_PATH,
  optimisticMarkNotificationRead,
  useSharedQuery,
} from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import { resetOverlayHistoryOnRouteLeave, usePersistedState } from "@/lib/back-navigation";
import { lazyChunk } from "@/lib/lazy-chunk";
import type { Tone } from "@/lib/portal-labels";
import { isRealtimeStreamConnected, useRealtimeNotifications } from "@/lib/realtime-notifications";
import type { NotificationItem, NotificationList } from "@/types/notifications";
import { formatDate, formatDateTime } from "@/utils/format";

function enrichDiaryNotificationBody(item: NotificationItem): string | null {
  if (!item.body) return null;
  if (item.kind !== "protocol" && !item.title.includes("nhật ký")) {
    return item.body;
  }
  const trailingDateOnly = /^(.*)\((\d{2}\/\d{2}\/\d{4})\)$/.exec(item.body.trim());
  if (!trailingDateOnly) return item.body;
  const dt = formatDateTime(item.createdAt);
  if (!/\d{2}:\d{2}$/.test(dt)) return item.body;
  const createdDate = formatDate(item.createdAt);
  const [, prefix, workDate] = trailingDateOnly;
  return workDate === createdDate
    ? `${prefix}(${dt})`
    : `${prefix}(làm ${workDate}, cập nhật ${dt})`;
}

const BroadcastNoticeModal = dynamic(
  () => lazyChunk(() => import("@/components/admin/households/BroadcastNoticeModal")),
  { ssr: false },
);

function kindMeta(item: NotificationItem): { label: string; tone: Tone } {
  const link = (item.link || "").toLowerCase();
  if (link.includes("sub=trace-requests")) {
    const isHandled =
      item.title.startsWith("Đã duyệt") ||
      item.title.startsWith("Đã cấp quyền") ||
      item.title.startsWith("Từ chối") ||
      item.title.startsWith("Đã thu hồi");
    return { label: "Cấp quyền truy xuất QR", tone: isHandled ? "blue" : "gold" };
  }
  if (link.includes("sub=deletions")) {
    const isResolved = item.title.startsWith("Đã duyệt") || item.title.startsWith("Từ chối");
    return { label: "Duyệt xóa thành viên", tone: isResolved ? "blue" : "red" };
  }
  if (link.includes("sub=alerts") || link.startsWith("#system-alert-")) {
    return { label: "Thông báo Ban điều hành", tone: "blue" };
  }
  if (link.includes("sub=registrations") || link.includes("section=registrations")) {
    return { label: "Tài khoản chờ duyệt", tone: "gold" };
  }
  if (link.includes("sub=stamps")) {
    return { label: "Tem truy xuất QR", tone: "green" };
  }
  if (link.includes("section=households")) {
    return { label: "Hồ sơ nông hộ", tone: "blue" };
  }
  if (link.includes("section=news")) {
    return { label: "Bản tin HTX", tone: "green" };
  }
  if (item.kind === "training") {
    return { label: "Tập huấn kỹ thuật", tone: "green" };
  }
  if (item.kind === "violation") return { label: "Cảnh báo vi phạm", tone: "red" };
  if (item.kind === "protocol") {
    if (link.includes("sub=spray") || link.includes("section=spray")) {
      return { label: "Nhật ký phun thuốc", tone: "green" };
    }
    if (link.includes("section=journal") && !link.includes("tab=protocol")) {
      return { label: "Nhật ký canh tác", tone: "green" };
    }
    return { label: "Quy trình 2026-2027", tone: "gold" };
  }
  if (item.kind === "approval") return { label: "Hồ sơ chờ duyệt", tone: "blue" };
  if (item.kind === "harvest") return { label: "Khai báo thu hoạch", tone: "green" };
  if (item.kind === "lab" || item.kind === "schedule") return { label: "Kiểm nghiệm và Kiểm tra", tone: "blue" };
  return { label: "Hệ thống", tone: "gray" };
}

function navigateAdminNotification(
  item: NotificationItem,
  pushRoute: (href: string) => void,
) {
  const rawLink = item.link || "";
  const link = rawLink.toLowerCase();
  if (rawLink.startsWith("/trace/")) {
    resetOverlayHistoryOnRouteLeave();
    pushRoute(rawLink);
    return;
  }
  if (
    link.includes("sub=trace-requests") ||
    link.includes("sub=deletions") ||
    link.includes("section=system") ||
    link.startsWith("#system-alert-")
  ) {
    const idMatch = /[?&]id=(\d+)/i.exec(rawLink);
    const parsedId = idMatch?.[1] ? Number(idMatch[1]) : null;
    if (link.includes("sub=trace-requests")) {
      requestSystemTab("trace-requests", parsedId);
    } else if (link.includes("sub=deletions")) {
      requestSystemTab("deletions", parsedId);
    } else if (link.includes("sub=alerts") || link.startsWith("#system-alert-")) {
      requestSystemTab("alerts");
    } else {
      requestSystemTab("accounts");
    }
    return;
  }
  if (link.includes("section=households")) {
    requestAdminNavigate("households");
    return;
  }
  if (link.includes("section=news")) {
    requestAdminNavigate("news");
    return;
  }
  if (item.kind === "training" || link.includes("section=catalog")) {
    requestAdminNavigate("catalog");
    return;
  }
  if (link.includes("sub=spray") || link.includes("section=spray")) {
    requestJournalTab("spray");
    return;
  }
  if (item.kind === "protocol" || link.includes("tab=protocol")) {
    requestJournalTab("journal");
    return;
  }
  if (item.kind === "violation" || link.includes("violation")) {
    requestJournalTab("violations");
    return;
  }
  if (
    link.includes("section=registrations") ||
    link.includes("section=schedule") ||
    link.includes("section=approval") ||
    item.kind === "approval"
  ) {
    if (link.includes("registration")) requestApprovalTab("registrations");
    else if (link.includes("schedule")) requestApprovalTab("schedule");
    else if (link.includes("minutes")) requestApprovalTab("minutes");
    else requestApprovalTab("pending");
    return;
  }
  if (link.includes("section=harvest") || item.kind === "harvest") {
    if (link.includes("sub=stamps")) requestHarvestTab("stamps");
    else if (link.includes("sub=plans")) requestHarvestTab("plans");
    else requestAdminNavigate("harvest");
    return;
  }
  if (link.includes("section=testing") || item.kind === "lab") {
    requestAdminNavigate("testing");
    return;
  }
  if (link.includes("section=journal")) {
    requestJournalTab("journal");
    return;
  }
  requestAdminNavigate("dashboard");
}

export function AdminNotificationBell({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { can } = useAuth();
  const canBroadcastNotice = can("system-alerts", "create");
  const [open, setOpen] = usePersistedState("admin:notif:open", false);
  const [composingNotice, setComposingNotice] = useState(false);
  const [filter, setFilter] = usePersistedState<"unread" | "read">(
    "admin:notif:filter",
    "unread",
    (v): v is "unread" | "read" => v === "unread" || v === "read",
  );
  const [markingAll, setMarkingAll] = useState(false);

  useRealtimeNotifications(enabled);
  const notifications = useSharedQuery<NotificationList>(enabled ? NOTIFICATIONS_PATH : null);
  const items = notifications.data?.data ?? [];
  const unreadItems = items.filter((n) => !n.readAt);
  const readItems = items.filter((n) => Boolean(n.readAt));
  const unread = unreadItems.length;
  const visibleItems = filter === "unread" ? unreadItems : readItems;

  useEffect(() => {
    if (!enabled) return;
    let lastTriggerAt = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastTriggerAt < 3_000) return;
      lastTriggerAt = now;
      invalidateQueries(NOTIFICATIONS_PATH);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !isRealtimeStreamConnected()) {
        invalidateQueries(NOTIFICATIONS_PATH);
      }
    }, 60_000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  if (!enabled) return null;

  const handleSelect = async (item: NotificationItem) => {
    setOpen(false);
    navigateAdminNotification(item, (href) => router.push(href));
    if (!item.readAt) {
      optimisticMarkNotificationRead(item.id);
      try {
        await api.post(`/notifications/${item.id}/read`);
        invalidateQueries(NOTIFICATIONS_PATH);
        notifyCountsChanged();
      } catch {
        invalidateQueries(NOTIFICATIONS_PATH);
      }
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    optimisticMarkNotificationRead();
    try {
      await api.post("/notifications/read-all");
      invalidateQueries(NOTIFICATIONS_PATH);
      notifyCountsChanged();
    } catch {
      invalidateQueries(NOTIFICATIONS_PATH);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="admin-notif-btn"
        title="Thông báo"
        aria-label={unread > 0 ? `Thông báo (${unread} chưa đọc)` : "Thông báo"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          invalidateQueries(NOTIFICATIONS_PATH);
        }}
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="admin-notif-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <Sheet
          variant="drawer"
          title="Thông báo"
          onClose={() => setOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {canBroadcastNotice && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setOpen(false);
                    setComposingNotice(true);
                  }}
                  style={{ width: "100%", justifyContent: "center", minHeight: 38 }}
                >
                  Soạn thông báo
                </button>
              )}

              <div style={{ display: "inline-grid", gridTemplateColumns: "repeat(2, minmax(132px, 1fr))", gap: 8, width: "100%", fontVariantNumeric: "tabular-nums" }}>
                <button
                  type="button"
                  className={`btn btn-sm btn-filter-toggle ${filter === "unread" ? "is-active" : ""}`}
                  aria-pressed={filter === "unread"}
                  onClick={() => setFilter("unread")}
                  style={{ justifyContent: "center", minHeight: 36 }}
                >
                  Chưa đọc ({unread})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm btn-filter-toggle ${filter === "read" ? "is-active" : ""}`}
                  aria-pressed={filter === "read"}
                  onClick={() => setFilter("read")}
                  style={{ justifyContent: "center", minHeight: 36 }}
                >
                  Đã đọc ({readItems.length})
                </button>
              </div>

              {filter === "unread" && unread > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-filter-toggle"
                  onClick={() => void handleMarkAll()}
                  disabled={markingAll}
                  style={{ width: "100%", justifyContent: "center", minHeight: 36, color: "#14372f" }}
                >
                  {markingAll ? "Đang xử lý…" : "Đọc hết"}
                </button>
              )}
            </div>

            {visibleItems.length === 0 ? (
              <EmptyState icon="ok">
                {items.length === 0
                  ? "Chưa có thông báo nào."
                  : filter === "unread"
                    ? "Chưa có thông báo mới."
                    : "Chưa có thông báo nào đã đọc."}
              </EmptyState>
            ) : (
              <div className="admin-notif-card-list">
                {visibleItems.map((item) => {
                  const meta = kindMeta(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`admin-notif-card ${item.readAt ? "is-read" : "is-unread"}`}
                      onClick={() => void handleSelect(item)}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color:
                              meta.tone === "red"
                                ? "#b91c1c"
                                : meta.tone === "gold"
                                  ? "#9a6712"
                                  : meta.tone === "green"
                                    ? "#15803d"
                                    : meta.tone === "blue"
                                      ? "#007aff"
                                      : "#5f6d66",
                          }}
                        >
                          {meta.label}
                        </span>
                        <span style={{ fontSize: 11.5, color: "#60736c", fontVariantNumeric: "tabular-nums" }}>
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>
                      <strong style={{ fontSize: 13.5, color: "#14372f", lineHeight: 1.4 }}>
                        {item.title}
                      </strong>
                      {item.body && (
                        <p style={{ margin: 0, fontSize: 12.5, color: "#435951", lineHeight: 1.45, fontVariantNumeric: "tabular-nums" }}>
                          {enrichDiaryNotificationBody(item)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Sheet>
      )}

      {composingNotice && (
        <BroadcastNoticeModal onClose={() => setComposingNotice(false)} />
      )}
    </>
  );
}

