"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "@/components/ui/PublicIcon";
import {
  notifyCountsChanged,
  requestAdminNavigate,
  requestApprovalTab,
  requestJournalTab,
} from "@/components/admin/shared/counts-events";
import { EmptyState, Pill, Sheet } from "@/components/portal/ui";
import { invalidateQueries, NOTIFICATIONS_PATH, useSharedQuery } from "@/hooks/use-portal";
import { api } from "@/lib/api-client";
import type { Tone } from "@/lib/portal-labels";
import type { NotificationItem, NotificationList } from "@/types/notifications";
import { formatDate } from "@/utils/format";

function kindMeta(kind: string): { label: string; tone: Tone } {
  if (kind === "violation") return { label: "Cảnh báo vi phạm", tone: "red" };
  if (kind === "protocol") return { label: "Quy trình 2026-2027", tone: "gold" };
  if (kind === "approval") return { label: "Hồ sơ chờ duyệt", tone: "blue" };
  if (kind === "harvest") return { label: "Khai báo thu hoạch", tone: "green" };
  if (kind === "lab" || kind === "schedule") return { label: "Kiểm nghiệm & Kiểm tra", tone: "blue" };
  return { label: "Hệ thống", tone: "gray" };
}

function navigateAdminNotification(item: NotificationItem) {
  const link = (item.link || "").toLowerCase();
  if (item.kind === "protocol" || link.includes("tab=protocol")) {
    requestJournalTab("protocol");
    return;
  }
  if (item.kind === "violation" || link.includes("violation")) {
    requestJournalTab("violations");
    return;
  }
  if (link.includes("section=approval") || item.kind === "approval") {
    if (link.includes("registration")) requestApprovalTab("registrations");
    else requestApprovalTab("pending");
    return;
  }
  if (link.includes("section=harvest") || item.kind === "harvest") {
    requestAdminNavigate("harvest");
    return;
  }
  if (link.includes("section=testing") || item.kind === "lab") {
    requestAdminNavigate("testing");
    return;
  }
  if (link.includes("section=journal")) {
    requestAdminNavigate("journal");
    return;
  }
  requestAdminNavigate("dashboard");
}

export function AdminNotificationBell({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const notifications = useSharedQuery<NotificationList>(enabled ? NOTIFICATIONS_PATH : null);
  const items = notifications.data?.data ?? [];
  const unread = notifications.data?.unread ?? items.filter((n) => !n.readAt).length;
  const visibleItems = filter === "unread" ? items.filter((n) => !n.readAt) : items;

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        invalidateQueries(NOTIFICATIONS_PATH);
      }
    };
    const timer = window.setInterval(onVisible, 30_000);
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
    if (!item.readAt) {
      try {
        await api.post(`/notifications/${item.id}/read`);
        invalidateQueries(NOTIFICATIONS_PATH);
        notifyCountsChanged();
      } catch {
        // ignore read error
      }
    }
    setOpen(false);
    navigateAdminNotification(item);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await api.post("/notifications/read-all");
      invalidateQueries(NOTIFICATIONS_PATH);
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="admin-notif-btn"
        title="Thông báo giám sát quy trình, vi phạm và hồ sơ"
        aria-label={unread > 0 ? `Thông báo quản trị (${unread} chưa đọc)` : "Thông báo quản trị"}
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
          title="Thông báo & cảnh báo quy trình"
          onClose={() => setOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setFilter("all")}
                >
                  Tất cả ({items.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${filter === "unread" ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setFilter("unread")}
                >
                  Chưa đọc ({unread})
                </button>
              </div>

              {unread > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void handleMarkAll()}
                  disabled={markingAll}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <CheckCheck size={14} />
                  <span>{markingAll ? "Đang xử lý…" : "Đánh dấu đã đọc hết"}</span>
                </button>
              )}
            </div>

            {visibleItems.length === 0 ? (
              <EmptyState icon="ok">
                {filter === "unread"
                  ? "Không còn cảnh báo hay thông báo nào chưa đọc."
                  : "Chưa có thông báo nào."}
              </EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visibleItems.map((item) => {
                  const meta = kindMeta(item.kind);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void handleSelect(item)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 8,
                        border: "1px solid #d4d4d2",
                        background: item.readAt ? "#ffffff" : "#f3f9f5",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <Pill tone={meta.tone}>{meta.label}</Pill>
                        <span style={{ fontSize: 11.5, color: "#60736c", fontVariantNumeric: "tabular-nums" }}>
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                      <strong style={{ fontSize: 13.5, color: "#14372f", lineHeight: 1.4 }}>
                        {item.title}
                      </strong>
                      {item.body && (
                        <p style={{ margin: 0, fontSize: 12.5, color: "#435951", lineHeight: 1.45 }}>
                          {item.body}
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
    </>
  );
}

